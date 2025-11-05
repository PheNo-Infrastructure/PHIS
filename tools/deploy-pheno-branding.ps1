#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy PheNo branding (colors + logos) to OpenSILEX server

.DESCRIPTION
    This script automates the deployment of PheNo theme branding to an OpenSILEX installation.
    It compiles SCSS to CSS, prepares logos, and injects them into the OpenSILEX JAR file.

.PARAMETER ServerHost
    The SSH hostname or IP address of the OpenSILEX server

.PARAMETER ServerUser
    The SSH username (default: azureuser)

.PARAMETER OpenSilexPath
    Path to OpenSILEX installation on the server (default: /home/azureuser/opensilex)

.PARAMETER SkipBackup
    Skip creating a backup of the JAR file

.PARAMETER SkipRestart
    Skip restarting OpenSILEX after deployment

.EXAMPLE
    .\deploy-pheno-branding.ps1 -ServerHost 20.234.181.44
    Deploy to test server

.EXAMPLE
    .\deploy-pheno-branding.ps1 -ServerHost 172.211.86.191 -SkipRestart
    Deploy to production without restarting (restart manually later)
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$ServerHost,

    [Parameter(Mandatory=$false)]
    [string]$ServerUser = "azureuser",

    [Parameter(Mandatory=$false)]
    [string]$OpenSilexPath = "/home/azureuser/opensilex",

    [Parameter(Mandatory=$false)]
    [switch]$SkipBackup,

    [Parameter(Mandatory=$false)]
    [switch]$SkipRestart
)

$ErrorActionPreference = "Stop"

# Color output functions
function Write-Info { param($Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Success { param($Message) Write-Host "✓ $Message" -ForegroundColor Green }
function Write-Error { param($Message) Write-Host "✗ $Message" -ForegroundColor Red }
function Write-Step { param($Message) Write-Host "`n▶ $Message" -ForegroundColor Yellow }

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$ThemeDir = Join-Path $RepoRoot "theme\pheno"

Write-Host @"

╔═══════════════════════════════════════════════╗
║   PheNo Branding Deployment for OpenSILEX    ║
║   Target: $ServerHost
╚═══════════════════════════════════════════════╝

"@

# Step 1: Validate prerequisites
Write-Step "Validating prerequisites"

# Check if theme directory exists
if (-not (Test-Path $ThemeDir)) {
    Write-Error "Theme directory not found: $ThemeDir"
    exit 1
}
Write-Success "Theme directory found"

# Check if Node.js is available
try {
    $nodeVersion = node --version
    Write-Success "Node.js available: $nodeVersion"
} catch {
    Write-Error "Node.js not found. Please install Node.js from https://nodejs.org/"
    exit 1
}

# Check if sass is available
try {
    $sassVersion = sass --version
    Write-Success "Sass compiler available: $sassVersion"
} catch {
    Write-Error "Sass not found. Installing..."
    npm install -g sass
}

# Check if sharp is available in theme directory
$packageJsonPath = Join-Path $ThemeDir "images\package.json"
if (-not (Test-Path $packageJsonPath)) {
    Write-Info "Installing image processing dependencies..."
    Push-Location (Join-Path $ThemeDir "images")
    npm install sharp
    Pop-Location
}
Write-Success "Image processing dependencies available"

# Check SSH connectivity
Write-Step "Testing SSH connectivity to $ServerHost"
$sshTest = ssh -o BatchMode=yes -o ConnectTimeout=5 "$ServerUser@$ServerHost" "echo connected" 2>&1
if ($sshTest -match "connected") {
    Write-Success "SSH connection successful"
} else {
    Write-Error "Cannot connect to $ServerHost as $ServerUser"
    Write-Info "Make sure SSH keys are configured or use ssh-add to add your key"
    exit 1
}

# Step 2: Prepare logos
Write-Step "Preparing PheNo logos (resizing to OpenSILEX sizes)"
Push-Location $ThemeDir
node prepare-logos.js
if ($LASTEXITCODE -ne 0) {
    Write-Error "Logo preparation failed"
    Pop-Location
    exit 1
}
Pop-Location
Write-Success "Logos prepared"

# Step 3: Compile SCSS to CSS
Write-Step "Compiling PheNo SCSS to CSS"
Push-Location $ThemeDir
sass theme.scss compiled-theme.css --no-source-map 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error "SCSS compilation failed"
    Pop-Location
    exit 1
}

# Copy to main.css
Copy-Item compiled-theme.css main.css -Force
Write-Success "SCSS compiled to CSS"
Pop-Location

# Step 4: Create deployment package
Write-Step "Creating deployment package"
$DeployTempDir = "/tmp/pheno-deploy-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

# Create remote directory structure
ssh "$ServerUser@$ServerHost" "mkdir -p $DeployTempDir/front/theme/opensilex/images"
Write-Success "Remote staging directory created"

# Step 5: Upload theme files
Write-Step "Uploading theme files to server"

# Upload SCSS and CSS files
Write-Info "Uploading theme CSS and SCSS..."
scp "$ThemeDir\_settings.scss" "$ServerUser@$ServerHost`:$DeployTempDir/front/theme/opensilex/"
scp "$ThemeDir\main.css" "$ServerUser@$ServerHost`:$DeployTempDir/front/theme/opensilex/"

# Upload logo files
Write-Info "Uploading logo files..."
scp "$ThemeDir\images\pheno-icon-224.png" "$ServerUser@$ServerHost`:$DeployTempDir/front/opensilex.png"
scp "$ThemeDir\images\pheno-icon-216.png" "$ServerUser@$ServerHost`:$DeployTempDir/front/theme/opensilex/images/logo-opensilex.png"
scp "$ThemeDir\images\pheno-icon-42.png" "$ServerUser@$ServerHost`:$DeployTempDir/front/theme/opensilex/images/logo-opensilex_miniature.png"
scp "$ThemeDir\images\pheno-icon-224.png" "$ServerUser@$ServerHost`:$DeployTempDir/front/theme/opensilex/images/dashboardLogo.png"
scp "$ThemeDir\images\PheNo_logo_long_Green.svg" "$ServerUser@$ServerHost`:$DeployTempDir/front/theme/opensilex/images/logo-phis.svg"

# Upload login background images
Write-Info "Uploading login background images..."
$loginBgDir = Join-Path $ThemeDir "images\login-backgrounds"
if (Test-Path $loginBgDir) {
    $bgImages = Get-ChildItem "$loginBgDir\*.jpg", "$loginBgDir\*.jpeg", "$loginBgDir\*.png" -ErrorAction SilentlyContinue
    if ($bgImages.Count -gt 0) {
        $bgIndex = 1
        foreach ($bgImage in $bgImages) {
            # Map images to the OpenSILEX login background names
            switch ($bgIndex) {
                1 { $targetName = "phis-login-bg.jpg" }
                2 { $targetName = "opensilex-login-bg.png" }
                3 { $targetName = "vitioeno.jpg" }
                4 { $targetName = "LBE_Reacteur_de_laboratoire.jpg" }
                5 { $targetName = "lac.jpg" }
                default { $targetName = "pheno-bg-$bgIndex.jpg" }
            }
            scp "$($bgImage.FullName)" "$ServerUser@$ServerHost`:$DeployTempDir/front/theme/opensilex/images/$targetName"
            Write-Info "  → $($bgImage.Name) as $targetName"
            $bgIndex++
        }
        Write-Success "Login background images uploaded ($($bgImages.Count) images)"
    } else {
        Write-Info "No login background images found, skipping..."
    }
} else {
    Write-Info "Login backgrounds directory not found, skipping..."
}

Write-Success "All files uploaded"

# Step 6: Backup existing JAR
if (-not $SkipBackup) {
    Write-Step "Creating backup of OpenSILEX JAR"
    $BackupTimestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    ssh "$ServerUser@$ServerHost" "cd $OpenSilexPath/bin/1.4.9-rdg/modules && cp opensilex-front.jar opensilex-front.jar.backup-$BackupTimestamp"
    Write-Success "Backup created: opensilex-front.jar.backup-$BackupTimestamp"
} else {
    Write-Info "Skipping backup (as requested)"
}

# Step 7: Inject files into JAR
Write-Step "Injecting PheNo branding into OpenSILEX JAR"
$jarCommand = "cd $DeployTempDir && jar -uf $OpenSilexPath/bin/1.4.9-rdg/modules/opensilex-front.jar front/opensilex.png front/theme/opensilex/_settings.scss front/theme/opensilex/main.css front/theme/opensilex/images/logo-opensilex.png front/theme/opensilex/images/logo-opensilex_miniature.png front/theme/opensilex/images/dashboardLogo.png front/theme/opensilex/images/logo-phis.svg front/theme/opensilex/images/phis-login-bg.jpg front/theme/opensilex/images/opensilex-login-bg.png front/theme/opensilex/images/vitioeno.jpg front/theme/opensilex/images/LBE_Reacteur_de_laboratoire.jpg front/theme/opensilex/images/lac.jpg"
ssh "$ServerUser@$ServerHost" $jarCommand

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to inject files into JAR"
    exit 1
}
Write-Success "PheNo branding injected into JAR (including login backgrounds)"

# Step 8: Cleanup
Write-Step "Cleaning up temporary files"
ssh "$ServerUser@$ServerHost" "rm -rf $DeployTempDir"
Write-Success "Cleanup complete"

# Step 9: Restart OpenSILEX
if (-not $SkipRestart) {
    Write-Step "Restarting OpenSILEX service"
    Write-Info "This will take about 45 seconds..."

    ssh "$ServerUser@$ServerHost" "sudo systemctl restart opensilex"
    Start-Sleep -Seconds 45

    $serviceStatus = ssh "$ServerUser@$ServerHost" "sudo systemctl is-active opensilex"
    if ($serviceStatus -match "active") {
        Write-Success "OpenSILEX restarted successfully"
    } else {
        Write-Error "OpenSILEX failed to start. Check logs: sudo journalctl -u opensilex -n 50"
        exit 1
    }
} else {
    Write-Info "Skipping restart (as requested)"
    Write-Info "Remember to restart OpenSILEX manually: sudo systemctl restart opensilex"
}

# Step 10: Verify deployment
Write-Step "Verifying deployment"
$verifyCommand = "jar -tf $OpenSilexPath/bin/1.4.9-rdg/modules/opensilex-front.jar | grep -E 'front/theme/opensilex/(main.css|_settings.scss|images/logo-opensilex.png)' | wc -l"
$themeCheck = ssh "$ServerUser@$ServerHost" $verifyCommand

if ([int]$themeCheck -ge 3) {
    Write-Success "Deployment verified - theme files present in JAR"
} else {
    Write-Error "Verification failed - some theme files may be missing"
    exit 1
}

Write-Host @"

╔═══════════════════════════════════════════════╗
║         ✅ Deployment Complete!                ║
╚═══════════════════════════════════════════════╝

PheNo branding has been deployed to:
  🖥️  Server: $ServerHost
  📁 Path: $OpenSilexPath

Next steps:
  1. Open http://$ServerHost in your browser
  2. Hard refresh (Ctrl+Shift+R) to clear cache
  3. Verify PheNo colors and logos are visible

If you need to rollback:
  cd $OpenSilexPath/bin/1.4.9-rdg/modules
  cp opensilex-front.jar.backup-TIMESTAMP opensilex-front.jar
  sudo systemctl restart opensilex

"@
