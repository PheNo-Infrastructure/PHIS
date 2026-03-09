#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Configure Feide/Dataporten OpenID Connect authentication for OpenSILEX

.DESCRIPTION
    Adds Feide authentication to an existing vanilla OpenSILEX deployment.
    This script:
    1. Adds Feide credentials to opensilex.env
    2. Appends Feide OpenID config to opensilex-custom-config.yml
    3. Restarts OpenSILEX container to apply changes

    NOTE: This does NOT enable auto-group assignment for new users.
    For auto-group assignment, run 03-apply-patches.ps1 after this script.

.PARAMETER TargetIP
    Server IP address (default: 20.61.108.197)

.PARAMETER AdminUsername
    SSH username (default: azureuser)

.PARAMETER PrivateKeyPath
    Path to SSH private key (default: ~/.ssh/id_ed25519)

.PARAMETER ApiKeysFile
    Path to API keys config file containing FEIDE_CLIENT_ID and FEIDE_CLIENT_SECRET
    (default: ..\config\api-keys-test.conf)

.EXAMPLE
    .\02-configure-feide.ps1 -TargetIP 20.61.108.197

.EXAMPLE
    .\02-configure-feide.ps1 -TargetIP 20.61.108.197 -ApiKeysFile ..\config\prod-api-keys.conf
#>

param(
    [string]$TargetIP = "20.61.108.197",
    [string]$AdminUsername = "azureuser",
    [string]$PrivateKeyPath = "~/.ssh/id_ed25519",
    [string]$ApiKeysFile = "..\config\api-keys-test.conf"
)

$ErrorActionPreference = "Stop"

# Resolve paths
if ($PrivateKeyPath -match '^~') {
    $PrivateKeyPath = $PrivateKeyPath -replace '^~', $env:USERPROFILE
}
$PrivateKeyPath = Resolve-Path $PrivateKeyPath -ErrorAction Stop

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$FeideConfigFile = Join-Path $ScriptDir "patches\feide-openid-config.yml"

# Remote paths
$RemoteDeployDir = "~/opensilex-docker-compose"

# ─────────────────────────────────────────────────────────────────────────────
# Load Feide credentials from API keys file
# ─────────────────────────────────────────────────────────────────────────────

if ($ApiKeysFile -match '^~') {
    $ApiKeysFile = $ApiKeysFile -replace '^~', $env:USERPROFILE
}
if (-not [System.IO.Path]::IsPathRooted($ApiKeysFile)) {
    $ApiKeysFile = Join-Path $ScriptDir $ApiKeysFile
}
$ApiKeysFile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ApiKeysFile)

$FeideClientID = ""
$FeideClientSecret = ""

if (Test-Path $ApiKeysFile) {
    Get-Content $ApiKeysFile | ForEach-Object {
        if ($_ -match '^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$' -and $_ -notmatch '^\s*#') {
            $key = $Matches[1]
            $val = $Matches[2]
            switch ($key) {
                "FEIDE_CLIENT_ID"     { $FeideClientID = $val }
                "FEIDE_CLIENT_SECRET" { $FeideClientSecret = $val }
            }
        }
    }
} else {
    Write-Host "ERROR: API keys file not found: $ApiKeysFile" -ForegroundColor Red
    Write-Host "Please create the file with FEIDE_CLIENT_ID and FEIDE_CLIENT_SECRET" -ForegroundColor Yellow
    exit 1
}

if (-not $FeideClientID -or -not $FeideClientSecret) {
    Write-Host "ERROR: Feide credentials not found in $ApiKeysFile" -ForegroundColor Red
    Write-Host "Please add FEIDE_CLIENT_ID and FEIDE_CLIENT_SECRET to the file" -ForegroundColor Yellow
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Security: Validate credentials don't contain shell metacharacters
# ─────────────────────────────────────────────────────────────────────────────

if ($FeideClientID -match '[`$\\"`'';\n\r]' -or $FeideClientSecret -match '[`$\\"`'';\n\r]') {
    Write-Host "ERROR: Feide credentials contain unsafe characters" -ForegroundColor Red
    Write-Host "Credentials must not contain: ` $ \ "" ' ; newlines" -ForegroundColor Yellow
    Write-Host "Please check your API keys file: $ApiKeysFile" -ForegroundColor Yellow
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Display configuration
# ─────────────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Configure Feide/Dataporten OpenID Connect Authentication" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Target Server:  $TargetIP" -ForegroundColor Gray
Write-Host "Feide Client:   $FeideClientID" -ForegroundColor Gray
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Verify SSH connectivity
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "[1/4] Testing SSH connectivity..." -ForegroundColor Yellow

$SSHTest = ssh -i $PrivateKeyPath -o BatchMode=yes -o ConnectTimeout=5 "$AdminUsername@$TargetIP" "echo OK" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] SSH connection failed" -ForegroundColor Red
    Write-Host "  Hint: Run 'ssh-keygen -R $TargetIP' if host key changed" -ForegroundColor Yellow
    exit 1
}

Write-Host "  ✓ SSH connection successful" -ForegroundColor Green
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Add Feide credentials to opensilex.env
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "[2/4] Adding Feide credentials to opensilex.env..." -ForegroundColor Yellow

# Check if Feide credentials already exist
$CheckFeideCmd = "cd $RemoteDeployDir && grep -q 'FEIDE_CLIENT_ID' opensilex.env && echo 'EXISTS' || echo 'NOT_FOUND'"
$FeideExists = ssh -i $PrivateKeyPath "$AdminUsername@$TargetIP" $CheckFeideCmd 2>&1 | Select-Object -Last 1

if ($FeideExists -eq "EXISTS") {
    # Update existing credentials securely (avoid exposing in process list)
    $UpdateFeideCmd = "cd $RemoteDeployDir && sed -i '/^FEIDE_CLIENT_ID=/d' opensilex.env && sed -i '/^FEIDE_CLIENT_SECRET=/d' opensilex.env && echo '' >> opensilex.env && echo '# Feide/Dataporten OpenID Connect' >> opensilex.env && echo 'FEIDE_CLIENT_ID=$FeideClientID' >> opensilex.env && echo 'FEIDE_CLIENT_SECRET=$FeideClientSecret' >> opensilex.env && chmod 600 opensilex.env"
    ssh -i $PrivateKeyPath "$AdminUsername@$TargetIP" $UpdateFeideCmd 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [FAIL] Failed to update Feide credentials" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✓ Updated Feide credentials in opensilex.env" -ForegroundColor Green
} else {
    # Add new credentials securely
    $AddFeideCmd = "cd $RemoteDeployDir && echo '' >> opensilex.env && echo '# Feide/Dataporten OpenID Connect' >> opensilex.env && echo 'FEIDE_CLIENT_ID=$FeideClientID' >> opensilex.env && echo 'FEIDE_CLIENT_SECRET=$FeideClientSecret' >> opensilex.env && chmod 600 opensilex.env"
    ssh -i $PrivateKeyPath "$AdminUsername@$TargetIP" $AddFeideCmd 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [FAIL] Failed to add Feide credentials" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✓ Added Feide credentials to opensilex.env" -ForegroundColor Green
}

Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Append Feide OpenID config to opensilex-custom-config.yml
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "[3/4] Configuring Feide OpenID settings..." -ForegroundColor Yellow

# Check if Feide config already appended
$CheckConfigCmd = "cd $RemoteDeployDir/config && grep -q 'Feide/Dataporten OpenID' opensilex-custom-config.yml && echo 'EXISTS' || echo 'NOT_FOUND'"
$ConfigExists = ssh -i $PrivateKeyPath "$AdminUsername@$TargetIP" $CheckConfigCmd 2>&1 | Select-Object -Last 1

if ($ConfigExists -eq "NOT_FOUND") {
    if (Test-Path $FeideConfigFile) {
        # Upload Feide config (secure: host key verification enabled)
        & scp -i $PrivateKeyPath $FeideConfigFile "${AdminUsername}@${TargetIP}:${RemoteDeployDir}/config/feide-temp.yml" 2>&1 | Out-Null

        # Append to custom config
        $AppendConfigCmd = 'cd ' + $RemoteDeployDir + '/config && echo "" >> opensilex-custom-config.yml && cat feide-temp.yml >> opensilex-custom-config.yml && rm feide-temp.yml'
        ssh -i $PrivateKeyPath "$AdminUsername@$TargetIP" $AppendConfigCmd 2>&1 | Out-Null

        Write-Host "  ✓ Appended Feide OpenID config to opensilex-custom-config.yml" -ForegroundColor Green
    } else {
        Write-Host "  WARNING: feide-openid-config.yml not found at $FeideConfigFile" -ForegroundColor Yellow
        Write-Host "           Feide env vars added, but OpenID config missing" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✓ Feide config already exists in opensilex-custom-config.yml" -ForegroundColor Green
}

Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 4: Restart OpenSILEX container to apply changes
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "[4/4] Restarting OpenSILEX container..." -ForegroundColor Yellow

# Restart to reload env vars (docker compose restart doesn't reload env_file, so use down/up)
$RestartCmd = 'cd ' + $RemoteDeployDir + ' && sudo docker compose --env-file opensilex.env down opensilex && sudo docker compose --env-file opensilex.env up -d opensilex'
$RestartOutput = ssh -i $PrivateKeyPath "$AdminUsername@$TargetIP" $RestartCmd 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ OpenSILEX restarted successfully" -ForegroundColor Green
    Write-Host ""

    # Wait for OpenSILEX to start
    Write-Host "Waiting for OpenSILEX to start (30 seconds)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30

    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  Feide Configuration Complete!" -ForegroundColor Green
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "✓ Feide/Dataporten login enabled" -ForegroundColor Green
    Write-Host "✓ Users can log in via https://auth.dataporten.no" -ForegroundColor Green
    Write-Host ""
    Write-Host "Access OpenSILEX at: http://$TargetIP/sandbox/app/" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "IMPORTANT:" -ForegroundColor Yellow
    Write-Host "  - New Feide users will have ZERO credentials (no group assignment)" -ForegroundColor Yellow
    Write-Host "  - To enable auto-group assignment, run:" -ForegroundColor Yellow
    Write-Host "    .\03-apply-patches.ps1 -Rebuild" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "  [FAIL] Failed to restart OpenSILEX" -ForegroundColor Red
    exit 1
}
