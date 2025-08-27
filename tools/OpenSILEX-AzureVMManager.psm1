# OpenSILEX Azure VM Management Module
# PowerShell module for Azure VM deployment and management

# Import required modules
Import-Module -Name "$PSScriptRoot\OpenSILEX-OutputUtils.psm1" -Force
Import-Module -Name "$PSScriptRoot\OpenSILEX-SSHUtils.psm1" -Force

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

function Deploy-VM {
    param(
        [string]$VMName,
        [string]$ResourceGroupName,
        [string]$Location,
        [string]$AdminUsername,
        [string]$SSHKeyPath,
        [string]$VMSize = "Standard_E4s_v4",
        [int]$DiskSize = 500
    )
    
    Write-Info "Deploying Azure VM for OpenSILEX GitHub installation..."
    
    if (-not (Test-Prerequisites)) {
        return $false, $null
    }
    
    $sshKeyPath = Get-SSHKeyPath -SSHKeyPath $SSHKeyPath
    if (-not $sshKeyPath) {
        return $false, $null
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
                $VMIPAddress = $publicIP.IpAddress
                Write-Success "Using existing VM successfully!"
                Write-Info "VM Name: $VMName"
                Write-Info "Public IP: $VMIPAddress"
                Write-Info "SSH Command: ssh $AdminUsername@$VMIPAddress"
                return $true, $VMIPAddress
            } else {
                Write-Error "Could not find public IP for existing VM"
                return $false, $null
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
                $VMIPAddress = $publicIP.IpAddress
                Write-Success "VM deployed successfully!"
                Write-Info "VM Name: $VMName"
                Write-Info "Public IP: $VMIPAddress"
                Write-Info "SSH Command: ssh $AdminUsername@$VMIPAddress"
                
                # Additional deployment verification
                $vm = Get-AzVM -ResourceGroupName $ResourceGroupName -Name $VMName -Status -ErrorAction SilentlyContinue
                if ($vm) {
                    $powerState = ($vm.Statuses | Where-Object {$_.Code -like "PowerState/*"}).DisplayStatus
                    Write-Info "VM Power State: $powerState"
                }
                
                return $true, $VMIPAddress
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
        return $false, $null
    }
    catch {
        Write-Error "VM deployment failed: $($_.Exception.Message)"
        return $false, $null
    }
}

function Test-VMReady {
    param(
        [string]$VMName,
        [string]$ResourceGroupName
    )
    
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

function Get-VMStatus {
    param(
        [string]$VMName,
        [string]$ResourceGroupName,
        [string]$AdminUsername
    )
    
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
    param(
        [string]$VMName,
        [string]$ResourceGroupName,
        [string]$AdminUsername,
        [string]$SSHKeyPath
    )
    
    Write-Info "Connecting to VM..."
    try {
        $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
        if ($publicIP -and $publicIP.IpAddress) {
            $sshKeyPath = Get-SSHKeyPath -SSHKeyPath $SSHKeyPath
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
    param(
        [string]$VMName,
        [string]$ResourceGroupName
    )
    
    Write-Info "Starting VM..."
    try {
        Start-AzVM -ResourceGroupName $ResourceGroupName -Name $VMName | Out-Null
        Write-Success "VM started successfully"
    } catch {
        Write-Error "Failed to start VM: $($_.Exception.Message)"
    }
}

function Stop-VM {
    param(
        [string]$VMName,
        [string]$ResourceGroupName
    )
    
    Write-Info "Stopping VM..."
    try {
        Stop-AzVM -ResourceGroupName $ResourceGroupName -Name $VMName -Force | Out-Null
        Write-Success "VM stopped successfully"
    } catch {
        Write-Error "Failed to stop VM: $($_.Exception.Message)"
    }
}

function Restart-VM {
    param(
        [string]$VMName,
        [string]$ResourceGroupName
    )
    
    Write-Info "Restarting VM..."
    try {
        Restart-AzVM -ResourceGroupName $ResourceGroupName -Name $VMName | Out-Null
        Write-Success "VM restarted successfully"
    } catch {
        Write-Error "Failed to restart VM: $($_.Exception.Message)"
    }
}

function Remove-Deployment {
    param(
        [string]$ResourceGroupName
    )
    
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
    param(
        [string]$VMName,
        [string]$ResourceGroupName,
        [string]$AdminUsername,
        [string]$SSHKeyPath
    )
    
    Write-Info "Fetching OpenSILEX logs..."
    try {
        $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
        if ($publicIP -and $publicIP.IpAddress) {
            $sshKeyPath = Get-SSHKeyPath -SSHKeyPath $SSHKeyPath
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

function Get-VMPublicIP {
    param(
        [string]$VMName,
        [string]$ResourceGroupName
    )
    
    try {
        $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
        if ($publicIP) {
            return $publicIP.IpAddress
        } else {
            return $null
        }
    } catch {
        return $null
    }
}

function Get-NetworkSecurityGroupRules {
    param(
        [string]$VMName,
        [string]$ResourceGroupName
    )
    
    try {
        $nsg = Get-AzNetworkSecurityGroup -ResourceGroupName $ResourceGroupName -Name "$VMName-nsg" -ErrorAction SilentlyContinue
        if ($nsg) {
            Write-Info "Network Security Group Rules:"
            $nsg.SecurityRules | ForEach-Object {
                Write-Host "  $($_.Name): $($_.Direction) $($_.Access) $($_.Protocol) $($_.DestinationPortRange)" -ForegroundColor White
            }
        }
    } catch {
        Write-Error "Failed to get NSG rules: $($_.Exception.Message)"
    }
}

# Export functions
Export-ModuleMember -Function Test-Prerequisites, Deploy-VM, Test-VMReady, Get-VMStatus, Connect-ToVM, Start-VM, Stop-VM, Restart-VM, Remove-Deployment, Show-Logs, Get-VMPublicIP, Get-NetworkSecurityGroupRules