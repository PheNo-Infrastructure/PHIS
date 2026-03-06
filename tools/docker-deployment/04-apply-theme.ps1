<#
.SYNOPSIS
    Apply PheNo theme to OpenSILEX deployment

.DESCRIPTION
    This script deploys the PheNo custom theme to a running OpenSILEX Docker deployment.
    The theme includes:
    - PheNo color palette (forest green, leaf greens, straw colors)
    - PheNo logos and branding
    - Aptos typography

    The script injects theme files directly into the opensilex-front.jar file
    inside the running Docker container and restarts OpenSILEX to apply changes.

.PARAMETER SSHKey
    Path to SSH private key for server access

.EXAMPLE
    .\04-apply-theme.ps1
    Apply PheNo theme to default server (20.61.108.197)

.EXAMPLE
    .\04-apply-theme.ps1 -SSHKey ~\.ssh\custom_key
    Apply theme using a custom SSH key

.NOTES
    Prerequisites:
    - OpenSILEX must be deployed and running (via 01-deploy-opensilex.ps1)
    - SSH access to the server
    - Theme files in tools/docker-deployment/theme/pheno/
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$SSHKey = "~/.ssh/id_ed25519",

    [Parameter(Mandatory=$false)]
    [string]$Server = "20.61.108.197",

    [Parameter(Mandatory=$false)]
    [string]$User = "azureuser"
)

# Resolve paths
$SSHKey = Resolve-Path $SSHKey -ErrorAction Stop
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ThemeDir = Join-Path $ScriptDir "theme\pheno"
$VanillaThemeDir = Join-Path $ScriptDir "theme\vanilla-opensilex"

# Remote paths
$RemoteDeployDir = "~/opensilex-docker-compose"
$RemoteThemeDir = "/tmp/pheno-theme-deploy"
$ContainerName = "sandbox-opensilex-docker-opensilexapp"

# Color mapping: Vanilla OpenSILEX colors → PheNo colors
# Note: sed will handle case-insensitive replacements with 'I' flag
$ColorReplacements = @(
    @{ Find = "#00A38D"; Replace = "#3D8526"; Desc = "Vanilla PHIS teal → PheNo Leaf Green" }
    @{ Find = "#018371"; Replace = "#264030"; Desc = "Darker teal → PheNo Forest Green" }
    @{ Find = "#00A28C"; Replace = "#3D8526"; Desc = "Teal variant → PheNo Leaf Green" }
    @{ Find = "#007969"; Replace = "#264030"; Desc = "Teal variant → PheNo Forest Green" }
    @{ Find = "#3C76F4"; Replace = "#3D8526"; Desc = "Blue variant → PheNo Leaf Green" }
    @{ Find = "rgb\(0,\s*163,\s*141\)"; Replace = "#3D8526"; Desc = "RGB teal → PheNo Leaf Green"; IsRegex = $true }
    @{ Find = "rgb\(1,\s*131,\s*113\)"; Replace = "#264030"; Desc = "RGB dark teal → PheNo Forest Green"; IsRegex = $true }
)

# SCSS component files to process (copy from vanilla, apply colors, upload)
$ScssComponents = @(
    "_badges.scss",
    "_buttons.scss",
    "_calendar.scss",
    "_cards.scss",
    "_carousel.scss",
    "_forms.scss",
    "_layout.scss",
    "_main.scss",
    "_mixins.scss",
    "_modal.scss",
    "_rating.scss",
    "_alert.scss",
    "_auth.scss",
    "_navigation.scss",
    "_range-slider.scss",
    "_tables.scss",
    "_widgets.scss"
)

# ─────────────────────────────────────────────────────────────────────────────
# Verify Prerequisites
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  PheNo Theme Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check theme directory exists
if (-not (Test-Path $ThemeDir)) {
    Write-Error "Theme directory not found: $ThemeDir"
    Write-Host "Expected location: tools/docker-deployment/theme/pheno/" -ForegroundColor Yellow
    exit 1
}

# Check required theme files
$RequiredFiles = @(
    "main.css",
    "hamburgers.css",
    "fix.css",
    "pheno-override.css",
    "_settings.scss",
    "opensilex.yml",
    "images\pheno-icon-224.png",
    "images\pheno-icon-216.png",
    "images\pheno-icon-42.png",
    "images\PheNo_logo_long_Green.svg"
)

foreach ($file in $RequiredFiles) {
    $filePath = Join-Path $ThemeDir $file
    if (-not (Test-Path $filePath)) {
        Write-Error "Required theme file missing: $file"
        exit 1
    }
}

Write-Host "[1/7] Verified theme files locally" -ForegroundColor Green
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# Verify Server Connection
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "[2/7] Verifying server connection..." -ForegroundColor Yellow

$output = ssh -i $SSHKey "$User@$Server" "echo connected" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to connect to server $Server"
    Write-Host $output
    exit 1
}

# Check if OpenSILEX container is running
$containerCheck = ssh -i $SSHKey "$User@$Server" "docker ps --filter name=$ContainerName --format '{{.Names}}'" 2>&1
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($containerCheck)) {
    Write-Error "OpenSILEX container '$ContainerName' is not running"
    Write-Host "Run 01-deploy-opensilex.ps1 first to deploy OpenSILEX" -ForegroundColor Yellow
    exit 1
}

Write-Host "  [OK] Connected to $Server" -ForegroundColor Green
Write-Host "  [OK] OpenSILEX container is running" -ForegroundColor Green

# Check if jar command is available (required for theme injection)
$jarCheck = ssh -i $SSHKey "$User@$Server" "which jar" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [!] JDK not found, installing openjdk-17-jdk-headless..." -ForegroundColor Yellow
    $output = ssh -i $SSHKey "$User@$Server" "sudo apt-get update > /dev/null 2>&1 && sudo apt-get install -y openjdk-17-jdk-headless" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install JDK"
        Write-Host $output
        exit 1
    }
    Write-Host "  [OK] Installed JDK" -ForegroundColor Green
} else {
    Write-Host "  [OK] JDK is available" -ForegroundColor Green
}

Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# Process SCSS Component Files with Color Replacements
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "[3/7] Processing SCSS component files with PheNo colors..." -ForegroundColor Yellow

# Create temp directory for processed SCSS files
$TempScssDir = Join-Path $env:TEMP "pheno-scss-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $TempScssDir -Force | Out-Null
Write-Host "  [OK] Created temp directory: $TempScssDir" -ForegroundColor Gray

$processedCount = 0
foreach ($scssFile in $ScssComponents) {
    $vanillaFile = Join-Path $VanillaThemeDir $scssFile
    $processedFile = Join-Path $TempScssDir $scssFile

    # Check if vanilla file exists
    if (-not (Test-Path $vanillaFile)) {
        Write-Warning "Vanilla SCSS file not found: $scssFile (skipping)"
        continue
    }

    # Copy vanilla file to temp location
    Copy-Item $vanillaFile $processedFile -Force

    # Read file content
    $content = Get-Content $processedFile -Raw

    # Apply color replacements
    foreach ($replacement in $ColorReplacements) {
        if ($replacement.IsRegex) {
            # Regex replacement (case-insensitive)
            $content = $content -replace "(?i)$($replacement.Find)", $replacement.Replace
        } else {
            # Literal string replacement (case-insensitive, escape regex special chars)
            $findEscaped = [regex]::Escape($replacement.Find)
            $content = $content -replace "(?i)$findEscaped", $replacement.Replace
        }
    }

    # Write modified content back to file
    Set-Content -Path $processedFile -Value $content -NoNewline

    $processedCount++
}

Write-Host "  [OK] Processed $processedCount SCSS component files with PheNo colors" -ForegroundColor Green
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# Upload Theme Files
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "[4/7] Uploading PheNo theme files..." -ForegroundColor Yellow

# Clean up old theme directory and recreate
ssh -i $SSHKey "$User@$Server" "rm -rf $RemoteThemeDir && mkdir -p $RemoteThemeDir/front/theme/opensilex/images" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create theme directory on server"
    exit 1
}

# Upload CSS files
$cssFiles = @(
    @{ File = "main.css"; Dest = "front/theme/opensilex/main.css" }
    @{ File = "hamburgers.css"; Dest = "front/theme/opensilex/hamburgers.css" }
    @{ File = "fix.css"; Dest = "front/theme/opensilex/fix.css" }
    @{ File = "pheno-override.css"; Dest = "front/theme/opensilex/pheno-override.css" }
)

foreach ($css in $cssFiles) {
    $localFile = Join-Path $ThemeDir $css.File
    $remotePath = "${RemoteThemeDir}/$($css.Dest)"

    scp -i $SSHKey $localFile "${User}@${Server}:${remotePath}" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to upload $($css.File)"
        exit 1
    }
}
Write-Host "  [OK] Uploaded CSS files (main, hamburgers, fix)" -ForegroundColor Green

# Upload SCSS settings and theme config
$configFiles = @(
    @{ File = "_settings.scss"; Dest = "front/theme/opensilex/_settings.scss" }
    @{ File = "opensilex.yml"; Dest = "front/theme/opensilex/opensilex.yml" }
)

foreach ($config in $configFiles) {
    $localFile = Join-Path $ThemeDir $config.File
    $remotePath = "${RemoteThemeDir}/$($config.Dest)"

    scp -i $SSHKey $localFile "${User}@${Server}:${remotePath}" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to upload $($config.File)"
        exit 1
    }
}
Write-Host "  [OK] Uploaded SCSS settings and theme config" -ForegroundColor Green

# Upload processed SCSS component files
$scssUploadCount = 0
foreach ($scssFile in $ScssComponents) {
    $localFile = Join-Path $TempScssDir $scssFile

    # Skip if file wasn't processed (doesn't exist in temp dir)
    if (-not (Test-Path $localFile)) {
        continue
    }

    $remotePath = "${RemoteThemeDir}/front/theme/opensilex/$scssFile"

    scp -i $SSHKey $localFile "${User}@${Server}:${remotePath}" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to upload $scssFile"
        exit 1
    }
    $scssUploadCount++
}
Write-Host "  [OK] Uploaded $scssUploadCount processed SCSS component files" -ForegroundColor Green

# Upload logos (array of objects to allow same source file to multiple destinations)
$logoMappings = @(
    @{ Local = "images\pheno-logo-green.svg"; Remote = "front/opensilex.png" }
    @{ Local = "images\pheno-logo-green.svg"; Remote = "front/theme/opensilex/images/logo-opensilex.png" }
    @{ Local = "images\pheno-logo-green.svg"; Remote = "front/theme/opensilex/images/logo-opensilex_miniature.png" }
    @{ Local = "images\pheno-logo-green.svg"; Remote = "front/theme/opensilex/images/dashboardLogo.svg" }
    @{ Local = "images\PheNo_logo_long_Green.svg"; Remote = "front/theme/opensilex/images/logo-phis.svg" }
    @{ Local = "images\PheNo_logo_long_White.svg"; Remote = "front/theme/opensilex/images/pheno-logo-white.svg" }
    @{ Local = "images\PheNo_logo_long_White.svg"; Remote = "front/pheno-logo-white.svg" }
)

foreach ($mapping in $logoMappings) {
    $localFile = Join-Path $ThemeDir $mapping.Local
    $remotePath = "${RemoteThemeDir}/$($mapping.Remote)"

    scp -i $SSHKey $localFile "${User}@${Server}:${remotePath}" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to upload $($mapping.Local)"
        exit 1
    }
}
Write-Host "  [OK] Uploaded logo files" -ForegroundColor Green
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# Inject Theme into JAR
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "[5/7] Injecting theme into opensilex-front.jar..." -ForegroundColor Yellow

# Create backup of JAR
$backupCmd = "docker exec $ContainerName bash -c 'cp /home/opensilex/bin/modules/opensilex-front.jar /home/opensilex/bin/modules/opensilex-front.jar.backup-\$(date +%Y%m%d-%H%M%S) && echo Backup created'"
$output = ssh -i $SSHKey "$User@$Server" $backupCmd 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create JAR backup"
    Write-Host $output
    exit 1
}
Write-Host "  [OK] Created JAR backup" -ForegroundColor Green

# Copy JAR from container to host for modification (container doesn't have jar command - only JRE)
$output = ssh -i $SSHKey "$User@$Server" "docker cp ${ContainerName}:/home/opensilex/bin/modules/opensilex-front.jar $RemoteThemeDir/opensilex-front.jar" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to copy JAR from container"
    Write-Host $output
    exit 1
}
Write-Host "  [OK] Copied JAR to host for modification" -ForegroundColor Green

# Build list of files to inject into JAR
$jarFiles = @(
    "front/opensilex.png",
    "front/theme/opensilex/_settings.scss",
    "front/theme/opensilex/opensilex.yml",
    "front/theme/opensilex/main.css",
    "front/theme/opensilex/hamburgers.css",
    "front/theme/opensilex/fix.css",
    "front/theme/opensilex/pheno-override.css"
)

# Add all processed SCSS component files
foreach ($scssFile in $ScssComponents) {
    $jarFiles += "front/theme/opensilex/$scssFile"
}

# Add logo files (using SVG for crisp rendering at any size)
$jarFiles += @(
    "front/opensilex.png",
    "front/theme/opensilex/images/logo-opensilex.png",
    "front/theme/opensilex/images/logo-opensilex_miniature.png",
    "front/theme/opensilex/images/dashboardLogo.svg",
    "front/theme/opensilex/images/logo-phis.svg",
    "front/theme/opensilex/images/pheno-logo-white.svg",
    "front/pheno-logo-white.svg"
)

# Remove old PNG logos from JAR (so SVG versions are used instead)
$oldPngs = @(
    "front/theme/opensilex/images/dashboardLogo.png"
)
foreach ($oldPng in $oldPngs) {
    $output = ssh -i $SSHKey "$User@$Server" "cd $RemoteThemeDir && zip -d opensilex-front.jar $oldPng" 2>&1
    # Ignore errors if file doesn't exist (exit code 12 = nothing to do)
}

# Build jar command with all files
$fileList = $jarFiles -join " "
$injectCmd = "cd $RemoteThemeDir && jar -uf opensilex-front.jar $fileList"
$output = ssh -i $SSHKey "$User@$Server" $injectCmd 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to inject theme into JAR"
    Write-Host $output
    Write-Host "`nRestoring backup..." -ForegroundColor Yellow
    ssh -i $SSHKey "$User@$Server" "docker exec $ContainerName bash -c 'cp /home/opensilex/bin/modules/opensilex-front.jar.backup-* /home/opensilex/bin/modules/opensilex-front.jar'" 2>&1 | Out-Null
    exit 1
}
Write-Host "  [OK] Injected theme into JAR" -ForegroundColor Green

# Copy modified JAR back to container
$output = ssh -i $SSHKey "$User@$Server" "docker cp $RemoteThemeDir/opensilex-front.jar ${ContainerName}:/home/opensilex/bin/modules/opensilex-front.jar" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to copy modified JAR back to container"
    Write-Host $output
    Write-Host "`nRestoring backup..." -ForegroundColor Yellow
    ssh -i $SSHKey "$User@$Server" "docker exec $ContainerName bash -c 'cp /home/opensilex/bin/modules/opensilex-front.jar.backup-* /home/opensilex/bin/modules/opensilex-front.jar'" 2>&1 | Out-Null
    exit 1
}
Write-Host "  [OK] Copied modified JAR back to container" -ForegroundColor Green

# Verify theme was injected
Write-Host ""
Write-Host "[6/7] Verifying theme injection..." -ForegroundColor Yellow
$verifyCmd = "cd $RemoteThemeDir && jar -tf opensilex-front.jar | grep -E '_navigation.scss|_buttons.scss|_settings.scss' | head -10"
$output = ssh -i $SSHKey "$User@$Server" $verifyCmd 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Could not verify theme files in JAR"
} else {
    Write-Host "  [OK] Verified SCSS component files in JAR:" -ForegroundColor Green
    Write-Host $output -ForegroundColor Gray
}

# Clean up temporary files on server
ssh -i $SSHKey "$User@$Server" "rm -rf $RemoteThemeDir" 2>&1 | Out-Null

# Clean up local temp SCSS directory
Remove-Item -Path $TempScssDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "  [OK] Cleaned up temporary files" -ForegroundColor Green

Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# Restart OpenSILEX
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "[7/7] Restarting OpenSILEX to apply theme..." -ForegroundColor Yellow

$restartCmd = "cd $RemoteDeployDir && docker compose --env-file opensilex.env restart opensilex"
$output = ssh -i $SSHKey "$User@$Server" $restartCmd 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to restart OpenSILEX container"
    Write-Host $output
    exit 1
}

Write-Host "  [OK] Container restarted" -ForegroundColor Green
Write-Host ""
Write-Host "Waiting for OpenSILEX to start (30 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  PheNo Theme Applied Successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Access your PheNo-branded OpenSILEX at:" -ForegroundColor Cyan
Write-Host "  http://$Server/sandbox/app/" -ForegroundColor Yellow
Write-Host ""
Write-Host "Theme includes:" -ForegroundColor White
Write-Host "  - Forest green navigation (#264030)" -ForegroundColor Gray
Write-Host "  - Leaf green buttons (#3D8526)" -ForegroundColor Gray
Write-Host "  - PheNo logos and branding" -ForegroundColor Gray
Write-Host "  - Aptos typography" -ForegroundColor Gray
Write-Host "  - $processedCount SCSS components with color replacements" -ForegroundColor Gray
Write-Host ""
Write-Host "Color replacements applied:" -ForegroundColor White
foreach ($replacement in $ColorReplacements) {
    Write-Host "  $($replacement.Find) → $($replacement.Replace)" -ForegroundColor Gray
}
Write-Host ""
Write-Host "Note: You may need to clear your browser cache (Ctrl+Shift+R)" -ForegroundColor Yellow
Write-Host "to see the new theme if you've visited the site before." -ForegroundColor Yellow
Write-Host ""
Write-Host "To rollback to default theme, restore the JAR backup:" -ForegroundColor Cyan
Write-Host "  docker exec $ContainerName bash -c 'cp /home/opensilex/bin/modules/opensilex-front.jar.backup-* /home/opensilex/bin/modules/opensilex-front.jar'" -ForegroundColor Gray
Write-Host "  cd $RemoteDeployDir && docker compose restart opensilex" -ForegroundColor Gray
Write-Host ""
