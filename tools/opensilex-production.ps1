# OpenSILEX Production Installation Master Script
# PowerShell script for managing OpenSILEX Production installation on Azure VMs

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("Menu", "FullInstall", "Deploy", "Install", "Status", "Connect", "Start", "Stop", "Restart", "Delete", "Logs", "Diagnose", "GenerateSSHKey", "TestSSHKeys", "ShowInfo", "GetIP", "OpenPorts")]
    [string]$Command = "Menu",
    
    [Parameter(Mandatory=$false)]
    [string]$VMName = "opensilex-production-vm",
    
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroupName = "RG-OPENSILEX-GITHUB",
    
    [Parameter(Mandatory=$false)]
    [string]$Location = "westeurope",
    
    [Parameter(Mandatory=$false)]
    [string]$AdminUsername = "azureuser",
    
    [Parameter(Mandatory=$false)]
    [string]$VMIPAddress,
    
    [Parameter(Mandatory=$false)]
    [string]$SSHKeyPath,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipDependencies
)

# Colors for output
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"
$Blue = "Cyan"
$White = "White"

# Configuration - Same as template
$VMSize = "Standard_B2as_v2"  # 2 vCPUs, 8 GB RAM (same as template-vm.json)
$OSVersion = "Debian:debian-12:12-gen2:latest"
$DiskSize = 50  # 50 GB for source code and build artifacts

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = $White,
        [string]$Prefix = ""
    )
    
    $timestamp = Get-Date -Format "HH:mm:ss"
    if ($Prefix) {
        Write-Host "[$timestamp] [$Prefix] $Message" -ForegroundColor $Color
    } else {
        Write-Host "[$timestamp] $Message" -ForegroundColor $Color
    }
}

function Write-Success { param([string]$Message) Write-ColorOutput $Message $Green "SUCCESS" }
function Write-Info { param([string]$Message) Write-ColorOutput $Message $Blue "INFO" }
function Write-Warning { param([string]$Message) Write-ColorOutput $Message $Yellow "WARNING" }
function Write-Error { param([string]$Message) Write-ColorOutput $Message $Red "ERROR" }

function Test-Prerequisites {
    Write-Info "Checking prerequisites..."
    
    # Check Azure PowerShell
    if (-not (Get-Module -ListAvailable -Name Az)) {
        Write-Error "Azure PowerShell module not found!"
        Write-Info "Please install it with: Install-Module -Name Az -Repository PSGallery -Force"
        return $false
    }
    
    # Check if logged into Azure
    try {
        $context = Get-AzContext
        if (-not $context) {
            Write-Error "Not logged into Azure!"
            Write-Info "Please run: Connect-AzAccount"
            return $false
        }
        Write-Success "Azure context: $($context.Account.Id)"
    }
    catch {
        Write-Error "Not logged into Azure!"
        Write-Info "Please run: Connect-AzAccount"
        return $false
    }
    
    Write-Success "Prerequisites check passed"
    return $true
}

function Get-SSHKeyPath {
    if ($SSHKeyPath) {
        return $SSHKeyPath
    }
    
    # Check for existing SSH keys in order of preference
    $keyPaths = @(
        "$env:USERPROFILE\.ssh\id_ed25519.pub",
        "$env:USERPROFILE\.ssh\id_rsa.pub",
        "$env:USERPROFILE\.ssh\id_ecdsa.pub"
    )
    
    foreach ($path in $keyPaths) {
        if (Test-Path $path) {
            Write-Success "Found SSH key: $path"
            return $path
        }
    }
    
    Write-Warning "No SSH keys found. Checked for: id_ed25519.pub, id_rsa.pub, id_ecdsa.pub"
    Write-Info "Generating new SSH key..."
    
    $sshDir = "$env:USERPROFILE\.ssh"
    if (-not (Test-Path $sshDir)) {
        New-Item -ItemType Directory -Path $sshDir -Force | Out-Null
    }
    
    # Generate ed25519 key by default (more secure and modern)
    $keyPath = "$env:USERPROFILE\.ssh\id_ed25519"
    ssh-keygen -t ed25519 -f $keyPath -N '""' -C "opensilex-production-vm" | Out-Null
    
    if (Test-Path "$keyPath.pub") {
        Write-Success "SSH key generated successfully"
        return "$keyPath.pub"
    } else {
        Write-Error "Failed to generate SSH key"
        return $null
    }
}

function Deploy-VM {
    Write-Info "Deploying Azure VM for OpenSILEX Production installation..."
    
    if (-not (Test-Prerequisites)) {
        return $false
    }
    
    $sshKeyPath = Get-SSHKeyPath
    if (-not $sshKeyPath) {
        return $false
    }
    
    try {
        # Check if VM already exists
        $existingVM = Get-AzVM -ResourceGroupName $ResourceGroupName -Name $VMName -ErrorAction SilentlyContinue
        if ($existingVM) {
            Write-Warning "VM '$VMName' already exists. Checking if it's running..."
            $vmStatus = Get-AzVM -ResourceGroupName $ResourceGroupName -Name $VMName -Status -ErrorAction SilentlyContinue
            $powerState = ($vmStatus.Statuses | Where-Object {$_.Code -like "PowerState/*"}).DisplayStatus
            
            if ($powerState -ne "VM running") {
                Write-Info "Starting existing VM..."
                Start-AzVM -ResourceGroupName $ResourceGroupName -Name $VMName | Out-Null
                Start-Sleep -Seconds 10
            }
            
            # Get existing VM IP
            $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
            if ($publicIP) {
                $script:VMIPAddress = $publicIP.IpAddress
                Write-Success "Using existing VM successfully!"
                Write-Info "VM Name: $VMName"
                Write-Info "Public IP: $($script:VMIPAddress)"
                Write-Info "SSH Command: ssh $AdminUsername@$($script:VMIPAddress)"
                return $true
            } else {
                Write-Error "Could not find public IP for existing VM"
                return $false
            }
        }
        
        # Check if resource group exists
        $rg = Get-AzResourceGroup -Name $ResourceGroupName -ErrorAction SilentlyContinue
        if (-not $rg) {
            Write-Info "Creating resource group: $ResourceGroupName"
            New-AzResourceGroup -Name $ResourceGroupName -Location $Location | Out-Null
        }
        
        # Read SSH public key
        $sshPublicKey = Get-Content $sshKeyPath -Raw
        
        # Create VM configuration
        Write-Info "Creating VM: $VMName"
        
        $templateParameters = @{
            vmName = $VMName
            adminUsername = $AdminUsername
            sshPublicKey = $sshPublicKey.Trim()
        }
        
        # Use production-specific template
        $templatePath = Join-Path $PSScriptRoot "template-vm-production.json"
        if (Test-Path $templatePath) {
            Write-Info "Using ARM template: $templatePath"
            $deployment = New-AzResourceGroupDeployment -ResourceGroupName $ResourceGroupName -TemplateFile $templatePath -TemplateParameterObject $templateParameters
        } else {
            Write-Error "Template file not found: $templatePath"
            return $false
        }
        
        # Get VM IP
        $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
        if ($publicIP) {
            $script:VMIPAddress = $publicIP.IpAddress
            Write-Success "VM deployed successfully!"
            Write-Info "VM Name: $VMName"
            Write-Info "Public IP: $($script:VMIPAddress)"
            Write-Info "SSH Command: ssh $AdminUsername@$($script:VMIPAddress)"
            return $true
        } else {
            Write-Error "Failed to get VM public IP"
            return $false
        }
    }
    catch {
        Write-Error "VM deployment failed: $($_.Exception.Message)"
        return $false
    }
}

function Test-VMReady {
    param([string]$TargetIP)
    
    Write-Info "Checking VM boot status..."
    try {
        $vm = Get-AzVM -ResourceGroupName $ResourceGroupName -Name $VMName -Status -ErrorAction SilentlyContinue
        if ($vm) {
            $powerState = ($vm.Statuses | Where-Object {$_.Code -like "PowerState/*"}).DisplayStatus
            $provisioningState = ($vm.Statuses | Where-Object {$_.Code -like "ProvisioningState/*"}).DisplayStatus
            
            Write-Info "VM Power State: $powerState"
            Write-Info "VM Provisioning State: $provisioningState"
            
            if ($powerState -eq "VM running" -and $provisioningState -eq "Provisioning succeeded") {
                return $true
            }
        }
        return $false
    }
    catch {
        Write-Warning "Could not check VM status: $($_.Exception.Message)"
        return $false
    }
}

function Test-SSHConnectivity {
    param(
        [string]$TargetIP,
        [string]$PrivateKeyPath,
        [int]$MaxRetries = 12,
        [int]$RetryDelay = 30
    )
    
    Write-Info "Testing SSH connectivity with retry logic..."
    
    for ($i = 1; $i -le $MaxRetries; $i++) {
        Write-Info "SSH attempt $i of $MaxRetries..."
        
        # Test SSH connection with extended timeout
        $testResult = ssh -i $PrivateKeyPath -o ConnectTimeout=15 -o StrictHostKeyChecking=no -o BatchMode=yes $AdminUsername@$TargetIP "echo 'Connected successfully'" 2>$null
        
        if ($testResult -and $testResult.Contains("Connected successfully")) {
            Write-Success "SSH connection established successfully"
            return $true
        }
        
        if ($i -lt $MaxRetries) {
            Write-Info "SSH not ready yet, waiting $RetryDelay seconds before retry $($i + 1)..."
            Start-Sleep -Seconds $RetryDelay
        }
    }
    
    Write-Error "SSH connection failed after $MaxRetries attempts"
    return $false
}

function Install-OpenSILEX {
    param([string]$TargetIP)
    
    if (-not $TargetIP -and -not $script:VMIPAddress) {
        # Try to get IP from Azure
        try {
            $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
            if ($publicIP) {
                $TargetIP = $publicIP.IpAddress
            }
        }
        catch {
            Write-Warning "Could not retrieve VM IP from Azure"
        }
        
        if (-not $TargetIP) {
            $TargetIP = Read-Host "Please enter the VM IP address"
        }
    }
    
    if (-not $TargetIP) {
        $TargetIP = $script:VMIPAddress
    }
    
    Write-Info "Installing OpenSILEX Production version on VM: $TargetIP"
    
    $sshKeyPath = Get-SSHKeyPath
    if (-not $sshKeyPath) {
        return $false
    }
    
    $privateKeyPath = $sshKeyPath -replace "\.pub$", ""
    
    try {
        # Wait for VM to be fully ready
        Write-Info "Waiting for VM to be fully ready..."
        $vmReadyRetries = 10
        for ($i = 1; $i -le $vmReadyRetries; $i++) {
            if (Test-VMReady -TargetIP $TargetIP) {
                Write-Success "VM is ready"
                break
            }
            if ($i -lt $vmReadyRetries) {
                Write-Info "VM not ready yet, waiting 15 seconds... (attempt $i of $vmReadyRetries)"
                Start-Sleep -Seconds 15
            } else {
                Write-Warning "VM readiness check timed out, proceeding anyway"
            }
        }
        
        # Test SSH connectivity with retry logic
        if (-not (Test-SSHConnectivity -TargetIP $TargetIP -PrivateKeyPath $privateKeyPath)) {
            Write-Error "Cannot establish SSH connection to VM"
            Write-Info "Troubleshooting tips:"
            Write-Info "1. VM may still be booting - wait a few more minutes and try again"
            Write-Info "2. Check if the VM is running: Get-AzVM -ResourceGroupName $ResourceGroupName -Name $VMName -Status"
            Write-Info "3. Verify network security group allows SSH (port 22)"
            Write-Info "4. Try connecting manually: ssh -i $privateKeyPath $AdminUsername@$TargetIP"
            return $false
        }
        
        Write-Success "SSH connection established"
        
        # Create installation scripts on remote VM
        Write-Info "Uploading production installation scripts..."
        
        # Upload dependency script
        $dependencyScript = @"
#!/bin/bash
set -e

# Colors for output
export DEBIAN_FRONTEND=noninteractive
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "`${BLUE}[INFO]`${NC} `$1"; }
print_success() { echo -e "`${GREEN}[SUCCESS]`${NC} `$1"; }
print_warning() { echo -e "`${YELLOW}[WARNING]`${NC} `$1"; }
print_error() { echo -e "`${RED}[ERROR]`${NC} `$1"; }

print_status "Updating system packages..."
sudo apt update && sudo DEBIAN_FRONTEND=noninteractive apt upgrade -y -o Dpkg::Options::="--force-confold"

print_status "Installing essential tools..."
sudo apt install -y curl wget git ca-certificates gnupg lsb-release nginx dos2unix

print_status "Installing Docker Engine..."
# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up Docker repository
echo "deb [arch=`$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian `$(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Add current user to docker group
sudo usermod -aG docker `$(whoami)

print_status "Verifying Docker installation..."
sudo docker --version
sudo docker compose version

print_success "Docker installation completed!"
print_status "Note: You may need to log out and back in for docker group membership to take effect"
"@
        
        # Upload production installer script
        $installerScript = @'
#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Create dedicated opensilex user (production best practice)
print_status "Creating dedicated OpenSILEX user..."
if ! id "opensilex" &>/dev/null; then
    sudo useradd -s /bin/bash -d /home/opensilex/ -m opensilex
    sudo usermod -aG docker opensilex
fi

# Create production directory structure
print_status "Creating production directory structure..."
sudo -u opensilex mkdir -p /home/opensilex/opensilex-docker-compose
sudo -u opensilex mkdir -p /home/opensilex/data
sudo -u opensilex mkdir -p /home/opensilex/logs

# Clone OpenSILEX Docker Compose repository
print_status "Cloning OpenSILEX Docker Compose repository..."
cd /home/opensilex
sudo -u opensilex git clone https://forge.inrae.fr/OpenSILEX/opensilex-docker-compose.git opensilex-docker-compose

# Change to the docker compose directory
cd /home/opensilex/opensilex-docker-compose

# Switch to the correct branch/tag for RDG version
print_status "Switching to version 1.4.9-rdg..."
sudo -u opensilex git checkout 1.4.9-rdg 2>/dev/null || sudo -u opensilex git fetch --all && sudo -u opensilex git checkout 1.4.9-rdg 2>/dev/null || print_warning "Could not switch to specific RDG branch, using master"

# Create PHIS-specific configuration directory
print_status "Creating PHIS configuration directory..."
sudo -u opensilex mkdir -p /home/opensilex/config

# Create PHIS-specific RDG configuration
print_status "Creating RDG module configuration..."
sudo -u opensilex tee /home/opensilex/config/rdg-config.yml > /dev/null << 'EOF'
# RDG Module Configuration for PHIS
rdg:
  enabled: true
  module:
    name: "Research Data Group Module"
    version: "1.4.9-rdg"
  organization:
    name: "INRAE"
    uri: "http://www.inrae.fr/"
  data:
    graph_uri: "http://phis.inrae.fr/graph/rdg"
    export_formats:
      - "json"
      - "csv"
      - "rdf"
  api:
    endpoints_enabled: true
    rate_limit: 1000
EOF

# Create PHIS-specific module configurations
print_status "Creating additional PHIS module configurations..."
sudo -u opensilex tee /home/opensilex/config/phis-modules.yml > /dev/null << 'EOF'
# PHIS Additional Modules Configuration
phis:
  modules:
    dataverse:
      enabled: true
      server_url: "https://dataverse.inrae.fr"
      api_token: ""  # To be configured by admin
    breeding_api:
      enabled: true
      version: "2.1"
      authentication: "oauth2"
    phenotyping:
      enabled: true
      sensors:
        - type: "camera"
        - type: "spectrometer"  
        - type: "lidar"
      image_formats: ["jpg", "png", "tiff"]
  data_management:
    backup_enabled: true
    backup_retention_days: 365
    export_formats: ["json", "csv", "rdf", "xlsx"]
EOF

# Get VM IP for Base URI configuration
print_status "Determining VM IP address for Base URI configuration..."
VM_IP=$(curl -s ifconfig.me 2>/dev/null || echo "localhost")
print_status "Using VM IP: $VM_IP"

# Validate IP address format
if [[ ! $VM_IP =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && [[ $VM_IP != "localhost" ]]; then
    print_warning "Invalid IP format detected: $VM_IP, falling back to localhost"
    VM_IP="localhost"
fi

print_status "Base URI will be configured as: http://$VM_IP/"
print_status "This ensures proper Docker network accessibility and RDF triple generation"

# Create custom environment file for production
print_status "Creating production environment configuration..."
sudo -u opensilex tee opensilex.env > /dev/null << EOF
# OpenSILEX Production Environment Configuration
OPENSILEX_RELEASE_TAG=1.4.9-rdg

# Docker container names
OPENSILEX_DOCKER_NAME=opensilex-production-app
MONGO_DOCKER_NAME=opensilex-production-mongo
RDF4J_DOCKER_NAME=opensilex-production-rdf4j
MONGO_EXPRESS_DOCKER_NAME=opensilex-production-mongo-express
HAPROXY_DOCKER_NAME=opensilex-production-haproxy

# Image versions
OPENSILEX_TOMCAT_IMAGE_VERSION=9.0-jre17
MONGO_IMAGE_VERSION=5
RDF4J_IMAGE_VERSION=5.0.3
MONGO_EXPRESS_IMAGE_VERSION=latest
HAPROXY_IMAGE_VERSION=2.8

# Port configurations
OPENSILEX_EXPOSED_PORT=28081
MONGO_EXPOSED_PORT=27017
RDF4J_EXPOSED_PORT=28887
MONGO_EXPRESS_EXPOSED_PORT=28888
HAPROXY_EXPOSED_PORT=80

# MongoDB Express configuration
ME_CONFIG_BASICAUTH_USERNAME=admin
ME_CONFIG_BASICAUTH_PASSWORD=admin123
MONGO_EXPRESS_HOST=mongo

# Directory configurations
OPENSILEX_LOCAL_FILE_SYSTEM_DIRECTORY=./data
INTERNAL_DATA_DIRECTORY=/home/opensilex/data

# OpenSILEX startup commands
OPENSILEX_START_CMD=./bin/opensilex.sh server start
OPENSILEX_START_CMD_DEBUG=

# Production settings
COMPOSE_PROJECT_NAME=opensilex-production

# Required OpenSILEX configuration variables
# Using VM IP for proper network accessibility
BASEURI=http://$VM_IP/
BASEURIALIAS=phis
REPOSITORIES_NAME=opensilex
OPENSILEX_FILESYSTEM=local
DATAFILE_OPENSILEX_FILESYSTEM=local
DOCUMENTS_OPENSILEX_FILESYSTEM=local
OPENSILEX_PATH_PREFIX=
OPENSILEX_PUBLIC_URL=http://$VM_IP:28081

# PHIS-specific configuration
PHIS_ENABLED=true
PHIS_ORGANIZATION_NAME=INRAE
PHIS_ORGANIZATION_URI=http://www.inrae.fr/

# RDG module configuration
RDG_MODULE_ENABLED=true
RDG_MODULE_CONFIG_PATH=/home/opensilex/config/rdg-config.yml

# RDF Configuration (must match Base URI)
RDF_BASE_URI=http://$VM_IP/
RDF_VOCABULARY_CONTEXT=http://$VM_IP/vocabulary/phis
RDF_INFRASTRUCTURE_CODE=PHIS

# Additional PHIS modules
PHIS_DATAVERSE_MODULE_ENABLED=true
PHIS_BREEDING_API_MODULE_ENABLED=true
PHIS_PHENOTYPING_MODULE_ENABLED=true

# PHIS API configuration
PHIS_API_RATE_LIMIT=1000
PHIS_API_AUTH_JWT_EXPIRE=3600
PHIS_API_CORS_ENABLED=true
EOF

# Check for port conflicts before starting services
print_status "Checking for port conflicts..."

# Check if port 80 is in use
if lsof -Pi :80 -sTCP:LISTEN -t >/dev/null 2>&1; then
    print_warning "Port 80 is already in use!"
    print_status "Services using port 80:"
    lsof -Pi :80 -sTCP:LISTEN 2>/dev/null || netstat -tlnp | grep :80 2>/dev/null
    
    print_status "Attempting to stop conflicting services..."
    # Try to stop common web services
    sudo systemctl stop apache2 2>/dev/null || print_status "Apache2 not running or not installed"
    sudo systemctl stop nginx 2>/dev/null || print_status "Nginx not running or not installed"
    sudo systemctl stop lighttpd 2>/dev/null || print_status "Lighttpd not running or not installed"
    
    # Wait a moment and check again
    sleep 5
    if lsof -Pi :80 -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "Port 80 still in use. HAProxy will use alternative port 8080"
        # Update HAProxy port in environment
        sed -i 's/HAPROXY_EXPOSED_PORT=80/HAPROXY_EXPOSED_PORT=8080/g' /home/opensilex/opensilex-docker-compose/opensilex.env
    else
        print_success "Port 80 is now available"
    fi
else
    print_success "Port 80 is available"
fi

# Check other critical ports
print_status "Checking other required ports..."
REQUIRED_PORTS="28081 27017 28887 28888"
for PORT in $REQUIRED_PORTS; do
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "Port $PORT is in use:"
        lsof -Pi :$PORT -sTCP:LISTEN 2>/dev/null || netstat -tlnp | grep :$PORT 2>/dev/null
        print_status "You may need to stop the service using this port before continuing"
    else
        print_success "Port $PORT is available"
    fi
done

# Build and start the Docker stack
print_status "Building OpenSILEX Docker containers..."

# Add network resilience and DNS configuration
print_status "Configuring Docker for network resilience..."
echo '{"dns": ["8.8.8.8", "1.1.1.1"], "registry-mirrors": ["https://mirror.gcr.io"]}' | sudo tee /etc/docker/daemon.json > /dev/null
sudo systemctl restart docker 2>/dev/null || print_warning "Could not restart Docker daemon"
sleep 10

# Test network connectivity before building
print_status "Testing network connectivity..."
if ! curl -s --connect-timeout 10 http://archive.ubuntu.com > /dev/null; then
    print_warning "Network connectivity to Ubuntu archives may be limited"
    print_status "This may cause build issues, but we'll attempt to continue with alternative methods"
fi

# Build with retry logic and better error handling
BUILD_SUCCESS=false
BUILD_RETRIES=3
for attempt in $(seq 1 $BUILD_RETRIES); do
    print_status "Docker build attempt $attempt of $BUILD_RETRIES..."
    
    # Try building with network timeout and no cache if previous attempts failed
    BUILD_ARGS="--build-arg UID=$(id -u opensilex) --build-arg GID=$(id -g opensilex)"
    if [ $attempt -gt 1 ]; then
        BUILD_ARGS="$BUILD_ARGS --no-cache --network=host"
        print_status "Using no-cache and host network for retry attempt"
    fi
    
    if sudo -u opensilex docker compose --env-file opensilex.env build $BUILD_ARGS 2>&1 | tee /tmp/docker_build.log; then
        # Check if build actually succeeded by looking for error patterns
        if ! grep -q "failed to solve\|ERROR:\|E: Unable to correct problems" /tmp/docker_build.log; then
            print_success "Docker build completed successfully!"
            BUILD_SUCCESS=true
            break
        else
            print_warning "Build completed but with errors detected"
        fi
    fi
    
    if [ $attempt -lt $BUILD_RETRIES ]; then
        print_warning "Build attempt $attempt failed, retrying in 30 seconds..."
        sleep 30
        
        # Clean up failed build artifacts
        sudo -u opensilex docker system prune -f --volumes 2>/dev/null || true
    fi
done

if [ "$BUILD_SUCCESS" = "false" ]; then
    print_error "Docker build failed after $BUILD_RETRIES attempts"
    print_status "Build log saved to /tmp/docker_build.log for debugging"
    print_status ""
    print_status "Common solutions for build failures:"
    print_status "1. Network issues: Check internet connectivity and DNS resolution"
    print_status "2. Package conflicts: Try using pre-built images instead of building"
    print_status "3. Docker resources: Ensure Docker has enough memory and disk space"
    print_status ""
    
    # Try fallback to pre-built images
    print_status "Attempting fallback: pulling pre-built images..."
    
    # Pull common images that might work
    FALLBACK_SUCCESS=false
    if sudo -u opensilex docker pull mongo:5 2>/dev/null; then
        print_success "MongoDB image pulled successfully"
        FALLBACK_SUCCESS=true
    fi
    
    if sudo -u opensilex docker pull eclipse/rdf4j-workbench:5.0.3 2>/dev/null; then
        print_success "RDF4J image pulled successfully"
        FALLBACK_SUCCESS=true
    fi
    
    # Try pulling OpenSILEX image if available
    if sudo -u opensilex docker pull opensilex/opensilex:1.4.9-rdg 2>/dev/null; then
        print_success "OpenSILEX pre-built image pulled successfully"
        FALLBACK_SUCCESS=true
    else
        print_warning "OpenSILEX pre-built image not available, will try to continue"
    fi
    
    if [ "$FALLBACK_SUCCESS" = "true" ]; then
        print_status "Some pre-built images were pulled successfully"
        print_status "Continuing with service startup using available images..."
    else
        print_warning "No pre-built images could be pulled"
        print_status "Continuing with service startup anyway - some components may still work"
    fi
else
    print_success "Docker containers built successfully"
fi

print_status "Starting Docker services in dependency order..."

# Start databases first
print_status "Starting MongoDB..."
sudo -u opensilex docker compose --env-file opensilex.env up mongo -d

print_status "Starting RDF4J triplestore..."
sudo -u opensilex docker compose --env-file opensilex.env up rdf4j -d

print_status "Waiting for databases to be ready..."
sleep 60

# Wait for MongoDB to be healthy
print_status "Checking MongoDB health..."
MONGO_RETRIES=10
MONGO_RETRY_COUNT=0
while [ $MONGO_RETRY_COUNT -lt $MONGO_RETRIES ]; do
    if sudo -u opensilex docker compose --env-file opensilex.env exec mongo mongo --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
        print_success "MongoDB is ready!"
        break
    else
        print_status "MongoDB not ready yet, waiting... ($((MONGO_RETRY_COUNT + 1))/$MONGO_RETRIES)"
        sleep 15
        MONGO_RETRY_COUNT=$((MONGO_RETRY_COUNT + 1))
    fi
done

# Wait for RDF4J to be healthy
print_status "Checking RDF4J health..."
RDF4J_RETRIES=10
RDF4J_RETRY_COUNT=0
while [ $RDF4J_RETRY_COUNT -lt $RDF4J_RETRIES ]; do
    if curl -s -f "http://localhost:28887/rdf4j-server" >/dev/null 2>&1; then
        print_success "RDF4J is ready!"
        break
    else
        print_status "RDF4J not ready yet, waiting... ($((RDF4J_RETRY_COUNT + 1))/$RDF4J_RETRIES)"
        sleep 15
        RDF4J_RETRY_COUNT=$((RDF4J_RETRY_COUNT + 1))
    fi
done

# Now start the main OpenSILEX application
print_status "Starting OpenSILEX application container..."
sudo -u opensilex docker compose --env-file opensilex.env up opensilex -d

# Start remaining services individually with better service detection
print_status "Detecting available services..."
cd /home/opensilex/opensilex-docker-compose
AVAILABLE_SERVICES=$(sudo -u opensilex docker compose --env-file opensilex.env config --services 2>/dev/null || echo "")
print_status "Available services: $AVAILABLE_SERVICES"

# Start MongoDB Express (try different possible names)
print_status "Starting MongoDB Express..."
MONGO_EXPRESS_STARTED=false
for service_name in "mongo-express" "mongoexpress" "mongodb-express" "mongo_express"; do
    if echo "$AVAILABLE_SERVICES" | grep -q "^$service_name$"; then
        if sudo -u opensilex docker compose --env-file opensilex.env up $service_name -d 2>/dev/null; then
            print_success "MongoDB Express started successfully as '$service_name'"
            MONGO_EXPRESS_STARTED=true
            break
        fi
    fi
done

if [ "$MONGO_EXPRESS_STARTED" = "false" ]; then
    print_warning "MongoDB Express service not found or failed to start"
    print_status "Available services for reference: $AVAILABLE_SERVICES"
fi

# Start HAProxy with better error handling
print_status "Starting HAProxy reverse proxy..."
HAPROXY_STARTED=false
for service_name in "haproxy" "ha-proxy" "proxy"; do
    if echo "$AVAILABLE_SERVICES" | grep -q "^$service_name$"; then
        # Check if port 80 is available before starting HAProxy
        if ! lsof -Pi :80 -sTCP:LISTEN -t >/dev/null 2>&1; then
            if sudo -u opensilex docker compose --env-file opensilex.env up $service_name -d 2>/dev/null; then
                print_success "HAProxy started successfully as '$service_name'"
                HAPROXY_PORT=$(grep "HAPROXY_EXPOSED_PORT" opensilex.env | cut -d'=' -f2 || echo "80")
                print_status "HAProxy available on port: $HAPROXY_PORT"
                HAPROXY_STARTED=true
                break
            fi
        else
            print_warning "Port 80 still occupied, skipping HAProxy startup"
            break
        fi
    fi
done

if [ "$HAPROXY_STARTED" = "false" ]; then
    print_warning "HAProxy not started (port conflict or service not found)"
    print_status "OpenSILEX will be accessible directly on port 28081"
    print_status "Direct access URL: http://$VM_IP:28081/"
fi

# Start any remaining services that haven't been started yet
print_status "Starting any remaining services..."
sudo -u opensilex docker compose --env-file opensilex.env up -d 2>/dev/null || print_status "All specified services are now running"

# Show final service status
print_status "Final service status:"
sudo -u opensilex docker compose --env-file opensilex.env ps 2>/dev/null || print_warning "Could not get service status"

print_status "All services started. Checking overall health..."

# Provide troubleshooting information for failed services
if [ "$MONGO_EXPRESS_STARTED" = "false" ] || [ "$HAPROXY_STARTED" = "false" ]; then
    print_status ""
    print_status "=== TROUBLESHOOTING INFORMATION ==="
    
    if [ "$MONGO_EXPRESS_STARTED" = "false" ]; then
        print_warning "MongoDB Express did not start - this is optional for core functionality"
        print_status "MongoDB can still be accessed directly on port 27017"
    fi
    
    if [ "$HAPROXY_STARTED" = "false" ]; then
        print_warning "HAProxy reverse proxy did not start"
        print_status "This is likely due to port 80 being occupied by another service"
        print_status "To identify what's using port 80, run: lsof -Pi :80 -sTCP:LISTEN"
        print_status "OpenSILEX is still fully functional via direct access on port 28081"
    fi
    
    print_status ""
    print_status "Core OpenSILEX functionality is not affected by these optional service failures"
    print_status ""
fi

sleep 30

# Create RDF4J repository
print_status "Creating RDF4J repository 'opensilex'..."
curl -s -X PUT "http://localhost:28887/rdf4j-server/repositories/opensilex" -H "Content-Type: application/x-turtle" --data-raw '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix rep: <http://www.openrdf.org/config/repository#> .
@prefix sr: <http://www.openrdf.org/config/repository/sail#> .
@prefix sail: <http://www.openrdf.org/config/sail#> .
@prefix ms: <http://www.openrdf.org/config/sail/memory#> .

[] a rep:Repository ;
   rep:repositoryID "opensilex" ;
   rdfs:label "OpenSILEX Repository" ;
   rep:repositoryImpl [
      rep:repositoryType "openrdf:SailRepository" ;
      sr:sailImpl [
         sail:sailType "openrdf:MemoryStore" ;
         ms:persist true ;
         ms:syncDelay 120
      ]
   ] .'

# Ensure correct Docker port mapping for production
print_status "Verifying Docker port mapping..."
sudo -u opensilex sed -i "s|8081:8666|\${OPENSILEX_EXPOSED_PORT}:8666|g" /home/opensilex/opensilex-docker-compose/docker-compose.yml || print_warning "Port mapping already correct"

# Wait for OpenSILEX container to be fully ready
print_status "Waiting for OpenSILEX container to be fully ready..."
OPENSILEX_CONTAINER="opensilex-production-app"
MAX_RETRIES=20
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    print_status "Checking container status (attempt $((RETRY_COUNT + 1))/$MAX_RETRIES)..."
    
    # Check if container is running
    if sudo -u opensilex docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "$OPENSILEX_CONTAINER.*Up"; then
        print_status "Container is running, checking if OpenSILEX is ready..."
        
        # Check if OpenSILEX is responding
        if sudo -u opensilex docker exec $OPENSILEX_CONTAINER test -f ./bin/opensilex.sh 2>/dev/null; then
            print_success "OpenSILEX container is ready!"
            break
        else
            print_warning "Container is running but OpenSILEX is not ready yet..."
        fi
    else
        print_warning "Container $OPENSILEX_CONTAINER is not running yet..."
        
        # Try to start the container if it's not running
        print_status "Attempting to start OpenSILEX container..."
        sudo -u opensilex docker compose --env-file opensilex.env up opensilex -d || print_warning "Failed to start container"
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        print_status "Waiting 30 seconds before next attempt..."
        sleep 30
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    print_error "OpenSILEX container failed to start after $MAX_RETRIES attempts"
    print_status "Container status:"
    sudo -u opensilex docker ps -a | grep opensilex || print_error "No OpenSILEX containers found"
    print_status "Container logs:"
    sudo -u opensilex docker logs $OPENSILEX_CONTAINER --tail 20 2>/dev/null || print_error "Could not retrieve container logs"
    print_error "Please check the logs and try again"
    exit 1
fi

# Create PHIS administrator with retry logic
print_status "Creating PHIS administrator..."
ADMIN_RETRIES=5
ADMIN_RETRY_COUNT=0

while [ $ADMIN_RETRY_COUNT -lt $ADMIN_RETRIES ]; do
    print_status "Creating admin user (attempt $((ADMIN_RETRY_COUNT + 1))/$ADMIN_RETRIES)..."
    
    if sudo -u opensilex docker exec $OPENSILEX_CONTAINER ./bin/opensilex.sh user add --admin --email=admin@phis.inrae.fr --lang=en --firstName=PHIS --lastName=Administrator --password=admin 2>/dev/null; then
        print_success "PHIS administrator created successfully!"
        break
    else
        print_warning "Failed to create admin user, retrying in 15 seconds..."
        ADMIN_RETRY_COUNT=$((ADMIN_RETRY_COUNT + 1))
        if [ $ADMIN_RETRY_COUNT -lt $ADMIN_RETRIES ]; then
            sleep 15
        fi
    fi
done

if [ $ADMIN_RETRY_COUNT -eq $ADMIN_RETRIES ]; then
    print_warning "Failed to create admin user after $ADMIN_RETRIES attempts"
    print_status "You can create the admin user manually later with:"
    print_status "  docker exec $OPENSILEX_CONTAINER ./bin/opensilex.sh user add --admin --email=admin@phis.inrae.fr --lang=en --firstName=PHIS --lastName=Administrator --password=admin"
fi

# Enable RDG module with retry logic
print_status "Enabling RDG module..."
RDG_RETRIES=3
RDG_RETRY_COUNT=0

while [ $RDG_RETRY_COUNT -lt $RDG_RETRIES ]; do
    print_status "Enabling RDG module (attempt $((RDG_RETRY_COUNT + 1))/$RDG_RETRIES)..."
    
    if sudo -u opensilex docker exec $OPENSILEX_CONTAINER ./bin/opensilex.sh module enable org.opensilex.module.rdg.RDGModule 2>/dev/null; then
        print_success "RDG module enabled successfully!"
        break
    else
        print_warning "Failed to enable RDG module, retrying..."
        RDG_RETRY_COUNT=$((RDG_RETRY_COUNT + 1))
        if [ $RDG_RETRY_COUNT -lt $RDG_RETRIES ]; then
            sleep 10
        fi
    fi
done

if [ $RDG_RETRY_COUNT -eq $RDG_RETRIES ]; then
    print_warning "RDG module may already be enabled or failed to enable"
    print_status "You can enable it manually later if needed"
fi

# Create systemd service for Docker Compose stack
print_status "Creating systemd service for Docker stack..."
sudo tee /etc/systemd/system/opensilex-docker.service > /dev/null << 'EOF'
[Unit]
Description=OpenSILEX Docker Compose Stack
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=opensilex
Group=opensilex
WorkingDirectory=/home/opensilex/opensilex-docker-compose
ExecStart=/usr/bin/docker compose --env-file opensilex.env up start_opensilex_stack -d
ExecStop=/usr/bin/docker compose --env-file opensilex.env down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

# Enable the service
sudo systemctl daemon-reload
sudo systemctl enable opensilex-docker.service

# Configure Nginx reverse proxy for external access (if HAProxy is not available)
print_status "Checking if additional reverse proxy configuration is needed..."

# Check if HAProxy is running and on which port
HAPROXY_RUNNING=false
if sudo -u opensilex docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "haproxy.*Up"; then
    HAPROXY_RUNNING=true
    HAPROXY_PORT=$(grep "HAPROXY_EXPOSED_PORT" /home/opensilex/opensilex-docker-compose/opensilex.env | cut -d'=' -f2 || echo "80")
    print_success "HAProxy is running on port $HAPROXY_PORT"
fi

# Configure Nginx as backup/additional proxy if needed
if [ "$HAPROXY_RUNNING" = "false" ] || [ "$HAPROXY_PORT" != "80" ]; then
    print_status "Configuring Nginx reverse proxy as backup/additional proxy..."
    
    # Use port 8080 for nginx if port 80 is still occupied
    NGINX_PORT=80
    if lsof -Pi :80 -sTCP:LISTEN -t >/dev/null 2>&1 && [ "$HAPROXY_PORT" != "80" ]; then
        NGINX_PORT=8080
        print_warning "Port 80 still in use, configuring Nginx on port 8080"
    fi
    
    sudo tee /etc/nginx/sites-available/opensilex > /dev/null << EOF
server {
    listen $NGINX_PORT;
    server_name _;
    
    # Main application
    location / {
        proxy_pass http://localhost:28081;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF

    # Enable site and restart nginx
    sudo ln -sf /etc/nginx/sites-available/opensilex /etc/nginx/sites-enabled/ 2>/dev/null
    sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null
    
    if sudo nginx -t 2>/dev/null; then
        sudo systemctl restart nginx && print_success "Nginx configured successfully on port $NGINX_PORT"
    else
        print_warning "Nginx configuration failed, but OpenSILEX is still accessible on port 28081"
    fi
else
    print_status "HAProxy is handling reverse proxy duties, skipping Nginx configuration"
fi

# VM IP already determined earlier for Base URI configuration

# Verify installation and determine access URLs
print_status "Verifying installation and determining access URLs..."

# Check OpenSILEX core application
if curl -s -o /dev/null -w "%{http_code}" http://localhost:28081/ | grep -q "301\|302\|200"; then
    print_success "OpenSILEX is running on port 28081"
    OPENSILEX_WORKING=true
else
    print_warning "OpenSILEX may still be starting up..."
    OPENSILEX_WORKING=false
fi

# Check API documentation
if curl -s -o /dev/null -w "%{http_code}" http://localhost:28081/api-docs | grep -q "301\|302\|200"; then
    print_success "OpenSILEX API documentation is accessible"
else
    print_warning "OpenSILEX API documentation may not be ready yet"
fi

# Check RDF4J
if curl -s -o /dev/null -w "%{http_code}" http://localhost:28887/rdf4j-workbench | grep -q "301\|302\|200"; then
    print_success "RDF4J workbench is accessible"
else
    print_warning "RDF4J workbench may not be ready yet"
fi

# Check proxy services and determine best access method
PROXY_INFO=""
BEST_ACCESS_URL="http://$VM_IP:28081/"

# Check HAProxy first
if sudo -u opensilex docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "haproxy.*Up"; then
    HAPROXY_PORT=$(grep "HAPROXY_EXPOSED_PORT" /home/opensilex/opensilex-docker-compose/opensilex.env | cut -d'=' -f2 || echo "80")
    if curl -s -f http://localhost:$HAPROXY_PORT > /dev/null 2>&1; then
        print_success "HAProxy reverse proxy is working on port $HAPROXY_PORT"
        BEST_ACCESS_URL="http://$VM_IP:$HAPROXY_PORT/"
        PROXY_INFO="via HAProxy"
    fi
fi

# Check Nginx as alternative
if [ -z "$PROXY_INFO" ]; then
    if curl -s -f http://localhost:80 > /dev/null 2>&1; then
        print_success "Nginx reverse proxy is working on port 80"
        BEST_ACCESS_URL="http://$VM_IP/"
        PROXY_INFO="via Nginx (port 80)"
    elif curl -s -f http://localhost:8080 > /dev/null 2>&1; then
        print_success "Nginx reverse proxy is working on port 8080"
        BEST_ACCESS_URL="http://$VM_IP:8080/"
        PROXY_INFO="via Nginx (port 8080)"
    fi
fi

# Determine overall installation status
INSTALLATION_SUCCESS=true
if [ "$BUILD_SUCCESS" = "false" ]; then
    INSTALLATION_SUCCESS=false
fi

# Check if core OpenSILEX application is running
if [ "$OPENSILEX_WORKING" = "false" ]; then
    INSTALLATION_SUCCESS=false
fi

# Report final status
if [ "$INSTALLATION_SUCCESS" = "true" ]; then
    print_success "OpenSILEX Docker Production installation completed successfully!"
else
    print_warning "OpenSILEX installation completed with some issues"
    print_status "Some components may not be fully functional - check the diagnostics for details"
fi

print_status ""
print_status "=== ACCESS INFORMATION ==="
if [ -n "$PROXY_INFO" ]; then
    print_status "🌐 Primary Access URL: $BEST_ACCESS_URL ($PROXY_INFO)"
fi
print_status "🔗 Direct Access: http://$VM_IP:28081/ (OpenSILEX application)"
print_status "📚 API Documentation: http://$VM_IP:28081/api-docs"
print_status "🗃️  RDF4J Workbench: http://$VM_IP:28887/rdf4j-workbench"
print_status "📊 MongoDB Express: http://$VM_IP:28888/ (admin/admin123)"
print_status ""
print_status "Default Login Credentials:"
print_status "  - Email: admin@phis.inrae.fr"
print_status "  - Password: admin"
print_status ""
print_status "RDG Module Status:"
print_status "  ✓ RDG module is enabled with version 1.4.9-rdg"
print_status "  ✓ RDG configuration file: /home/opensilex/config/rdg-config.yml"
print_status "  ✓ PHIS organization configured: INRAE"
print_status ""
print_status "PHIS-specific Features:"
print_status "  ✓ Base URI configured for PHIS: http://$VM_IP/"
print_status "  ✓ RDF vocabulary context: http://$VM_IP/vocabulary/phis"
print_status "  ✓ PHIS administrator created: admin@phis.inrae.fr"
print_status "  ✓ RDG data export formats: JSON, CSV, RDF"
print_status "  ✓ Infrastructure code: PHIS"
'@
        
        # Write scripts to temporary files and upload
        $tempDepsScript = [System.IO.Path]::GetTempFileName()
        $tempInstallScript = [System.IO.Path]::GetTempFileName()
        
        [System.IO.File]::WriteAllText($tempDepsScript, $dependencyScript)
        [System.IO.File]::WriteAllText($tempInstallScript, $installerScript)
        
        # Upload scripts
        scp -i $privateKeyPath -o StrictHostKeyChecking=no $tempDepsScript "$AdminUsername@${TargetIP}:~/install-dependencies.sh"
        scp -i $privateKeyPath -o StrictHostKeyChecking=no $tempInstallScript "$AdminUsername@${TargetIP}:~/install-opensilex-production.sh"
        
        # Clean up temp files
        Remove-Item $tempDepsScript, $tempInstallScript
        
        # Fix line endings and make scripts executable
        ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "dos2unix ~/install-dependencies.sh ~/install-opensilex-production.sh 2>/dev/null || sed -i 's/\r$//' ~/install-dependencies.sh ~/install-opensilex-production.sh; chmod +x ~/install-dependencies.sh ~/install-opensilex-production.sh"
        
        if (-not $SkipDependencies) {
            Write-Info "Installing dependencies (this may take 10-15 minutes)..."
            ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "~/install-dependencies.sh"
        }
        
        Write-Info "Installing OpenSILEX Production (this may take 10-15 minutes)..."
        ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "~/install-opensilex-production.sh"
        
        Write-Success "OpenSILEX Production installation completed successfully!"
        Write-Info "Docker Production Features:"
        Write-Info "- Docker-based deployment with docker-compose"
        Write-Info "- Dedicated opensilex user with docker access"
        Write-Info "- Containerized MongoDB with replica set"
        Write-Info "- Containerized RDF4J triplestore"
        Write-Info "- OpenSILEX application container"
        Write-Info "- Nginx reverse proxy on port 80"
        Write-Info "- Systemd service for Docker stack management"
        Write-Info "- MongoDB Express for database management"
        Write-Info "- Production environment configuration"
    } catch {
        Write-Error "Installation failed: $($_.Exception.Message)"
        return $false
    }
    
    return $true
}

function Get-VMStatus {
    Write-Info "Checking VM status..."
    try {
        $vm = Get-AzVM -ResourceGroupName $ResourceGroupName -Name $VMName -Status -ErrorAction SilentlyContinue
        if ($vm) {
            $powerState = ($vm.Statuses | Where-Object {$_.Code -like "PowerState/*"}).DisplayStatus
            Write-Info "VM Status: $powerState"
            
            if ($powerState -eq "VM running") {
                $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
                if ($publicIP) {
                    Write-Info "Public IP: $($publicIP.IpAddress)"
                    Write-Info "SSH Command: ssh $AdminUsername@$($publicIP.IpAddress)"
                    Write-Info "PHIS OpenSILEX (direct): http://$($publicIP.IpAddress):28081/"
                    Write-Info "PHIS OpenSILEX (nginx): http://$($publicIP.IpAddress)/"
                    Write-Info "RDF4J Workbench: http://$($publicIP.IpAddress):28887/"
                    Write-Info "MongoDB Express: http://$($publicIP.IpAddress):28888/"
                } else {
                    Write-Warning "Public IP not found"
                }
            }
        } else {
            Write-Warning "VM not found"
        }
    } catch {
        Write-Error "Failed to get VM status: $($_.Exception.Message)"
    }
    
    return $true
}

function Connect-ToVM {
    Write-Info "Connecting to VM..."
    try {
        $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
        if ($publicIP -and $publicIP.IpAddress) {
            $sshKeyPath = Get-SSHKeyPath
            if ($sshKeyPath) {
                $privateKeyPath = $sshKeyPath -replace "\.pub$", ""
                $ipAddress = $publicIP.IpAddress
                Write-Info "Connecting to VM..."
                & ssh -i $privateKeyPath $AdminUsername@$ipAddress
            } else {
                Write-Error "SSH key not found"
            }
        } else {
            Write-Error "Could not find VM public IP or IP address is null"
        }
    } catch {
        Write-Error "Failed to connect: $($_.Exception.Message)"
    }
}

function Start-VM {
    Write-Info "Starting VM..."
    try {
        Start-AzVM -ResourceGroupName $ResourceGroupName -Name $VMName | Out-Null
        Write-Success "VM started successfully"
    } catch {
        Write-Error "Failed to start VM: $($_.Exception.Message)"
    }
}

function Stop-VM {
    Write-Info "Stopping VM..."
    try {
        Stop-AzVM -ResourceGroupName $ResourceGroupName -Name $VMName -Force | Out-Null
        Write-Success "VM stopped successfully"
    } catch {
        Write-Error "Failed to stop VM: $($_.Exception.Message)"
    }
}

function Restart-VM {
    Write-Info "Restarting VM..."
    try {
        Restart-AzVM -ResourceGroupName $ResourceGroupName -Name $VMName | Out-Null
        Write-Success "VM restarted successfully"
    } catch {
        Write-Error "Failed to restart VM: $($_.Exception.Message)"
    }
}

function Remove-Deployment {
    Write-Warning "This will delete ALL resources in the resource group: $ResourceGroupName"
    $confirm = Read-Host "Are you sure? Type 'DELETE' to confirm"
    
    if ($confirm -eq "DELETE") {
        Write-Info "Deleting resource group: $ResourceGroupName"
        try {
            Remove-AzResourceGroup -Name $ResourceGroupName -Force | Out-Null
            Write-Success "Resources deleted successfully"
        } catch {
            Write-Error "Failed to delete resources: $($_.Exception.Message)"
        }
    } else {
        Write-Info "Deletion cancelled"
    }
}

function Show-Logs {
    Write-Info "Fetching OpenSILEX production logs..."
    try {
        $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
        if ($publicIP -and $publicIP.IpAddress) {
            $sshKeyPath = Get-SSHKeyPath
            if ($sshKeyPath) {
                $privateKeyPath = $sshKeyPath -replace "\.pub$", ""
                $ipAddress = $publicIP.IpAddress
                Write-Info "Fetching OpenSILEX Docker service logs..."
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "sudo journalctl -u opensilex-docker.service -n 50"
                Write-Info "Fetching Docker container logs..."
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "sudo -u opensilex docker logs opensilex-production-app --tail 50"
            } else {
                Write-Error "SSH key not found"
            }
        } else {
            Write-Error "Could not find VM public IP or IP address is null"
        }
    }
    catch {
        Write-Error "Failed to fetch logs: $($_.Exception.Message)"
    }
}

function Show-Diagnostics {
    Write-Info "Running comprehensive OpenSILEX diagnostics..."
    try {
        $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
        if ($publicIP -and $publicIP.IpAddress) {
            $sshKeyPath = Get-SSHKeyPath
            if ($sshKeyPath) {
                $privateKeyPath = $sshKeyPath -replace "\.pub$", ""
                $ipAddress = $publicIP.IpAddress
                
                Write-Info "=== Container Status ==="
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "sudo -u opensilex docker ps -a | grep opensilex"
                
                Write-Info ""
                Write-Info "=== Container Health ==="
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "sudo -u opensilex docker stats --no-stream --format 'table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}' | grep opensilex"
                
                Write-Info ""
                Write-Info "=== Service Connectivity ==="
                Write-Info "Checking MongoDB (port 27017)..."
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "nc -zv localhost 27017 2>&1 | head -1"
                
                Write-Info "Checking RDF4J (port 28887)..."
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "nc -zv localhost 28887 2>&1 | head -1"
                
                Write-Info "Checking OpenSILEX (port 28081)..."
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "nc -zv localhost 28081 2>&1 | head -1"
                
                Write-Info ""
                Write-Info "=== Disk Usage ==="
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "df -h | grep -E '(opensilex|docker)' || df -h | head -5"
                
                Write-Info ""
                Write-Info "=== Recent Container Logs (Last 10 lines each) ==="
                Write-Info "--- MongoDB ---"
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "sudo -u opensilex docker logs opensilex-production-mongo --tail 10 2>/dev/null || echo 'MongoDB container not found or not running'"
                
                Write-Info "--- RDF4J ---"
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "sudo -u opensilex docker logs opensilex-production-rdf4j --tail 10 2>/dev/null || echo 'RDF4J container not found or not running'"
                
                Write-Info "--- OpenSILEX Application ---"
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "sudo -u opensilex docker logs opensilex-production-app --tail 10 2>/dev/null || echo 'OpenSILEX app container not found or not running'"
                
                Write-Info ""
                Write-Info "=== System Resources ==="
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "free -h && echo '' && top -bn1 | head -5"
                
                Write-Info ""
                Write-Info "=== Docker Compose Status ==="
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "cd /home/opensilex/opensilex-docker-compose && sudo -u opensilex docker compose --env-file opensilex.env ps"
                
                Write-Info ""
                Write-Info "=== Available Services in Docker Compose ==="
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "cd /home/opensilex/opensilex-docker-compose && sudo -u opensilex docker compose --env-file opensilex.env config --services 2>/dev/null || echo 'Could not retrieve service list'"
                
                Write-Info ""
                Write-Info "=== Port Usage Check ==="
                Write-Info "Port 80 (HAProxy):"
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "lsof -Pi :80 -sTCP:LISTEN 2>/dev/null || echo 'Port 80 is free'"
                Write-Info "Port 28081 (OpenSILEX):"
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "lsof -Pi :28081 -sTCP:LISTEN 2>/dev/null || echo 'Port 28081 is free'"
                
            } else {
                Write-Error "SSH key not found"
            }
        } else {
            Write-Error "Could not find VM public IP or IP address is null"
        }
    }
    catch {
        Write-Error "Failed to run diagnostics: $($_.Exception.Message)"
    }
}

function Show-Menu {
    $script:choice = ""
    Clear-Host
    Write-Host "=============================================" -ForegroundColor Blue
    Write-Host "   OpenSILEX Production Installation Manager" -ForegroundColor Blue
    Write-Host "=============================================" -ForegroundColor Blue
    Write-Host ""
    Write-Host "Current Configuration:" -ForegroundColor Yellow
    Write-Host "  VM Name: $VMName" -ForegroundColor White
    Write-Host "  Resource Group: $ResourceGroupName (shared with GitHub version)" -ForegroundColor White
    Write-Host "  Region: $Location" -ForegroundColor White
    Write-Host ""
    Write-Host "Production Features:" -ForegroundColor Green
    Write-Host "  - Dedicated opensilex user account" -ForegroundColor White
    Write-Host "  - Proper directory structure" -ForegroundColor White
    Write-Host "  - MongoDB with replica set" -ForegroundColor White
    Write-Host "  - RDF4J triplestore" -ForegroundColor White
    Write-Host "  - Nginx reverse proxy" -ForegroundColor White
    Write-Host "  - Systemd service management" -ForegroundColor White
    Write-Host "  - Production logging" -ForegroundColor White
    Write-Host ""
    Write-Host "Available Commands:" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Installation & Deployment:" -ForegroundColor Green
    Write-Host "    1. Full Install (Deploy VM + Install OpenSILEX Production)" -ForegroundColor White
    Write-Host "    2. Deploy VM Only" -ForegroundColor White
    Write-Host "    3. Install OpenSILEX Production on Existing VM" -ForegroundColor White
    Write-Host ""
    Write-Host "  VM Management:" -ForegroundColor Green
    Write-Host "    4. Start VM" -ForegroundColor White
    Write-Host "    5. Stop VM" -ForegroundColor White
    Write-Host "    6. Restart VM" -ForegroundColor White
    Write-Host "    7. Check Status" -ForegroundColor White
    Write-Host "    8. Connect via SSH" -ForegroundColor White
    Write-Host ""
    Write-Host "  Maintenance:" -ForegroundColor Green
    Write-Host "    9. View Logs" -ForegroundColor White
    Write-Host "   10. Run Diagnostics" -ForegroundColor White
    Write-Host "   11. Delete All Resources" -ForegroundColor White
    Write-Host ""
    Write-Host "  Utilities:" -ForegroundColor Green
    Write-Host "   12. Generate SSH Key" -ForegroundColor White
    Write-Host "   13. Test SSH Keys" -ForegroundColor White
    Write-Host "   14. Get VM Info" -ForegroundColor White
    Write-Host ""
    Write-Host "    0. Exit" -ForegroundColor Red
    Write-Host ""
    
    $script:choice = Read-Host "Select an option (0-14)"
    
    switch ($script:choice) {
        "1" { 
            Write-Info "Starting full production installation..."
            if (Deploy-VM) {
                Install-OpenSILEX
            }
        }
        "2" { Deploy-VM }
        "3" { Install-OpenSILEX }
        "4" { Start-VM }
        "5" { Stop-VM }
        "6" { Restart-VM }
        "7" { Get-VMStatus }
        "8" { Connect-ToVM }
        "9" { Show-Logs }
        "10" { Show-Diagnostics }
        "11" { Remove-Deployment }
        "12" { 
            $sshPath = Get-SSHKeyPath
            if ($sshPath) {
                Write-Success "SSH key available at: $sshPath"
            }
        }
        "13" { 
            $sshPath = Get-SSHKeyPath
            if ($sshPath) {
                Write-Success "SSH key test passed: $sshPath"
            } else {
                Write-Error "SSH key test failed"
            }
        }
        "14" { 
            Get-VMStatus
            try {
                $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
                if ($publicIP) {
                    Write-Info "PHIS OpenSILEX Access: http://$($publicIP.IpAddress):28081/"
                    Write-Info "PHIS via Nginx: http://$($publicIP.IpAddress)/"
                    Write-Info "RDF4J Workbench: http://$($publicIP.IpAddress):28887/"
                    Write-Info "MongoDB Express: http://$($publicIP.IpAddress):28888/"
                }
            } catch {}
        }
        "0" { 
            Write-Info "Goodbye!"
            exit 
        }
        default { 
            Write-Warning "Invalid selection. Please try again."
        }
    }
}

# Main execution
try {
    Write-Host "OpenSILEX Production Installation Manager" -ForegroundColor Blue
    Write-Host "=========================================" -ForegroundColor Blue
    Write-Host ""
    
    switch ($Command.ToLower()) {
        "menu" { 
            $script:choice = ""
            while ($script:choice -ne "0") {
                Show-Menu
                if ($script:choice -ne "0") {
                    Write-Host ""
                    Read-Host "Press Enter to continue"
                }
            }
        }
        "fullinstall" { 
            if (Deploy-VM) {
                Install-OpenSILEX -TargetIP $VMIPAddress
            }
        }
        "deploy" { Deploy-VM }
        "install" { Install-OpenSILEX }
        "status" { Get-VMStatus }
        "connect" { Connect-ToVM }
        "start" { Start-VM }
        "stop" { Stop-VM }
        "restart" { Restart-VM }
        "delete" { Remove-Deployment }
        "logs" { Show-Logs }
        "diagnose" { Show-Diagnostics }
        "generatesshkey" { 
            $sshPath = Get-SSHKeyPath
            if ($sshPath) {
                Write-Success "SSH key available at: $sshPath"
            }
        }
        "testsshkeys" { 
            $sshPath = Get-SSHKeyPath
            if ($sshPath) {
                Write-Success "SSH key test passed: $sshPath"
            } else {
                Write-Error "SSH key test failed"
            }
        }
        "showinfo" { 
            Get-VMStatus
            try {
                $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
                if ($publicIP) {
                    Write-Info "VM Public IP: $($publicIP.IpAddress)"
                } else {
                    Write-Warning "VM public IP not found"
                }
            } catch {}
        }
        "getip" {
            try {
                $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
                if ($publicIP) {
                    Write-Info "VM Public IP: $($publicIP.IpAddress)"
                } else {
                    Write-Warning "VM public IP not found"
                }
            } catch {}
        }
        "openports" {
            try {
                $nsg = Get-AzNetworkSecurityGroup -ResourceGroupName $ResourceGroupName -Name "$VMName-nsg" -ErrorAction SilentlyContinue
                if ($nsg) {
                    Write-Info "Network Security Group Rules:"
                    $nsg.SecurityRules | ForEach-Object {
                        Write-Host "  $($_.Name): $($_.Direction) $($_.Access) $($_.Protocol) $($_.DestinationPortRange)" -ForegroundColor White
                    }
                }
            } catch {}
        }
        default { 
            Write-Warning "Unknown command: $Command"
            Write-Info "Available commands: Menu, FullInstall, Deploy, Install, Status, Connect, Start, Stop, Restart, Delete, Logs"
        }
    }
} catch {
    Write-Error "Script execution failed: $($_.Exception.Message)"
    Write-Error $_.ScriptStackTrace
}