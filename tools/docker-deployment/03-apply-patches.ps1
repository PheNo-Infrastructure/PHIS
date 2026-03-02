#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Apply OpenSILEX source patches to remote server deployment

.DESCRIPTION
    This script automates the process of deploying OpenSILEX with source-level patches:
    1. Backs up the vanilla Dockerfile on the server
    2. Uploads the source-build Dockerfile (with patch support)
    3. Uploads all .patch files to the server
    4. Rebuilds the OpenSILEX container with patches applied (by default)

.PARAMETER Server
    Server IP or hostname (default: 20.61.108.197)

.PARAMETER User
    SSH user (default: azureuser)

.PARAMETER SSHKey
    Path to SSH private key (default: ~/.ssh/id_ed25519)

.PARAMETER SkipRebuild
    Skip rebuilding the container after uploading patches (just upload files)

.PARAMETER ApiKeysFile
    Path to API keys config file containing FEIDE_CLIENT_ID and FEIDE_CLIENT_SECRET.
    If provided and contains Feide credentials, OpenID Connect login will be configured.
    Default: ../config/test-api-keys.conf

.EXAMPLE
    .\03-apply-patches.ps1
    Upload patches and rebuild container (default behavior)

.EXAMPLE
    .\03-apply-patches.ps1 -SkipRebuild
    Upload patches without rebuilding

.EXAMPLE
    .\03-apply-patches.ps1 -ApiKeysFile ..\config\test-api-keys.conf
    Upload patches, configure Feide authentication, and rebuild
#>

param(
    [string]$Server = "20.61.108.197",
    [string]$User = "azureuser",
    [string]$SSHKey = "~/.ssh/id_ed25519",
    [switch]$SkipRebuild,
    [string]$ApiKeysFile = ""
)

# Resolve paths
$SSHKey = Resolve-Path $SSHKey -ErrorAction Stop
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PatchesDir = Join-Path $ScriptDir "patches"
$SourceBuildDockerfile = Join-Path $PatchesDir "opensilex-build-step.docker"
$FeideConfigFile = Join-Path $PatchesDir "feide-openid-config.yml"

# Remote paths
$RemoteDeployDir = "~/opensilex-docker-compose"
$RemotePatchesDir = "$RemoteDeployDir/patches"
$RemoteDockerfile = "$RemoteDeployDir/opensilex-build-step.docker"

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
        Write-Host "WARNING: API keys file not found: $ApiKeysFile" -ForegroundColor Yellow
        Write-Host "         Continuing without Feide authentication" -ForegroundColor Yellow
        Write-Host ""
    }
}

Write-Host "=== OpenSILEX Patch Deployment Script ===" -ForegroundColor Cyan
Write-Host "Server: $Server" -ForegroundColor Gray
Write-Host "User: $User" -ForegroundColor Gray
Write-Host ""

# Step 1: Verify local files exist
Write-Host "[1/5] Verifying local files..." -ForegroundColor Yellow

if (-not (Test-Path $SourceBuildDockerfile)) {
    Write-Error "Source-build Dockerfile not found: $SourceBuildDockerfile"
    exit 1
}

$PatchFiles = Get-ChildItem -Path $PatchesDir -Filter "*.patch"
if ($PatchFiles.Count -eq 0) {
    Write-Error "No .patch files found in: $PatchesDir"
    exit 1
}

Write-Host "  ✓ Found source-build Dockerfile" -ForegroundColor Green
Write-Host "  ✓ Found $($PatchFiles.Count) patch file(s):" -ForegroundColor Green
foreach ($patch in $PatchFiles) {
    Write-Host "    - $($patch.Name)" -ForegroundColor Gray
}
Write-Host ""

# Step 2: Test SSH connectivity
Write-Host "[2/5] Testing SSH connectivity..." -ForegroundColor Yellow

$SSHTest = ssh -i $SSHKey -o BatchMode=yes -o ConnectTimeout=5 "$User@$Server" "echo OK" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "SSH connection failed. Error: $SSHTest"
    Write-Host "Hint: Run 'ssh-keygen -R $Server' if host key changed" -ForegroundColor Yellow
    exit 1
}

Write-Host "  ✓ SSH connection successful" -ForegroundColor Green
Write-Host ""

# Step 3: Backup vanilla Dockerfile on server
Write-Host "[3/5] Backing up vanilla Dockerfile on server..." -ForegroundColor Yellow

$BackupCmd = "cd $RemoteDeployDir && " +
             "if [ ! -f opensilex-build-step.docker.vanilla ]; then " +
             "  cp opensilex-build-step.docker opensilex-build-step.docker.vanilla && " +
             "  echo 'BACKED_UP'; " +
             "else " +
             "  echo 'ALREADY_EXISTS'; " +
             "fi"

$BackupResult = ssh -i $SSHKey "$User@$Server" $BackupCmd 2>&1

if ($BackupResult -match "BACKED_UP") {
    Write-Host "  ✓ Vanilla Dockerfile backed up" -ForegroundColor Green
} elseif ($BackupResult -match "ALREADY_EXISTS") {
    Write-Host "  ✓ Backup already exists (skipping)" -ForegroundColor Green
} else {
    Write-Error "Failed to backup Dockerfile: $BackupResult"
    exit 1
}
Write-Host ""

# Step 4: Upload source-build Dockerfile and patches
Write-Host "[4/5] Uploading source-build Dockerfile and patches..." -ForegroundColor Yellow

# Clean up old patches directory and recreate fresh (prevents accumulation of renamed/removed patches)
ssh -i $SSHKey "$User@$Server" "rm -rf $RemotePatchesDir && mkdir -p $RemotePatchesDir" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create patches directory on server"
    exit 1
}

# Upload source-build Dockerfile
scp -i $SSHKey $SourceBuildDockerfile "${User}@${Server}:${RemoteDockerfile}" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to upload source-build Dockerfile"
    exit 1
}
Write-Host "  ✓ Uploaded source-build Dockerfile" -ForegroundColor Green

# Upload each patch file
foreach ($patch in $PatchFiles) {
    scp -i $SSHKey $patch.FullName "${User}@${Server}:${RemotePatchesDir}/" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to upload patch: $($patch.Name)"
        exit 1
    }
    Write-Host "  ✓ Uploaded $($patch.Name)" -ForegroundColor Green
}
Write-Host ""

# Step 5: Configure Feide/OpenID Connect (optional)
if ($FeideEnabled) {
    Write-Host "[5/6] Configuring Feide/OpenID Connect authentication..." -ForegroundColor Yellow

    # Detect which env file to update
    $EnvFileCheckCmd = "cd $RemoteDeployDir && " +
                       "if [ -f opensilex.env ]; then echo 'opensilex.env'; elif [ -f .env ]; then echo '.env'; else echo 'NONE'; fi"

    $EnvFile = ssh -i $SSHKey "$User@$Server" $EnvFileCheckCmd 2>&1 | Select-Object -Last 1

    if ($EnvFile -eq "NONE") {
        Write-Host "  WARNING: No env file found on server. Skipping Feide configuration." -ForegroundColor Yellow
    } else {
        # Check if Feide credentials already exist in env file
        $CheckFeideCmd = "cd $RemoteDeployDir && grep -q 'FEIDE_CLIENT_ID' $EnvFile && echo 'EXISTS' || echo 'NOT_FOUND'"
        $FeideExists = ssh -i $SSHKey "$User@$Server" $CheckFeideCmd 2>&1 | Select-Object -Last 1

        if ($FeideExists -eq "EXISTS") {
            # Update existing Feide credentials
            $UpdateFeideCmd = "cd $RemoteDeployDir && " +
                            "sed -i 's|^FEIDE_CLIENT_ID=.*|FEIDE_CLIENT_ID=$FeideClientID|' $EnvFile && " +
                            "sed -i 's|^FEIDE_CLIENT_SECRET=.*|FEIDE_CLIENT_SECRET=$FeideClientSecret|' $EnvFile"
            ssh -i $SSHKey "$User@$Server" $UpdateFeideCmd 2>&1 | Out-Null
            Write-Host "  ✓ Updated Feide credentials in $EnvFile" -ForegroundColor Green
        } else {
            # Add Feide credentials to env file
            $AddFeideCmd = "cd $RemoteDeployDir && cat >> $EnvFile << 'EOF'

# Feide/Dataporten OpenID Connect
FEIDE_CLIENT_ID=$FeideClientID
FEIDE_CLIENT_SECRET=$FeideClientSecret
EOF"
            ssh -i $SSHKey "$User@$Server" $AddFeideCmd 2>&1 | Out-Null
            Write-Host "  ✓ Added Feide credentials to $EnvFile" -ForegroundColor Green
        }

        # Sync to opensilex.env if using .env (docker-compose.yml hardcodes opensilex.env)
        if ($EnvFile -eq ".env") {
            ssh -i $SSHKey "$User@$Server" "cd $RemoteDeployDir && cp .env opensilex.env" 2>&1 | Out-Null
            Write-Host "  ✓ Synced to opensilex.env (required by docker-compose.yml)" -ForegroundColor Green
        }

        # Check if Feide config already appended to custom config
        $CheckConfigCmd = "cd $RemoteDeployDir/config && grep -q 'Feide/Dataporten OpenID' opensilex-custom-config.yml && echo 'EXISTS' || echo 'NOT_FOUND'"
        $ConfigExists = ssh -i $SSHKey "$User@$Server" $CheckConfigCmd 2>&1 | Select-Object -Last 1

        if ($ConfigExists -eq "NOT_FOUND") {
            # Upload and append Feide OpenID config
            if (Test-Path $FeideConfigFile) {
                scp -i $SSHKey $FeideConfigFile "${User}@${Server}:${RemoteDeployDir}/config/feide-temp.yml" 2>&1 | Out-Null
                $AppendConfigCmd = "cd $RemoteDeployDir/config && " +
                                 "echo '' >> opensilex-custom-config.yml && " +
                                 "cat feide-temp.yml >> opensilex-custom-config.yml && " +
                                 "rm feide-temp.yml"
                ssh -i $SSHKey "$User@$Server" $AppendConfigCmd 2>&1 | Out-Null
                Write-Host "  ✓ Appended Feide OpenID config to opensilex-custom-config.yml" -ForegroundColor Green
            } else {
                Write-Host "  WARNING: feide-openid-config.yml not found at $FeideConfigFile" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  ✓ Feide config already exists in opensilex-custom-config.yml" -ForegroundColor Green
        }
    }
    Write-Host ""
} else {
    Write-Host "[5/6] Skipping Feide configuration (no credentials provided)" -ForegroundColor Yellow
    Write-Host ""
}

# Step 6: Rebuild (default behavior, skip only if -SkipRebuild flag used)
if (-not $SkipRebuild) {
    Write-Host "[6/6] Rebuilding OpenSILEX container with patches..." -ForegroundColor Yellow
    Write-Host "  This will take 15-20 minutes (Maven build from source)" -ForegroundColor Gray
    Write-Host ""

    # Detect which env file exists on server
    $EnvFileCheckCmd = "cd $RemoteDeployDir && " +
                       "if [ -f .env ]; then echo '.env'; elif [ -f opensilex.env ]; then echo 'opensilex.env'; else echo 'NONE'; fi"

    $EnvFile = ssh -i $SSHKey "$User@$Server" $EnvFileCheckCmd 2>&1 | Select-Object -Last 1

    if ($EnvFile -eq "NONE") {
        Write-Error "No env file found on server (.env or opensilex.env). Cannot proceed with rebuild."
        exit 1
    }

    Write-Host "  Using env file: $EnvFile" -ForegroundColor Gray

    # If using .env, ensure opensilex.env also exists (docker-compose.yml hardcodes it)
    if ($EnvFile -eq ".env") {
        ssh -i $SSHKey "$User@$Server" "cd $RemoteDeployDir && cp .env opensilex.env" 2>&1 | Out-Null
        Write-Host "  Created opensilex.env from .env (required by docker-compose.yml)" -ForegroundColor Gray
    }

    # Build docker-compose command
    $DockerComposeBase = "docker compose --env-file opensilex.env"

    # If Feide is enabled, use down/up to reload env vars (restart doesn't reload env_file)
    if ($FeideEnabled) {
        Write-Host "  Using down/up to reload Feide environment variables" -ForegroundColor Gray
        $RebuildCmd = "cd $RemoteDeployDir && " +
                      "$DockerComposeBase down opensilex && " +
                      "$DockerComposeBase build --build-arg UID=1001 --build-arg GID=1001 opensilex && " +
                      "$DockerComposeBase up -d opensilex"
    } else {
        $RebuildCmd = "cd $RemoteDeployDir && " +
                      "$DockerComposeBase stop opensilex && " +
                      "$DockerComposeBase build --build-arg UID=1001 --build-arg GID=1001 opensilex && " +
                      "$DockerComposeBase up -d opensilex"
    }

    ssh -i $SSHKey "$User@$Server" $RebuildCmd

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "  ✓ Rebuild complete" -ForegroundColor Green
        Write-Host ""

        # Create default Users group via API
        Write-Host "Creating default 'Users' group for auto-assignment..." -ForegroundColor Yellow
        Write-Host "  Waiting for OpenSILEX to be ready (max 3 minutes)..." -ForegroundColor Gray

        $CreateGroupCmd = @'
#!/bin/bash
OPENSILEX_URL="http://localhost/sandbox"
ADMIN_EMAIL="admin@opensilex.org"
ADMIN_PASSWORD="admin"
MAX_WAIT=180

# Wait for OpenSILEX to be ready
echo "  Waiting for OpenSILEX..."
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

# Authenticate as admin
echo "  Authenticating..."
TOKEN=$(curl -sf -X POST "$OPENSILEX_URL/rest/security/authenticate" \
  -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "ERROR: Failed to authenticate"
    exit 1
fi

# Check if Users group already exists
EXISTING_GROUP=$(curl -sf -X GET "$OPENSILEX_URL/rest/security/groups?name=Users" \
  -H "Authorization: Bearer $TOKEN" | grep -o '"name":"Users"')

if [ -n "$EXISTING_GROUP" ]; then
    echo "  ✓ Users group already exists"
    exit 0
fi

# Get Default profile URI
PROFILE_URI=$(curl -sf -X GET "$OPENSILEX_URL/rest/security/profiles?name=Default%20profile" \
  -H "Authorization: Bearer $TOKEN" | \
  grep -o '"uri":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$PROFILE_URI" ]; then
    echo "ERROR: Default profile not found"
    exit 1
fi

# Create Users group with Default profile
RESPONSE=$(curl -sf -X POST "$OPENSILEX_URL/rest/security/groups" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Users\",
    \"description\": \"Default group for all users\",
    \"user_profiles\": []
  }")

if echo "$RESPONSE" | grep -q '"uri"'; then
    echo "  ✓ Created Users group"
else
    echo "ERROR: Failed to create Users group"
    echo "$RESPONSE"
    exit 1
fi
'@

        # Execute group creation script on server
        $CreateGroupResult = ssh -i $SSHKey "$User@$Server" $CreateGroupCmd 2>&1

        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Default group setup complete" -ForegroundColor Green
        } else {
            Write-Host "  WARNING: Failed to create Users group automatically" -ForegroundColor Yellow
            Write-Host "  You may need to create it manually in the UI" -ForegroundColor Yellow
            Write-Host "  Error: $CreateGroupResult" -ForegroundColor Gray
        }

        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "  1. Check logs: docker compose logs -f opensilex" -ForegroundColor Gray
        Write-Host "  2. Test Groups API to verify GroupDAO patch" -ForegroundColor Gray
        if ($FeideEnabled) {
            Write-Host "  3. Test Feide login button appears in UI" -ForegroundColor Gray
            Write-Host "  4. Test auto-group assignment with new Feide user" -ForegroundColor Gray
        } else {
            Write-Host "  3. Test OpenID login to verify auto-group assignment" -ForegroundColor Gray
        }
    } else {
        Write-Error "Rebuild failed. Check server logs with: docker compose logs opensilex"
        exit 1
    }
} else {
    Write-Host "[6/6] Skipping rebuild (-SkipRebuild flag used)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Patches uploaded successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "To rebuild with patches, run this script again without -SkipRebuild" -ForegroundColor Cyan
    Write-Host "  .\03-apply-patches.ps1" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or rebuild manually via SSH:" -ForegroundColor Cyan
    Write-Host "  cd $RemoteDeployDir" -ForegroundColor Gray
    Write-Host "  docker compose --env-file opensilex.env stop opensilex" -ForegroundColor Gray
    Write-Host "  docker compose --env-file opensilex.env build --build-arg UID=1001 --build-arg GID=1001 opensilex" -ForegroundColor Gray
    Write-Host "  docker compose --env-file opensilex.env up -d opensilex" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Complete ===" -ForegroundColor Cyan
