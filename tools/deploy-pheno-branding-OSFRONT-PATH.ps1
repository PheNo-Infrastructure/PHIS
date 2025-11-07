#!/usr/bin/env pwsh
<#
.SYNOPSIS
    EXPERIMENTAL: Deploy PheNo branding using osfront/ paths

.DESCRIPTION
    This is an experimental version that places custom CSS/JS under front/osfront/
    instead of front/css/ and front/js/, based on the theory that OpenSILEX only
    serves files from the osfront/ directory.

.PARAMETER ServerHost
    The SSH hostname or IP address of the OpenSILEX server
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

function Write-Info { param($Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Success { param($Message) Write-Host "✓ $Message" -ForegroundColor Green }
function Write-Error { param($Message) Write-Host "✗ $Message" -ForegroundColor Red }
function Write-Step { param($Message) Write-Host "`n▶ $Message" -ForegroundColor Yellow }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$ThemeDir = Join-Path $RepoRoot "theme\pheno"

Write-Host @"

╔═══════════════════════════════════════════════╗
║   PheNo Branding Deployment (EXPERIMENTAL)    ║
║   Using osfront/ path structure              ║
║   Target: $ServerHost
╚═══════════════════════════════════════════════╝

"@

# Create modified index.html with osfront paths
Write-Step "Creating modified index.html with osfront/ paths"
$indexContent = Get-Content "$ThemeDir\index.html" -Raw
$modifiedIndex = $indexContent -replace '/css/pheno-overrides\.css', 'osfront/css/pheno-overrides.css'
$modifiedIndex = $modifiedIndex -replace '/js/pheno-text-replace\.js', 'osfront/js/pheno-text-replace.js'
$tempIndexPath = "$env:TEMP\index-osfront.html"
$modifiedIndex | Out-File -FilePath $tempIndexPath -Encoding UTF8 -NoNewline
Write-Success "Modified index.html created"

# Test SSH
Write-Step "Testing SSH connectivity"
$sshTest = ssh -o BatchMode=yes -o ConnectTimeout=5 "$ServerUser@$ServerHost" "echo connected" 2>&1
if ($sshTest -notmatch "connected") {
    Write-Error "Cannot connect to $ServerHost"
    exit 1
}
Write-Success "SSH connection successful"

# Create deployment package
Write-Step "Creating deployment package with osfront/ structure"
$DeployTempDir = "/tmp/pheno-deploy-osfront-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

# Create directory structure under osfront
ssh "$ServerUser@$ServerHost" "mkdir -p $DeployTempDir/front/osfront/css $DeployTempDir/front/osfront/js $DeployTempDir/front/theme/opensilex/images"
Write-Success "Remote staging directory created"

# Upload files
Write-Step "Uploading theme files to osfront/ paths"

Write-Info "Uploading modified index.html..."
scp "$tempIndexPath" "$ServerUser@$ServerHost`:$DeployTempDir/front/index.html"

Write-Info "Uploading CSS to osfront/css/..."
scp "$ThemeDir\pheno-overrides.css" "$ServerUser@$ServerHost`:$DeployTempDir/front/osfront/css/"

Write-Info "Uploading JS to osfront/js/..."
scp "$ThemeDir\pheno-text-replace.js" "$ServerUser@$ServerHost`:$DeployTempDir/front/osfront/js/"

Write-Info "Uploading SCSS..."
scp "$ThemeDir\_settings.scss" "$ServerUser@$ServerHost`:$DeployTempDir/front/theme/opensilex/"

Write-Info "Uploading logos..."
scp "$ThemeDir\images\pheno-icon-224.png" "$ServerUser@$ServerHost`:$DeployTempDir/front/opensilex.png"
scp "$ThemeDir\images\pheno-logo-navbar.png" "$ServerUser@$ServerHost`:$DeployTempDir/front/theme/opensilex/images/logo-opensilex.png"
scp "$ThemeDir\images\pheno-logo-navbar-mini.png" "$ServerUser@$ServerHost`:$DeployTempDir/front/theme/opensilex/images/logo-opensilex_miniature.png"

Write-Success "All files uploaded"

# Backup
if (-not $SkipBackup) {
    Write-Step "Creating backup"
    $BackupTimestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    ssh "$ServerUser@$ServerHost" "cd $OpenSilexPath/bin/1.4.9-rdg/modules && cp opensilex-front.jar opensilex-front.jar.backup-$BackupTimestamp"
    Write-Success "Backup created"
}

# Inject into JAR
Write-Step "Injecting files into JAR"
$jarCommand = "cd $DeployTempDir && jar -uf $OpenSilexPath/bin/1.4.9-rdg/modules/opensilex-front.jar front/index.html front/osfront/css/pheno-overrides.css front/osfront/js/pheno-text-replace.js front/opensilex.png front/theme/opensilex/_settings.scss front/theme/opensilex/images/logo-opensilex.png front/theme/opensilex/images/logo-opensilex_miniature.png"
ssh "$ServerUser@$ServerHost" $jarCommand

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to inject files"
    exit 1
}

# Verify
Write-Info "Verifying JAR contents..."
$verifyCmd = "jar -tf $OpenSilexPath/bin/1.4.9-rdg/modules/opensilex-front.jar | grep -E 'front/osfront/(css|js)/pheno'"
$jarCheck = ssh "$ServerUser@$ServerHost" $verifyCmd
Write-Info "Found in JAR:`n$jarCheck"
Write-Success "Files injected successfully"

# Cleanup
ssh "$ServerUser@$ServerHost" "rm -rf $DeployTempDir"
Remove-Item $tempIndexPath -Force

# Restart
if (-not $SkipRestart) {
    Write-Step "Restarting OpenSILEX"
    ssh "$ServerUser@$ServerHost" "sudo systemctl restart opensilex"
    Start-Sleep -Seconds 45
    Write-Success "OpenSILEX restarted"
}

Write-Host @"

╔═══════════════════════════════════════════════╗
║         ✅ Experimental Deployment Complete!   ║
╚═══════════════════════════════════════════════╝

Files deployed to osfront/ paths:
  - front/osfront/css/pheno-overrides.css
  - front/osfront/js/pheno-text-replace.js

index.html updated to reference:
  - osfront/css/pheno-overrides.css
  - osfront/js/pheno-text-replace.js

Test at: http://$ServerHost

"@
