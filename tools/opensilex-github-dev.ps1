# OpenSILEX GitHub Development Installation Script v1.4.9-rdg (Modular Version)
# PowerShell script for managing OpenSILEX development version installation on Azure VMs
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
    [string]$VMName = "phis-debian12-DEV-HOME",
    
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroupName = "RG-OPENSILEX-debian12-DEV",
    
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

# Import all required modules (reuse existing production modules)
$ModulePath = $PSScriptRoot
Import-Module -Name "$ModulePath\OpenSILEX-OutputUtils.psm1" -Force
Import-Module -Name "$ModulePath\OpenSILEX-SSHUtils.psm1" -Force
Import-Module -Name "$ModulePath\OpenSILEX-AzureVMManager.psm1" -Force
Import-Module -Name "$ModulePath\OpenSILEX-Installer-Dev.psm1" -Force
Import-Module -Name "$ModulePath\OpenSILEX-MenuUI.psm1" -Force

# Main execution
try {
    Write-Host "OpenSILEX GitHub Development Installation Manager" -ForegroundColor Blue
    Write-Host "=================================================" -ForegroundColor Blue
    Write-Host ""
    
    switch ($Command.ToLower()) {
        "menu" { 
            $choice = ""
            while ($choice -ne "0") {
                $choice = Show-Menu -VMName $VMName -ResourceGroupName $ResourceGroupName -Location $Location -AdminUsername $AdminUsername -SSHKeyPath $SSHKeyPath -SkipDependencies:$SkipDependencies -PSScriptRoot $PSScriptRoot -DevMode
                if ($choice -ne "0") {
                    Write-Host ""
                    Read-Host "Press Enter to continue"
                }
            }
        }
        default {
            Invoke-MenuCommand -Command $Command -VMName $VMName -ResourceGroupName $ResourceGroupName -Location $Location -AdminUsername $AdminUsername -SSHKeyPath $SSHKeyPath -VMIPAddress $VMIPAddress -SkipDependencies:$SkipDependencies -PSScriptRoot $PSScriptRoot -DevMode
        }
    }
} catch {
    Write-Error "Script execution failed: $($_.Exception.Message)"
    Write-Error $_.ScriptStackTrace
}