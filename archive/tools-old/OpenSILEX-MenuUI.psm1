# OpenSILEX Menu and UI Module
# PowerShell module for interactive menu system

# Import required modules
Import-Module -Name "$PSScriptRoot\OpenSILEX-OutputUtils.psm1" -Force
Import-Module -Name "$PSScriptRoot\OpenSILEX-SSHUtils.psm1" -Force
Import-Module -Name "$PSScriptRoot\OpenSILEX-AzureVMManager.psm1" -Force
Import-Module -Name "$PSScriptRoot\OpenSILEX-Installer.psm1" -Force
Import-Module -Name "$PSScriptRoot\dev\OpenSILEX-Installer-Dev.psm1" -Force

function Show-Menu {
    param(
        [string]$VMName,
        [string]$ResourceGroupName,
        [string]$Location,
        [string]$AdminUsername,
        [string]$SSHKeyPath,
        [switch]$SkipDependencies,
        [string]$PSScriptRoot,
        [switch]$DevMode
    )
    
    $choice = ""
    Clear-Host
    $modeTitle = if ($DevMode) { "Development" } else { "Production" }
    Write-Host "===============================================" -ForegroundColor Blue
    Write-Host "   OpenSILEX GitHub $modeTitle Installation Manager   " -ForegroundColor Blue
    Write-Host "===============================================" -ForegroundColor Blue
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
    
    $choice = Read-Host "Select an option (0-13)"
    
    switch ($choice) {
        "1" { 
            Write-Info "Starting full installation..."
            $deployResult, $VMIPAddress = Deploy-VM -VMName $VMName -ResourceGroupName $ResourceGroupName -Location $Location -AdminUsername $AdminUsername -SSHKeyPath $SSHKeyPath
            if ($deployResult) {
                if ($DevMode) {
                    Install-OpenSILEX-Dev -TargetIP $VMIPAddress -VMName $VMName -ResourceGroupName $ResourceGroupName -AdminUsername $AdminUsername -SSHKeyPath $SSHKeyPath -SkipDependencies:$SkipDependencies -PSScriptRoot $PSScriptRoot
                } else {
                    Install-OpenSILEX -TargetIP $VMIPAddress -VMName $VMName -ResourceGroupName $ResourceGroupName -AdminUsername $AdminUsername -SSHKeyPath $SSHKeyPath -SkipDependencies:$SkipDependencies -PSScriptRoot $PSScriptRoot
                }
            }
        }
        "2" { 
            Deploy-VM -VMName $VMName -ResourceGroupName $ResourceGroupName -Location $Location -AdminUsername $AdminUsername -SSHKeyPath $SSHKeyPath | Out-Null
        }
        "3" { 
            if ($DevMode) {
                Install-OpenSILEX-Dev -VMName $VMName -ResourceGroupName $ResourceGroupName -AdminUsername $AdminUsername -SSHKeyPath $SSHKeyPath -SkipDependencies:$SkipDependencies -PSScriptRoot $PSScriptRoot | Out-Null
            } else {
                Install-OpenSILEX -VMName $VMName -ResourceGroupName $ResourceGroupName -AdminUsername $AdminUsername -SSHKeyPath $SSHKeyPath -SkipDependencies:$SkipDependencies -PSScriptRoot $PSScriptRoot | Out-Null
            }
        }
        "4" { Start-VM -VMName $VMName -ResourceGroupName $ResourceGroupName }
        "5" { Stop-VM -VMName $VMName -ResourceGroupName $ResourceGroupName }
        "6" { Restart-VM -VMName $VMName -ResourceGroupName $ResourceGroupName }
        "7" { Get-VMStatus -VMName $VMName -ResourceGroupName $ResourceGroupName -AdminUsername $AdminUsername | Out-Null }
        "8" { Connect-ToVM -VMName $VMName -ResourceGroupName $ResourceGroupName -AdminUsername $AdminUsername -SSHKeyPath $SSHKeyPath }
        "9" { Show-Logs -VMName $VMName -ResourceGroupName $ResourceGroupName -AdminUsername $AdminUsername -SSHKeyPath $SSHKeyPath }
        "10" { Remove-Deployment -ResourceGroupName $ResourceGroupName }
        "11" { 
            $sshPath = Get-SSHKeyPath -SSHKeyPath $SSHKeyPath
            if ($sshPath) {
                Write-Success "SSH key available at: $sshPath"
            }
        }
        "12" { 
            $sshPath = Get-SSHKeyPath -SSHKeyPath $SSHKeyPath
            if ($sshPath) {
                Write-Success "SSH key test passed: $sshPath"
            } else {
                Write-Error "SSH key test failed"
            }
        }
        "13" { 
            Get-VMStatus -VMName $VMName -ResourceGroupName $ResourceGroupName -AdminUsername $AdminUsername | Out-Null
            try {
                $VMIPAddress = Get-VMPublicIP -VMName $VMName -ResourceGroupName $ResourceGroupName
                if ($VMIPAddress) {
                    Write-Info "OpenSILEX Access: http://$VMIPAddress:8666/"
                    Write-Info "API Documentation: http://$VMIPAddress:8666/api-docs"
                }
            } catch {}
        }
        "0" { 
            Write-Info "Goodbye!"
            return $choice 
        }
        default { 
            Write-Warning "Invalid selection. Please try again."
        }
    }
    
    return $choice
}

function Invoke-MenuCommand {
    param(
        [string]$Command,
        [string]$VMName,
        [string]$ResourceGroupName,
        [string]$Location,
        [string]$AdminUsername,
        [string]$SSHKeyPath,
        [string]$VMIPAddress,
        [switch]$SkipDependencies,
        [string]$PSScriptRoot,
        [switch]$DevMode
    )
    
    switch ($Command.ToLower()) {
        "fullinstall" { 
            $deployResult, $ResultVMIPAddress = Deploy-VM -VMName $VMName -ResourceGroupName $ResourceGroupName -Location $Location -AdminUsername $AdminUsername -SSHKeyPath $SSHKeyPath
            if ($deployResult) {
                if ($DevMode) {
                    Install-OpenSILEX-Dev -TargetIP $ResultVMIPAddress -VMName $VMName -ResourceGroupName $ResourceGroupName -AdminUsername $AdminUsername -SSHKeyPath $SSHKeyPath -SkipDependencies:$SkipDependencies -PSScriptRoot $PSScriptRoot | Out-Null
                } else {
                    Install-OpenSILEX -TargetIP $ResultVMIPAddress -VMName $VMName -ResourceGroupName $ResourceGroupName -AdminUsername $AdminUsername -SSHKeyPath $SSHKeyPath -SkipDependencies:$SkipDependencies -PSScriptRoot $PSScriptRoot | Out-Null
                }
            }
        }
        "deploy" { 
            Deploy-VM -VMName $VMName -ResourceGroupName $ResourceGroupName -Location $Location -AdminUsername $AdminUsername -SSHKeyPath $SSHKeyPath | Out-Null
        }
        "install" { 
            if ($DevMode) {
                Install-OpenSILEX-Dev -TargetIP $VMIPAddress -VMName $VMName -ResourceGroupName $ResourceGroupName -AdminUsername $AdminUsername -SSHKeyPath $SSHKeyPath -SkipDependencies:$SkipDependencies -PSScriptRoot $PSScriptRoot | Out-Null
            } else {
                Install-OpenSILEX -TargetIP $VMIPAddress -VMName $VMName -ResourceGroupName $ResourceGroupName -AdminUsername $AdminUsername -SSHKeyPath $SSHKeyPath -SkipDependencies:$SkipDependencies -PSScriptRoot $PSScriptRoot | Out-Null
            }
        }
        "status" { 
            Get-VMStatus -VMName $VMName -ResourceGroupName $ResourceGroupName -AdminUsername $AdminUsername | Out-Null
        }
        "connect" { 
            Connect-ToVM -VMName $VMName -ResourceGroupName $ResourceGroupName -AdminUsername $AdminUsername -SSHKeyPath $SSHKeyPath 
        }
        "start" { 
            Start-VM -VMName $VMName -ResourceGroupName $ResourceGroupName 
        }
        "stop" { 
            Stop-VM -VMName $VMName -ResourceGroupName $ResourceGroupName 
        }
        "restart" { 
            Restart-VM -VMName $VMName -ResourceGroupName $ResourceGroupName 
        }
        "delete" { 
            Remove-Deployment -ResourceGroupName $ResourceGroupName 
        }
        "logs" { 
            Show-Logs -VMName $VMName -ResourceGroupName $ResourceGroupName -AdminUsername $AdminUsername -SSHKeyPath $SSHKeyPath 
        }
        "generatesshkey" { 
            $sshPath = Get-SSHKeyPath -SSHKeyPath $SSHKeyPath
            if ($sshPath) {
                Write-Success "SSH key available at: $sshPath"
            }
        }
        "testsshkeys" { 
            $sshPath = Get-SSHKeyPath -SSHKeyPath $SSHKeyPath
            if ($sshPath) {
                Write-Success "SSH key test passed: $sshPath"
            } else {
                Write-Error "SSH key test failed"
            }
        }
        "showinfo" { 
            Get-VMStatus -VMName $VMName -ResourceGroupName $ResourceGroupName -AdminUsername $AdminUsername | Out-Null
            try {
                $VMIPAddress = Get-VMPublicIP -VMName $VMName -ResourceGroupName $ResourceGroupName
                if ($VMIPAddress) {
                    Write-Info "VM Public IP: $VMIPAddress"
                } else {
                    Write-Warning "VM public IP not found"
                }
            } catch {}
        }
        "getip" {
            try {
                $VMIPAddress = Get-VMPublicIP -VMName $VMName -ResourceGroupName $ResourceGroupName
                if ($VMIPAddress) {
                    Write-Info "VM Public IP: $VMIPAddress"
                } else {
                    Write-Warning "VM public IP not found"
                }
            } catch {}
        }
        "openports" {
            Get-NetworkSecurityGroupRules -VMName $VMName -ResourceGroupName $ResourceGroupName
        }
        default { 
            Write-Warning "Unknown command: $Command"
            Write-Info "Available commands: Menu, FullInstall, Deploy, Install, Status, Connect, Start, Stop, Restart, Delete, Logs"
        }
    }
}

# Export functions
Export-ModuleMember -Function Show-Menu, Invoke-MenuCommand