# OpenSILEX Patching Guide

## Overview

This guide covers applying source-level patches to OpenSILEX to fix known bugs:
1. **GroupDAO NullPointerException** - Crashes when viewing groups for users with empty profiles
2. **OpenID/SAML Auto-Group Assignment** - New OpenID/SAML users get auto-assigned to "Users" group

## Quick Start

```powershell
# Upload patches without rebuilding (to review first)
.\02-02-apply-patches.ps1

# Upload patches and rebuild automatically (15-20 min build)
.\02-02-apply-patches.ps1 -Rebuild

# Upload patches, configure Feide, and rebuild
.\02-02-apply-patches.ps1 -Rebuild -ApiKeysFile ..\config\test-api-keys.conf
```

## What the Script Does

The `02-02-apply-patches.ps1` script automates:

1. ✅ Backs up vanilla Dockerfile on server
2. ✅ Uploads source-build Dockerfile (enables patching)
3. ✅ Uploads all `.patch` files to server
4. ✅ Configures Feide/OpenID authentication (if `-ApiKeysFile` provided)
5. ✅ Optionally rebuilds container with patches applied
6. ✅ Creates default "Users" group for auto-assignment (if rebuild enabled)

## Files Involved

```
tools/docker-deployment/
├── 02-apply-patches.ps1                    # Automation script
├── patches/
│   ├── opensilex-build-step.docker      # Source-build Dockerfile
│   ├── 001-groupdao-nullpointer-fix.patch
│   └── 002-openid-auto-group-assignment.patch
└── PATCHING.md                          # This file
```

## How Patching Works

### Vanilla Build (what you have now)
```
Docker Build → Download pre-built ZIP → Extract → Done (2-3 min)
```

### Patched Build (what this enables)
```
Docker Build → Clone source → Apply patches → Maven compile → Package → Done (15-20 min)
```

The 15-20 minute build happens **once** during `docker compose build`. After that, starting/stopping containers is instant.

## Manual Steps (if not using script)

If you prefer to apply patches manually:

### 1. Backup Vanilla Dockerfile

```bash
# On server
cd ~/opensilex-docker-compose
cp opensilex-build-step.docker opensilex-build-step.docker.vanilla
```

### 2. Upload Source-Build Dockerfile

```powershell
# On local machine
scp -i ~/.ssh/id_ed25519 `
  "c:\Users\siv017\Documents\GitHub\PHIS\tools\docker-deployment\patches\opensilex-build-step.docker" `
  azureuser@20.61.108.197:~/opensilex-docker-compose/opensilex-build-step.docker
```

### 3. Upload Patch Files

```powershell
# On local machine
ssh -i ~/.ssh/id_ed25519 azureuser@20.61.108.197 "mkdir -p ~/opensilex-docker-compose/patches"

scp -i ~/.ssh/id_ed25519 `
  "c:\Users\siv017\Documents\GitHub\PHIS\tools\docker-deployment\patches\*.patch" `
  azureuser@20.61.108.197:~/opensilex-docker-compose/patches/
```

### 4. Rebuild Container

```bash
# On server
cd ~/opensilex-docker-compose
docker compose --env-file opensilex.env stop opensilex
docker compose --env-file opensilex.env build --build-arg UID=1001 --build-arg GID=1001 opensilex
docker compose --env-file opensilex.env up start_opensilex_stack -d
```

## Verifying Patches Applied

### Test GroupDAO Fix

```bash
# On server - this would crash in vanilla OpenSILEX
TOKEN=$(curl -s -X POST "http://localhost:8080/sandbox/rest/security/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"admin@example.com","password":"admin123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/sandbox/rest/core/groups" | jq
```

**Expected**: JSON response with groups (not 500 error)

### Test OpenID Auto-Assignment

1. Configure OpenID/SAML authentication in OpenSILEX
2. Login with a new OpenID/SAML user
3. Check that user is automatically in "Users" group with "Default User" profile

**Expected**: User can access system immediately (no manual group assignment needed)

## Adding New Patches

To add additional patches:

1. Create a new `.patch` file in `patches/` directory
2. Run `.\02-apply-patches.ps1 -Rebuild`

The source-build Dockerfile automatically applies **all** `.patch` files in the `patches/` directory.

## Removing Patches

To remove a patch:

1. Delete the `.patch` file from `patches/` directory
2. Run `.\02-apply-patches.ps1 -Rebuild`

## Reverting to Vanilla

To go back to vanilla (no patches):

```bash
# On server
cd ~/opensilex-docker-compose
cp opensilex-build-step.docker.vanilla opensilex-build-step.docker
docker compose --env-file opensilex.env build --build-arg UID=1001 --build-arg GID=1001 opensilex
docker compose --env-file opensilex.env up start_opensilex_stack -d
```

## Troubleshooting

### Build fails with "patch does not apply"

**Cause**: Patch file doesn't match the source code (wrong version or file changed)

**Fix**:
1. Check OpenSILEX version in `opensilex.env` matches patch expectations
2. Review patch file to ensure it matches the source structure

### Build hangs during Maven compilation

**Cause**: Maven timeout issues (known issue with Maven 3.9+)

**Fix**: The source-build Dockerfile already includes timeout fixes:
```bash
-Dmaven.resolver.transport=wagon
-Dmaven.wagon.http.connectionTimeout=5000
-Dmaven.wagon.http.readTimeout=10000
```

If build still hangs, check Docker logs for specific module that's stuck.

### Build fails with vuelayers errors

**Cause**: Frontend build issue with Vue.js bind operator

**Fix**: The source-build Dockerfile includes automatic fallback patching for this issue. Check build logs for "Retrying build with patched vuelayers..."

## Build Time Expectations

- **First build with patches**: 15-20 minutes (Maven compiles from source)
- **Subsequent builds** (if no code changes): ~2 minutes (Docker cache)
- **Container start/stop**: Instant (no rebuild needed)

## Feide Authentication Integration

The script can automatically configure Feide/Dataporten OpenID Connect authentication.

### Prerequisites

1. **Register application** at https://dashboard.dataporten.no/
2. **Set redirect URI**: `http://YOUR-SERVER-IP:28081/sandbox/app/openid`
3. **Enable scopes**: `openid`, `userid`, `profile`, `email`, `userinfo-name`, `userinfo-mail`
4. **Create API keys file**: `tools/config/api-keys.conf`

### API Keys File Format

```bash
# Feide/Dataporten Credentials
FEIDE_CLIENT_ID="58c19493-d945-48d2-b8c4-f1baf7b00aee"
FEIDE_CLIENT_SECRET="04fbe911-e106-4307-8253-24b15c4cc020"
```

### Apply with Feide Configuration

```powershell
.\02-apply-patches.ps1 -Rebuild -ApiKeysFile ..\config\test-api-keys.conf
```

This will:
1. Add `FEIDE_CLIENT_ID` and `FEIDE_CLIENT_SECRET` to `opensilex.env`
2. Update `OPENSILEX_PUBLIC_URL` if needed (must use server IP, not localhost)
3. Append Feide OpenID config to `opensilex-custom-config.yml`
4. Rebuild container with proper env var loading (down/up cycle to reload env_file)

### Verify Feide Integration

After rebuild completes:
1. Open `http://YOUR-SERVER-IP:28081/sandbox/app/`
2. Look for **"Login with Feide"** or **"Logg inn med Feide"** button
3. Test login with Feide credentials
4. Verify new users are auto-assigned to "Users" group (no blank page)

## Auto-Group Assignment

The `002-openid-auto-group-assignment.patch` automatically assigns new OpenID/SAML users to a default group.

### How It Works

1. **Patch searches by NAME** (not hardcoded URI):
   - Group: `"Users"`
   - Profile: `"Default profile"`

2. **Script creates group automatically** after rebuild:
   - Waits for OpenSILEX to be ready (max 3 minutes)
   - Creates "Users" group via REST API
   - Associates with existing "Default profile"

3. **New Feide users get immediate access**:
   - No blank page on first login
   - Automatically added to "Users" group
   - Gets permissions from "Default profile"

### Troubleshooting Auto-Assignment

If new users still get blank page after Feide login:

1. **Check if Users group exists**:
   ```bash
   ssh -i ~/.ssh/id_ed25519 azureuser@20.61.108.197
   curl -s http://localhost:8080/sandbox/rest/core/groups | jq '.result[] | select(.name=="Users")'
   ```

2. **Check OpenSILEX logs for warnings**:
   ```bash
   docker compose logs opensilex | grep "Default group"
   ```

3. **Manually create group** if script failed:
   - Login as admin: `http://20.61.108.197:28081/sandbox/app/`
   - Security → Groups → Add Group
   - Name: `Users` (exact, case-sensitive)
   - Add "Default profile" to the group

## Script Options

```powershell
# Full syntax
.\02-apply-patches.ps1 -Server <IP> -User <username> -SSHKey <path> -Rebuild -ApiKeysFile <path>

# Examples
.\02-apply-patches.ps1                                                        # Upload patches only
.\02-apply-patches.ps1 -Rebuild                                              # Upload and rebuild
.\02-apply-patches.ps1 -Rebuild -ApiKeysFile ..\config\test-api-keys.conf   # With Feide
.\02-apply-patches.ps1 -Server 10.0.0.5                                      # Custom server
.\02-apply-patches.ps1 -SSHKey ~/.ssh/custom_key                             # Custom SSH key
```

## Integration with MANUAL_DEPLOYMENT.md

This patching process can be integrated into the manual deployment workflow:

**After Step 9** (vanilla build complete), optionally add:

**Step 9a: Apply Patches (Optional)**
```powershell
# On local machine
cd c:\Users\siv017\Documents\GitHub\PHIS\tools\docker-deployment
.\02-apply-patches.ps1 -Rebuild
```

This replaces the vanilla OpenSILEX with a patched version.
