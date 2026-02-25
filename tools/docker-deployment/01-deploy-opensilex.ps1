#!/usr/bin/env pwsh
<#
.SYNOPSIS
    One-Click OpenSILEX Docker Deployment (Official Stack)

.DESCRIPTION
    Deploys OpenSILEX using the official opensilex-docker-compose repository.
    Builds OpenSILEX from source with Maven to apply Java patches.
    Stack: OpenSILEX + RDF4J + MongoDB + HAProxy + Mongo Express

    Steps performed:
    1. Validates prerequisites (SSH key, connectivity, Docker on server)
    2. Clones official opensilex-docker-compose repository
    3. Applies required fixes (Dockerfile UID/GID, directory permissions)
    4. Configures environment (version, prefix, public URL)
    5. Builds Docker images (OpenSILEX compiled from source with patches)
    6. Starts the stack and waits for health
    7. Configures Nginx reverse proxy (port 80 -> OpenSILEX)
    8. Creates admin user and verifies deployment
    9. Sets up Feide auto-group assignment (profiles, groups, monitor)

.PARAMETER TargetIP
    The IP address of the target server

.PARAMETER AdminUsername
    SSH username for the target server (default: azureuser)

.PARAMETER PrivateKeyPath
    Path to SSH private key (default: ~/.ssh/id_ed25519)

.PARAMETER AdminEmail
    OpenSILEX admin email (default: admin@opensilex.org)

.PARAMETER AdminPassword
    OpenSILEX admin password (default: admin)

.PARAMETER OpenSilexVersion
    OpenSILEX release version (default: 1.4.9)

.PARAMETER ProjectPrefix
    Docker stack prefix used for container naming (default: sandbox)

.PARAMETER ApiKeysFile
    Path to API keys config file containing FEIDE_CLIENT_ID, FEIDE_CLIENT_SECRET,
    and optionally AGROPORTAL_API_KEY. See tools/config/api-keys.conf.template.
    If provided and contains Feide credentials, OpenID Connect login is enabled.

.EXAMPLE
    .\deploy-opensilex-docker.ps1 -TargetIP 20.61.108.197

.EXAMPLE
    .\deploy-opensilex-docker.ps1 -TargetIP 20.61.108.197 -ApiKeysFile ..\config\test-api-keys.conf

.EXAMPLE
    .\deploy-opensilex-docker.ps1 -TargetIP 10.0.0.5 -OpenSilexVersion 1.4.9 -ProjectPrefix production
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$TargetIP,

    [Parameter(Mandatory=$false)]
    [string]$AdminUsername = "azureuser",

    [Parameter(Mandatory=$false)]
    [string]$PrivateKeyPath = "~/.ssh/id_ed25519",

    [Parameter(Mandatory=$false)]
    [string]$AdminEmail = "admin@opensilex.org",

    [Parameter(Mandatory=$false)]
    [string]$AdminPassword = "admin",

    [Parameter(Mandatory=$false)]
    [string]$OpenSilexVersion = "1.4.9",

    [Parameter(Mandatory=$false)]
    [string]$ProjectPrefix = "sandbox",

    [Parameter(Mandatory=$false)]
    [string]$ApiKeysFile = ""
)

$ErrorActionPreference = "Stop"

# Script directory (where this script and patches/ live)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Derived settings
$DeployDir = "opensilex-docker-compose"
$RepoURL = "https://github.com/OpenSILEX/opensilex-docker-compose.git"
$OpenSilexPort = 28081
$RDF4JPort = 28887
$MongoExpressPort = 28889

# ─────────────────────────────────────────────────────────────────────────────
# Load API keys from config file (if provided)
# ─────────────────────────────────────────────────────────────────────────────

$FeideEnabled = $false
$FeideClientID = ""
$FeideClientSecret = ""

if ($ApiKeysFile) {
    if ($ApiKeysFile -match '^~') {
        $ApiKeysFile = $ApiKeysFile -replace '^~', $env:USERPROFILE
    }
    # Resolve relative paths from script directory
    if (-not [System.IO.Path]::IsPathRooted($ApiKeysFile)) {
        $ApiKeysFile = Join-Path $ScriptDir $ApiKeysFile
    }
    $ApiKeysFile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ApiKeysFile)

    if (Test-Path $ApiKeysFile) {
        # Parse key=value lines from the config file
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

        if ($FeideClientID -and $FeideClientSecret) {
            $FeideEnabled = $true
        }
    } else {
        Write-Host "[WARN] API keys file not found: $ApiKeysFile" -ForegroundColor Yellow
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# Output helpers
# ─────────────────────────────────────────────────────────────────────────────

function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK]   $Message" -ForegroundColor Green
}

function Write-Err {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Write-Step {
    param([string]$Step, [string]$Title)
    Write-Host ""
    Write-Host ("=" * 65) -ForegroundColor Cyan
    Write-Host " STEP $Step : $Title" -ForegroundColor Cyan
    Write-Host ("=" * 65) -ForegroundColor Cyan
}

# ─────────────────────────────────────────────────────────────────────────────
# SSH helper -- runs a command on the remote server
# ─────────────────────────────────────────────────────────────────────────────

function Invoke-ServerCommand {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Command,

        [Parameter(Mandatory=$false)]
        [string]$Description = "",

        [Parameter(Mandatory=$false)]
        [switch]$NoFail,

        [Parameter(Mandatory=$false)]
        [switch]$Quiet
    )

    if ($Description) {
        Write-Status $Description
    }

    $output = & ssh -i $PrivateKeyPath -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=60 "${AdminUsername}@${TargetIP}" $Command 2>&1
    $exitCode = $LASTEXITCODE

    if ($output -and -not $Quiet) {
        Write-Host $output
    }

    if ($exitCode -ne 0 -and -not $NoFail) {
        Write-Err "Command failed (exit $exitCode): $Command"
        exit 1
    }

    return $output
}

# ─────────────────────────────────────────────────────────────────────────────
# Banner
# ─────────────────────────────────────────────────────────────────────────────

Write-Host @"

         .+.
        +++++``.
      ;+;  ++.++``.
     ++     '+,  ++``.
   '+.        ++  ``+++       ___                    ___  ___  _     ___ __  __
  ++           +++``  ++     / _ \  _ __  ___  _ _  / __||_ _|| |   | __|\ \/ /
``++   ,;++++++++++++++++   | (_) || '_ \/ -_)| ' \ \__ \ | | | |__ | _|  >  <
++++++:``        ++   .++    \___/ | .__/\___||_||_||___/|___||____||___|/_/\_\
 .++    ``'+++   ++  ++``           |_|
   ++.      '+++'+.++
     ++:+++.``   .++          OFFICIAL DOCKER DEPLOYMENT
      ``````````````

"@ -ForegroundColor Cyan

Write-Status "Target:  $TargetIP"
Write-Status "Version: OpenSILEX $OpenSilexVersion"
Write-Status "Prefix:  $ProjectPrefix"
if ($FeideEnabled) {
    Write-Status "Feide:   Enabled (OpenID Connect)"
} else {
    Write-Status "Feide:   Disabled"
}
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: Prerequisites
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "1/9" "Prerequisites"

# Expand ~ in key path
if ($PrivateKeyPath -match '^~') {
    $PrivateKeyPath = $PrivateKeyPath -replace '^~', $env:USERPROFILE
}
$PrivateKeyPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($PrivateKeyPath)

# Check SSH key
if (-not (Test-Path $PrivateKeyPath)) {
    Write-Err "SSH private key not found: $PrivateKeyPath"
    exit 1
}
Write-Success "SSH key found: $PrivateKeyPath"

# Test SSH connectivity
Write-Status "Testing SSH connectivity..."
$sshTest = & ssh -i $PrivateKeyPath -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${AdminUsername}@${TargetIP}" "echo SSH_OK" 2>&1
if ($sshTest -notmatch "SSH_OK") {
    Write-Err "Cannot connect to $TargetIP via SSH"
    Write-Err "Output: $sshTest"
    exit 1
}
Write-Success "SSH connection to $TargetIP successful"

# Check Docker
$dockerCheck = Invoke-ServerCommand -Command "docker --version 2>/dev/null && sudo docker compose version 2>/dev/null" -Description "Checking Docker installation..." -NoFail -Quiet
if ($LASTEXITCODE -ne 0 -or $dockerCheck -notmatch "Docker") {
    Write-Err "Docker or Docker Compose not found on server"
    Write-Err "Install Docker first: https://docs.docker.com/engine/install/debian/"
    exit 1
}
Write-Success "Docker is installed"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: Clone official repository
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "2/9" "Clone official opensilex-docker-compose repository"

$repoExists = Invoke-ServerCommand -Command "test -d ~/$DeployDir/.git && echo EXISTS || echo MISSING" -NoFail -Quiet
if ($repoExists -match "EXISTS") {
    Write-Status "Repository already exists, pulling latest..."
    Invoke-ServerCommand -Command "cd ~/$DeployDir && git pull" -Description "Updating repository..."
} else {
    Invoke-ServerCommand -Command "cd ~ && git clone $RepoURL $DeployDir" -Description "Cloning $RepoURL ..."
}
Write-Success "Repository ready at ~/$DeployDir"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: Apply fixes and configure
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "3/9" "Apply fixes and configure environment"

# Fix 1: Replace Dockerfile with runtime JAR patching
# The original Dockerfile downloads a pre-built release ZIP. Our version
# downloads the same release but patches the GroupDAO.class file at runtime
# to fix the NullPointerException bug without needing Maven source build.
Write-Status "Deploying runtime JAR patching Dockerfile..."

$patchFile = Join-Path $ScriptDir "patches\opensilex-runtime-patch.docker"
if (-not (Test-Path $patchFile)) {
    Write-Err "Patch file not found: $patchFile"
    exit 1
}

& scp -i $PrivateKeyPath -o StrictHostKeyChecking=no $patchFile "${AdminUsername}@${TargetIP}:~/${DeployDir}/opensilex-build-step.docker"
if ($LASTEXITCODE -ne 0) {
    Write-Err "Failed to copy runtime-patch Dockerfile to server"
    exit 1
}

Write-Success "Runtime JAR patching Dockerfile deployed (GroupDAO fix built-in)"

# Fix 2: Directory permissions -- the container's opensilex user needs to
# write generated config files (envsubst output) into the mounted config dir.
Invoke-ServerCommand -Command "chmod 777 ~/$DeployDir/config/ && sudo mkdir -p ~/$DeployDir/logs/opensilex && sudo chmod 777 ~/$DeployDir/logs/opensilex" -Description "Fixing directory permissions..."
Write-Success "Directory permissions set"

# Fix 3: Configure opensilex.env with user-provided values
Write-Status "Configuring opensilex.env..."

$envConfig = "cd ~/$DeployDir && sed -i 's|^OPENSILEX_RELEASE_TAG=.*|OPENSILEX_RELEASE_TAG=$OpenSilexVersion|' opensilex.env && sed -i 's|^PROJECT_PREFIX=.*|PROJECT_PREFIX=$ProjectPrefix|' opensilex.env && sed -i 's|^OPENSILEX_PUBLIC_URL=.*|OPENSILEX_PUBLIC_URL=http://${TargetIP}/|' opensilex.env"

Invoke-ServerCommand -Command $envConfig
Write-Success "Environment configured (version=$OpenSilexVersion, prefix=$ProjectPrefix)"

# Fix 4: Feide/OpenID Connect authentication (optional)
if ($FeideEnabled) {
    Write-Status "Configuring Feide/OpenID Connect authentication..."

    # Add Feide env vars to opensilex.env
    $feideEnvCmd = "cd ~/$DeployDir && echo '' >> opensilex.env && echo '# Feide/Dataporten OpenID Connect' >> opensilex.env && echo 'FEIDE_CLIENT_ID=$FeideClientID' >> opensilex.env && echo 'FEIDE_CLIENT_SECRET=$FeideClientSecret' >> opensilex.env"
    Invoke-ServerCommand -Command $feideEnvCmd -Quiet

    # Append Feide YAML config to opensilex-custom-config.yml (gets merged via envsubst)
    $feideConfigFile = Join-Path $ScriptDir "patches\feide-openid-config.yml"
    if (Test-Path $feideConfigFile) {
        # SCP the feide config, then append it to the custom config
        & scp -i $PrivateKeyPath -o StrictHostKeyChecking=no $feideConfigFile "${AdminUsername}@${TargetIP}:~/${DeployDir}/config/feide-openid-config.yml" 2>&1 | Out-Null
        Invoke-ServerCommand -Command "cd ~/$DeployDir/config && cat feide-openid-config.yml >> opensilex-custom-config.yml && rm feide-openid-config.yml" -Quiet
        Write-Success "Feide authentication configured"
    } else {
        Write-Err "Feide config patch not found: $feideConfigFile"
        exit 1
    }
} else {
    Write-Status "Feide authentication: skipped (no credentials provided)"
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: Build Docker images
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "4/9" "Build Docker images (source build with patches)"
Write-Status "Building OpenSILEX from source, RDF4J, and HAProxy images..."
Write-Status "(First build takes 15-20 min for Maven compilation; subsequent builds use cache)"

# Run the build detached (nohup) to survive SSH idle timeouts from Azure NAT.
# The Maven source build takes 15-20 min with periods of no output, which
# causes Azure to reset the TCP connection even with SSH keepalive.
$buildLogFile = "/tmp/docker-build.log"
Invoke-ServerCommand -Command "cd ~/$DeployDir && sudo rm -f $buildLogFile && sudo nohup bash -c 'BUILDKIT_PROGRESS=plain docker compose --progress=plain --env-file opensilex.env build > $buildLogFile 2>&1; echo EXIT_CODE=\`$?\` >> $buildLogFile' &>/dev/null &" -Description "Starting Docker build in background..." -NoFail -Quiet

Write-Status "Build running in background. Polling progress..."

# Poll until the build finishes (EXIT_CODE appears in log) or timeout
$buildTimeout = 1800  # 30 minutes
$pollInterval = 30    # seconds
$elapsed = 0
$lastLines = 0

while ($elapsed -lt $buildTimeout) {
    Start-Sleep -Seconds $pollInterval
    $elapsed += $pollInterval

    # Check if build finished (EXIT_CODE line appears at end of log)
    $status = Invoke-ServerCommand -Command "grep -c '^EXIT_CODE=' $buildLogFile 2>/dev/null || echo 0" -NoFail -Quiet
    $lineCount = Invoke-ServerCommand -Command "wc -l < $buildLogFile 2>/dev/null || echo 0" -NoFail -Quiet
    $lastLog = Invoke-ServerCommand -Command "tail -3 $buildLogFile 2>/dev/null" -NoFail -Quiet

    # Show progress
    $mins = [math]::Floor($elapsed / 60)
    $secs = $elapsed % 60
    if ($lastLog) {
        # Extract a short summary from the last log line
        $summary = ($lastLog -split "`n" | Where-Object { $_ -match '\S' } | Select-Object -Last 1)
        if ($summary.Length -gt 100) { $summary = $summary.Substring(0, 100) + "..." }
        Write-Status "  [${mins}m${secs}s] $summary"
    } else {
        Write-Status "  [${mins}m${secs}s] Building... ($lineCount lines logged)"
    }

    if ($status -and $status.Trim() -ne "0") {
        break
    }
}

if ($elapsed -ge $buildTimeout) {
    Write-Err "Docker build timed out after 30 minutes"
    Invoke-ServerCommand -Command "tail -50 $buildLogFile" -Description "Build log (last 50 lines):"
    exit 1
}

# Check exit code
$exitLine = Invoke-ServerCommand -Command "grep '^EXIT_CODE=' $buildLogFile" -NoFail -Quiet
$buildExitCode = if ($exitLine -match 'EXIT_CODE=(\d+)') { $Matches[1] } else { "1" }

if ($buildExitCode -ne "0") {
    Write-Err "Docker image build failed (exit code $buildExitCode)"
    Invoke-ServerCommand -Command "tail -50 $buildLogFile" -Description "Build log (last 50 lines):"
    exit 1
}
Write-Success "All images built successfully"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: Start stack
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "5/9" "Start OpenSILEX stack"

# Stop any existing stack first
Invoke-ServerCommand -Command "cd ~/$DeployDir && sudo docker compose --env-file opensilex.env down 2>/dev/null" -Description "Stopping any existing stack..." -NoFail

# Remove the first_install flag so system install runs fresh
Invoke-ServerCommand -Command "cd ~/$DeployDir && sudo docker volume rm ${ProjectPrefix}-stack_persist_opensilex 2>/dev/null" -NoFail

# Start the stack
Invoke-ServerCommand -Command "cd ~/$DeployDir && sudo docker compose --env-file opensilex.env up -d" -Description "Starting all services..."

# Wait for OpenSILEX to become ready
Write-Status "Waiting for OpenSILEX to start (this takes 1-3 minutes)..."

$maxAttempts = 36  # 36 * 10s = 6 minutes max
$attempt = 0
$ready = $false

while ($attempt -lt $maxAttempts -and -not $ready) {
    Start-Sleep -Seconds 10
    $attempt++

    $healthCheck = & ssh -i $PrivateKeyPath -o StrictHostKeyChecking=no "${AdminUsername}@${TargetIP}" "curl -s -o /dev/null -w '%{http_code}' http://localhost:${OpenSilexPort}/${ProjectPrefix}/app/ 2>/dev/null" 2>&1

    if ($healthCheck -match "200") {
        $ready = $true
    } else {
        $elapsed = $attempt * 10
        Write-Host "  Waiting... (${elapsed}s elapsed, status: $healthCheck)" -ForegroundColor Gray
    }
}

if (-not $ready) {
    Write-Err "OpenSILEX did not start within timeout"
    Write-Status "Check logs: ssh $AdminUsername@$TargetIP 'cd ~/$DeployDir && sudo docker compose --env-file opensilex.env logs opensilex'"
    exit 1
}

Write-Success "OpenSILEX is running and serving requests"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6: Configure Nginx reverse proxy
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "6/9" "Configure Nginx reverse proxy"

# Install nginx if not present
$nginxCheck = Invoke-ServerCommand -Command "which nginx 2>/dev/null && echo NGINX_FOUND || echo NGINX_MISSING" -NoFail -Quiet
if ($nginxCheck -notmatch "NGINX_FOUND") {
    Write-Status "Installing nginx..."
    Invoke-ServerCommand -Command "sudo apt-get update -qq && sudo apt-get install -y -qq nginx" -Quiet
    Write-Success "Nginx installed"
} else {
    Write-Success "Nginx already installed"
}

# SCP the nginx config template to server
$nginxConfigFile = Join-Path $ScriptDir "patches\nginx-opensilex.conf"
if (-not (Test-Path $nginxConfigFile)) {
    Write-Err "Nginx config template not found: $nginxConfigFile"
    exit 1
}

& scp -i $PrivateKeyPath -o StrictHostKeyChecking=no $nginxConfigFile "${AdminUsername}@${TargetIP}:~/nginx-opensilex.conf" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Err "Failed to copy nginx config to server"
    exit 1
}

# Replace placeholders and install the config
$nginxSetup = "sed -i 's|__OPENSILEX_PORT__|$OpenSilexPort|g' ~/nginx-opensilex.conf && sed -i 's|__SERVER_NAME__|$TargetIP|g' ~/nginx-opensilex.conf && sudo cp ~/nginx-opensilex.conf /etc/nginx/sites-available/opensilex && sudo ln -sf /etc/nginx/sites-available/opensilex /etc/nginx/sites-enabled/opensilex && sudo rm -f /etc/nginx/sites-enabled/default && rm ~/nginx-opensilex.conf"
Invoke-ServerCommand -Command $nginxSetup -Description "Configuring nginx reverse proxy..." -Quiet

# Test and reload nginx
$nginxTest = Invoke-ServerCommand -Command "sudo nginx -t 2>&1" -NoFail -Quiet
if ($LASTEXITCODE -ne 0) {
    Write-Err "Nginx configuration test failed"
    Write-Host $nginxTest
    exit 1
}
Invoke-ServerCommand -Command "sudo systemctl reload nginx 2>/dev/null || sudo systemctl start nginx" -Quiet

# Verify nginx is proxying correctly
Start-Sleep -Seconds 2
$nginxCheck = & ssh -i $PrivateKeyPath -o StrictHostKeyChecking=no "${AdminUsername}@${TargetIP}" "curl -s -o /dev/null -w '%{http_code}' http://localhost/${ProjectPrefix}/app/ 2>/dev/null" 2>&1
if ($nginxCheck -match "200") {
    Write-Success "Nginx reverse proxy active (port 80 -> $OpenSilexPort)"
} else {
    Write-Err "Nginx proxy verification failed (status: $nginxCheck)"
    Write-Status "Check: ssh $AdminUsername@$TargetIP 'sudo nginx -t && sudo journalctl -u nginx --no-pager -n 20'"
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 7: Create admin user
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "7/9" "Create admin user"

$userAddCmd = "cd ~/$DeployDir && sudo docker compose --env-file opensilex.env exec opensilex ./bin/opensilex.sh user add --admin --email=$AdminEmail --password=$AdminPassword --lang=en --CONFIG_FILE=/home/opensilex/config/opensilex.yml 2>&1"

$userResult = Invoke-ServerCommand -Command $userAddCmd -Description "Creating admin user ($AdminEmail)..." -NoFail

if ($userResult -match "User created") {
    Write-Success "Admin user created: $AdminEmail"
} elseif ($userResult -match "already exists") {
    Write-Success "Admin user already exists: $AdminEmail"
} else {
    Write-Host $userResult
    Write-Status "User creation returned unexpected output (may still be OK)"
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 7: Verify and report
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "8/9" "Verify deployment"

# Test authentication
Write-Status "Testing authentication..."
$authResult = & ssh -i $PrivateKeyPath -o StrictHostKeyChecking=no "${AdminUsername}@${TargetIP}" "curl -s http://localhost:${OpenSilexPort}/${ProjectPrefix}/rest/security/authenticate -X POST -H 'Content-Type: application/json' -d '{`"identifier`":`"$AdminEmail`",`"password`":`"$AdminPassword`"}' 2>&1"

if ($authResult -match '"token"') {
    Write-Success "Authentication verified -- JWT token received"
} else {
    Write-Err "Authentication test failed"
    Write-Host $authResult
}

# Show container status
Write-Status "Container status:"
Invoke-ServerCommand -Command "cd ~/$DeployDir && sudo docker compose --env-file opensilex.env ps" -NoFail

# ─────────────────────────────────────────────────────────────────────────────
# STEP 9: Feide auto-group assignment
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "9/9" "Feide auto-group assignment"

if ($FeideEnabled) {
    # Install Python, cron, and set up virtualenv
    Write-Status "Installing prerequisites (python3, cron)..."
    Invoke-ServerCommand -Command "sudo apt-get update -qq && sudo apt-get install -y -qq python3 python3-venv python3-pip cron" -Quiet
    Invoke-ServerCommand -Command "sudo systemctl enable cron && sudo systemctl start cron" -Quiet

    # Create directory and copy scripts
    Invoke-ServerCommand -Command "sudo mkdir -p /opt/opensilex-auto-groups && sudo chown ${AdminUsername}:${AdminUsername} /opt/opensilex-auto-groups" -Quiet

    $setupScript = Join-Path $ScriptDir "scripts\setup_groups.py"
    $monitorScript = Join-Path $ScriptDir "scripts\monitor_new_users.py"

    & scp -i $PrivateKeyPath -o StrictHostKeyChecking=no $setupScript $monitorScript "${AdminUsername}@${TargetIP}:/opt/opensilex-auto-groups/" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Failed to copy auto-group scripts to server"
        exit 1
    }

    # Create virtualenv and install requests
    $venvSetup = "cd /opt/opensilex-auto-groups && python3 -m venv venv 2>/dev/null && ./venv/bin/pip install -q requests 2>&1"
    Invoke-ServerCommand -Command $venvSetup -Description "Setting up Python virtualenv..." -Quiet

    # Run initial setup (create profiles and groups)
    $ApiUrl = "http://localhost:${OpenSilexPort}/${ProjectPrefix}/rest"
    $setupCmd = "cd /opt/opensilex-auto-groups && ./venv/bin/python setup_groups.py --api-url $ApiUrl --email $AdminEmail --password $AdminPassword"
    Write-Status "Creating profiles and groups..."
    Invoke-ServerCommand -Command $setupCmd

    # Create the monitor wrapper script (SCP approach avoids PowerShell/bash quoting issues)
    $RDF4JUrl = "http://localhost:${RDF4JPort}/rdf4j-server"
    $RepoName = "opensilex-docker-db"
    $wrapperContent = @"
#!/bin/bash
PIDFILE=/opt/opensilex-auto-groups/monitor.pid
LOGFILE=/opt/opensilex-auto-groups/monitor.log
if [ -f "`$PIDFILE" ] && kill -0 "`$(cat "`$PIDFILE")" 2>/dev/null; then
    exit 0
fi
cd /opt/opensilex-auto-groups
./venv/bin/python monitor_new_users.py --api-url $ApiUrl --rdf4j-url $RDF4JUrl --repo $RepoName --email $AdminEmail --password $AdminPassword >> "`$LOGFILE" 2>&1 &
echo `$! > "`$PIDFILE"
"@

    # Write wrapper to temp file and SCP it (avoids heredoc-through-SSH issues)
    $tempWrapper = Join-Path ([System.IO.Path]::GetTempPath()) "run_monitor.sh"
    $wrapperContent | Set-Content -Path $tempWrapper -Encoding utf8NoBOM -NoNewline
    # Fix line endings to Unix
    (Get-Content $tempWrapper -Raw) -replace "`r`n", "`n" | Set-Content -Path $tempWrapper -Encoding utf8NoBOM -NoNewline
    & scp -i $PrivateKeyPath -o StrictHostKeyChecking=no $tempWrapper "${AdminUsername}@${TargetIP}:/opt/opensilex-auto-groups/run_monitor.sh" 2>&1 | Out-Null
    Remove-Item $tempWrapper -ErrorAction SilentlyContinue

    Invoke-ServerCommand -Command "chmod +x /opt/opensilex-auto-groups/run_monitor.sh" -Quiet

    # Install cron job (idempotent: remove old entries first, then add)
    $cronSetup = "(crontab -l 2>/dev/null | grep -v 'opensilex-auto-groups') | crontab - && (crontab -l 2>/dev/null; echo '@reboot /opt/opensilex-auto-groups/run_monitor.sh'; echo '* * * * * /opt/opensilex-auto-groups/run_monitor.sh') | crontab -"
    Invoke-ServerCommand -Command $cronSetup -Description "Installing cron job for auto-group monitor..." -Quiet

    # Start the monitor now
    Invoke-ServerCommand -Command "/opt/opensilex-auto-groups/run_monitor.sh" -Quiet
    Write-Success "Auto-group monitor running (cron-managed)"
    Write-Success "Profiles: Administrator, Default User"
    Write-Success "Groups: Users (auto-assign), Administrators (manual)"
} else {
    Write-Status "Feide auto-groups: skipped (Feide not enabled)"
}

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host ("=" * 65) -ForegroundColor Green
Write-Host "  DEPLOYMENT COMPLETE" -ForegroundColor Green
Write-Host ("=" * 65) -ForegroundColor Green
Write-Host ""
Write-Status "Access Information:"
Write-Host ("-" * 65) -ForegroundColor Gray
Write-Success "OpenSILEX Web UI:    http://${TargetIP}/${ProjectPrefix}/app/"
Write-Success "OpenSILEX API Docs:  http://${TargetIP}/${ProjectPrefix}/api-docs"
Write-Success "Direct (no proxy):   http://${TargetIP}:${OpenSilexPort}/${ProjectPrefix}/app/"
Write-Success "RDF4J Workbench:     http://${TargetIP}:${RDF4JPort}/rdf4j-workbench/"
Write-Success "MongoDB Express:     http://${TargetIP}:${MongoExpressPort}/"
Write-Success "Admin Email:         $AdminEmail"
Write-Success "Admin Password:      $AdminPassword"
if ($FeideEnabled) {
    Write-Success "Feide Login:         Enabled (https://auth.dataporten.no)"
    Write-Success "Auto-Groups:         New users -> Users group (read-only)"
}
Write-Host ("-" * 65) -ForegroundColor Gray
Write-Host ""
Write-Status "Useful Commands:"
Write-Host "  View logs:     ssh $AdminUsername@$TargetIP 'cd ~/$DeployDir && sudo docker compose --env-file opensilex.env logs -f opensilex'" -ForegroundColor Gray
Write-Host "  Stop stack:    ssh $AdminUsername@$TargetIP 'cd ~/$DeployDir && sudo docker compose --env-file opensilex.env down'" -ForegroundColor Gray
Write-Host "  Start stack:   ssh $AdminUsername@$TargetIP 'cd ~/$DeployDir && sudo docker compose --env-file opensilex.env up -d'" -ForegroundColor Gray
Write-Host "  Restart:       ssh $AdminUsername@$TargetIP 'cd ~/$DeployDir && sudo docker compose --env-file opensilex.env restart opensilex'" -ForegroundColor Gray
Write-Host ""
