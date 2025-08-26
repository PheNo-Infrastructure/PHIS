# OpenSILEX GitHub Installation Script v1.4.9-rdg
# PowerShell script for managing OpenSILEX version 1.4.9-rdg installation on Azure VMs
# Follows official OpenSILEX repository guidelines: https://github.com/OpenSILEX/opensilex
#
# API Key Configuration:
#   For Agroportal ontology integration, you need an API key from:
#   https://agroportal.lirmm.fr/account
#
# FEIDE Authentication Configuration:
#   For FEIDE (Dataporten) authentication, you need client credentials from:
#   https://dashboard.dataporten.no/
#
# Setup Methods (in order of preference):
#   1. Create: tools/config/api-keys.conf with content:
#      AGROPORTAL_API_KEY="your-key-here"
#      FEIDE_CLIENT_ID="your-client-id-here"
#      FEIDE_CLIENT_SECRET="your-client-secret-here"
#   
#   2. OR set environment variables:
#      $env:AGROPORTAL_API_KEY = "your-key-here" (PowerShell)
#      $env:FEIDE_CLIENT_ID = "your-client-id-here" (PowerShell)
#      $env:FEIDE_CLIENT_SECRET = "your-client-secret-here" (PowerShell)
#      export AGROPORTAL_API_KEY="your-key-here" (Bash)
#      export FEIDE_CLIENT_ID="your-client-id-here" (Bash)
#      export FEIDE_CLIENT_SECRET="your-client-secret-here" (Bash)
#
# Security Note:
#   - The config/api-keys.conf file is ignored by git (.gitignore)
#   - Never commit API keys or client credentials to version control
#   - Script works without API key/FEIDE credentials (features disabled)

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("Menu", "FullInstall", "Deploy", "Install", "Status", "Connect", "Start", "Stop", "Restart", "Delete", "Logs", "Diagnose", "GenerateSSHKey", "TestSSHKeys", "ShowInfo", "GetIP", "OpenPorts")]
    [string]$Command = "Menu",
    
    [Parameter(Mandatory=$false)]
    [string]$VMName = "phis-debian12-TEST",
    
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroupName = "RG-OPENSILEX-debian12-TEST",
    
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
$VMSize = "Standard_E4s_v4"  # 4 vCPUs, 32 GB RAM (optimized for current usage patterns)
$OSVersion = "Debian:debian-12:12-gen2:latest"
$DiskSize = 500  # 500 GB for production data and storage requirements

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
            
            # Check for orphaned disks from previous VM deletions
            Write-Info "Checking for orphaned disks..."
            $orphanedDisk = Get-AzDisk -ResourceGroupName $ResourceGroupName -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*$VMName*" -and $_.DiskState -eq "Unattached" }
            if ($orphanedDisk) {
                Write-Warning "Found orphaned disk(s) from previous VM deletion:"
                $orphanedDisk | ForEach-Object { Write-Info "  - $($_.Name)" }
                Write-Info "These will be automatically cleaned up during VM creation"
            }
            
            # Create VM using PowerShell commands (simplified version)
            $credential = New-Object System.Management.Automation.PSCredential ($AdminUsername, (ConvertTo-SecureString "dummy" -AsPlainText -Force))
            
            $vm = New-AzVMConfig -VMName $VMName -VMSize $VMSize -Priority "Spot" -MaxPrice -1 -EvictionPolicy Deallocate
            $vm = Set-AzVMOperatingSystem -VM $vm -Linux -ComputerName $VMName -Credential $credential -DisablePasswordAuthentication
            $vm = Set-AzVMSourceImage -VM $vm -PublisherName "Debian" -Offer "debian-12" -Skus "12-gen2" -Version "latest"
            
            # Add SSH key
            Add-AzVMSshPublicKey -VM $vm -KeyData $sshPublicKey -Path "/home/$AdminUsername/.ssh/authorized_keys"
            
            # Create or reuse network components
            Write-Info "Checking for existing network components..."
            
            # Check for existing virtual network
            $vnet = Get-AzVirtualNetwork -Name "$VMName-vnet" -ResourceGroupName $ResourceGroupName -ErrorAction SilentlyContinue
            if ($vnet) {
                Write-Success "Reusing existing virtual network: $VMName-vnet"
            } else {
                Write-Info "Creating new virtual network..."
                $subnet = New-AzVirtualNetworkSubnetConfig -Name "default" -AddressPrefix "10.0.0.0/24"
                $vnet = New-AzVirtualNetwork -Name "$VMName-vnet" -ResourceGroupName $ResourceGroupName -Location $Location -AddressPrefix "10.0.0.0/16" -Subnet $subnet
                Write-Success "Virtual network created: $VMName-vnet"
            }
            
            # Check for existing public IP
            $pip = Get-AzPublicIpAddress -Name "$VMName-ip" -ResourceGroupName $ResourceGroupName -ErrorAction SilentlyContinue
            if ($pip) {
                Write-Success "Reusing existing public IP: $VMName-ip (IP: $($pip.IpAddress))"
                # Ensure it's set to Static to preserve the IP
                if ($pip.PublicIpAllocationMethod -eq "Dynamic") {
                    Write-Info "Converting public IP from Dynamic to Static to preserve IP address..."
                    $pip.PublicIpAllocationMethod = "Static"
                    Set-AzPublicIpAddress -PublicIpAddress $pip | Out-Null
                    Write-Success "Public IP converted to Static"
                }
            } else {
                Write-Info "Creating new public IP..."
                $pip = New-AzPublicIpAddress -Name "$VMName-ip" -ResourceGroupName $ResourceGroupName -Location $Location -AllocationMethod Static
                Write-Success "Public IP created: $VMName-ip"
            }
            
            # Check for existing NSG
            $nsg = Get-AzNetworkSecurityGroup -Name "$VMName-nsg" -ResourceGroupName $ResourceGroupName -ErrorAction SilentlyContinue
            if ($nsg) {
                Write-Success "Reusing existing network security group: $VMName-nsg"
            } else {
                Write-Info "Creating new network security group..."
                $nsgRule1 = New-AzNetworkSecurityRuleConfig -Name "SSH" -Protocol Tcp -Direction Inbound -Priority 1000 -SourceAddressPrefix * -SourcePortRange * -DestinationAddressPrefix * -DestinationPortRange 22 -Access Allow
                $nsgRule2 = New-AzNetworkSecurityRuleConfig -Name "HTTP" -Protocol Tcp -Direction Inbound -Priority 1001 -SourceAddressPrefix * -SourcePortRange * -DestinationAddressPrefix * -DestinationPortRange 80 -Access Allow
                $nsgRule3 = New-AzNetworkSecurityRuleConfig -Name "OpenSILEX" -Protocol Tcp -Direction Inbound -Priority 1002 -SourceAddressPrefix * -SourcePortRange * -DestinationAddressPrefix * -DestinationPortRange 8666 -Access Allow
                $nsg = New-AzNetworkSecurityGroup -Name "$VMName-nsg" -ResourceGroupName $ResourceGroupName -Location $Location -SecurityRules $nsgRule1,$nsgRule2,$nsgRule3
                Write-Success "Network security group created: $VMName-nsg"
            }
            
            # Check for existing NIC
            $nic = Get-AzNetworkInterface -Name "$VMName-nic" -ResourceGroupName $ResourceGroupName -ErrorAction SilentlyContinue
            if ($nic) {
                Write-Warning "Network interface $VMName-nic already exists. This might indicate a previous incomplete deployment."
                Write-Info "Removing existing NIC to create a fresh one..."
                Remove-AzNetworkInterface -Name "$VMName-nic" -ResourceGroupName $ResourceGroupName -Force | Out-Null
            }
            
            Write-Info "Creating new network interface..."
            $nic = New-AzNetworkInterface -Name "$VMName-nic" -ResourceGroupName $ResourceGroupName -Location $Location -SubnetId $vnet.Subnets[0].Id -PublicIpAddressId $pip.Id -NetworkSecurityGroupId $nsg.Id
            Write-Success "Network interface created: $VMName-nic"
            
            $vm = Add-AzVMNetworkInterface -VM $vm -Id $nic.Id
            
            # Create the VM
            Write-Info "Creating new VM: $VMName"
            try {
                New-AzVM -ResourceGroupName $ResourceGroupName -Location $Location -VM $vm | Out-Null
                Write-Success "VM created successfully: $VMName"
            } catch {
                Write-Error "Failed to create VM: $($_.Exception.Message)"
                Write-Info "Cleaning up potentially orphaned network interface..."
                Remove-AzNetworkInterface -Name "$VMName-nic" -ResourceGroupName $ResourceGroupName -Force -ErrorAction SilentlyContinue | Out-Null
                throw $_
            }
            
            # Configure auto-shutdown (19:00 UTC = 8 PM CET/7 PM GMT)
            Write-Info "Configuring auto-shutdown for 19:00 UTC (8 PM CET)..."
            $shutdownConfig = @{
                ResourceGroupName = $ResourceGroupName
                Name = $VMName
                AutoShutdownTimeZone = "UTC"
                AutoShutdownTime = "19:00"
                AutoShutdownStatus = "Enabled"
                AutoShutdownNotificationStatus = "Disabled"
            }
            
            try {
                Set-AzVMAutoShutdownPolicy @shutdownConfig -ErrorAction Stop
                Write-Success "Auto-shutdown configured successfully"
            } catch {
                Write-Warning "Failed to configure auto-shutdown: $($_.Exception.Message)"
                Write-Info "You can configure this manually in Azure portal later"
            }
        }
        
        # Get VM IP and verify deployment
        Write-Info "Verifying VM deployment and getting public IP..."
        $maxRetries = 5
        $retryDelay = 10
        
        for ($i = 1; $i -le $maxRetries; $i++) {
            $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
            if ($publicIP -and $publicIP.IpAddress) {
                $script:VMIPAddress = $publicIP.IpAddress
                Write-Success "VM deployed successfully!"
                Write-Info "VM Name: $VMName"
                Write-Info "Public IP: $($script:VMIPAddress)"
                Write-Info "SSH Command: ssh $AdminUsername@$($script:VMIPAddress)"
                
                # Additional deployment verification
                $vm = Get-AzVM -ResourceGroupName $ResourceGroupName -Name $VMName -Status -ErrorAction SilentlyContinue
                if ($vm) {
                    $powerState = ($vm.Statuses | Where-Object {$_.Code -like "PowerState/*"}).DisplayStatus
                    Write-Info "VM Power State: $powerState"
                }
                
                return $true
            } else {
                Write-Warning "Attempt $i of ${maxRetries}: Public IP not ready yet..."
                if ($i -lt $maxRetries) {
                    Start-Sleep -Seconds $retryDelay
                }
            }
        }
        
        Write-Error "Failed to get VM public IP after ${maxRetries} attempts"
        Write-Info "VM may have been created but public IP assignment failed"
        Write-Info "Check Azure portal for VM status: $VMName in resource group: $ResourceGroupName"
        return $false
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
            Write-Info "Troubleshooting tips:"
            Write-Info "1. VM may still be booting - wait a few more minutes and try again"
            Write-Info "2. Check if the VM is running: Get-AzVM -ResourceGroupName $ResourceGroupName -Name $VMName -Status"
            Write-Info "3. Verify network security group allows SSH (port 22)"
            Write-Info "4. Try connecting manually: ssh -i $privateKeyPath $AdminUsername@$TargetIP"
            return $false
        }
        
        Write-Success "SSH connection established"
        
        # Create installation scripts on remote VM
        Write-Info "Uploading installation scripts..."
        
        # Upload production user setup and dependency installation script
        $setupScript = @"
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

print_status "Using azureuser for OpenSILEX installation..."

print_status "Installing Java JDK 17 (official OpenSILEX requirement)..."
sudo apt install -y openjdk-17-jdk openjdk-17-jre
echo 'export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64' >> ~/.bashrc
echo 'export PATH=`$JAVA_HOME/bin:`$PATH' >> ~/.bashrc

# Environment variables already added to azureuser above

print_status "Installing Docker (required for MongoDB/RDF4J containers)..."
sudo apt install -y ca-certificates curl gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
# Fix GPG key download for non-interactive sessions
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || {
    print_warning "GPG method failed, trying alternative Docker installation..."
    # Alternative: use the convenience script
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm get-docker.sh
}
# Only add repository if GPG key was successful
if [ -f "/etc/apt/keyrings/docker.gpg" ]; then
    echo "deb [arch=`$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian `$(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

print_status "Configuring Docker..."
sudo usermod -aG docker `$(whoami)
sudo systemctl start docker
sudo systemctl enable docker
sudo chmod 666 /var/run/docker.sock

print_status "Installing essential tools..."
sudo apt install -y curl wget unzip

print_status "Installing and configuring nginx..."
sudo apt install -y nginx

print_success "System setup completed!"
"@
        
        
        # Upload complete OpenSILEX production installer script following official guide
        $installerScript = @'
#!/bin/bash
set -e

# Continue with azureuser for all operations
echo "Continuing OpenSILEX installation as azureuser..."

# Source environment variables
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export PATH=$JAVA_HOME/bin:$PATH
export NODE_ENV=production

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

OPENSILEX_HOME="/home/azureuser/opensilex"

# Create OpenSILEX directory structure following production guide
print_status "Creating OpenSILEX production directory structure..."
mkdir -p "$OPENSILEX_HOME/bin"
cd "$OPENSILEX_HOME"
mkdir -p "$OPENSILEX_HOME/config"
mkdir -p "$OPENSILEX_HOME/data"
mkdir -p "$OPENSILEX_HOME/logs"
mkdir -p "$OPENSILEX_HOME/data/files"
mkdir -p "$OPENSILEX_HOME/data/logs"

# Download OpenSILEX release following production guide
print_status "Downloading OpenSILEX 1.4.9-rdg release..."
cd "$OPENSILEX_HOME/bin"
OPENSILEX_VERSION="1.4.9-rdg"
RELEASE_URL="https://github.com/OpenSILEX/opensilex/releases/download/${OPENSILEX_VERSION}/opensilex-release-${OPENSILEX_VERSION}.zip"

if curl -s -I -L --fail "$RELEASE_URL" >/dev/null 2>&1; then
    print_status "Downloading pre-built OpenSILEX ${OPENSILEX_VERSION} release..."
    wget -O "opensilex-release-${OPENSILEX_VERSION}.zip" "$RELEASE_URL"
    unzip "opensilex-release-${OPENSILEX_VERSION}.zip"
    
    # Move contents following production structure
    if [ -d "opensilex-release-${OPENSILEX_VERSION}" ]; then
        mv "opensilex-release-${OPENSILEX_VERSION}"/* .
        rmdir "opensilex-release-${OPENSILEX_VERSION}"
    fi
    
    # Move jar to parent directory as per production guide
    if [ -f "opensilex.jar" ]; then
        mv opensilex.jar "$OPENSILEX_HOME/"
    fi
    
    rm "opensilex-release-${OPENSILEX_VERSION}.zip"
    print_success "OpenSILEX release downloaded and extracted successfully"
else
    print_error "Pre-built release not available for ${OPENSILEX_VERSION}"
    exit 1
fi

# Get VM public IP for configuration
print_status "Fetching VM public IP address..."
VM_PUBLIC_IP=""
# Try multiple methods to get public IP
if command -v curl >/dev/null 2>&1; then
    VM_PUBLIC_IP=$(curl -s --max-time 10 ifconfig.me 2>/dev/null || curl -s --max-time 10 ipinfo.io/ip 2>/dev/null || curl -s --max-time 10 icanhazip.com 2>/dev/null)
fi

# Fallback if curl methods fail
if [ -z "$VM_PUBLIC_IP" ]; then
    VM_PUBLIC_IP="localhost"
    print_warning "Could not fetch public IP, using localhost. You may need to update publicURI manually."
else
    print_success "Using VM public IP: $VM_PUBLIC_IP"
fi

# Create configuration files following production guide
print_status "Creating production configuration files..."

# Create required directories with proper permissions
mkdir -p "$OPENSILEX_HOME/logs"
mkdir -p "$OPENSILEX_HOME/data/files"
mkdir -p "$OPENSILEX_HOME/config"
chown -R azureuser:azureuser "$OPENSILEX_HOME"
chmod -R 755 "$OPENSILEX_HOME"

# Check for API keys and FEIDE credentials - try multiple sources
AGROPORTAL_ENABLED=true
AGROPORTAL_API_KEY=""
FEIDE_ENABLED=false
FEIDE_CLIENT_ID=""
FEIDE_CLIENT_SECRET=""

# 1. Check for local config file (uploaded from tools/config/api-keys.conf)
CONFIG_FILE="$HOME/api-keys.conf"
if [ -f "$CONFIG_FILE" ]; then
    print_status "Loading configuration from config file..."
    source "$CONFIG_FILE"
    if [ ! -z "$AGROPORTAL_API_KEY" ]; then
        print_success "Using Agroportal API key from config file"
        AGROPORTAL_ENABLED=true
    fi
    if [ ! -z "$FEIDE_CLIENT_ID" ] && [ ! -z "$FEIDE_CLIENT_SECRET" ]; then
        print_success "Using FEIDE credentials from config file"
        FEIDE_ENABLED=true
    fi
else
    print_status "Configuration file not found at $CONFIG_FILE"
fi

# 2. Check environment variables (overrides config file)
if [ ! -z "$AGROPORTAL_API_KEY" ]; then
    print_success "Using Agroportal API key from environment variable"
    AGROPORTAL_ENABLED=true
fi

if [ ! -z "$FEIDE_CLIENT_ID" ] && [ ! -z "$FEIDE_CLIENT_SECRET" ]; then
    print_success "Using FEIDE credentials from environment variables"
    FEIDE_ENABLED=true
fi

# 3. Final status reporting
if [ "$AGROPORTAL_ENABLED" = false ]; then
    print_warning "No Agroportal API key found"
    print_status "Agroportal integration will be disabled"
    echo ""
    print_status "To enable Agroportal ontology integration:"
    print_status "1. Get your API key from: https://agroportal.lirmm.fr/account"
    print_status "2. Create file: config/api-keys.conf"
    print_status "3. Add line: AGROPORTAL_API_KEY=\"your-key-here\""
    print_status "4. See config/api-keys.conf.template for example"
    echo ""
fi

if [ "$FEIDE_ENABLED" = false ]; then
    print_warning "No FEIDE credentials found"
    print_status "FEIDE authentication will be disabled"
    echo ""
    print_status "To enable FEIDE (Dataporten) authentication:"
    print_status "1. Register your application at: https://dashboard.dataporten.no/"
    print_status "2. Set redirect URI to: http://$VM_PUBLIC_IP/app/openid"
    print_status "3. Enable attribute groups: email, userinfo-name, userinfo-mail"
    print_status "4. Enable scopes: openid, userid, profile, email"
    print_status "5. Create file: config/api-keys.conf"
    print_status "6. Add lines:"
    print_status "   FEIDE_CLIENT_ID=\"your-client-id-here\""
    print_status "   FEIDE_CLIENT_SECRET=\"your-client-secret-here\""
    echo ""
fi

# Main configuration file with dynamic IP
cat > "$OPENSILEX_HOME/config/opensilex.yml" << CONFIG_EOF
# OpenSILEX Production Configuration
ontologies:
  baseURI: "http://$VM_PUBLIC_IP/"
  baseURIAlias: "prod"
  sparql:
    config:
      serverURI: "http://localhost:7200"
      repository: "opensilex"
      # GraphDB connection settings to prevent connection issues
      maxConnections: 10
      connectionTimeout: 30000
      readTimeout: 60000
      queryTimeout: 120000

big-data:
  mongodb:
    implementation: org.opensilex.nosql.mongodb.MongoDBService
    config:
      host: "localhost"
      port: 27017
      database: "opensilex"

# File system configuration with proper structure
file-system:
  fs:
    defaultFS: local
    config:
      connections:
        local:
          implementation: org.opensilex.fs.local.LocalFileSystemConnection
          config:
            basePath: "/home/azureuser/opensilex/data/files"

server:
  host: "0.0.0.0"
  port: 8666
  publicURI: "http://$VM_PUBLIC_IP:8666"

# Security configuration with email support
security:
  email:
    config:
      enable: false
      smtp:
        host: ""
        port: 587
        userId: ""
        userPassword: ""
        sender: ""

# Dashboard configuration with real-time metrics
front:
  dashboard:
    graph1:
      # Variable URI for dashboard visualization (leave empty for default logo)
      # After importing data, update this with a variable that has data points
      # Example: "http://opensilex.test/id/variable/air_temperature_datalogging_degreecelsius"
      variable: ""
      # Enhanced location information for data context
      dataLocationInformations: "Production Environment - Configure with variable URI after data import"
  # Agroportal ontology mappings for variable components
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
  # Geocoding service configuration
  geocodingService: Photon

# Logging configuration
logging:
  config:
    file: "/home/azureuser/opensilex/config/logback.xml"

# System configuration
system:
  defaultLanguage: "en"

core:
    enableLogs: true
    sharedResourceInstances:
      - uri: "http://opensilex.org/sandbox"
        apiUrl: "http://opensilex.org/sandbox/rest"
        label:
          fr: "SANDBOX"
          en: "SANDBOX"
        accountName: "guest@opensilex.org"
        accountPassword: "guest"
      - uri: "http://aims.fao.org/aos/agrovoc/"
        apiUrl: "https://agrovoc.fao.org/sparql"
        label:
          fr: "AGROVOC"
          en: "AGROVOC"
        accountName: ""
        accountPassword: ""
    # Metrics options (MetricsConfig) - Optimized for real-time dashboard
    metrics:
      # Activate access metrics (boolean)
      enableMetrics: true
      # Metrics configs about system (SystemMetricsConfig) - Real-time updates
      system:
        # First metrics after 2 minutes (reasonable startup time)
        timeBeforeFirstMetric: 2
        # Update system metrics every 5 minutes for responsive dashboard
        delayBetweenMetrics: 5
        # Use MINUTES for real-time dashboard responsiveness
        metricsTimeUnit: MINUTES
      # Metrics configs about experiments (ExperimentsMetricsConfig) - Daily tracking
      experiments:
        # Start experiment metrics after 2 minutes
        timeBeforeFirstMetric: 2
        # Update experiment metrics daily (appropriate for research data)
        delayBetweenMetrics: 1
        # Use DAYS for experiment overview tracking
        metricsTimeUnit: DAYS
# Additional production configurations
phisws:
  # Enable CORS for production
  cors:
    allowedOrigins:
      - "http://$VM_PUBLIC_IP"
      - "https://$VM_PUBLIC_IP"
    allowedMethods:
      - "GET"
      - "POST"
      - "PUT"
      - "DELETE"
      - "OPTIONS"
    allowedHeaders:
      - "*"
    allowCredentials: true
CONFIG_EOF

# Add Agroportal configuration if enabled
if [ "$AGROPORTAL_ENABLED" = true ]; then
    print_status "Adding Agroportal configuration..."
    cat >> "$OPENSILEX_HOME/config/opensilex.yml" << AGROPORTAL_EOF

# Agroportal configuration for ontology access
core:
  agroportal:
    basePath: "https://agroportal.lirmm.fr"
    baseAPIPath: "https://data.agroportal.lirmm.fr"
    externalAPIKey: "$AGROPORTAL_API_KEY"
AGROPORTAL_EOF
else
    print_status "Skipping Agroportal configuration - disabled"
fi

# Add FEIDE configuration if enabled
if [ "$FEIDE_ENABLED" = true ]; then
    print_status "Adding FEIDE (Dataporten) authentication configuration..."
    cat >> "$OPENSILEX_HOME/config/opensilex.yml" << FEIDE_EOF

# FEIDE/Dataporten OpenID Connect authentication configuration
security:
  openID:
    enable: true
    scopes: ["openid", "userid", "profile", "email", "userinfo-name", "userinfo-mail"]
    userIdClaim: "sub"
    userNameClaim: "name"
    userEmailClaim: "https://n.feide.no/claims/eduPersonPrincipalName"
    userFirstNameClaim: "given_name"
    userLastNameClaim: "family_name"
    providerURI: "https://auth.dataporten.no"
    redirectURI: "http://$VM_PUBLIC_IP/app/openid"
    clientID: "$FEIDE_CLIENT_ID"
    clientSecret: "$FEIDE_CLIENT_SECRET"
    connectionTitle:
      en: "Login with Feide"
      no: "Logg inn med Feide"
FEIDE_EOF
else
    print_status "Skipping FEIDE authentication configuration - disabled"
fi

# Logging configuration file
cat > "$OPENSILEX_HOME/config/logback.xml" << 'LOGBACK_EOF'
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <!-- Console appender -->
    <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>
    
    <!-- File appender -->
    <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>/home/azureuser/opensilex/logs/opensilex.log</file>
        <append>true</append>
        <immediateFlush>true</immediateFlush>
        <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
            <fileNamePattern>/home/azureuser/opensilex/logs/opensilex.%d{yyyy-MM-dd}.%i.log</fileNamePattern>
            <maxFileSize>100MB</maxFileSize>
            <maxHistory>30</maxHistory>
            <totalSizeCap>1GB</totalSizeCap>
        </rollingPolicy>
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>
    
    <!-- Root logger -->
    <root level="DEBUG">
        <appender-ref ref="STDOUT" />
        <appender-ref ref="FILE" />
    </root>
    
    <!-- OpenSILEX specific loggers -->
    <logger name="org.opensilex" level="DEBUG" />
    <logger name="org.opensilex.core.device" level="TRACE" />
    <logger name="org.opensilex.sparql" level="DEBUG" />
    <logger name="org.eclipse.rdf4j" level="DEBUG" />
    <logger name="org.eclipse.rdf4j.query" level="TRACE" />
    <logger name="org.eclipse.rdf4j.repository" level="DEBUG" />
    <logger name="org.mongodb" level="DEBUG" />
    <logger name="org.mongodb.driver" level="DEBUG" />
</configuration>
LOGBACK_EOF

# Docker compose configuration
print_status "Creating database services configuration..."
cat > "$OPENSILEX_HOME/docker-compose.yml" << 'DOCKER_EOF'
version: '3.8'
services:
  graphdb:
    image: ontotext/graphdb:10.6.4
    container_name: opensilex-graphdb
    ports:
      - "7200:7200"
    environment:
      - GDB_HEAP_SIZE=4g
      - GDB_MAX_HEAP_SIZE=8g
      - GDB_JAVA_OPTS=-XX:+UseG1GC -Djava.awt.headless=true
    volumes:
      - graphdb_data:/opt/graphdb/home
      - graphdb_work:/opt/graphdb/work
      - graphdb_logs:/opt/graphdb/logs
    networks:
      - opensilex_network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:7200/rest/repositories"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    restart: unless-stopped
    
  mongodb:
    image: mongo:5
    container_name: opensilex-mongodb
    ports:
      - "27017:27017"
    command: ["mongod", "--replSet", "opensilex", "--bind_ip_all"]
    volumes:
      - mongodb_data:/data/db
    networks:
      - opensilex_network
    restart: unless-stopped

volumes:
  graphdb_data:
  graphdb_work:
  graphdb_logs:
  mongodb_data:
  
networks:
  opensilex_network:
    driver: bridge
DOCKER_EOF

# Start database services
print_status "Starting database services..."
cd "$OPENSILEX_HOME"
docker compose up -d
sleep 30

# Initialize MongoDB replica set
print_status "Initializing MongoDB replica set..."
echo "Waiting for MongoDB to start..."
for i in {1..30}; do
    if docker exec opensilex-mongodb mongosh --eval "db.adminCommand('ismaster')" >/dev/null 2>&1; then
        echo "MongoDB is ready"
        break
    fi
    sleep 2
done

# Initialize replica set
docker exec opensilex-mongodb mongosh --eval "rs.initiate({_id: 'opensilex', members: [{_id: 0, host: 'localhost:27017'}]})"
sleep 15
docker exec opensilex-mongodb mongosh --eval "rs.status()"

# Create OpenSILEX wrapper script
print_status "Creating OpenSILEX wrapper script..."
VERSION="1.4.9-rdg"
mkdir -p "$OPENSILEX_HOME/bin/$VERSION"
mv "$OPENSILEX_HOME/opensilex.jar" "$OPENSILEX_HOME/bin/$VERSION/"
mv "$OPENSILEX_HOME/bin/modules" "$OPENSILEX_HOME/bin/$VERSION/"

# Create opensilex.sh script
cat > "$OPENSILEX_HOME/bin/$VERSION/opensilex.sh" << 'WRAPPER_EOF'
#!/bin/bash

SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"

CONFIG_FILE="/home/azureuser/opensilex/config/opensilex.yml"

cd $SCRIPT_DIR

java --add-opens java.base/java.io=ALL-UNNAMED \
     --add-opens java.base/java.lang=ALL-UNNAMED \
     --add-opens java.base/java.util=ALL-UNNAMED \
     --add-opens java.base/sun.nio.ch=ALL-UNNAMED \
     --add-opens java.base/java.net=ALL-UNNAMED \
     --add-opens java.base/java.lang.reflect=ALL-UNNAMED \
     --add-opens java.base/java.security=ALL-UNNAMED \
     --add-exports java.base/sun.util.calendar=ALL-UNNAMED \
     -jar $SCRIPT_DIR/opensilex.jar --BASE_DIRECTORY=$SCRIPT_DIR --CONFIG_FILE=$CONFIG_FILE "$@"
WRAPPER_EOF

chmod +x "$OPENSILEX_HOME/bin/$VERSION/opensilex.sh"

# Create alias for azureuser
echo 'alias opensilex="/home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh"' >> ~/.bash_aliases

# Wait for GraphDB to be ready and create repository if needed
print_status "Waiting for GraphDB to be ready..."
for i in {1..60}; do
    if docker exec opensilex-graphdb curl -s http://localhost:7200/rest/repositories >/dev/null 2>&1; then
        echo "GraphDB is ready"
        break
    fi
    echo "Waiting for GraphDB to start... ($i/60)"
    sleep 5
done

# Check if repository already exists
print_status "Checking if OpenSILEX repository exists..."
if docker exec opensilex-graphdb curl -s http://localhost:7200/rest/repositories/opensilex >/dev/null 2>&1; then
    echo "OpenSILEX repository already exists, skipping creation"
else
    print_status "Creating GraphDB repository..."
    
    # Create repository configuration file with dynamic IP
    docker exec opensilex-graphdb sh -c "cat > /tmp/repo-config.ttl << 'EOF'
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix rep: <http://www.openrdf.org/config/repository#> .
@prefix sr: <http://www.openrdf.org/config/repository/sail#> .
@prefix sail: <http://www.openrdf.org/config/sail#> .
@prefix owlim: <http://www.ontotext.com/trree/owlim#> .

[] a rep:Repository ;
   rep:repositoryID \"opensilex\" ;
   rdfs:label \"OpenSILEX Repository\" ;
   rep:repositoryImpl [
      rep:repositoryType \"graphdb:SailRepository\" ;
      sr:sailImpl [
         sail:sailType \"graphdb:Sail\" ;
         owlim:ruleset \"rdfs-optimized\" ;
         owlim:storage-folder \"storage\" ;
         owlim:base-URL \"http://$VM_PUBLIC_IP/\" ;
         owlim:repository-type \"file-repository\" ;
         owlim:entity-index-size \"10000000\" ;
         owlim:enable-context-index \"false\" ;
         owlim:enablePredicateList \"true\" ;
         owlim:enable-literal-index \"true\" ;
         owlim:check-for-inconsistencies \"false\" ;
         owlim:disable-sameAs \"true\" ;
         owlim:query-timeout \"0\" ;
         owlim:throw-QueryEvaluationException-on-timeout \"false\" ;
         owlim:read-only \"false\"
      ]
   ] .
EOF"

    # Create the repository using the TTL file
    if docker exec opensilex-graphdb curl -X POST \
        -H "Content-Type: multipart/form-data" \
        -F "config=@/tmp/repo-config.ttl" \
        http://localhost:7200/rest/repositories; then
        echo "GraphDB repository created successfully"
    else
        echo "WARNING: Repository creation failed, but continuing with installation"
    fi
    
    sleep 10
fi

# Initialize OpenSILEX system
print_status "Initializing OpenSILEX system..."
cd "$OPENSILEX_HOME"
/home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh system install

# Reset and load ontologies (triplestore initialization) - CRITICAL for GraphDB
print_status "Initializing triplestore with ontologies..."
# Wait for GraphDB repository to be fully accessible
sleep 15

# Retry the sparql reset-ontologies command up to 5 times (GraphDB may need more time)
for attempt in {1..5}; do
    echo "Attempt $attempt: Initializing triplestore with ontologies..."
    if /home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh sparql reset-ontologies; then
        echo "SUCCESS: Triplestore initialization completed"
        break
    else
        echo "Triplestore initialization failed on attempt $attempt"
        if [ $attempt -eq 5 ]; then
            echo "ERROR: Triplestore initialization failed after 5 attempts"
            echo "OpenSILEX may not work correctly without ontologies"
            echo "Run this command manually after installation:"
            echo "/home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh sparql reset-ontologies"
        else
            echo "Waiting 15 seconds before retry..."
            sleep 15
        fi
    fi
done

# Create admin user (automated)
print_status "Creating admin user..."
# Retry user creation up to 3 times
for attempt in {1..3}; do
    echo "Attempt $attempt: Creating admin user..."
    if /home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh user add \
        --admin \
        --email="admin@opensilex.org" \
        --firstName="System" \
        --lastName="Administrator" \
        --password="admin"; then
        echo "Admin user created successfully"
        break
    else
        echo "User creation failed on attempt $attempt"
        if [ $attempt -eq 3 ]; then
            echo "WARNING: Admin user creation failed after 3 attempts. You may need to run this manually after startup:"
            echo "/home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh user add --admin --email=admin@opensilex.org --firstName=System --lastName=Administrator --password=admin"
        else
            echo "Waiting 10 seconds before retry..."
            sleep 10
        fi
    fi
done

# Add useful aliases for azureuser  
print_status "Setting up OpenSILEX aliases..."
echo 'alias opensilex="/home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh"' >> ~/.bashrc
echo 'alias opensilex-start="sudo systemctl start opensilex"' >> ~/.bashrc
echo 'alias opensilex-stop="sudo systemctl stop opensilex"' >> ~/.bashrc
echo 'alias opensilex-status="sudo systemctl status opensilex"' >> ~/.bashrc
echo 'alias opensilex-logs="sudo journalctl -u opensilex -f"' >> ~/.bashrc

print_success "OpenSILEX aliases configured"

# Configure nginx reverse proxy
print_status "Configuring nginx reverse proxy..."

# Create nginx config with error handling
if sudo tee /etc/nginx/sites-available/opensilex << 'NGINX_CONFIG'
server {
    listen 80;
    server_name _;
    
    # Increase client max body size for file uploads
    client_max_body_size 100M;
    
    # Proxy settings for OpenSILEX
    location / {
        proxy_pass http://127.0.0.1:8666;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Handle WebSocket connections for real-time features
    location /ws {
        proxy_pass http://127.0.0.1:8666;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_CONFIG
then
    print_success "Nginx configuration file created successfully"
else
    print_error "Failed to create nginx configuration file"
    exit 1
fi

# Verify the config file was created
if [ ! -f "/etc/nginx/sites-available/opensilex" ]; then
    print_error "Nginx configuration file not found after creation"
    exit 1
fi

# Enable the site and disable default
print_status "Enabling OpenSILEX site and disabling default..."
sudo ln -sf /etc/nginx/sites-available/opensilex /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Verify the symlink was created
if [ ! -L "/etc/nginx/sites-enabled/opensilex" ]; then
    print_error "Failed to create nginx site symlink"
    exit 1
fi

# Test nginx configuration
print_status "Testing nginx configuration..."
if sudo nginx -t; then
    print_success "Nginx configuration test passed"
else
    print_error "Nginx configuration test failed"
    exit 1
fi

# Start and enable nginx
print_status "Starting and enabling nginx service..."
sudo systemctl start nginx
sudo systemctl enable nginx
sudo systemctl reload nginx

# Verify nginx is running
if sudo systemctl is-active --quiet nginx; then
    print_success "Nginx is running successfully"
else
    print_error "Nginx failed to start"
    sudo systemctl status nginx
    exit 1
fi

# Test if nginx is serving on port 80
sleep 5
if curl -s -I http://localhost/ | grep -q "nginx"; then
    print_success "Nginx configured as reverse proxy on port 80"
else
    print_warning "Nginx may not be properly configured - please check manually"
fi

# Test log file creation
print_status "Testing log file creation..."
sudo -u azureuser touch "$OPENSILEX_HOME/logs/opensilex.log"
sudo -u azureuser chmod 664 "$OPENSILEX_HOME/logs/opensilex.log"
echo "$(date): OpenSILEX installation log test" | sudo -u azureuser tee "$OPENSILEX_HOME/logs/opensilex.log" > /dev/null

if [ -f "$OPENSILEX_HOME/logs/opensilex.log" ]; then
    echo "Log file created successfully at $OPENSILEX_HOME/logs/opensilex.log"
else
    echo "WARNING: Failed to create log file"
fi

# Create systemd service
print_status "Creating systemd service..."
sudo tee /etc/systemd/system/opensilex.service << 'SERVICE_EOF'
[Unit]
Description=OpenSILEX Server (Production)
After=network.target docker.service
Requires=docker.service

[Service]
Type=exec
User=azureuser
WorkingDirectory=/home/azureuser/opensilex
Environment=JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
Environment=PATH=/usr/lib/jvm/java-17-openjdk-amd64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=production
ExecStartPre=/usr/bin/docker compose up -d
ExecStartPre=/bin/sleep 30
ExecStart=/home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh server start --host=0.0.0.0 --port=8666
ExecStop=/home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh server stop
ExecStopPost=/usr/bin/docker compose down
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
# Ensure log directory permissions
ExecStartPre=/bin/chown -R azureuser:azureuser /home/azureuser/opensilex/logs
ExecStartPre=/bin/chmod -R 755 /home/azureuser/opensilex/logs

[Install]
WantedBy=multi-user.target
SERVICE_EOF

sudo systemctl daemon-reload
sudo systemctl enable opensilex.service
sudo systemctl start opensilex.service

# Set up automatic group assignment for Feide/OpenID users
print_status "Setting up automatic group assignment for new users..."

# Wait for OpenSILEX to start up (may take a minute)
print_status "Waiting for OpenSILEX service to be fully ready..."
sleep 30
for i in {1..12}; do
    if curl -s http://localhost:8666/rest/system/info >/dev/null; then
        print_success "OpenSILEX API is responding"
        break
    fi
    if [ $i -eq 12 ]; then
        print_warning "API not responding yet, continuing with group setup anyway"
    else
        print_status "Waiting for API... (attempt $i/12)"
        sleep 10
    fi
done

# Create auto-group assignment directory
sudo mkdir -p /opt/opensilex-auto-groups

# Install Python dependencies
sudo apt install -y python3 python3-pip python3-venv jq curl

# Clone PHIS repository for OpenSILEX Python client
print_status "Setting up OpenSILEX Python client..."
if [ ! -d "/home/azureuser/PHIS" ]; then
    echo "Cloning PHIS repository (debian-11-production branch) for OpenSILEX Python client..."
    cd /home/azureuser
    git clone -b debian-11-production https://github.com/lversen/PHIS.git PHIS
    chown -R azureuser:azureuser /home/azureuser/PHIS
else
    echo "PHIS repository already exists"
fi

# Create Python virtual environment
sudo python3 -m venv /opt/opensilex-auto-groups/venv
sudo /opt/opensilex-auto-groups/venv/bin/pip install requests pymongo python-dateutil urllib3 six

# Create the monitoring script
sudo tee /opt/opensilex-auto-groups/monitor_new_users.py > /dev/null << 'MONITOR_EOF'
#!/usr/bin/env python3
"""
Working OpenSILEX New User Monitor using raw HTTP requests
Bypasses Python client deserialization issues
"""

import requests
import json
import time
import logging
import os
import sys
from datetime import datetime

# Configuration
OPENSILEX_API_URL = "http://172.211.86.191:8666/rest"
ADMIN_EMAIL = "admin@opensilex.org"
ADMIN_PASSWORD = "admin"
DEFAULT_GROUP_URI = "http://opensilex.org/groups/users"
DEFAULT_PROFILE_URI = "http://opensilex.org/profiles/default"
CHECK_INTERVAL = 10  # seconds - optimized for faster user detection
PROCESSED_USERS_FILE = "/opt/opensilex-auto-groups/processed_users.json"

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/opensilex-auto-groups.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class RawOpenSILEXAutoGroups:
    def __init__(self):
        self.token = None
        self.processed_users = self.load_processed_users()
        
    def load_processed_users(self):
        """Load list of already processed users"""
        try:
            if os.path.exists(PROCESSED_USERS_FILE):
                with open(PROCESSED_USERS_FILE, 'r') as f:
                    return set(json.load(f))
        except Exception as e:
            logger.warning(f"Could not load processed users file: {e}")
        return set()
    
    def save_processed_users(self):
        """Save list of processed users"""
        try:
            with open(PROCESSED_USERS_FILE, 'w') as f:
                json.dump(list(self.processed_users), f)
        except Exception as e:
            logger.error(f"Could not save processed users file: {e}")
    
    def authenticate(self):
        """Authenticate and get token"""
        try:
            auth_data = {"identifier": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
            response = requests.post(f"{OPENSILEX_API_URL}/security/authenticate", 
                                   json=auth_data, headers={"Content-Type": "application/json"})
            
            if response.status_code == 200:
                result = response.json()
                self.token = result.get('result', {}).get('token')
                if self.token:
                    logger.info("Successfully authenticated with OpenSILEX API")
                    return True
            
            logger.error(f"Authentication failed: {response.status_code}")
            return False
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            return False
    
    def get_users_from_api(self):
        """Get users using raw HTTP"""
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.get(f"{OPENSILEX_API_URL}/security/users", headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                return data.get('result', [])
            else:
                logger.error(f"Failed to get users: {response.status_code} - {response.text}")
                return []
        except Exception as e:
            logger.error(f"Error getting users: {e}")
            return []
    
    def get_group_by_uri(self, group_uri):
        """Get group data using raw HTTP"""
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            # URL encode the URI
            encoded_uri = group_uri.replace('/', '%2F').replace(':', '%3A')
            response = requests.get(f"{OPENSILEX_API_URL}/security/groups/{encoded_uri}", headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                return data.get('result', {})
            else:
                logger.error(f"Failed to get group: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            logger.error(f"Error getting group: {e}")
            return None
    
    def update_group_raw(self, group_data):
        """Update group using raw HTTP"""
        try:
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            
            response = requests.put(f"{OPENSILEX_API_URL}/security/groups", 
                                  json=group_data, headers=headers)
            
            if response.status_code == 200:
                return True
            else:
                logger.error(f"Failed to update group: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"Error updating group: {e}")
            return False
    
    def assign_user_to_group(self, user_data):
        """Assign user to default group using raw HTTP"""
        try:
            user_uri = user_data.get('uri')
            user_email = user_data.get('email', 'unknown')
            user_name = f"{user_data.get('first_name', '')} {user_data.get('last_name', '')}".strip()
            if not user_name:
                user_name = user_email
            
            logger.info(f"Processing user: {user_email} ({user_uri})")
            
            # Get current group
            group_data = self.get_group_by_uri(DEFAULT_GROUP_URI)
            if not group_data:
                logger.error("Could not retrieve Users group")
                return False
            
            # Check if user already in group
            user_profiles = group_data.get('user_profiles', [])
            for profile in user_profiles:
                if profile.get('user_uri') == user_uri:
                    logger.info(f"User {user_email} already in group")
                    return True
            
            # Add user to group
            new_user_profile = {
                "user_uri": user_uri,
                "user_name": user_name,
                "profile_uri": DEFAULT_PROFILE_URI,
                "profile_name": "Default User"
            }
            
            user_profiles.append(new_user_profile)
            group_data['user_profiles'] = user_profiles
            
            # Update the group
            if self.update_group_raw(group_data):
                logger.info(f"✅ Successfully assigned {user_email} to Users group")
                return True
            else:
                logger.error(f"❌ Failed to update group for {user_email}")
                return False
                
        except Exception as e:
            logger.error(f"Error assigning user to group: {e}")
            return False
    
    def process_new_users(self):
        """Process new users"""
        try:
            if not self.token and not self.authenticate():
                logger.warning("Failed to authenticate")
                return
            
            users = self.get_users_from_api()
            if not users:
                logger.debug("No users returned")
                return
            
            logger.info(f"Found {len(users)} total users")
            new_users_found = 0
            
            for user in users:
                user_uri = user.get('uri')
                user_email = user.get('email', 'unknown')
                
                if not user_uri:
                    continue
                
                # Skip admin user
                if user_email == ADMIN_EMAIL:
                    continue
                
                # Check if already processed
                if user_uri in self.processed_users:
                    continue
                
                logger.info(f"Found new user: {user_email}")
                
                # Assign to group
                if self.assign_user_to_group(user):
                    self.processed_users.add(user_uri)
                    new_users_found += 1
                else:
                    logger.error(f"Failed to assign {user_email}")
            
            if new_users_found > 0:
                self.save_processed_users()
                logger.info(f"Processed {new_users_found} new users")
            else:
                logger.debug("No new users to process")
                
        except Exception as e:
            logger.error(f"Error in process_new_users: {e}")
            self.token = None  # Reset auth on error
    
    def run_monitor(self):
        """Main monitoring loop"""
        logger.info("🚀 Starting Raw HTTP OpenSILEX Monitor for Feide users")
        logger.info(f"Check interval: {CHECK_INTERVAL} seconds")
        
        while True:
            try:
                self.process_new_users()
                time.sleep(CHECK_INTERVAL)
                
            except KeyboardInterrupt:
                logger.info("Shutting down...")
                break
            except Exception as e:
                logger.error(f"Unexpected error: {e}")
                time.sleep(CHECK_INTERVAL)
        
        logger.info("Monitor stopped")

if __name__ == "__main__":
    monitor = RawOpenSILEXAutoGroups()
    monitor.run_monitor()
MONITOR_EOF

# Create initial groups and profiles setup script
sudo tee /opt/opensilex-auto-groups/setup_initial_groups.py > /dev/null << 'SETUP_EOF'
#!/usr/bin/env python3
"""
Simple working setup for OpenSILEX Feide/OpenID integration
Focuses on creating profiles and groups correctly
"""

import sys
import os
import time

# Add src directories to Python path for OpenSILEX client
sys.path.insert(0, '/home/azureuser/PHIS/src')
sys.path.insert(0, '/home/azureuser/PHIS/src/utils')
sys.path.insert(0, '/home/azureuser/PHIS/src/opensilex_python_client')

from opensilex_swagger_client.api.security_api import SecurityApi
from opensilex_swagger_client.models.group_creation_dto import GroupCreationDTO
from opensilex_swagger_client.models.profile_creation_dto import ProfileCreationDTO
from auth_manager import OpenSilexAuthManager

OPENSILEX_API_URL = "http://172.211.86.191:8666"
ADMIN_EMAIL = "admin@opensilex.org"
ADMIN_PASSWORD = "admin"

def main():
    print("🚀 Setting up OpenSILEX profiles and groups for Feide/OpenID integration...")
    
    try:
        # Initialize auth manager
        auth_manager = OpenSilexAuthManager(host=OPENSILEX_API_URL)
        
        # Authenticate with retry logic
        authenticated = False
        for attempt in range(5):
            print(f"Authentication attempt {attempt + 1}/5...")
            if auth_manager.authenticate(ADMIN_EMAIL, ADMIN_PASSWORD, save_token=False):
                authenticated = True
                print("✅ Authentication successful")
                break
            else:
                print(f"❌ Authentication failed (attempt {attempt+1}/5)")
                if attempt < 4:
                    print("Waiting 10 seconds before retry...")
                    time.sleep(10)
        
        if not authenticated:
            print("❌ Could not authenticate after 5 attempts")
            sys.exit(1)
        
        # Get authenticated client
        api_client = auth_manager.get_authenticated_client()
        security_api = SecurityApi(api_client)
        auth_header = f"Bearer {auth_manager.token_data['token']}"
        
        print("🔧 Creating profiles...")
        
        # Create comprehensive admin profile with ALL necessary credentials
        admin_credentials = [
            # Core security management
            "admin-access", "user-modification", "group-modification", "profile-modification",
            # Access to all system modules
            "organization-access", "project-access", "experiment-access", "facility-access",
            "device-access", "event-access", "variable-access", "germplasm-access", 
            "document-access", "scientific-objects-access", "provenance-access", "data-access",
            "spatial-access", "vocabulary-access", "account-access", "person-access", 
            "group-access", "profile-access", "package-access", "dataverse-access",
            # UI access
            "dashboard-access", "menu-access", "profile-read-own"
        ]
        
        try:
            admin_profile = ProfileCreationDTO(
                uri="http://opensilex.org/profiles/admin",
                name="Administrator",
                credentials=admin_credentials
            )
            security_api.create_profile(authorization=auth_header, body=admin_profile)
            print("✅ Created/Updated Administrator profile with comprehensive permissions")
        except Exception as e:
            if "409" in str(e) or "already exists" in str(e).lower():
                print("ℹ️  Administrator profile already exists")
            else:
                print(f"❌ Failed to create Administrator profile: {e}")
        
        # Create default profile for Feide users
        try:
            default_profile = ProfileCreationDTO(
                uri="http://opensilex.org/profiles/default",
                name="Default User",
                credentials=[
                    "dashboard-access",
                    "menu-access", 
                    "profile-read-own"
                ]
            )
            security_api.create_profile(authorization=auth_header, body=default_profile)
            print("✅ Created Default User profile")
        except Exception as e:
            if "409" in str(e) or "already exists" in str(e).lower():
                print("ℹ️  Default User profile already exists")
            else:
                print(f"❌ Failed to create Default User profile: {e}")
        
        print("🔧 Creating groups...")
        
        # Create Users group for automatic Feide assignment
        try:
            users_group = GroupCreationDTO(
                uri="http://opensilex.org/groups/users",
                name="Users",
                description="Default group for Feide/OpenID users - automatically assigned",
                user_profiles=[]
            )
            security_api.create_group(authorization=auth_header, body=users_group)
            print("✅ Created Users group")
        except Exception as e:
            if "409" in str(e) or "already exists" in str(e).lower():
                print("ℹ️  Users group already exists")
            else:
                print(f"❌ Failed to create Users group: {e}")
        
        # Create Administrators group for manual admin assignment
        try:
            admin_group = GroupCreationDTO(
                uri="http://opensilex.org/groups/administrators",
                name="Administrators",
                description="System administrators with full access",
                user_profiles=[]
            )
            security_api.create_group(authorization=auth_header, body=admin_group)
            print("✅ Created Administrators group")
        except Exception as e:
            if "409" in str(e) or "already exists" in str(e).lower():
                print("ℹ️  Administrators group already exists")
            else:
                print(f"❌ Failed to create Administrators group: {e}")
        
        print("✅ Setup completed successfully!")
        print("")
        print("📋 Next Steps:")
        print("1. ✅ Administrator profile created with comprehensive permissions")
        print("2. ✅ Default User profile created for Feide users")
        print("3. ✅ Users group created for automatic assignment")
        print("4. ✅ Administrators group created")
        print("")
        print("🔧 Manual Action Required:")
        print("• Log into the OpenSILEX web interface as admin")
        print("• Go to Administration > Groups")
        print("• Edit the 'Administrators' group")
        print("• Add the admin user with 'Administrator' profile")
        print("• This enables the admin to manage users and groups via the API")
        print("")
        print("🚀 After manual setup, the monitoring service will automatically:")
        print("• Detect new Feide users")
        print("• Assign them to 'Users' group with 'Default User' profile")
        print("• Give them dashboard and menu access")
        
    except Exception as e:
        print(f"❌ Setup failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
SETUP_EOF

# Make scripts executable
sudo chmod +x /opt/opensilex-auto-groups/monitor_new_users.py
sudo chmod +x /opt/opensilex-auto-groups/setup_initial_groups.py

# Run initial setup
print_status "Creating initial profiles and groups..."
sudo /opt/opensilex-auto-groups/venv/bin/python /opt/opensilex-auto-groups/setup_initial_groups.py

# Create systemd service for monitoring
sudo tee /etc/systemd/system/opensilex-auto-groups.service > /dev/null << 'SERVICE_EOF'
[Unit]
Description=OpenSILEX Automatic Group Assignment Service for Feide/OpenID Users (Optimized - 10s intervals)
After=network.target opensilex.service
Requires=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/opensilex-auto-groups
ExecStart=/opt/opensilex-auto-groups/venv/bin/python /opt/opensilex-auto-groups/monitor_new_users.py
Restart=always
RestartSec=10
StandardOutput=append:/var/log/opensilex-auto-groups.log
StandardError=append:/var/log/opensilex-auto-groups.log

Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
SERVICE_EOF

# Create log rotation
sudo tee /etc/logrotate.d/opensilex-auto-groups > /dev/null << 'LOGROTATE_EOF'
/var/log/opensilex-auto-groups.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
}
LOGROTATE_EOF

# Enable and start the auto-groups service
sudo systemctl daemon-reload
sudo systemctl enable opensilex-auto-groups.service
sudo systemctl start opensilex-auto-groups.service

print_success "Automatic group assignment configured!"

print_success "OpenSILEX production installation completed!"
echo ""
echo "==============================================" 
echo "        Installation Summary"
echo "==============================================" 
echo "• Using azureuser for OpenSILEX installation"
echo "• Directory structure: /home/azureuser/opensilex/{bin,config,data,logs}"
echo "• Configuration files created with logging"
echo "• MongoDB and GraphDB services configured"
echo "• Triplestore initialized with ontologies"
echo "• Admin user created (admin@opensilex.org / admin)"
echo "• Nginx reverse proxy configured on port 80"
echo "• Startup scripts and aliases configured"
echo "• Systemd service configured"
echo "• Feide/OpenID authentication configured"
echo "• Automatic group assignment system installed"
echo ""
echo "🔐 User Management:"
echo "• New Feide users automatically join 'Users' group"
echo "• Default profile provides menu/dashboard access only"
echo "• Admin users must be manually assigned to 'Administrators' group"
echo "• Monitor service: systemctl status opensilex-auto-groups"
echo "• Monitor logs: tail -f /var/log/opensilex-auto-groups.log"
echo ""
echo "Next steps:"
echo "1. Access: http://$(curl -s ifconfig.me)/ (nginx) or :8666 (direct)"
echo "2. Login with Feide credentials (new users auto-assigned to Users group)"
echo "3. For admin access: manually add users to Administrators group"
echo "4. Run help: /home/azureuser/opensilex-help.sh"
echo "==============================================" 
'@

        
        # Write scripts to temporary files and upload
        $tempSetupScript = [System.IO.Path]::GetTempFileName()
        $tempInstallScript = [System.IO.Path]::GetTempFileName()
        
        [System.IO.File]::WriteAllText($tempSetupScript, $setupScript)
        [System.IO.File]::WriteAllText($tempInstallScript, $installerScript)
        
        # Upload scripts
        scp -i $privateKeyPath -o StrictHostKeyChecking=no $tempSetupScript "$AdminUsername@${TargetIP}:~/setup-system.sh"
        scp -i $privateKeyPath -o StrictHostKeyChecking=no $tempInstallScript "$AdminUsername@${TargetIP}:~/install-opensilex.sh"
        
        # Upload API keys config file if it exists
        $apiKeysPath = Join-Path $PSScriptRoot "config\api-keys.conf"
        if (Test-Path $apiKeysPath) {
            Write-Info "Uploading API keys configuration..."
            scp -i $privateKeyPath -o StrictHostKeyChecking=no $apiKeysPath "$AdminUsername@${TargetIP}:~/api-keys.conf"
        } else {
            Write-Warning "API keys file not found: $apiKeysPath"
        }
        
        # Clean up temp files
        Remove-Item $tempSetupScript, $tempInstallScript
        
        # Fix line endings and make scripts executable
        ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "dos2unix ~/setup-system.sh ~/install-opensilex.sh ~/api-keys.conf 2>/dev/null || sed -i 's/\r$//' ~/setup-system.sh ~/install-opensilex.sh ~/api-keys.conf; chmod +x ~/setup-system.sh ~/install-opensilex.sh"
        
        if (-not $SkipDependencies) {
            Write-Info "Setting up system and creating OpenSILEX user (this may take 5-10 minutes)..."
            ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "~/setup-system.sh"
        }
        
        Write-Info "Installing OpenSILEX following production guide (this may take 10-15 minutes)..."
        ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "~/install-opensilex.sh"
        
        Write-Success "OpenSILEX installation completed successfully!"
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
                    Write-Info "OpenSILEX URL: http://$($publicIP.IpAddress):8666/"
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
                ssh -i $privateKeyPath $AdminUsername@$ipAddress "sudo journalctl -u opensilex -n 50"
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
                    Write-Info "OpenSILEX Access: http://$($publicIP.IpAddress):8666/"
                    Write-Info "API Documentation: http://$($publicIP.IpAddress):8666/api-docs"
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
    
    # Choice handling moved to main loop
}

# Main execution
try {
    Write-Host "OpenSILEX GitHub Installation Manager" -ForegroundColor Blue
    Write-Host "=====================================" -ForegroundColor Blue
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