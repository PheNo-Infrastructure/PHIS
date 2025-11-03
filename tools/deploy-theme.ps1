# PheNo Theme Deployment Script
# Deploys custom PheNo branding to OpenSILEX

param(
    [Parameter(Mandatory=$false)]
    [string]$VMIPAddress = "172.211.86.191",

    [Parameter(Mandatory=$false)]
    [string]$AdminUsername = "azureuser",

    [Parameter(Mandatory=$false)]
    [ValidateSet("Deploy", "Status", "InstallNginx", "All")]
    [string]$Action = "All"
)

# Import modules
$ModulePath = $PSScriptRoot
Import-Module -Name "$ModulePath\OpenSILEX-OutputUtils.psm1" -Force
Import-Module -Name "$ModulePath\OpenSILEX-ThemeDeployer.psm1" -Force

Write-Host "`n========================================" -ForegroundColor Blue
Write-Host "  PheNo Theme Deployment Tool" -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""

switch ($Action) {
    "Deploy" {
        Write-Host "Deploying theme files to server..." -ForegroundColor Cyan
        $result = Deploy-OpenSILEXTheme -VMIPAddress $VMIPAddress -AdminUsername $AdminUsername
        if ($result) {
            Write-Host "`nTheme files deployed successfully!" -ForegroundColor Green
        }
    }

    "Status" {
        Show-ThemeStatus -VMIPAddress $VMIPAddress -AdminUsername $AdminUsername
    }

    "InstallNginx" {
        Write-Host "Installing Nginx reverse proxy for theme injection..." -ForegroundColor Cyan
        $result = Install-NginxReverseProxy -VMIPAddress $VMIPAddress -AdminUsername $AdminUsername
        if ($result) {
            Write-Host "`nNginx installed and configured successfully!" -ForegroundColor Green
            Write-Host "Access OpenSILEX with PheNo theme at: http://$VMIPAddress" -ForegroundColor Yellow
        }
    }

    "All" {
        # Deploy theme files
        Write-Host "Step 1: Deploying theme files..." -ForegroundColor Cyan
        $deployResult = Deploy-OpenSILEXTheme -VMIPAddress $VMIPAddress -AdminUsername $AdminUsername

        if (-not $deployResult) {
            Write-Error "Theme deployment failed. Aborting."
            exit 1
        }

        # Install Nginx for theme injection
        Write-Host "`nStep 2: Installing Nginx for theme injection..." -ForegroundColor Cyan
        $nginxResult = Install-NginxReverseProxy -VMIPAddress $VMIPAddress -AdminUsername $AdminUsername

        if (-not $nginxResult) {
            Write-Error "Nginx installation failed."
            exit 1
        }

        # Show final status
        Write-Host "`n" -NoNewline
        Show-ThemeStatus -VMIPAddress $VMIPAddress -AdminUsername $AdminUsername

        Write-Host "`n========================================" -ForegroundColor Green
        Write-Host "  PheNo Theme Deployed Successfully!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Access your PheNo-branded OpenSILEX at:" -ForegroundColor Cyan
        Write-Host "  http://$VMIPAddress" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "The theme includes:" -ForegroundColor White
        Write-Host "  - PheNo color palette (greens and straw)" -ForegroundColor Gray
        Write-Host "  - Aptos typography" -ForegroundColor Gray
        Write-Host "  - Custom branding elements" -ForegroundColor Gray
        Write-Host ""
    }
}

Write-Host "`nDone!" -ForegroundColor Green
