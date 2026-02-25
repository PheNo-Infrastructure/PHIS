# OpenSILEX Development Installation Module
# PowerShell module for OpenSILEX development installation and setup

# Import required modules
Import-Module -Name "$PSScriptRoot\OpenSILEX-OutputUtils.psm1" -Force
Import-Module -Name "$PSScriptRoot\OpenSILEX-SSHUtils.psm1" -Force
Import-Module -Name "$PSScriptRoot\OpenSILEX-AzureVMManager.psm1" -Force

function Install-OpenSILEX-Dev {
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
    
    Write-Info "Installing OpenSILEX development version on VM: $TargetIP"
    
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
        Write-Info "Uploading development installation scripts..."
        
        # Read the development setup script
        $setupScriptPath = Join-Path $PSScriptRoot "opensilex-setup-dev.sh"
        if (-not (Test-Path $setupScriptPath)) {
            Write-Error "Development setup script not found: $setupScriptPath"
            return $false
        }
        
        Write-Info "Reading development setup script from: $setupScriptPath"
        $setupScript = Get-Content $setupScriptPath -Raw 
        
        # Read the development installer script
        $installerScriptPath = Join-Path $PSScriptRoot "opensilex-installer-dev.sh"
        if (-not (Test-Path $installerScriptPath)) {
            Write-Error "Development installer script not found: $installerScriptPath"
            return $false
        }
        
        Write-Info "Reading development installer script from: $installerScriptPath"
        $installerScript = Get-Content $installerScriptPath -Raw 
        
        # Write scripts to temporary files and upload
        $tempSetupScript = [System.IO.Path]::GetTempFileName()
        $tempInstallScript = [System.IO.Path]::GetTempFileName()
        
        try {
            # Fix line endings for Linux compatibility
            $setupScript = $setupScript -replace "`r`n", "`n"
            $installerScript = $installerScript -replace "`r`n", "`n"
            Set-Content -Path $tempSetupScript -Value $setupScript -Encoding UTF8 -NoNewline
            Add-Content -Path $tempSetupScript -Value "`n" -Encoding UTF8 -NoNewline
            Set-Content -Path $tempInstallScript -Value $installerScript -Encoding UTF8 -NoNewline
            Add-Content -Path $tempInstallScript -Value "`n" -Encoding UTF8 -NoNewline
            
            # Upload scripts via SCP
            Write-Info "Uploading setup script..."
            Write-Info "Temp file: $tempSetupScript"
            Write-Info "Target: ${AdminUsername}@${TargetIP}:~/opensilex-setup-dev.sh"
            $scpResult = & scp -v -i $privateKeyPath -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 $tempSetupScript "${AdminUsername}@${TargetIP}:~/opensilex-setup-dev.sh" 2>&1
            Write-Info "SCP Result: $scpResult"
            Write-Info "SCP Exit Code: $LASTEXITCODE"
            if ($LASTEXITCODE -ne 0) {
                Write-Error "Failed to upload setup script: $scpResult"
                return $false
            }
            
            Write-Info "Uploading installer script..."
            $scpResult = & scp -i $privateKeyPath -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 $tempInstallScript "${AdminUsername}@${TargetIP}:~/opensilex-installer-dev.sh" 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Error "Failed to upload installer script: $scpResult"
                return $false
            }
            
            # Upload API keys configuration if it exists
            $apiKeysPath = Join-Path $PSScriptRoot "config\api-keys.conf"
            if (Test-Path $apiKeysPath) {
                Write-Info "Uploading API keys configuration..."
                # Fix line endings for Linux compatibility
                $apiKeysContent = Get-Content $apiKeysPath -Raw
                $apiKeysContent = $apiKeysContent -replace "`r`n", "`n"
                $tempApiKeysFile = [System.IO.Path]::GetTempFileName()
                Set-Content -Path $tempApiKeysFile -Value $apiKeysContent -Encoding UTF8 -NoNewline
                $scpResult = & scp -i $privateKeyPath -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 $tempApiKeysFile "${AdminUsername}@${TargetIP}:~/api-keys.conf" 2>&1
                Remove-Item -Path $tempApiKeysFile -Force -ErrorAction SilentlyContinue
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "API keys configuration uploaded"
                } else {
                    Write-Warning "Could not upload API keys configuration (will continue without)"
                }
            } else {
                Write-Warning "No API keys configuration found at: $apiKeysPath"
                Write-Info "OpenSILEX will run without Agroportal and FEIDE integrations"
            }
            
        }
        finally {
            # Clean up temporary files
            Remove-Item -Path $tempSetupScript -Force -ErrorAction SilentlyContinue
            Remove-Item -Path $tempInstallScript -Force -ErrorAction SilentlyContinue
        }
        
        Write-Success "Scripts uploaded successfully"
        
        # Verify scripts exist on remote server
        Write-Info "Verifying scripts exist on remote server..."
        $verifyResult = & ssh -i $privateKeyPath -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 "${AdminUsername}@${TargetIP}" "ls -la ~/opensilex-*.sh" 2>&1
        Write-Info "Remote files: $verifyResult"
        
        # Make scripts executable
        Write-Info "Making scripts executable..."
        $chmodResult = & ssh -i $privateKeyPath -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 "${AdminUsername}@${TargetIP}" "chmod +x ~/opensilex-setup-dev.sh ~/opensilex-installer-dev.sh" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to make scripts executable: $chmodResult"
            return $false
        }
        
        # Skip dependencies installation if requested
        if (-not $SkipDependencies) {
            Write-Info "Running system setup (installing development dependencies)..."
            Write-Info "This may take 10-15 minutes depending on internet speed..."
            
            $setupResult = & ssh -i $privateKeyPath -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 "${AdminUsername}@${TargetIP}" "sudo ~/opensilex-setup-dev.sh" 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Error "System setup failed: $setupResult"
                Write-Info "You may need to run the setup manually:"
                Write-Info "ssh -i $privateKeyPath $AdminUsername@$TargetIP"
                Write-Info "sudo ~/opensilex-setup-dev.sh"
                return $false
            }
            
            Write-Success "System setup completed"
        } else {
            Write-Warning "Skipping dependencies installation as requested"
        }
        
        Write-Info "Running OpenSILEX development installation..."
        Write-Info "This may take 20-30 minutes for Maven build and source compilation..."
        
        $installResult = & ssh -i $privateKeyPath -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 "${AdminUsername}@${TargetIP}" "~/opensilex-installer-dev.sh" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error "OpenSILEX installation failed: $installResult"
            Write-Info "You may need to run the installation manually:"
            Write-Info "ssh -i $privateKeyPath $AdminUsername@$TargetIP"
            Write-Info "~/opensilex-installer-dev.sh"
            return $false
        }
        
        Write-Success "OpenSILEX development installation completed successfully!"
        Write-Info ""
        Write-Info "Development Environment Summary:"
        Write-Info "================================"
        Write-Info "VM IP Address: $TargetIP"
        Write-Info "SSH Command: ssh -i $privateKeyPath $AdminUsername@$TargetIP"
        Write-Info "OpenSILEX URL: http://$TargetIP`:8666"
        Write-Info "Source Code: /home/azureuser/opensilex/source/opensilex"
        Write-Info ""
        Write-Info "To start the development server:"
        Write-Info "1. SSH to the VM: ssh -i $privateKeyPath $AdminUsername@$TargetIP"
        Write-Info "2. Navigate to: cd /home/azureuser/opensilex"
        Write-Info "3. Start server: ./start-dev.sh"
        Write-Info ""
        Write-Info "For development workflow:"
        Write-Info "- Source code is in: /home/azureuser/opensilex/source/opensilex"
        Write-Info "- Rebuild with: cd /home/azureuser/opensilex/source/opensilex && mvn clean install -DskipTests=true"
        Write-Info "- Configuration: /home/azureuser/opensilex/config/opensilex.yml"
        Write-Info "- Logs: /home/azureuser/opensilex/logs/"
        
        return $true
        
    }
    catch {
        Write-Error "Installation failed with exception: $($_.Exception.Message)"
        Write-Error $_.ScriptStackTrace
        return $false
    }
}

# Export functions
Export-ModuleMember -Function Install-OpenSILEX-Dev