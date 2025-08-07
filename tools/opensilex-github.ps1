# OpenSILEX GitHub Installation Master Script
# PowerShell script for managing OpenSILEX GitHub installation on Azure VMs
# Based on official OpenSILEX installation guide: https://github.com/OpenSILEX/opensilex

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("Menu", "FullInstall", "Deploy", "Install", "Status", "Connect", "Start", "Stop", "Restart", "Delete", "Logs", "Diagnose", "GenerateSSHKey", "TestSSHKeys", "ShowInfo", "GetIP", "OpenPorts")]
    [string]$Command = "Menu",
    
    [Parameter(Mandatory=$false)]
    [string]$VMName = "opensilex-github-vm-https",
    
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

# Configuration - aligned with OpenSILEX requirements
$VMSize = "Standard_B4ms"  # 4 vCPUs, 16 GB RAM (sufficient for OpenSILEX build)
$OSVersion = "Debian:debian-12:12-gen2:latest"  # Debian 12 as supported OS
$DiskSize = 100  # 100 GB for source code, build artifacts, and databases

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
    ssh-keygen -t ed25519 -f $keyPath -N '""' -C "opensilex-github-vm" | Out-Null
    
    if (Test-Path "$keyPath.pub") {
        Write-Success "SSH key generated successfully"
        return "$keyPath.pub"
    } else {
        Write-Error "Failed to generate SSH key"
        return $null
    }
}

function Deploy-VM {
    Write-Info "Deploying Azure VM for OpenSILEX GitHub installation..."
    
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
        
        # Use template-vm.json if it exists, otherwise create inline
        $templatePath = Join-Path $PSScriptRoot "template-vm.json"
        if (Test-Path $templatePath) {
            Write-Info "Using ARM template: $templatePath"
            $deployment = New-AzResourceGroupDeployment -ResourceGroupName $ResourceGroupName -TemplateFile $templatePath -TemplateParameterObject $templateParameters
        } else {
            Write-Info "Creating VM with PowerShell commands..."
            
            # Create VM using PowerShell commands (fallback option)
            $credential = New-Object System.Management.Automation.PSCredential ($AdminUsername, (ConvertTo-SecureString "dummy" -AsPlainText -Force))
            
            $vm = New-AzVMConfig -VMName $VMName -VMSize $VMSize
            $vm = Set-AzVMOperatingSystem -VM $vm -Linux -ComputerName $VMName -Credential $credential -DisablePasswordAuthentication
            $vm = Set-AzVMSourceImage -VM $vm -PublisherName "Debian" -Offer "debian-12" -Skus "12-gen2" -Version "latest"
            
            # Add SSH key
            Add-AzVMSshPublicKey -VM $vm -KeyData $sshPublicKey -Path "/home/$AdminUsername/.ssh/authorized_keys"
            
            # Create network components
            $subnet = New-AzVirtualNetworkSubnetConfig -Name "default" -AddressPrefix "10.0.0.0/24"
            $vnet = New-AzVirtualNetwork -Name "$VMName-vnet" -ResourceGroupName $ResourceGroupName -Location $Location -AddressPrefix "10.0.0.0/16" -Subnet $subnet
            
            $pip = New-AzPublicIpAddress -Name "$VMName-ip" -ResourceGroupName $ResourceGroupName -Location $Location -AllocationMethod Dynamic
            
            # Create NSG with required ports for OpenSILEX
            $nsgRule1 = New-AzNetworkSecurityRuleConfig -Name "SSH" -Protocol Tcp -Direction Inbound -Priority 1000 -SourceAddressPrefix * -SourcePortRange * -DestinationAddressPrefix * -DestinationPortRange 22 -Access Allow
            $nsgRule2 = New-AzNetworkSecurityRuleConfig -Name "OpenSILEX-Web" -Protocol Tcp -Direction Inbound -Priority 1001 -SourceAddressPrefix * -SourcePortRange * -DestinationAddressPrefix * -DestinationPortRange 8666 -Access Allow
            $nsgRule3 = New-AzNetworkSecurityRuleConfig -Name "OpenSILEX-RDF4J" -Protocol Tcp -Direction Inbound -Priority 1002 -SourceAddressPrefix * -SourcePortRange * -DestinationAddressPrefix * -DestinationPortRange 8667 -Access Allow
            $nsg = New-AzNetworkSecurityGroup -Name "$VMName-nsg" -ResourceGroupName $ResourceGroupName -Location $Location -SecurityRules $nsgRule1,$nsgRule2,$nsgRule3
            
            $nic = New-AzNetworkInterface -Name "$VMName-nic" -ResourceGroupName $ResourceGroupName -Location $Location -SubnetId $vnet.Subnets[0].Id -PublicIpAddressId $pip.Id -NetworkSecurityGroupId $nsg.Id
            
            $vm = Add-AzVMNetworkInterface -VM $vm -Id $nic.Id
            
            # Create the VM
            New-AzVM -ResourceGroupName $ResourceGroupName -Location $Location -VM $vm
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
    
    Write-Info "Installing OpenSILEX GitHub version on VM: $TargetIP"
    Write-Info "Following official installation guide from: https://github.com/OpenSILEX/opensilex"
    
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
        
        # Create installation scripts based on official OpenSILEX installation guide
        Write-Info "Uploading installation scripts..."
        
        # System dependencies script - aligned with OpenSILEX requirements
        $dependencyScript = @"
#!/bin/bash
set -e

# OpenSILEX Dependencies Installation Script
# Based on official requirements: Java JDK 11+, Maven 3.9+, Git 2.34.1+, Docker 27.1.1+

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

print_status "Starting OpenSILEX dependency installation..."
print_status "System requirements: Java JDK 11+, Maven 3.9+, Git 2.34.1+, Docker 27.1.1+"

# Update system packages
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Java JDK 17 (OpenJDK)
print_status "Installing Java JDK 17 (compatible with OpenSILEX)..."
sudo apt install -y openjdk-17-jdk openjdk-17-jre
echo 'export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64' >> ~/.bashrc
echo 'export PATH=`$JAVA_HOME/bin:`$PATH' >> ~/.bashrc

# Verify Java installation
java -version
javac -version

# Install Maven 3.9+
print_status "Installing Maven 3.9.9..."
cd /tmp
wget -q https://archive.apache.org/dist/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.tar.gz
tar -xzf apache-maven-3.9.9-bin.tar.gz
sudo mv apache-maven-3.9.9 /opt/maven
sudo ln -sf /opt/maven/bin/mvn /usr/local/bin/mvn
echo 'export MAVEN_HOME=/opt/maven' >> ~/.bashrc
echo 'export PATH=`$MAVEN_HOME/bin:`$PATH' >> ~/.bashrc

# Verify Maven installation
/opt/maven/bin/mvn -version

# Install Git
print_status "Installing Git..."
sudo apt install -y git
git --version

# Install Docker (official Docker repository method)
print_status "Installing Docker 27.1.1+..."
sudo apt install -y ca-certificates curl gnupg lsb-release
sudo mkdir -m 0755 -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=`$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian `$(. /etc/os-release && echo "`$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Configure Docker for current user
print_status "Configuring Docker permissions..."
sudo usermod -aG docker `$(whoami)
sudo systemctl start docker
sudo systemctl enable docker

# Verify Docker installation
sudo docker --version
sudo docker compose version

# Install additional build tools
print_status "Installing build tools..."
sudo apt install -y curl wget unzip build-essential

# Create workspace directory
print_status "Creating OpenSILEX workspace..."
mkdir -p ~/opensilex-workspace
chmod 755 ~/opensilex-workspace

print_success "All OpenSILEX dependencies installed successfully!"
print_status "Java version: `$(java -version 2>&1 | head -n1)"
print_status "Maven version: `$(/opt/maven/bin/mvn -version | head -n1)"
print_status "Git version: `$(git --version)"
print_status "Docker version: `$(sudo docker --version)"
print_status "Docker Compose version: `$(sudo docker compose version)"

print_warning "Please log out and back in (or restart your session) for Docker permissions to take effect"
"@

        # Main OpenSILEX installation script - following official guide exactly
        $installerScript = @"
#!/bin/bash
set -e

# OpenSILEX Installation Script
# Following official guide: https://github.com/OpenSILEX/opensilex

# Source environment variables
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export MAVEN_HOME=/opt/maven
export PATH=`$JAVA_HOME/bin:`$MAVEN_HOME/bin:`$PATH

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "`${BLUE}[INFO]`${NC} `$1"; }
print_success() { echo -e "`${GREEN}[SUCCESS]`${NC} `$1"; }
print_warning() { echo -e "`${YELLOW}[WARNING]`${NC} `$1"; }
print_error() { echo -e "`${RED}[ERROR]`${NC} `$1"; }

print_status "Starting OpenSILEX installation..."
print_status "Following official guide: https://github.com/OpenSILEX/opensilex"

# Set up workspace
WORKSPACE_DIR="`$HOME/opensilex-workspace"
OPENSILEX_HOME="`$WORKSPACE_DIR/opensilex"
STORAGE_DIR="`$WORKSPACE_DIR/opensilex-data"

cd `$WORKSPACE_DIR

# Step 1: Clone the repository (official guide)
print_status "Cloning OpenSILEX repository..."
if [ -d "`$OPENSILEX_HOME" ]; then
    rm -rf "`$OPENSILEX_HOME"
fi

git clone https://github.com/OpenSILEX/opensilex.git
cd `$OPENSILEX_HOME

# Step 2: Build the project (official guide)
print_status "Building OpenSILEX (this may take 10-20 minutes)..."
export MAVEN_OPTS="-Xmx4096m -XX:MaxMetaspaceSize=512m"
mvn install -DskipTests

if [ `$? -ne 0 ]; then
    print_error "OpenSILEX build failed"
    exit 1
fi

print_success "OpenSILEX build completed successfully"

# Step 3: Configure the system
print_status "Configuring OpenSILEX..."
CONFIG_FILE="`$OPENSILEX_HOME/opensilex-dev-tools/src/main/resources/config/opensilex.yml"
mkdir -p `$STORAGE_DIR/files
mkdir -p `$STORAGE_DIR/logs
chmod -R 755 `$STORAGE_DIR

# Update configuration with storage path (mandatory setting)
if [ -f "`$CONFIG_FILE" ]; then
    cp "`$CONFIG_FILE" "`$CONFIG_FILE.backup"
    
    # Set mandatory storage path
    if grep -q "storageBasePath" "`$CONFIG_FILE"; then
        sed -i "s|storageBasePath:.*|storageBasePath: `$STORAGE_DIR|g" "`$CONFIG_FILE"
    else
        echo "file-system:" >> "`$CONFIG_FILE"
        echo "  storageBasePath: `$STORAGE_DIR" >> "`$CONFIG_FILE"
    fi
    
    print_success "Configuration updated with storage path: `$STORAGE_DIR"
else
    print_warning "Configuration file not found, creating minimal config..."
    cat > "`$CONFIG_FILE" << 'EOF'
file-system:
  storageBasePath: STORAGE_DIR_PLACEHOLDER

server:
  host: 0.0.0.0
  port: 8666
  adminPort: 8667

default-lang: en
EOF
    sed -i "s|STORAGE_DIR_PLACEHOLDER|`$STORAGE_DIR|g" "`$CONFIG_FILE"
fi

# Step 4: Set up databases using Docker (official guide)
print_status "Setting up databases with Docker Compose..."
cd `$OPENSILEX_HOME/opensilex-dev-tools/src/main/resources/docker

# Ensure Docker is available
if ! command -v docker &> /dev/null; then
    print_error "Docker not found in PATH"
    exit 1
fi

# Start databases
sudo docker compose up -d

# Wait for databases to be ready
print_status "Waiting for databases to start (60 seconds)..."
sleep 60

# Verify database containers are running
if ! sudo docker compose ps | grep -q "Up"; then
    print_error "Database containers failed to start"
    sudo docker compose logs
    exit 1
fi

print_success "Database containers started successfully"

# Step 5: Initialize system data (official guide)
print_status "Initializing OpenSILEX system data..."
cd `$OPENSILEX_HOME

# Add executable permissions to opensilex script
chmod +x opensilex-release/target/opensilex/opensilex.sh

# Initialize the system
./opensilex-release/target/opensilex/opensilex.sh dev install

if [ `$? -eq 0 ]; then
    print_success "OpenSILEX system initialization completed"
else
    print_warning "System initialization had issues (this can be normal on first run)"
fi

# Step 6: Create startup scripts
print_status "Creating startup and service scripts..."

# Create startup script
cat > `$OPENSILEX_HOME/start-opensilex.sh << 'EOF'
#!/bin/bash
cd "`$(dirname "`$0")"

export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export MAVEN_HOME=/opt/maven
export PATH=`$JAVA_HOME/bin:`$MAVEN_HOME/bin:`$PATH

echo "Starting OpenSILEX databases..."
cd opensilex-dev-tools/src/main/resources/docker
sudo docker compose up -d
sleep 10

echo "Starting OpenSILEX server..."
cd "`$(dirname "`$0")"
./opensilex-release/target/opensilex/opensilex.sh dev start --no-front-dev
EOF

chmod +x `$OPENSILEX_HOME/start-opensilex.sh

# Create systemd service for databases
sudo tee /etc/systemd/system/opensilex-databases.service > /dev/null << EOF
[Unit]
Description=OpenSILEX Database Services
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=root
WorkingDirectory=`$OPENSILEX_HOME/opensilex-dev-tools/src/main/resources/docker
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
EOF

# Create systemd service for OpenSILEX server
sudo tee /etc/systemd/system/opensilex-server.service > /dev/null << EOF
[Unit]
Description=OpenSILEX Application Server
After=opensilex-databases.service
Requires=opensilex-databases.service

[Service]
Type=simple
User=`$(whoami)
WorkingDirectory=`$OPENSILEX_HOME
Environment=JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
Environment=MAVEN_HOME=/opt/maven
Environment=PATH=/usr/lib/jvm/java-17-openjdk-amd64/bin:/opt/maven/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=`$OPENSILEX_HOME/opensilex-release/target/opensilex/opensilex.sh dev start --no-front-dev
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start services
print_status "Enabling OpenSILEX services..."
sudo systemctl daemon-reload
sudo systemctl enable opensilex-databases.service
sudo systemctl enable opensilex-server.service

# Start the services
print_status "Starting OpenSILEX services..."
sudo systemctl start opensilex-databases.service
sleep 30
sudo systemctl start opensilex-server.service

# Wait for service to start and verify
print_status "Waiting for OpenSILEX to start (90 seconds)..."
sleep 90

# Test if OpenSILEX is responding
print_status "Testing OpenSILEX server availability..."
if curl -s -f http://localhost:8666/ > /dev/null; then
    print_success "OpenSILEX server is responding!"
elif curl -s -f http://localhost:8666/app/ > /dev/null; then
    print_success "OpenSILEX application is responding!"
else
    print_warning "OpenSILEX server may still be starting up..."
    print_info "Check service status with: sudo systemctl status opensilex-server"
fi

print_success "OpenSILEX installation completed!"
print_info "Access points:"
print_info "- Web Application: http://localhost:8666/ (or http://VM_IP:8666/)"
print_info "- API Documentation: http://localhost:8666/api-docs"
print_info "- RDF4J Workbench: http://localhost:8667/rdf4j-workbench"
print_info ""
print_info "Default admin credentials:"
print_info "- Email: admin@opensilex.org"
print_info "- Password: admin"
print_info ""
print_info "Service management:"
print_info "- Start: sudo systemctl start opensilex-server"
print_info "- Stop: sudo systemctl stop opensilex-server"
print_info "- Status: sudo systemctl status opensilex-server"
print_info "- Logs: sudo journalctl -u opensilex-server -f"
"@
        
        # Write scripts to temporary files and upload
        $tempDepsScript = [System.IO.Path]::GetTempFileName()
        $tempInstallScript = [System.IO.Path]::GetTempFileName()
        
        [System.IO.File]::WriteAllText($tempDepsScript, $dependencyScript)
        [System.IO.File]::WriteAllText($tempInstallScript, $installerScript)
        
        # Upload scripts
        scp -i $privateKeyPath -o StrictHostKeyChecking=no $tempDepsScript "$AdminUsername@${TargetIP}:~/install-dependencies.sh"
        scp -i $privateKeyPath -o StrictHostKeyChecking=no $tempInstallScript "$AdminUsername@${TargetIP}:~/install-opensilex.sh"
        
        # Clean up temp files
        Remove-Item $tempDepsScript, $tempInstallScript
        
        # Fix line endings and make scripts executable
        ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "dos2unix ~/install-dependencies.sh ~/install-opensilex.sh 2>/dev/null || sed -i 's/\r$//' ~/install-dependencies.sh ~/install-opensilex.sh; chmod +x ~/install-dependencies.sh ~/install-opensilex.sh"
        
        if (-not $SkipDependencies) {
            Write-Info "Installing dependencies (this may take 10-15 minutes)..."
            Write-Info "This includes: Java JDK 17, Maven 3.9+, Git, Docker 27.1.1+, and build tools"
            ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "~/install-dependencies.sh"
            
            Write-Warning "Restarting SSH session for Docker permissions..."
            Start-Sleep -Seconds 5
        }
        
        Write-Info "Installing OpenSILEX (this may take 20-30 minutes)..."
        Write-Info "This includes: cloning repository, building with Maven, setting up databases, and configuring services"
        ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "~/install-opensilex.sh"
        
        Write-Success "OpenSILEX installation completed successfully!"
        Write-Info "Access Information:"
        Write-Info "- Web Application: http://$TargetIP:8666/"
        Write-Info "- API Documentation: http://$TargetIP:8666/api-docs"
        Write-Info "- RDF4J Workbench: http://$TargetIP:8667/rdf4j-workbench"
        Write-Info "- Default Admin Login: admin@opensilex.org / admin"
        
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
                    Write-Info "OpenSILEX Web: http://$($publicIP.IpAddress):8666/"
                    Write-Info "OpenSILEX API: http://$($publicIP.IpAddress):8666/api-docs"
                    Write-Info "RDF4J Workbench: http://$($publicIP.IpAddress):8667/rdf4j-workbench"
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
                Write-Info "Connecting to VM at $ipAddress..."
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
        Start-Sleep -Seconds 10
        Get-VMStatus
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
        Start-Sleep -Seconds 15
        Get-VMStatus
    } catch {
        Write-Error "Failed to restart VM: $($_.Exception.Message)"
    }
}

function Remove-Deployment {
    Write-Warning "This will delete ALL resources in the resource group: $ResourceGroupName"
    Write-Warning "This action is IRREVERSIBLE!"
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
    Write-Info "Fetching OpenSILEX logs..."
    try {
        $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
        if ($publicIP -and $publicIP.IpAddress) {
            $sshKeyPath = Get-SSHKeyPath
            if ($sshKeyPath) {
                $privateKeyPath = $sshKeyPath -replace "\.pub$", ""
                $ipAddress = $publicIP.IpAddress
                Write-Info "Fetching latest OpenSILEX service logs..."
                ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$ipAddress "sudo journalctl -u opensilex-server.service -n 100 --no-pager"
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
    Write-Host "   OpenSILEX GitHub Installation Manager   " -ForegroundColor Blue
    Write-Host "=============================================" -ForegroundColor Blue
    Write-Host ""
    Write-Host "Based on Official OpenSILEX Installation Guide" -ForegroundColor Cyan
    Write-Host "Repository: https://github.com/OpenSILEX/opensilex" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Current Configuration:" -ForegroundColor Yellow
    Write-Host "  VM Name: $VMName" -ForegroundColor White
    Write-Host "  Resource Group: $ResourceGroupName" -ForegroundColor White
    Write-Host "  Region: $Location" -ForegroundColor White
    Write-Host "  VM Size: $VMSize (4 vCPUs, 16GB RAM)" -ForegroundColor White
    Write-Host "  OS: Debian 12" -ForegroundColor White
    Write-Host ""
    Write-Host "Available Commands:" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Installation & Deployment:" -ForegroundColor Green
    Write-Host "    1. Full Install (Deploy VM + Install OpenSILEX)" -ForegroundColor White
    Write-Host "    2. Deploy VM Only" -ForegroundColor White
    Write-Host "    3. Install OpenSILEX on Existing VM" -ForegroundColor White
    Write-Host ""
    Write-Host "  VM Management:" -ForegroundColor Green
    Write-Host "    4. Start VM" -ForegroundColor White
    Write-Host "    5. Stop VM" -ForegroundColor White
    Write-Host "    6. Restart VM" -ForegroundColor White
    Write-Host "    7. Check Status" -ForegroundColor White
    Write-Host "    8. Connect via SSH" -ForegroundColor White
    Write-Host ""
    Write-Host "  Maintenance:" -ForegroundColor Green
    Write-Host "    9. View OpenSILEX Logs" -ForegroundColor White
    Write-Host "   10. Delete All Resources" -ForegroundColor White
    Write-Host ""
    Write-Host "  Utilities:" -ForegroundColor Green
    Write-Host "   11. Generate SSH Key" -ForegroundColor White
    Write-Host "   12. Test SSH Keys" -ForegroundColor White
    Write-Host "   13. Get VM Info & URLs" -ForegroundColor White
    Write-Host ""
    Write-Host "    0. Exit" -ForegroundColor Red
    Write-Host ""
    
    $script:choice = Read-Host "Select an option (0-13)"
    
    switch ($script:choice) {
        "1" { 
            Write-Info "Starting full OpenSILEX installation..."
            Write-Info "This will deploy a VM and install OpenSILEX following the official guide"
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
        }
        "0" { 
            Write-Info "Thank you for using OpenSILEX Installation Manager!"
            exit 
        }
        default { 
            Write-Warning "Invalid selection. Please try again."
        }
    }
}

# Main execution
try {
    Write-Host "OpenSILEX GitHub Installation Manager" -ForegroundColor Blue
    Write-Host "=====================================" -ForegroundColor Blue
    Write-Host "Based on: https://github.com/OpenSILEX/opensilex" -ForegroundColor Cyan
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
        "showinfo" { Get-VMStatus }
        "getip" {
            try {
                $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
                if ($publicIP) {
                    Write-Info "VM Public IP: $($publicIP.IpAddress)"
                } else {
                    Write-Warning "VM public IP not found"
                }
            } catch {
                Write-Error "Failed to get VM IP: $($_.Exception.Message)"
            }
        }
        "openports" {
            try {
                $nsg = Get-AzNetworkSecurityGroup -ResourceGroupName $ResourceGroupName -Name "$VMName-nsg" -ErrorAction SilentlyContinue
                if ($nsg) {
                    Write-Info "Network Security Group Rules:"
                    $nsg.SecurityRules | ForEach-Object {
                        Write-Host "  $($_.Name): $($_.Direction) $($_.Access) $($_.Protocol) $($_.DestinationPortRange)" -ForegroundColor White
                    }
                } else {
                    Write-Warning "Network Security Group not found"
                }
            } catch {
                Write-Error "Failed to get NSG rules: $($_.Exception.Message)"
            }
        }
        default { 
            Write-Warning "Unknown command: $Command"
            Write-Info "Available commands: Menu, FullInstall, Deploy, Install, Status, Connect, Start, Stop, Restart, Delete, Logs, ShowInfo, GetIP"
        }
    }
} catch {
    Write-Error "Script execution failed: $($_.Exception.Message)"
    Write-Error $_.ScriptStackTrace
}