# OpenSILEX Theme Deployment Module
# Handles deployment of custom PheNo theme to OpenSILEX server

<#
.SYNOPSIS
    Deploys PheNo custom theme to OpenSILEX server

.DESCRIPTION
    This module copies theme files (CSS, images, fonts) from the local repository
    to the OpenSILEX server and configures the application to use the custom theme.
#>

function Deploy-OpenSILEXTheme {
    param(
        [Parameter(Mandatory=$true)]
        [string]$VMIPAddress,

        [Parameter(Mandatory=$true)]
        [string]$AdminUsername,

        [Parameter(Mandatory=$false)]
        [string]$ThemeSourcePath = (Join-Path $PSScriptRoot "..\theme"),

        [Parameter(Mandatory=$false)]
        [string]$RemoteThemePath = "/home/azureuser/opensilex/data/files/theme"
    )

    Write-Host "`n=== Deploying PheNo Custom Theme ===" -ForegroundColor Cyan

    # Verify theme files exist locally
    if (-not (Test-Path $ThemeSourcePath)) {
        Write-Error "Theme directory not found at: $ThemeSourcePath"
        return $false
    }

    # Create remote theme directory
    Write-Host "Creating remote theme directory..." -ForegroundColor Yellow
    $sshCommand = "mkdir -p $RemoteThemePath/css $RemoteThemePath/images $RemoteThemePath/fonts"
    ssh "$AdminUsername@$VMIPAddress" $sshCommand

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create remote theme directory"
        return $false
    }

    # Copy CSS files
    Write-Host "Copying CSS files..." -ForegroundColor Yellow
    $cssPath = Join-Path $ThemeSourcePath "css"
    if (Test-Path $cssPath) {
        $cssFiles = Get-ChildItem -Path $cssPath -File
        foreach ($file in $cssFiles) {
            Write-Host "  - Uploading $($file.Name)" -ForegroundColor Gray
            scp $file.FullName "$AdminUsername@${VMIPAddress}:$RemoteThemePath/css/"

            if ($LASTEXITCODE -ne 0) {
                Write-Error "Failed to copy $($file.Name)"
                return $false
            }
        }
    }

    # Copy image files
    Write-Host "Copying image files..." -ForegroundColor Yellow
    $imagesPath = Join-Path $ThemeSourcePath "images"
    if (Test-Path $imagesPath) {
        $imageFiles = Get-ChildItem -Path $imagesPath -File -Include *.svg,*.png,*.jpg,*.ico
        if ($imageFiles.Count -gt 0) {
            foreach ($file in $imageFiles) {
                Write-Host "  - Uploading $($file.Name)" -ForegroundColor Gray
                scp $file.FullName "$AdminUsername@${VMIPAddress}:$RemoteThemePath/images/"

                if ($LASTEXITCODE -ne 0) {
                    Write-Error "Failed to copy $($file.Name)"
                    return $false
                }
            }
        } else {
            Write-Warning "No logo image files found. Please add logo files to theme/images/"
        }
    }

    # Copy font files (if any)
    Write-Host "Copying font files..." -ForegroundColor Yellow
    $fontsPath = Join-Path $ThemeSourcePath "fonts"
    if (Test-Path $fontsPath) {
        $fontFiles = Get-ChildItem -Path $fontsPath -File
        if ($fontFiles.Count -gt 0) {
            foreach ($file in $fontFiles) {
                Write-Host "  - Uploading $($file.Name)" -ForegroundColor Gray
                scp $file.FullName "$AdminUsername@${VMIPAddress}:$RemoteThemePath/fonts/"

                if ($LASTEXITCODE -ne 0) {
                    Write-Error "Failed to copy $($file.Name)"
                    return $false
                }
            }
        }
    }

    # Set appropriate permissions
    Write-Host "Setting file permissions..." -ForegroundColor Yellow
    $sshCommand = "chmod -R 755 $RemoteThemePath"
    ssh "$AdminUsername@$VMIPAddress" $sshCommand

    Write-Host "`nTheme files deployed successfully!" -ForegroundColor Green
    Write-Host "Theme location: $RemoteThemePath" -ForegroundColor Cyan

    return $true
}

function Update-OpenSILEXThemeConfig {
    param(
        [Parameter(Mandatory=$true)]
        [string]$VMIPAddress,

        [Parameter(Mandatory=$true)]
        [string]$AdminUsername,

        [Parameter(Mandatory=$false)]
        [string]$ConfigPath = "/home/azureuser/opensilex/config/opensilex.yml"
    )

    Write-Host "`n=== Updating OpenSILEX Configuration for Custom Theme ===" -ForegroundColor Cyan

    # Create a backup of the configuration
    Write-Host "Creating backup of configuration file..." -ForegroundColor Yellow
    $backupCommand = "cp $ConfigPath ${ConfigPath}.backup.$(date +%Y%m%d_%H%M%S)"
    ssh "$AdminUsername@$VMIPAddress" $backupCommand

    # Check if theme CSS file exists
    Write-Host "Verifying theme CSS file..." -ForegroundColor Yellow
    $checkCommand = "test -f /home/azureuser/opensilex/data/files/theme/css/pheno-theme.css && echo 'exists' || echo 'missing'"
    $result = ssh "$AdminUsername@$VMIPAddress" $checkCommand

    if ($result -ne "exists") {
        Write-Error "Theme CSS file not found on server. Deploy theme files first."
        return $false
    }

    Write-Host "`nTo activate the theme, you need to:" -ForegroundColor Yellow
    Write-Host "1. Add custom CSS link to OpenSILEX web interface template" -ForegroundColor White
    Write-Host "2. Update logo configuration in opensilex.yml" -ForegroundColor White
    Write-Host "`nThe theme CSS file is available at:" -ForegroundColor Cyan
    Write-Host "  /data/files/theme/css/pheno-theme.css" -ForegroundColor Gray

    Write-Host "`nNote: OpenSILEX may require theme integration through:" -ForegroundColor Yellow
    Write-Host "  - Custom module development, or" -ForegroundColor White
    Write-Host "  - Direct HTML template modification in the JAR file" -ForegroundColor White
    Write-Host "`nFor immediate testing, we can inject CSS via reverse proxy." -ForegroundColor Cyan

    return $true
}

function Install-NginxReverseProxy {
    param(
        [Parameter(Mandatory=$true)]
        [string]$VMIPAddress,

        [Parameter(Mandatory=$true)]
        [string]$AdminUsername
    )

    Write-Host "`n=== Installing Nginx Reverse Proxy for Theme Injection ===" -ForegroundColor Cyan

    Write-Host "Installing Nginx..." -ForegroundColor Yellow
    $installCommand = @"
sudo apt-get update && \
sudo apt-get install -y nginx && \
sudo systemctl enable nginx
"@

    ssh "$AdminUsername@$VMIPAddress" $installCommand

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install Nginx"
        return $false
    }

    # Create Nginx configuration for OpenSILEX with theme injection
    Write-Host "Creating Nginx configuration..." -ForegroundColor Yellow

    $nginxConfig = @'
# PheNo OpenSILEX Reverse Proxy with Theme Injection
server {
    listen 80;
    server_name _;

    # Serve theme files directly
    location /theme/ {
        alias /home/azureuser/opensilex/data/files/theme/;
        expires 1d;
        add_header Cache-Control "public, immutable";
    }

    # Proxy to OpenSILEX
    location / {
        proxy_pass http://localhost:8666;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Inject custom CSS into HTML responses
        sub_filter '</head>' '<link rel="stylesheet" href="/theme/css/pheno-theme.css"></head>';
        sub_filter_once off;
        sub_filter_types text/html;
    }
}
'@

    # Upload Nginx configuration
    $tempConfigFile = [System.IO.Path]::GetTempFileName()
    Set-Content -Path $tempConfigFile -Value $nginxConfig

    scp $tempConfigFile "$AdminUsername@${VMIPAddress}:/tmp/opensilex-pheno.conf"
    Remove-Item $tempConfigFile

    # Move config and restart Nginx
    $deployConfigCommand = @"
sudo mv /tmp/opensilex-pheno.conf /etc/nginx/sites-available/opensilex-pheno && \
sudo ln -sf /etc/nginx/sites-available/opensilex-pheno /etc/nginx/sites-enabled/ && \
sudo rm -f /etc/nginx/sites-enabled/default && \
sudo nginx -t && \
sudo systemctl restart nginx
"@

    ssh "$AdminUsername@$VMIPAddress" $deployConfigCommand

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to configure Nginx"
        return $false
    }

    Write-Host "`nNginx reverse proxy installed successfully!" -ForegroundColor Green
    Write-Host "The custom theme will now be automatically injected into all pages." -ForegroundColor Cyan
    Write-Host "`nAccess OpenSILEX at: http://$VMIPAddress" -ForegroundColor Yellow
    Write-Host "(Nginx will proxy to OpenSILEX on port 8666)" -ForegroundColor Gray

    return $true
}

function Show-ThemeStatus {
    param(
        [Parameter(Mandatory=$true)]
        [string]$VMIPAddress,

        [Parameter(Mandatory=$true)]
        [string]$AdminUsername
    )

    Write-Host "`n=== PheNo Theme Status ===" -ForegroundColor Cyan

    # Check theme files
    Write-Host "`nTheme Files:" -ForegroundColor Yellow
    $checkFiles = @"
if [ -d /home/azureuser/opensilex/data/files/theme ]; then
    echo "Theme directory: EXISTS"
    if [ -f /home/azureuser/opensilex/data/files/theme/css/pheno-theme.css ]; then
        echo "CSS file: EXISTS"
    else
        echo "CSS file: MISSING"
    fi
    echo "Image files:"
    ls -1 /home/azureuser/opensilex/data/files/theme/images/ 2>/dev/null || echo "  No images found"
else
    echo "Theme directory: NOT FOUND"
fi
"@

    ssh "$AdminUsername@$VMIPAddress" $checkFiles

    # Check Nginx
    Write-Host "`nNginx Status:" -ForegroundColor Yellow
    $nginxStatus = ssh "$AdminUsername@$VMIPAddress" "systemctl is-active nginx 2>/dev/null || echo 'not-installed'"
    Write-Host "  Nginx: $nginxStatus" -ForegroundColor $(if ($nginxStatus -eq "active") { "Green" } else { "Gray" })

    # Check OpenSILEX
    Write-Host "`nOpenSILEX Status:" -ForegroundColor Yellow
    $opensilexStatus = ssh "$AdminUsername@$VMIPAddress" "systemctl is-active opensilex 2>/dev/null || echo 'inactive'"
    Write-Host "  OpenSILEX: $opensilexStatus" -ForegroundColor $(if ($opensilexStatus -eq "active") { "Green" } else { "Red" })
}

Export-ModuleMember -Function Deploy-OpenSILEXTheme, Update-OpenSILEXThemeConfig, Install-NginxReverseProxy, Show-ThemeStatus
