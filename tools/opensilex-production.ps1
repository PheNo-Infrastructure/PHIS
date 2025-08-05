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
sudo apt install -y curl wget git ca-certificates gnupg lsb-release

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

# Create custom environment file for production
print_status "Creating production environment configuration..."
sudo -u opensilex tee opensilex.env > /dev/null << 'EOF'
# OpenSILEX Production Environment Configuration
OPENSILEX_RELEASE_TAG=1.4.9

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
BASEURI=http://opensilex.test/
BASEURIALIAS=test
REPOSITORIES_NAME=opensilex
OPENSILEX_FILESYSTEM=local
DATAFILE_OPENSILEX_FILESYSTEM=local
DOCUMENTS_OPENSILEX_FILESYSTEM=local
OPENSILEX_PATH_PREFIX=
OPENSILEX_PUBLIC_URL=http://$VM_IP:28081
EOF

# Build and start the Docker stack
print_status "Building OpenSILEX Docker containers..."
sudo -u opensilex docker compose --env-file opensilex.env build --build-arg UID=$(id -u opensilex) --build-arg GID=$(id -g opensilex)

print_status "Starting OpenSILEX Docker stack..."
sudo -u opensilex docker compose --env-file opensilex.env up start_opensilex_stack -d

# Wait for services to start
print_status "Waiting for services to initialize (this may take 2-3 minutes)..."
sleep 180

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

# Fix Docker port mapping for OpenSILEX (from 8081 to 8666)
print_status "Fixing Docker port mapping..."
sudo -u opensilex sed -i "s|OPENSILEX_EXPOSED_PORT:8081|OPENSILEX_EXPOSED_PORT:8666|g" /home/opensilex/opensilex-docker-compose/docker-compose.yml

# Restart OpenSILEX container with correct port mapping
print_status "Restarting OpenSILEX container with correct port mapping..."
sudo -u opensilex docker compose --env-file opensilex.env -f /home/opensilex/opensilex-docker-compose/docker-compose.yml stop opensilex
sudo -u opensilex docker compose --env-file opensilex.env -f /home/opensilex/opensilex-docker-compose/docker-compose.yml up opensilex -d

# Wait for OpenSILEX to restart
print_status "Waiting for OpenSILEX to restart..."
sleep 60

# Create default administrator
print_status "Creating default administrator..."
OPENSILEX_CONTAINER="opensilex-production-app"
print_status "Creating admin user in container: $OPENSILEX_CONTAINER"
sudo -u opensilex docker exec $OPENSILEX_CONTAINER ./bin/opensilex.sh user add --admin --email=admin@opensilex.org --lang=en --firstName=Admin --lastName=User --password=admin

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

# Configure Nginx reverse proxy for external access
print_status "Configuring Nginx reverse proxy..."
sudo tee /etc/nginx/sites-available/opensilex > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;
    
    # Main application
    location / {
        proxy_pass http://localhost:28081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
    }
}
EOF

# Enable site and restart nginx
sudo ln -sf /etc/nginx/sites-available/opensilex /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

# Get VM IP for access URLs
VM_IP=$(curl -s ifconfig.me 2>/dev/null || echo "localhost")

# Verify installation
print_status "Verifying installation..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:28081/ | grep -q "301\|302\|200"; then
    print_success "OpenSILEX is running on Docker port 28081"
else
    print_warning "OpenSILEX may still be starting up..."
fi

if curl -s -o /dev/null -w "%{http_code}" http://localhost:28081/api-docs | grep -q "301\|302\|200"; then
    print_success "OpenSILEX API documentation is accessible"
else
    print_warning "OpenSILEX API documentation may not be ready yet"
fi

if curl -s -o /dev/null -w "%{http_code}" http://localhost:28887/rdf4j-workbench | grep -q "301\|302\|200"; then
    print_success "RDF4J workbench is accessible"
else
    print_warning "RDF4J workbench may not be ready yet"
fi

if curl -f http://localhost:80 > /dev/null 2>&1; then
    print_success "Nginx reverse proxy is working on port 80"
else
    print_warning "Nginx reverse proxy may need time to start"
fi

print_success "OpenSILEX Docker Production installation completed!"
print_status "Access Information:"
print_status "  - Web Application: http://$VM_IP:28081/ (redirects to /app/)"
print_status "  - API Documentation: http://$VM_IP:28081/api-docs"
print_status "  - RDF4J Workbench: http://$VM_IP:28887/rdf4j-workbench"
print_status "  - MongoDB Express: http://$VM_IP:28888 (admin/admin123)"
print_status "  - Via Nginx Proxy: http://$VM_IP/ (if configured)"
print_status ""
print_status "Default Login Credentials:"
print_status "  - Email: admin@opensilex.org"
print_status "  - Password: admin"
print_status ""
print_status "RDG Module Activation:"
print_status "  To enable RDG module, change OPENSILEX_RELEASE_TAG to: 1.2.1-rdg"
print_status "  Then restart: docker compose --env-file opensilex.env restart"
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
                    Write-Info "OpenSILEX URL (direct): http://$($publicIP.IpAddress):8081/"
                    Write-Info "OpenSILEX URL (nginx): http://$($publicIP.IpAddress)/"
                    Write-Info "Admin Interface: http://$($publicIP.IpAddress):4081/"
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
                Write-Info "Fetching OpenSILEX service logs..."
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "sudo journalctl -u opensilex.service -n 50"
                Write-Info "Fetching application logs..."
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "sudo tail -n 20 /home/opensilex/logs/opensilex.log"
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
    Write-Host "   10. Delete All Resources" -ForegroundColor White
    Write-Host ""
    Write-Host "  Utilities:" -ForegroundColor Green
    Write-Host "   11. Generate SSH Key" -ForegroundColor White
    Write-Host "   12. Test SSH Keys" -ForegroundColor White
    Write-Host "   13. Get VM Info" -ForegroundColor White
    Write-Host ""
    Write-Host "    0. Exit" -ForegroundColor Red
    Write-Host ""
    
    $script:choice = Read-Host "Select an option (0-13)"
    
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
        "10" { Remove-Deployment }
        "11" { 
            $sshPath = Get-SSHKeyPath
            if ($sshPath) {
                Write-Success "SSH key available at: $sshPath"
            }
        }
        "12" { 
            $sshPath = Get-SSHKeyPath
            if ($sshPath) {
                Write-Success "SSH key test passed: $sshPath"
            } else {
                Write-Error "SSH key test failed"
            }
        }
        "13" { 
            Get-VMStatus
            try {
                $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
                if ($publicIP) {
                    Write-Info "OpenSILEX Direct Access: http://$($publicIP.IpAddress):8081/"
                    Write-Info "OpenSILEX via Nginx: http://$($publicIP.IpAddress)/"
                    Write-Info "Admin Interface: http://$($publicIP.IpAddress):4081/"
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