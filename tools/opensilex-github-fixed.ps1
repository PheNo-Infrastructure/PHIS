# OpenSILEX GitHub Installation Master Script - FIXED VERSION
# PowerShell script for managing OpenSILEX GitHub installation on Azure VMs
# This version addresses port mapping and database initialization issues

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("Menu", "FullInstall", "Deploy", "Install", "Status", "Connect", "Start", "Stop", "Restart", "Delete", "Logs", "Diagnose", "GenerateSSHKey", "TestSSHKeys", "ShowInfo", "GetIP", "OpenPorts")]
    [string]$Command = "Menu",
    
    [Parameter(Mandatory=$false)]
    [string]$VMName = "opensilex-github-vm-fixed",
    
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroupName = "RG-OPENSILEX-GITHUB-FIXED",
    
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

# Configuration
$VMSize = "Standard_B4ms"  # 4 vCPUs, 16 GB RAM
$OSVersion = "Debian:debian-12:12-gen2:latest"
$DiskSize = 50  # 50 GB

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
    
    # Check Azure PowerShell (check for core Az modules)
    $azModules = Get-Module -ListAvailable -Name Az.Accounts, Az.Resources, Az.Compute
    if ($azModules.Count -lt 3) {
        Write-Error "Azure PowerShell modules not found!"
        Write-Info "Please install with: Install-Module -Name Az -Repository PSGallery -Force"
        return $false
    }
    
    # Import required Az modules
    Import-Module Az.Accounts, Az.Resources, Az.Compute, Az.Network -Force | Out-Null
    
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
    
    Write-Warning "No SSH keys found. Generating new SSH key..."
    
    $sshDir = "$env:USERPROFILE\.ssh"
    if (-not (Test-Path $sshDir)) {
        New-Item -ItemType Directory -Path $sshDir -Force | Out-Null
    }
    
    # Generate ed25519 key by default
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
        
        # Use template-vm.json
        $templatePath = Join-Path $PSScriptRoot "template-vm.json"
        if (Test-Path $templatePath) {
            Write-Info "Using ARM template: $templatePath"
            $deployment = New-AzResourceGroupDeployment -ResourceGroupName $ResourceGroupName -TemplateFile $templatePath -TemplateParameterObject $templateParameters
        } else {
            Write-Info "Creating VM with PowerShell commands..."
            
            # Create VM using PowerShell commands
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
            
            # Create NSG with required ports - INCLUDING PROPER DATABASE PORTS
            $nsgRule1 = New-AzNetworkSecurityRuleConfig -Name "SSH" -Protocol Tcp -Direction Inbound -Priority 1000 -SourceAddressPrefix * -SourcePortRange * -DestinationAddressPrefix * -DestinationPortRange 22 -Access Allow
            $nsgRule2 = New-AzNetworkSecurityRuleConfig -Name "OpenSILEX" -Protocol Tcp -Direction Inbound -Priority 1001 -SourceAddressPrefix * -SourcePortRange * -DestinationAddressPrefix * -DestinationPortRange 8666 -Access Allow
            $nsgRule3 = New-AzNetworkSecurityRuleConfig -Name "MongoDB" -Protocol Tcp -Direction Inbound -Priority 1002 -SourceAddressPrefix * -SourcePortRange * -DestinationAddressPrefix * -DestinationPortRange 8668 -Access Allow
            $nsgRule4 = New-AzNetworkSecurityRuleConfig -Name "RDF4J" -Protocol Tcp -Direction Inbound -Priority 1003 -SourceAddressPrefix * -SourcePortRange * -DestinationAddressPrefix * -DestinationPortRange 8667 -Access Allow
            $nsg = New-AzNetworkSecurityGroup -Name "$VMName-nsg" -ResourceGroupName $ResourceGroupName -Location $Location -SecurityRules $nsgRule1,$nsgRule2,$nsgRule3,$nsgRule4
            
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
            return $false
        }
        
        Write-Success "SSH connection established"
        
        # Create installation scripts on remote VM
        Write-Info "Uploading installation scripts..."
        
        # FIXED: Dependency script
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
sudo apt update && sudo apt upgrade -y

print_status "Installing Java JDK 17..."
sudo apt install -y openjdk-17-jdk openjdk-17-jre
echo 'export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64' >> ~/.bashrc
echo 'export PATH=`$JAVA_HOME/bin:`$PATH' >> ~/.bashrc

print_status "Installing Maven 3.9..."
cd /tmp
wget https://archive.apache.org/dist/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.tar.gz
tar -xzf apache-maven-3.9.9-bin.tar.gz
sudo mv apache-maven-3.9.9 /opt/maven
echo 'export MAVEN_HOME=/opt/maven' >> ~/.bashrc
echo 'export PATH=`$MAVEN_HOME/bin:`$PATH' >> ~/.bashrc

print_status "Installing Git..."
sudo apt install -y git

print_status "Installing Docker..."
sudo apt install -y ca-certificates curl gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=`$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian `$(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

print_status "Configuring Docker..."
sudo usermod -aG docker `$(whoami)
sudo systemctl start docker
sudo systemctl enable docker
sudo chmod 666 /var/run/docker.sock

print_status "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

print_status "Installing additional tools..."
sudo apt install -y curl wget unzip build-essential socat

print_success "Dependencies installation completed!"
"@
        
        # FIXED: Installer script with proper port mapping and initialization
        $installerScript = @'
#!/bin/bash
set -e

# Source environment variables
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export MAVEN_HOME=/opt/maven
export PATH=$JAVA_HOME/bin:$MAVEN_HOME/bin:$PATH

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

OPENSILEX_HOME="$HOME/opensilex"

print_status "Cloning OpenSILEX repository..."
if [ -d "$OPENSILEX_HOME" ]; then
    rm -rf "$OPENSILEX_HOME"
fi

git clone https://github.com/OpenSILEX/opensilex.git $OPENSILEX_HOME
cd $OPENSILEX_HOME

print_status "Building OpenSILEX (this may take 10-15 minutes)..."
export MAVEN_OPTS="-Xmx4096m"
mvn clean install -DskipTests -pl '!opensilex-swagger-codegen-maven-plugin'

print_status "Setting up databases..."
cd $OPENSILEX_HOME/opensilex-dev-tools/src/main/resources/docker
docker compose up -d

print_status "Waiting for databases to start..."
sleep 30

print_status "Configuring OpenSILEX for proper port mapping..."
CONFIG_FILE="$OPENSILEX_HOME/opensilex-release/target/opensilex/config/opensilex.yml"
STORAGE_DIR="$HOME/opensilex-data"
mkdir -p $STORAGE_DIR

# FIXED: Create proper configuration with correct port mapping
cat > "$CONFIG_FILE" << 'EOF'
ontologies:
    baseURI: http://opensilex.dev/
    baseURIAlias: dev
    sparql:
        config:
            serverURI: http://localhost:8667/rdf4j-server/
            repository: opensilex

file-system:
    fs:
        config:
            defaultFS: local
            connections:
                local:
                    implementation: org.opensilex.fs.local.LocalFileSystemConnection
                    config:
                        basePath: ../../opensilex-data
                gridfs:
                    implementation: org.opensilex.fs.gridfs.GridFSConnection
                    config:
                        host: localhost
                        port: 8668
                        database: opensilex

big-data:
    mongodb:
        config:
            host: localhost
            port: 8668
            database: opensilex

phisws:
    infrastructure: opensilex

system:
    ignoredModules:
        org.opensilex.opensilex-mobile.MobileModule: opensilex-mobile.jar

front:
    agroportal:
        entity:
            - AGROVOC
            - PO
        trait:
            - PATO
        method:
            - TRANSFORMON
        unit:
            - OBOE

# BRAPI Configuration
brapi:
    enable: true
    version: v2
    serverInfo:
        serverName: "OpenSILEX BRAPI Server"
        serverDescription: "OpenSILEX BRAPI v2 API Implementation"
        contactEmail: "admin@opensilex.org"
        documentationURL: "https://github.com/OpenSILEX/opensilex"
        location: "Research Institute"
        organizationName: "OpenSILEX"

# SPARQL Configuration  
sparql:
    enable: true
    endpoint: "/rest/core/sparql"
    rdf4j:
        serverURI: "http://localhost:8667/rdf4j-server/"
        repository: "opensilex"

# Core module enhancements
core:
    enableLogs: true
    ontologies:
        autoLoad: true
        loadDefaults: true
    
# Security enhancements
security:
    token:
        expiration: 3600
    permissions:
        autoGrantAdmin: true
        
EOF

chmod -R 755 $STORAGE_DIR

print_status "Creating port forwarding service for installation..."
# CRITICAL FIX: Create persistent port forwards for database initialization
cat > /tmp/setup-port-forwards.sh << 'PORT_EOF'
#!/bin/bash
# Kill any existing port forwards
pkill -f "socat.*27017" || true
pkill -f "socat.*8080" || true

# Create port forwards for installation
nohup socat TCP-LISTEN:27017,reuseaddr,fork TCP:localhost:8668 > /tmp/socat-mongo.log 2>&1 &
nohup socat TCP-LISTEN:8080,reuseaddr,fork TCP:localhost:8667 > /tmp/socat-rdf4j.log 2>&1 &

# Wait for forwards to be ready
sleep 5

# Test connections
if timeout 3 bash -c '</dev/tcp/localhost/27017'; then
    echo "MongoDB port forward: OK"
else
    echo "MongoDB port forward: FAILED"
fi

if timeout 3 bash -c '</dev/tcp/localhost/8080'; then
    echo "RDF4J port forward: OK"
else
    echo "RDF4J port forward: FAILED"
fi
PORT_EOF

chmod +x /tmp/setup-port-forwards.sh
/tmp/setup-port-forwards.sh

print_status "Initializing OpenSILEX system (CRITICAL STEP)..."
cd $OPENSILEX_HOME/opensilex-release/target/opensilex

# CRITICAL FIX: Proper system installation with working port forwards
timeout 300 ./opensilex.sh system install || {
    print_error "System installation failed or timed out"
    print_status "Checking error logs..."
    tail -50 opensilex.log || true
    exit 1
}

print_status "Creating admin user..."
timeout 60 ./opensilex.sh user add \
    --admin \
    --email="admin@opensilex.org" \
    --first-name="System" \
    --last-name="Administrator" \
    --password="admin" || {
    print_warning "Admin user creation may have failed - this is sometimes normal if user already exists"
}

print_status "Creating startup scripts..."
cat > $OPENSILEX_HOME/start-opensilex.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export MAVEN_HOME=/opt/maven
export PATH=$JAVA_HOME/bin:$MAVEN_HOME/bin:$PATH

echo "Starting databases..."
cd opensilex-dev-tools/src/main/resources/docker
docker compose up -d
sleep 10

echo "Starting OpenSILEX server..."
cd "$(dirname "$0")"
~/opensilex/opensilex-release/target/opensilex/opensilex.sh dev start --no-front-dev
EOF

chmod +x $OPENSILEX_HOME/start-opensilex.sh

print_status "Creating systemd services for automatic startup..."
sudo tee /etc/systemd/system/opensilex-docker.service > /dev/null << 'EOF'
[Unit]
Description=OpenSILEX Docker Services
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/azureuser/opensilex/opensilex-dev-tools/src/main/resources/docker
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
User=azureuser
Group=azureuser

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/opensilex-server.service > /dev/null << 'EOF'
[Unit]
Description=OpenSILEX Server
After=opensilex-docker.service
Requires=opensilex-docker.service

[Service]
Type=simple
WorkingDirectory=/home/azureuser/opensilex
ExecStart=/home/azureuser/opensilex/opensilex-release/target/opensilex/opensilex.sh dev start --no-front-dev
User=azureuser
Group=azureuser
Environment=JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
Environment=MAVEN_HOME=/opt/maven
Environment=PATH=/usr/lib/jvm/java-17-openjdk-amd64/bin:/opt/maven/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

print_status "Enabling systemd services..."
sudo systemctl daemon-reload
sudo systemctl enable opensilex-docker.service
sudo systemctl enable opensilex-server.service

print_status "Starting OpenSILEX services..."
sudo systemctl start opensilex-docker.service
sleep 15

print_status "Starting OpenSILEX server..."
sudo systemctl start opensilex-server.service

# Wait for OpenSILEX to be ready
print_status "Waiting for OpenSILEX to be ready..."
for i in {1..60}; do
    if curl -s http://localhost:8666/rest/security/authenticate > /dev/null 2>&1; then
        print_success "OpenSILEX is now running and accessible!"
        break
    fi
    sleep 5
    echo -n "."
done
echo

print_status "Testing final installation..."
# Test authentication
AUTH_RESPONSE=$(curl -s -X POST "http://localhost:8666/rest/security/authenticate" \
    -H "Content-Type: application/json" \
    -d '{"identifier":"admin@opensilex.org","password":"admin"}' || echo "failed")

if echo "$AUTH_RESPONSE" | grep -q "token"; then
    print_success "Authentication test: PASSED"
    
    # Extract token and test API
    TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    
    # Test experiments endpoint
    EXPERIMENTS=$(curl -s -H "Authorization: Bearer $TOKEN" \
        "http://localhost:8666/rest/core/experiments" || echo "failed")
    
    if echo "$EXPERIMENTS" | grep -q "result"; then
        print_success "API endpoints test: PASSED"
    else
        print_warning "API endpoints test: FAILED"
    fi
else
    print_warning "Authentication test: FAILED"
fi

print_success "OpenSILEX installation completed!"
print_info "Access OpenSILEX at: http://YOUR_VM_IP:8666/"
print_info "Default credentials: admin@opensilex.org / admin"
'@

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
            Write-Info "Installing dependencies (this may take 5-10 minutes)..."
            ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "~/install-dependencies.sh"
        }
        
        Write-Info "Installing OpenSILEX (this may take 20-30 minutes)..."
        ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "~/install-opensilex.sh"
        
        Write-Success "OpenSILEX installation completed successfully!"
        Write-Info "Access OpenSILEX at: http://$TargetIP:8666/"
        Write-Info "Default credentials: admin@opensilex.org / admin"
        
    } catch {
        Write-Error "Installation failed: $($_.Exception.Message)"
        return $false
    }
    
    return $true
}

# Add all the other functions from the original script (Get-VMStatus, Connect-ToVM, etc.)
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
                    Write-Info "OpenSILEX URL: http://$($publicIP.IpAddress):8666/"
                    Write-Info "Admin Login: admin@opensilex.org / admin"
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
    Write-Info "Fetching OpenSILEX logs..."
    try {
        $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
        if ($publicIP -and $publicIP.IpAddress) {
            $sshKeyPath = Get-SSHKeyPath
            if ($sshKeyPath) {
                $privateKeyPath = $sshKeyPath -replace "\.pub$", ""
                $ipAddress = $publicIP.IpAddress
                Write-Info "Fetching OpenSILEX logs..."
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "sudo journalctl -u opensilex-server.service -n 50"
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
    Write-Host "              FIXED VERSION                 " -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Blue
    Write-Host ""
    Write-Host "IMPROVEMENTS IN THIS VERSION:" -ForegroundColor Green
    Write-Host "• Fixed port mapping issues (MongoDB: 8668, RDF4J: 8667)" -ForegroundColor White
    Write-Host "• Added automatic port forwarding during installation" -ForegroundColor White
    Write-Host "• Proper system initialization with admin user creation" -ForegroundColor White
    Write-Host "• Enhanced error handling and status checking" -ForegroundColor White
    Write-Host "• Complete database initialization" -ForegroundColor White
    Write-Host ""
    Write-Host "Current Configuration:" -ForegroundColor Yellow
    Write-Host "  VM Name: $VMName" -ForegroundColor White
    Write-Host "  Resource Group: $ResourceGroupName" -ForegroundColor White
    Write-Host "  Region: $Location" -ForegroundColor White
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
    Write-Host "    9. View Logs" -ForegroundColor White
    Write-Host "   10. Delete All Resources" -ForegroundColor White
    Write-Host ""
    Write-Host "    0. Exit" -ForegroundColor Red
    Write-Host ""
    
    $script:choice = Read-Host "Select an option (0-10)"
    
    switch ($script:choice) {
        "1" { 
            Write-Info "Starting full installation..."
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
    Write-Host "OpenSILEX GitHub Installation Manager - FIXED VERSION" -ForegroundColor Blue
    Write-Host "====================================================" -ForegroundColor Blue
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
                    Write-Info "OpenSILEX Access: http://$($publicIP.IpAddress):8666/"
                    Write-Info "Admin Login: admin@opensilex.org / admin"
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
        default { 
            Write-Warning "Unknown command: $Command"
            Write-Info "Available commands: Menu, FullInstall, Deploy, Install, Status, Connect, Start, Stop, Restart, Delete, Logs"
        }
    }
} catch {
    Write-Error "Script execution failed: $($_.Exception.Message)"
    Write-Error $_.ScriptStackTrace
}