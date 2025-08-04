# OpenSILEX Production Installation Manager
# PowerShell script for deploying and managing OpenSILEX production installation on Linux VMs
# Works with the opensilex-production-install.sh script

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("Menu", "FullDeploy", "DeployVM", "InstallProduction", "Status", "Connect", "Start", "Stop", "Restart", "Delete", "Logs", "Backup", "UpdateScript", "ShowInfo", "GetIP")]
    [string]$Command = "Menu",
    
    [Parameter(Mandatory=$false)]
    [string]$VMName = "opensilex-prod-vm",
    
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroupName = "RG-OPENSILEX-PRODUCTION",
    
    [Parameter(Mandatory=$false)]
    [string]$Location = "westeurope",
    
    [Parameter(Mandatory=$false)]
    [string]$AdminUsername = "azureuser",
    
    [Parameter(Mandatory=$false)]
    [string]$VMIPAddress,
    
    [Parameter(Mandatory=$false)]
    [string]$SSHKeyPath,
    
    [Parameter(Mandatory=$false)]
    [string]$DomainName = "",
    
    [Parameter(Mandatory=$false)]
    [switch]$EnableSSL,
    
    [Parameter(Mandatory=$false)]
    [switch]$DisableNginx
)

# Colors for output
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"
$Blue = "Cyan"
$White = "White"

# Configuration
$VMSize = "Standard_D4s_v3"  # 4 vCPUs, 16 GB RAM for production
$OSVersion = "Ubuntu:0001-com-ubuntu-server-jammy:22_04-lts-gen2:latest"
$DiskSize = 100  # 100 GB for production

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
    Write-Info "Deploying Azure VM for OpenSILEX production installation..."
    
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
        Write-Info "Creating production VM: $VMName"
        
        $credential = New-Object System.Management.Automation.PSCredential ($AdminUsername, (ConvertTo-SecureString "dummy" -AsPlainText -Force))
        
        $vm = New-AzVMConfig -VMName $VMName -VMSize $VMSize
        $vm = Set-AzVMOperatingSystem -VM $vm -Linux -ComputerName $VMName -Credential $credential -DisablePasswordAuthentication
        $vm = Set-AzVMSourceImage -VM $vm -PublisherName "Canonical" -Offer "0001-com-ubuntu-server-jammy" -Skus "22_04-lts-gen2" -Version "latest"
        
        # Add SSH key
        Add-AzVMSshPublicKey -VM $vm -KeyData $sshPublicKey -Path "/home/$AdminUsername/.ssh/authorized_keys"
        
        # Create network components
        $subnet = New-AzVirtualNetworkSubnetConfig -Name "default" -AddressPrefix "10.0.0.0/24"
        $vnet = New-AzVirtualNetwork -Name "$VMName-vnet" -ResourceGroupName $ResourceGroupName -Location $Location -AddressPrefix "10.0.0.0/16" -Subnet $subnet
        
        $pip = New-AzPublicIpAddress -Name "$VMName-ip" -ResourceGroupName $ResourceGroupName -Location $Location -AllocationMethod Static -Sku Standard
        
        # Create NSG with production ports
        $nsgRules = @()
        $nsgRules += New-AzNetworkSecurityRuleConfig -Name "SSH" -Protocol Tcp -Direction Inbound -Priority 1000 -SourceAddressPrefix * -SourcePortRange * -DestinationAddressPrefix * -DestinationPortRange 22 -Access Allow
        $nsgRules += New-AzNetworkSecurityRuleConfig -Name "HTTP" -Protocol Tcp -Direction Inbound -Priority 1001 -SourceAddressPrefix * -SourcePortRange * -DestinationAddressPrefix * -DestinationPortRange 80 -Access Allow
        $nsgRules += New-AzNetworkSecurityRuleConfig -Name "HTTPS" -Protocol Tcp -Direction Inbound -Priority 1002 -SourceAddressPrefix * -SourcePortRange * -DestinationAddressPrefix * -DestinationPortRange 443 -Access Allow
        
        # Add direct OpenSILEX access if Nginx is disabled
        if ($DisableNginx) {
            $nsgRules += New-AzNetworkSecurityRuleConfig -Name "OpenSILEX" -Protocol Tcp -Direction Inbound -Priority 1003 -SourceAddressPrefix * -SourcePortRange * -DestinationAddressPrefix * -DestinationPortRange 8080 -Access Allow
        }
        
        $nsg = New-AzNetworkSecurityGroup -Name "$VMName-nsg" -ResourceGroupName $ResourceGroupName -Location $Location -SecurityRules $nsgRules
        
        $nic = New-AzNetworkInterface -Name "$VMName-nic" -ResourceGroupName $ResourceGroupName -Location $Location -SubnetId $vnet.Subnets[0].Id -PublicIpAddressId $pip.Id -NetworkSecurityGroupId $nsg.Id
        
        $vm = Add-AzVMNetworkInterface -VM $vm -Id $nic.Id
        
        # Set OS disk to Premium SSD for production
        $vm = Set-AzVMOSDisk -VM $vm -Name "$VMName-osdisk" -DiskSizeInGB $DiskSize -CreateOption FromImage -StorageAccountType "Premium_LRS"
        
        # Create the VM
        Write-Info "Creating VM (this may take 5-10 minutes)..."
        New-AzVM -ResourceGroupName $ResourceGroupName -Location $Location -VM $vm | Out-Null
        
        # Get VM IP
        $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
        if ($publicIP) {
            $script:VMIPAddress = $publicIP.IpAddress
            Write-Success "Production VM deployed successfully!"
            Write-Info "VM Name: $VMName"
            Write-Info "VM Size: $VMSize (Production)"
            Write-Info "OS: Ubuntu 22.04 LTS"
            Write-Info "Disk: $DiskSize GB Premium SSD"
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

function Test-SSHConnectivity {
    param(
        [string]$TargetIP,
        [string]$PrivateKeyPath,
        [int]$MaxRetries = 15,
        [int]$RetryDelay = 20
    )
    
    Write-Info "Testing SSH connectivity..."
    
    for ($i = 1; $i -le $MaxRetries; $i++) {
        Write-Info "SSH attempt $i of $MaxRetries..."
        
        # Test SSH connection
        $testResult = ssh -i $PrivateKeyPath -o ConnectTimeout=10 -o StrictHostKeyChecking=no -o BatchMode=yes $AdminUsername@$TargetIP "echo 'Connected successfully'" 2>$null
        
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

function Install-OpenSILEXProduction {
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
    
    Write-Info "Installing OpenSILEX production environment on VM: $TargetIP"
    
    $sshKeyPath = Get-SSHKeyPath
    if (-not $sshKeyPath) {
        return $false
    }
    
    $privateKeyPath = $sshKeyPath -replace "\.pub$", ""
    
    try {
        # Test SSH connectivity
        if (-not (Test-SSHConnectivity -TargetIP $TargetIP -PrivateKeyPath $privateKeyPath)) {
            Write-Error "Cannot establish SSH connection to VM"
            return $false
        }
        
        # Upload installation script
        Write-Info "Uploading production installation script..."
        $scriptPath = Join-Path $PSScriptRoot "opensilex-production-install.sh"
        
        if (-not (Test-Path $scriptPath)) {
            Write-Error "Installation script not found: $scriptPath"
            Write-Info "Please ensure opensilex-production-install.sh is in the same directory as this script"
            return $false
        }
        
        scp -i $privateKeyPath -o StrictHostKeyChecking=no $scriptPath "$AdminUsername@${TargetIP}:~/opensilex-production-install.sh"
        
        # Make script executable
        ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "chmod +x ~/opensilex-production-install.sh"
        
        # Get domain configuration if not provided
        if (-not $DomainName) {
            if ($script:VMIPAddress) {
                $DomainName = $script:VMIPAddress
            } else {
                $DomainName = $TargetIP
            }
        }
        
        # Prepare configuration for unattended installation
        Write-Info "Configuring production installation..."
        $configScript = @"
#!/bin/bash
export DEBIAN_FRONTEND=noninteractive

# Pre-configure responses for the installation script
echo '$DomainName' | ~/opensilex-production-install.sh install
"@
        
        # Write configuration script
        $tempConfigScript = [System.IO.Path]::GetTempFileName()
        [System.IO.File]::WriteAllText($tempConfigScript, $configScript)
        
        scp -i $privateKeyPath -o StrictHostKeyChecking=no $tempConfigScript "$AdminUsername@${TargetIP}:~/run-install.sh"
        Remove-Item $tempConfigScript
        
        ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "chmod +x ~/run-install.sh"
        
        # Run installation
        Write-Info "Starting OpenSILEX production installation..."
        Write-Info "This process may take 30-45 minutes. Please be patient..."
        Write-Warning "Do not interrupt the installation process!"
        
        $installStart = Get-Date
        
        # Run the installation with timeout
        $installResult = ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "timeout 3600 ./opensilex-production-install.sh install" 2>&1
        
        $installEnd = Get-Date
        $installDuration = $installEnd - $installStart
        
        Write-Info "Installation completed in $($installDuration.TotalMinutes.ToString("F1")) minutes"
        
        # Check if installation was successful
        $statusCheck = ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "sudo systemctl is-active opensilex.service" 2>$null
        
        if ($statusCheck -eq "active") {
            Write-Success "OpenSILEX production installation completed successfully!"
            
            # Get access information
            $accessUrl = if ($EnableSSL -and $DomainName -ne $TargetIP) {
                "https://$DomainName"
            } elseif ($DisableNginx) {
                "http://${TargetIP}:8080"
            } else {
                "http://$TargetIP"
            }
            
            Write-Info "=== Installation Summary ==="
            Write-Info "OpenSILEX URL: $accessUrl"
            Write-Info "Admin Email: admin@$DomainName"
            Write-Info "Admin Password: admin (CHANGE IMMEDIATELY!)"
            Write-Info "SSH Access: ssh $AdminUsername@$TargetIP"
            Write-Warning "Please change the default admin password immediately!"
            
            return $true
        } else {
            Write-Error "Installation completed but OpenSILEX service is not running"
            Write-Info "Check logs with: $0 logs"
            return $false
        }
        
    } catch {
        Write-Error "Production installation failed: $($_.Exception.Message)"
        return $false
    }
}

function Get-VMStatus {
    Write-Info "Checking VM and OpenSILEX status..."
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
                    
                    # Check OpenSILEX service status
                    $sshKeyPath = Get-SSHKeyPath
                    if ($sshKeyPath) {
                        $privateKeyPath = $sshKeyPath -replace "\.pub$", ""
                        try {
                            $serviceStatus = ssh -i $privateKeyPath -o StrictHostKeyChecking=no -o ConnectTimeout=5 $AdminUsername@$($publicIP.IpAddress) "sudo systemctl is-active opensilex.service" 2>$null
                            Write-Info "OpenSILEX Service: $serviceStatus"
                            
                            if ($serviceStatus -eq "active") {
                                $accessUrl = if ($DisableNginx) {
                                    "http://$($publicIP.IpAddress):8080"
                                } else {
                                    "http://$($publicIP.IpAddress)"
                                }
                                Write-Info "OpenSILEX URL: $accessUrl"
                            }
                        }
                        catch {
                            Write-Warning "Could not check OpenSILEX service status"
                        }
                    }
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
                Write-Info "Connecting to production VM..."
                & ssh -i $privateKeyPath $AdminUsername@$ipAddress
            } else {
                Write-Error "SSH key not found"
            }
        } else {
            Write-Error "Could not find VM public IP"
        }
    } catch {
        Write-Error "Failed to connect: $($_.Exception.Message)"
    }
}

function Invoke-RemoteCommand {
    param(
        [string]$Command,
        [string]$Description
    )
    
    Write-Info $Description
    try {
        $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
        if ($publicIP -and $publicIP.IpAddress) {
            $sshKeyPath = Get-SSHKeyPath
            if ($sshKeyPath) {
                $privateKeyPath = $sshKeyPath -replace "\.pub$", ""
                $ipAddress = $publicIP.IpAddress
                
                $result = ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$ipAddress $Command
                Write-Success "Command executed successfully"
                if ($result) {
                    Write-Host $result
                }
            } else {
                Write-Error "SSH key not found"
            }
        } else {
            Write-Error "Could not find VM public IP"
        }
    } catch {
        Write-Error "Failed to execute command: $($_.Exception.Message)"
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
    Write-Warning "This action cannot be undone!"
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
    Invoke-RemoteCommand "sudo journalctl -u opensilex.service -n 50" "Fetching OpenSILEX service logs..."
}

function Start-OpenSILEXServices {
    Invoke-RemoteCommand "sudo -u opensilex /home/opensilex/bin/start.sh" "Starting OpenSILEX services..."
}

function Stop-OpenSILEXServices {
    Invoke-RemoteCommand "sudo -u opensilex /home/opensilex/bin/stop.sh" "Stopping OpenSILEX services..."
}

function Show-OpenSILEXStatus {
    Invoke-RemoteCommand "sudo -u opensilex /home/opensilex/bin/status.sh" "Checking OpenSILEX services status..."
}

function Create-Backup {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    Invoke-RemoteCommand "sudo -u opensilex /home/opensilex/bin/backup.sh" "Creating OpenSILEX backup..."
    Write-Info "Backup created with timestamp: $timestamp"
}

function Update-InstallScript {
    Write-Info "Updating installation script on VM..."
    try {
        $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
        if ($publicIP -and $publicIP.IpAddress) {
            $sshKeyPath = Get-SSHKeyPath
            if ($sshKeyPath) {
                $privateKeyPath = $sshKeyPath -replace "\.pub$", ""
                $scriptPath = Join-Path $PSScriptRoot "opensilex-production-install.sh"
                
                if (Test-Path $scriptPath) {
                    scp -i $privateKeyPath -o StrictHostKeyChecking=no $scriptPath "$AdminUsername@$($publicIP.IpAddress):~/opensilex-production-install.sh"
                    ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$($publicIP.IpAddress) "chmod +x ~/opensilex-production-install.sh"
                    Write-Success "Installation script updated successfully"
                } else {
                    Write-Error "Local installation script not found: $scriptPath"
                }
            }
        }
    } catch {
        Write-Error "Failed to update script: $($_.Exception.Message)"
    }
}

function Show-Menu {
    $script:choice = ""
    Clear-Host
    Write-Host "=============================================" -ForegroundColor Blue
    Write-Host "   OpenSILEX Production Manager            " -ForegroundColor Blue
    Write-Host "=============================================" -ForegroundColor Blue
    Write-Host ""
    Write-Host "PRODUCTION DEPLOYMENT FEATURES:" -ForegroundColor Green
    Write-Host "• Ubuntu 22.04 LTS with Production VM size" -ForegroundColor White
    Write-Host "• MongoDB Replica Set configuration" -ForegroundColor White
    Write-Host "• RDF4J Triplestore with proper memory allocation" -ForegroundColor White
    Write-Host "• Nginx reverse proxy with SSL support" -ForegroundColor White
    Write-Host "• Systemd services for automatic startup" -ForegroundColor White
    Write-Host "• Firewall configuration" -ForegroundColor White
    Write-Host "• Backup and management scripts" -ForegroundColor White
    Write-Host ""
    Write-Host "Current Configuration:" -ForegroundColor Yellow
    Write-Host "  VM Name: $VMName" -ForegroundColor White
    Write-Host "  Resource Group: $ResourceGroupName" -ForegroundColor White
    Write-Host "  Region: $Location" -ForegroundColor White
    Write-Host "  VM Size: $VMSize (Production)" -ForegroundColor White
    Write-Host ""
    Write-Host "Available Commands:" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Deployment:" -ForegroundColor Green
    Write-Host "    1. Full Production Deploy (VM + OpenSILEX)" -ForegroundColor White
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
    Write-Host "  OpenSILEX Management:" -ForegroundColor Green
    Write-Host "    9. Start OpenSILEX Services" -ForegroundColor White
    Write-Host "   10. Stop OpenSILEX Services" -ForegroundColor White
    Write-Host "   11. View Logs" -ForegroundColor White
    Write-Host "   12. Create Backup" -ForegroundColor White  
    Write-Host ""
    Write-Host "  Maintenance:" -ForegroundColor Green
    Write-Host "   13. Update Installation Script" -ForegroundColor White
    Write-Host "   14. Delete All Resources" -ForegroundColor White
    Write-Host ""
    Write-Host "    0. Exit" -ForegroundColor Red
    Write-Host ""
    
    $script:choice = Read-Host "Select an option (0-14)"
    
    switch ($script:choice) {
        "1" { 
            Write-Info "Starting full production deployment..."
            if (Deploy-VM) {
                Install-OpenSILEXProduction
            }
        }
        "2" { Deploy-VM }
        "3" { Install-OpenSILEXProduction }
        "4" { Start-VM }
        "5" { Stop-VM }
        "6" { Restart-VM }
        "7" { Get-VMStatus }
        "8" { Connect-ToVM }
        "9" { Start-OpenSILEXServices }
        "10" { Stop-OpenSILEXServices }
        "11" { Show-Logs }
        "12" { Create-Backup }
        "13" { Update-InstallScript }
        "14" { Remove-Deployment }
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
    Write-Host "OpenSILEX Production Manager" -ForegroundColor Blue
    Write-Host "===========================" -ForegroundColor Blue
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
        "fulldeploy" { 
            if (Deploy-VM) {
                Install-OpenSILEXProduction -TargetIP $VMIPAddress
            }
        }
        "deployvm" { Deploy-VM }
        "installproduction" { Install-OpenSILEXProduction }
        "status" { Get-VMStatus }
        "connect" { Connect-ToVM }
        "start" { Start-OpenSILEXServices }
        "stop" { Stop-OpenSILEXServices }
        "restart" { Restart-VM }
        "delete" { Remove-Deployment }
        "logs" { Show-Logs }
        "backup" { Create-Backup }
        "updatescript" { Update-InstallScript }
        "showinfo" { 
            Get-VMStatus
            Show-OpenSILEXStatus
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
            Write-Info "Available commands: Menu, FullDeploy, DeployVM, InstallProduction, Status, Connect, Start, Stop, Restart, Delete, Logs, Backup, UpdateScript"
        }
    }
} catch {
    Write-Error "Script execution failed: $($_.Exception.Message)"
    Write-Error $_.ScriptStackTrace
}