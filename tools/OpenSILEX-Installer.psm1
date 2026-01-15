# OpenSILEX Installation Module
# PowerShell module for OpenSILEX installation and setup

# Import required modules
Import-Module -Name "$PSScriptRoot\OpenSILEX-OutputUtils.psm1" -Force
Import-Module -Name "$PSScriptRoot\OpenSILEX-SSHUtils.psm1" -Force
Import-Module -Name "$PSScriptRoot\OpenSILEX-AzureVMManager.psm1" -Force

function Install-OpenSILEX {
    param(
        [string]$TargetIP,
        [string]$VMName,
        [string]$ResourceGroupName,
        [string]$AdminUsername,
        [string]$SSHKeyPath,
        [switch]$SkipDependencies,
        [string]$PSScriptRoot
    )
    
    if (-not $TargetIP) {
        # Try to get IP from Azure
        try {
            $TargetIP = Get-VMPublicIP -VMName $VMName -ResourceGroupName $ResourceGroupName
        }
        catch {
            Write-Warning "Could not retrieve VM IP from Azure"
        }
        
        if (-not $TargetIP) {
            $TargetIP = Read-Host "Please enter the VM IP address"
        }
    }
    
    Write-Info "Installing OpenSILEX GitHub version on VM: $TargetIP"
    
    $sshKeyPath = Get-SSHKeyPath -SSHKeyPath $SSHKeyPath
    if (-not $sshKeyPath) {
        return $false
    }
    
    $privateKeyPath = $sshKeyPath -replace "\.pub$", ""
    
    try {
        # Wait for VM to be fully ready
        Write-Info "Waiting for VM to be fully ready..."
        $vmReadyRetries = 10
        for ($i = 1; $i -le $vmReadyRetries; $i++) {
            if (Test-VMReady -VMName $VMName -ResourceGroupName $ResourceGroupName) {
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
        if (-not (Test-SSHConnectivity -TargetIP $TargetIP -PrivateKeyPath $privateKeyPath -AdminUsername $AdminUsername)) {
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
        
        # Read the setup script from the separate file
        $setupScriptPath = Join-Path $PSScriptRoot "opensilex-setup.sh"
        if (-not (Test-Path $setupScriptPath)) {
            Write-Error "Setup script not found: $setupScriptPath"
            return $false
        }
        
        Write-Info "Reading setup script from: $setupScriptPath"
        $setupScript = Get-Content $setupScriptPath -Raw 
        
        
        # Read the installer script from the separate file
        $installerScriptPath = Join-Path $PSScriptRoot "opensilex-installer.sh"
        if (-not (Test-Path $installerScriptPath)) {
            Write-Error "Installer script not found: $installerScriptPath"
            return $false
        }
        
        Write-Info "Reading installer script from: $installerScriptPath"
        $installerScript = Get-Content $installerScriptPath -Raw 

        
        # Write scripts to temporary files and upload
        $tempSetupScript = [System.IO.Path]::GetTempFileName()
        $tempInstallScript = [System.IO.Path]::GetTempFileName()
        
        [System.IO.File]::WriteAllText($tempSetupScript, $setupScript)
        [System.IO.File]::WriteAllText($tempInstallScript, $installerScript)
        
        # Upload scripts
        scp -i $privateKeyPath -o StrictHostKeyChecking=no $tempSetupScript "$AdminUsername@${TargetIP}:~/setup-system.sh"
        scp -i $privateKeyPath -o StrictHostKeyChecking=no $tempInstallScript "$AdminUsername@${TargetIP}:~/install-opensilex.sh"
        
        # Upload API keys config file if it exists
        $apiKeysPath = Join-Path $PSScriptRoot "config\test-api-keys.conf"
        if (Test-Path $apiKeysPath) {
            Write-Info "Uploading API keys configuration..."
            scp -i $privateKeyPath -o StrictHostKeyChecking=no $apiKeysPath "$AdminUsername@${TargetIP}:~/test-api-keys.conf"
        } else {
            Write-Warning "API keys file not found: $apiKeysPath"
        }
        
        # Clean up temp files
        Remove-Item $tempSetupScript, $tempInstallScript
        
        # Fix line endings and make scripts executable
        ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "dos2unix ~/setup-system.sh ~/install-opensilex.sh ~/test-api-keys.conf 2>/dev/null || sed -i 's/\r$//' ~/setup-system.sh ~/install-opensilex.sh ~/test-api-keys.conf; chmod +x ~/setup-system.sh ~/install-opensilex.sh"
        
        if (-not $SkipDependencies) {
            Write-Info "Setting up system and creating OpenSILEX user (this may take 5-10 minutes)..."
            ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "~/setup-system.sh"
        }
        
        Write-Info "Installing OpenSILEX following production guide (this may take 15-20 minutes with patches)..."
        Write-Info "Building from source with GroupDAO fix and auto-group assignment patches..."
        ssh -i $privateKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "sudo bash ~/install-opensilex.sh"
        
        Write-Success "OpenSILEX installation completed successfully!"
    } catch {
        Write-Error "Installation failed: $($_.Exception.Message)"
        return $false
    }
    
    return $true
}

# Export functions
Export-ModuleMember -Function Install-OpenSILEX