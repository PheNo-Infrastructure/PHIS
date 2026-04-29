#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy pre-built patched OpenSILEX image to a remote server

.DESCRIPTION
    Pulls the pre-built patched OpenSILEX image from GitHub Container Registry
    and deploys it. Build the image first via GitHub Actions:
        GitHub → Actions → Build Patched OpenSILEX → Run workflow

    The image is built by .github/workflows/build-opensilex.yml which:
    - Clones opensilex-docker-compose
    - Applies all .patch files from tools/docker-deployment/patches/
    - Compiles with Maven on GitHub-hosted runners (no load on target server)
    - Pushes the patched image to ghcr.io

.PARAMETER Server
    Server IP or hostname

.PARAMETER User
    SSH user (default: azureuser)

.PARAMETER SSHKey
    Path to SSH private key (default: ~/.ssh/id_ed25519)

.PARAMETER PatchedImage
    Full image reference from ghcr.io.
    e.g. ghcr.io/siv017/opensilex-phis:latest
    Build this via GitHub Actions before running this script.

.PARAMETER SkipRebuild
    Skip pulling and restarting the container (only configure Feide)

.PARAMETER ApiKeysFile
    Path to API keys config file with FEIDE_CLIENT_ID and FEIDE_CLIENT_SECRET.

.EXAMPLE
    .\03-apply-patches.ps1 -Server 108.143.24.11 -PatchedImage ghcr.io/siv017/opensilex-phis:latest

.EXAMPLE
    .\03-apply-patches.ps1 -Server 108.143.24.11 -PatchedImage ghcr.io/siv017/opensilex-phis:latest -ApiKeysFile ..\config\api-keys-sandbox.conf
#>

param(
    [string]$Server = "20.61.108.197",
    [string]$User = "azureuser",
    [string]$SSHKey = "~/.ssh/id_ed25519",
    [string]$PatchedImage = "",
    [switch]$SkipRebuild,
    [string]$ApiKeysFile = ""
)

$ErrorActionPreference = "Stop"

# Resolve paths
$SSHKey = Resolve-Path $SSHKey -ErrorAction Stop
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PatchesDir = Join-Path $ScriptDir "patches"
$FeideConfigFile = Join-Path $PatchesDir "feide-openid-config.yml"
$RemoteDeployDir = "~/opensilex-docker-compose"

# ─────────────────────────────────────────────────────────────────────────────
# Load Feide credentials from API keys file (if provided)
# ─────────────────────────────────────────────────────────────────────────────

$FeideEnabled = $false
$FeideClientID = ""
$FeideClientSecret = ""

if ($ApiKeysFile) {
    if ($ApiKeysFile -match '^~') {
        $ApiKeysFile = $ApiKeysFile -replace '^~', $env:USERPROFILE
    }
    if (-not [System.IO.Path]::IsPathRooted($ApiKeysFile)) {
        $ApiKeysFile = Join-Path $ScriptDir $ApiKeysFile
    }
    $ApiKeysFile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ApiKeysFile)

    if (Test-Path $ApiKeysFile) {
        Get-Content $ApiKeysFile | ForEach-Object {
            if ($_ -match '^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$' -and $_ -notmatch '^\s*#') {
                $key = $Matches[1]; $val = $Matches[2]
                switch ($key) {
                    "FEIDE_CLIENT_ID"     { $FeideClientID = $val }
                    "FEIDE_CLIENT_SECRET" { $FeideClientSecret = $val }
                }
            }
        }
        if ($FeideClientID -and $FeideClientSecret) { $FeideEnabled = $true }
    } else {
        Write-Host "WARNING: API keys file not found: $ApiKeysFile" -ForegroundColor Yellow
        Write-Host "         Continuing without Feide authentication" -ForegroundColor Yellow
        Write-Host ""
    }
}

Write-Host "=== OpenSILEX Patch Deployment ===" -ForegroundColor Cyan
Write-Host "Server: $Server" -ForegroundColor Gray
Write-Host "Image:  $(if ($PatchedImage) { $PatchedImage } else { '(none — use -SkipRebuild or provide -PatchedImage)' })" -ForegroundColor Gray
Write-Host "Feide:  $(if ($FeideEnabled) { 'enabled' } else { 'disabled' })" -ForegroundColor Gray
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Test SSH connectivity
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "[1/3] Testing SSH connectivity..." -ForegroundColor Yellow

$SSHTest = ssh -i $SSHKey -o BatchMode=yes -o ConnectTimeout=5 "$User@$Server" "echo OK" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "SSH connection failed. Error: $SSHTest"
    Write-Host "Hint: Run 'ssh-keygen -R $Server' if host key changed" -ForegroundColor Yellow
    Write-Host "Hint: If server is overloaded from a prior interrupted build, use:" -ForegroundColor Yellow
    Write-Host "      az vm run-command invoke --resource-group <RG> --name <VM> --command-id RunShellScript --scripts 'sudo pkill -9 -f java; sudo systemctl restart docker'" -ForegroundColor Gray
    exit 1
}

Write-Host "  ✓ SSH connection successful" -ForegroundColor Green
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Configure Feide/OpenID Connect (optional)
# ─────────────────────────────────────────────────────────────────────────────

if ($FeideEnabled) {
    Write-Host "[2/3] Configuring Feide/OpenID Connect authentication..." -ForegroundColor Yellow

    $EnvFileCheckCmd = "cd $RemoteDeployDir && if [ -f opensilex.env ]; then echo 'opensilex.env'; elif [ -f .env ]; then echo '.env'; else echo 'NONE'; fi"
    $EnvFile = ssh -i $SSHKey "$User@$Server" $EnvFileCheckCmd 2>&1 | Select-Object -Last 1

    if ($EnvFile -eq "NONE") {
        Write-Host "  WARNING: No env file found. Skipping Feide configuration." -ForegroundColor Yellow
    } else {
        $CheckFeideCmd = "cd $RemoteDeployDir && grep -q 'FEIDE_CLIENT_ID' $EnvFile && echo 'EXISTS' || echo 'NOT_FOUND'"
        $FeideExists = ssh -i $SSHKey "$User@$Server" $CheckFeideCmd 2>&1 | Select-Object -Last 1

        if ($FeideExists -eq "EXISTS") {
            $UpdateFeideCmd = "cd $RemoteDeployDir && " +
                              "sed -i 's|^FEIDE_CLIENT_ID=.*|FEIDE_CLIENT_ID=$FeideClientID|' $EnvFile && " +
                              "sed -i 's|^FEIDE_CLIENT_SECRET=.*|FEIDE_CLIENT_SECRET=$FeideClientSecret|' $EnvFile"
            ssh -i $SSHKey "$User@$Server" $UpdateFeideCmd 2>&1 | Out-Null
            Write-Host "  ✓ Updated Feide credentials in $EnvFile" -ForegroundColor Green
        } else {
            $AddFeideCmd = "cd $RemoteDeployDir && cat >> $EnvFile << 'EOF'

# Feide/Dataporten OpenID Connect
FEIDE_CLIENT_ID=$FeideClientID
FEIDE_CLIENT_SECRET=$FeideClientSecret
EOF"
            ssh -i $SSHKey "$User@$Server" $AddFeideCmd 2>&1 | Out-Null
            Write-Host "  ✓ Added Feide credentials to $EnvFile" -ForegroundColor Green
        }

        if ($EnvFile -eq ".env") {
            ssh -i $SSHKey "$User@$Server" "cd $RemoteDeployDir && cp .env opensilex.env" 2>&1 | Out-Null
            Write-Host "  ✓ Synced to opensilex.env" -ForegroundColor Green
        }

        $CheckConfigCmd = "cd $RemoteDeployDir/config && grep -q 'Feide/Dataporten OpenID' opensilex-custom-config.yml && echo 'EXISTS' || echo 'NOT_FOUND'"
        $ConfigExists = ssh -i $SSHKey "$User@$Server" $CheckConfigCmd 2>&1 | Select-Object -Last 1

        if ($ConfigExists -eq "NOT_FOUND") {
            if (Test-Path $FeideConfigFile) {
                scp -i $SSHKey $FeideConfigFile "${User}@${Server}:${RemoteDeployDir}/config/feide-temp.yml" 2>&1 | Out-Null
                $AppendConfigCmd = "cd $RemoteDeployDir/config && echo '' >> opensilex-custom-config.yml && cat feide-temp.yml >> opensilex-custom-config.yml && rm feide-temp.yml"
                ssh -i $SSHKey "$User@$Server" $AppendConfigCmd 2>&1 | Out-Null
                Write-Host "  ✓ Appended Feide OpenID config" -ForegroundColor Green
            } else {
                Write-Host "  WARNING: feide-openid-config.yml not found at $FeideConfigFile" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  ✓ Feide config already present" -ForegroundColor Green
        }
    }
    Write-Host ""
} else {
    Write-Host "[2/3] Skipping Feide configuration (no credentials provided)" -ForegroundColor Yellow
    Write-Host ""
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Pull and deploy patched image
# ─────────────────────────────────────────────────────────────────────────────

if (-not $SkipRebuild) {
    if (-not $PatchedImage) {
        Write-Error "PatchedImage is required. Build the image first via GitHub Actions, then pass -PatchedImage ghcr.io/owner/opensilex-phis:latest"
        exit 1
    }

    Write-Host "[3/3] Deploying patched image..." -ForegroundColor Yellow
    Write-Host "  $PatchedImage" -ForegroundColor Gray
    Write-Host ""

    # Pull pre-built image from ghcr.io
    Write-Host "  Pulling image..." -ForegroundColor Gray
    ssh -i $SSHKey "$User@$Server" "docker pull $PatchedImage"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to pull $PatchedImage. Ensure the GitHub Actions build completed and the image is public."
        exit 1
    }
    Write-Host "  ✓ Image pulled" -ForegroundColor Green

    # Write docker-compose.override.yml to use the ghcr.io image instead of building locally
    $OverrideCmd = "printf 'services:\n  opensilex:\n    image: $PatchedImage\n' > $RemoteDeployDir/docker-compose.override.yml"
    ssh -i $SSHKey "$User@$Server" $OverrideCmd
    Write-Host "  ✓ Created docker-compose.override.yml" -ForegroundColor Green

    # Restart opensilex with the new image
    $DockerBase = "docker compose --env-file opensilex.env"
    if ($FeideEnabled) {
        $RestartCmd = "cd $RemoteDeployDir && $DockerBase down opensilex && $DockerBase up -d opensilex"
    } else {
        $RestartCmd = "cd $RemoteDeployDir && $DockerBase stop opensilex && $DockerBase up -d opensilex"
    }
    ssh -i $SSHKey "$User@$Server" $RestartCmd
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to restart OpenSILEX. Check: ssh $User@$Server 'docker compose -f $RemoteDeployDir/docker-compose.yml logs opensilex'"
        exit 1
    }
    Write-Host "  ✓ Container restarted with patched image" -ForegroundColor Green
    Write-Host ""

    # Wait for OpenSILEX to start and create the default Users group
    Write-Host "  Waiting for OpenSILEX to be ready (max 3 minutes)..." -ForegroundColor Gray

    $CreateGroupCmd = @'
#!/bin/bash
OPENSILEX_URL="http://localhost/sandbox"
ADMIN_EMAIL="admin@opensilex.org"
ADMIN_PASSWORD="admin"
MAX_WAIT=180

for i in $(seq 1 $MAX_WAIT); do
    if curl -sf "$OPENSILEX_URL/" >/dev/null 2>&1; then
        echo "  OpenSILEX is ready"
        break
    fi
    if [ $i -eq $MAX_WAIT ]; then
        echo "ERROR: OpenSILEX did not start within $MAX_WAIT seconds"
        exit 1
    fi
    sleep 1
done

AUTH_RESPONSE=$(curl -sf -X POST "$OPENSILEX_URL/rest/security/authenticate" \
  -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

TOKEN=$(echo "$AUTH_RESPONSE" | sed -n 's/.*"token"\s*:\s*"\([^"]*\)".*/\1/p')

if [ -z "$TOKEN" ]; then
    echo "ERROR: Failed to authenticate"
    exit 1
fi

EXISTING=$(curl -sf -X GET "$OPENSILEX_URL/rest/security/groups?name=Users" \
  -H "Authorization: Bearer $TOKEN")

if echo "$EXISTING" | grep -q '"name"\s*:\s*"Users"'; then
    echo "  ✓ Users group already exists"
    exit 0
fi

PROFILE_URI=$(curl -sf -X GET "$OPENSILEX_URL/rest/security/profiles?name=Default%20profile" \
  -H "Authorization: Bearer $TOKEN" | sed -n 's/.*"uri"\s*:\s*"\([^"]*\)".*/\1/p' | head -1)

if [ -z "$PROFILE_URI" ]; then
    echo "ERROR: Default profile not found"
    exit 1
fi

RESPONSE=$(curl -sf -X POST "$OPENSILEX_URL/rest/security/groups" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"Users\", \"description\": \"Default group for all users\", \"user_profiles\": []}")

if echo "$RESPONSE" | grep -q '"result"'; then
    echo "  ✓ Created Users group"
else
    echo "ERROR: Failed to create Users group: $RESPONSE"
    exit 1
fi
'@

    $CreateGroupCmd = $CreateGroupCmd -replace "`r`n", "`n"
    $CreateGroupResult = ssh -i $SSHKey "$User@$Server" $CreateGroupCmd 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Default group setup complete" -ForegroundColor Green
    } else {
        Write-Host "  WARNING: Failed to create Users group automatically" -ForegroundColor Yellow
        Write-Host "  Create it manually in the UI under Security → Groups" -ForegroundColor Yellow
        Write-Host "  Error: $CreateGroupResult" -ForegroundColor Gray
    }

    Write-Host ""
    Write-Host "  ✓ Patched image deployed successfully" -ForegroundColor Green
    if ($FeideEnabled) {
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "  1. Test Feide login button appears in UI" -ForegroundColor Gray
        Write-Host "  2. Test auto-group assignment with new Feide user" -ForegroundColor Gray
    }
} else {
    Write-Host "[3/3] Skipping image pull (-SkipRebuild flag used)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Feide configuration applied. Run without -SkipRebuild to deploy the patched image." -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=== Complete ===" -ForegroundColor Cyan
