#!/usr/bin/env pwsh
<#
.SYNOPSIS
    One-Click OpenSILEX Docker Deployment

.DESCRIPTION
    This script deploys OpenSILEX using Docker to a target server.
    It performs the complete installation process:
    - Copies deployment files to the server
    - Installs Docker (if needed)
    - Builds and deploys the OpenSILEX stack
    - Initializes the system
    - Creates admin user

.PARAMETER TargetIP
    The IP address of the target server

.PARAMETER AdminUsername
    The SSH username for the target server (default: azureuser)

.PARAMETER PrivateKeyPath
    Path to SSH private key (default: ~/.ssh/id_rsa)

.PARAMETER AdminEmail
    OpenSILEX admin email (default: admin@opensilex.org)

.PARAMETER AdminPassword
    OpenSILEX admin password (default: admin)

.EXAMPLE
    .\deploy-opensilex-docker.ps1 -TargetIP 108.143.82.78

.EXAMPLE
    .\deploy-opensilex-docker.ps1 -TargetIP 108.143.82.78 -AdminEmail "admin@example.com" -AdminPassword "SecurePass123"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$TargetIP,

    [Parameter(Mandatory=$false)]
    [string]$AdminUsername = "azureuser",

    [Parameter(Mandatory=$false)]
    [string]$PrivateKeyPath = "~/.ssh/id_rsa",

    [Parameter(Mandatory=$false)]
    [string]$AdminEmail = "admin@opensilex.org",

    [Parameter(Mandatory=$false)]
    [string]$AdminPassword = "admin"
)

# Color output functions
function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Write-Warning-Custom {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

# Banner
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
     ++:+++.``   .++          DOCKER DEPLOYMENT
      ``````````````

"@ -ForegroundColor Cyan

Write-Status "Starting OpenSILEX Docker deployment to $TargetIP"
Write-Host ""

# Expand paths
$PrivateKeyPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($PrivateKeyPath)

# Verify private key exists
if (-not (Test-Path $PrivateKeyPath)) {
    Write-Error-Custom "Private key not found: $PrivateKeyPath"
    exit 1
}

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Verify deployment files exist
$RequiredFiles = @("Dockerfile", "docker-compose.yml", "install-opensilex-docker.sh")
foreach ($file in $RequiredFiles) {
    if (-not (Test-Path (Join-Path $ScriptDir $file))) {
        Write-Error-Custom "Required file not found: $file"
        Write-Error-Custom "Please run this script from the docker-deployment directory"
        exit 1
    }
}

Write-Success "All deployment files found"

################################################################################
# STEP 1: Copy deployment files to server
################################################################################

Write-Host ""
Write-Status "═══════════════════════════════════════════════════════════"
Write-Status "STEP 1/3: Copying deployment files to server"
Write-Status "═══════════════════════════════════════════════════════════"

# Create temporary deployment package
$TempDir = Join-Path $env:TEMP "opensilex-docker-deploy"
if (Test-Path $TempDir) {
    Remove-Item -Path $TempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $TempDir | Out-Null

Write-Status "Preparing deployment package..."
Copy-Item -Path (Join-Path $ScriptDir "*") -Destination $TempDir -Recurse
Write-Success "Package prepared: $TempDir"

Write-Status "Copying files to $TargetIP..."
$SshOptions = "-i `"$PrivateKeyPath`" -o StrictHostKeyChecking=no"

# Copy entire directory
& scp -r $SshOptions "$TempDir" "${AdminUsername}@${TargetIP}:~/docker-deployment"

if ($LASTEXITCODE -ne 0) {
    Write-Error-Custom "Failed to copy files to server"
    exit 1
}

Write-Success "Files copied successfully"

################################################################################
# STEP 2: Run installation script on server
################################################################################

Write-Host ""
Write-Status "═══════════════════════════════════════════════════════════"
Write-Status "STEP 2/3: Running installation on server"
Write-Status "═══════════════════════════════════════════════════════════"
Write-Warning-Custom "This will take 15-20 minutes (building OpenSILEX from source)"
Write-Host ""

$InstallCommand = @"
export ADMIN_EMAIL='$AdminEmail'
export ADMIN_PASSWORD='$AdminPassword'
cd ~/docker-deployment
sudo -E bash install-opensilex-docker.sh
"@

Write-Status "Starting installation..."
& ssh $SshOptions "${AdminUsername}@${TargetIP}" $InstallCommand

if ($LASTEXITCODE -ne 0) {
    Write-Error-Custom "Installation failed"
    Write-Status "Check logs on server: docker compose -f /opt/opensilex-docker/docker-compose.yml logs"
    exit 1
}

################################################################################
# STEP 3: Verify installation
################################################################################

Write-Host ""
Write-Status "═══════════════════════════════════════════════════════════"
Write-Status "STEP 3/3: Verifying installation"
Write-Status "═══════════════════════════════════════════════════════════"

Write-Status "Checking service status..."
& ssh $SshOptions "${AdminUsername}@${TargetIP}" "docker compose -f /opt/opensilex-docker/docker-compose.yml ps"

Write-Host ""
Write-Success "═══════════════════════════════════════════════════════════"
Write-Success "  DEPLOYMENT COMPLETE!"
Write-Success "═══════════════════════════════════════════════════════════"
Write-Host ""
Write-Status "Access Information:"
Write-Status "───────────────────────────────────────────────────────────"
Write-Success "OpenSILEX URL:  http://$TargetIP:8666"
Write-Success "GraphDB URL:    http://$TargetIP:7200"
Write-Success "Admin Email:    $AdminEmail"
Write-Success "Admin Password: $AdminPassword"
Write-Status "───────────────────────────────────────────────────────────"
Write-Host ""
Write-Status "Useful Commands:"
Write-Host "  View logs:        ssh $AdminUsername@$TargetIP 'docker compose -f /opt/opensilex-docker/docker-compose.yml logs -f'" -ForegroundColor Gray
Write-Host "  Stop services:    ssh $AdminUsername@$TargetIP 'docker compose -f /opt/opensilex-docker/docker-compose.yml down'" -ForegroundColor Gray
Write-Host "  Start services:   ssh $AdminUsername@$TargetIP 'docker compose -f /opt/opensilex-docker/docker-compose.yml up -d'" -ForegroundColor Gray
Write-Host "  Restart service:  ssh $AdminUsername@$TargetIP 'docker compose -f /opt/opensilex-docker/docker-compose.yml restart opensilex'" -ForegroundColor Gray
Write-Host ""
Write-Success "🎉 Your OpenSILEX instance is ready to use!"
Write-Host ""

# Cleanup
Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
