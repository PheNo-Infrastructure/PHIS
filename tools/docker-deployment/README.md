# OpenSILEX Docker Deployment

Automated deployment of OpenSILEX 1.4.9 with source patches and Feide authentication on Debian 11.

## Overview

This directory contains **3 scripts** for a complete, reproducible OpenSILEX deployment:

```
00-install-docker.ps1    # Step 0: Install Docker on clean Debian 11 server
01-deploy-opensilex.ps1  # Step 1: Deploy OpenSILEX from scratch (full automation)
02-apply-patches.ps1     # Step 2: Apply/update patches on existing deployment
```

## Quick Start (Clean Server)

For a **fresh deployment** on a clean Debian 11 server:

```powershell
# Step 0: Install Docker (if not already installed)
.\00-install-docker.ps1 -TargetIP 20.61.108.197

# Step 1: Deploy OpenSILEX with patches and Feide authentication
.\01-deploy-opensilex.ps1 -TargetIP 20.61.108.197 -ApiKeysFile ..\config\test-api-keys.conf
```

That's it. The deployment is 100% automated.

## What Gets Deployed

- **OpenSILEX 1.4.9** - Built from source with patches
- **RDF4J 5.1.3** - Triplestore for ontologies and metadata
- **MongoDB 8.0.11** - Document store for large data
- **HAProxy 3.2** - Reverse proxy on port 28081

### Source Patches Applied

1. **GroupDAO NullPointerException Fix** - Prevents crashes when viewing groups for users with empty profiles
2. **OpenID/SAML Auto-Group Assignment** - New Feide users automatically assigned to "Users" group (no blank page)

### Feide Integration

If you provide `-ApiKeysFile`, the deployment will:
- Configure Feide/Dataporten OpenID Connect authentication
- Add "Login with Feide" button to the UI
- Auto-assign new Feide users to the "Users" group
- Create the "Users" group automatically via REST API

## Script Details

### 00-install-docker.ps1

Installs Docker and Docker Compose on a clean Debian 11 server.

**Usage:**
```powershell
.\00-install-docker.ps1 -TargetIP <server-ip> [-User azureuser] [-SSHKey ~/.ssh/id_ed25519]
```

**What it does:**
1. Removes old Docker versions
2. Adds Docker's official GPG key and repository
3. Installs Docker Engine, CLI, and Docker Compose plugin
4. Configures user permissions (adds user to docker group)
5. Enables and starts Docker service

**Time:** ~2-3 minutes

### 01-deploy-opensilex.ps1

Full deployment from scratch. Clones the official OpenSILEX Docker Compose repository, applies patches, builds from source, and starts all services.

**Usage:**
```powershell
.\01-deploy-opensilex.ps1 -TargetIP <server-ip> [-ApiKeysFile path/to/api-keys.conf]
```

**What it does:**
1. Verifies prerequisites (SSH connectivity, Docker installed)
2. Clones official `opensilex-docker-compose` repository to server
3. Uploads patched Dockerfile (enables source build with patches)
4. Uploads all `.patch` files from `patches/` directory
5. Configures Feide authentication (if `-ApiKeysFile` provided)
6. Builds OpenSILEX from source (15-20 min Maven build)
7. Starts all services (OpenSILEX, RDF4J, MongoDB, HAProxy)
8. Creates "Users" group automatically via REST API
9. Waits for services to be ready and reports status

**Time:** ~20-25 minutes (first build), ~3-5 minutes (rebuild with cache)

**After deployment:**
- OpenSILEX UI: `http://<server-ip>:28081/sandbox/app/`
- Admin login: `admin@opensilex.org` / `admin`
- RDF4J Workbench: `http://<server-ip>:28081/rdf4j-workbench/`

### 02-apply-patches.ps1

Apply or update patches on an **existing** OpenSILEX deployment.

**Usage:**
```powershell
# Upload patches without rebuilding (to review first)
.\02-apply-patches.ps1

# Upload patches and rebuild automatically
.\02-apply-patches.ps1 -Rebuild

# Upload patches, configure Feide, and rebuild
.\02-apply-patches.ps1 -Rebuild -ApiKeysFile ..\config\test-api-keys.conf
```

**What it does:**
1. Backs up vanilla Dockerfile on server (if not already backed up)
2. Uploads patched Dockerfile and all `.patch` files
3. Configures Feide authentication (if `-ApiKeysFile` provided)
4. Optionally rebuilds container with patches applied (if `-Rebuild` flag used)
5. Creates "Users" group via API (if rebuild enabled)

**Time:** ~1 minute (upload only), ~20 minutes (with rebuild)

**Use cases:**
- Adding new patches to an existing deployment
- Updating Feide credentials
- Rebuilding after patch changes

## Feide Authentication Setup

### Prerequisites

1. Register application at https://dashboard.dataporten.no/
2. Set redirect URI: `http://<your-server-ip>:28081/sandbox/app/openid`
3. Enable scopes: `openid`, `userid`, `profile`, `email`, `userinfo-name`, `userinfo-mail`
4. Create API keys file

### API Keys File Format

Create `tools/config/test-api-keys.conf`:

```bash
# Feide/Dataporten Credentials
FEIDE_CLIENT_ID="your-client-id-here"
FEIDE_CLIENT_SECRET="your-client-secret-here"
```

### Testing Feide Login

After deployment with `-ApiKeysFile`:

1. Open `http://<server-ip>:28081/sandbox/app/`
2. Look for "Login with Feide" or "Logg inn med Feide" button
3. Click and authenticate with Feide credentials
4. Verify you are automatically logged in (no blank page)
5. Check that you are in the "Users" group: Security → My Profile

## Directory Structure

```
tools/docker-deployment/
├── README.md                    # This file
├── 00-install-docker.ps1        # Docker installation script
├── 01-deploy-opensilex.ps1      # Full deployment script
├── 02-apply-patches.ps1         # Patch application script
│
├── patches/                     # Patches applied during build
│   ├── 001-groupdao-nullpointer-fix.patch
│   ├── 002-openid-auto-group-assignment.patch
│   ├── opensilex-build-step.docker     # Multi-stage Dockerfile (Maven + Tomcat)
│   ├── feide-openid-config.yml         # Feide OpenID Connect config
│   └── README.md
│
├── config/                      # Configuration files
│   └── (your api-keys files)
│
├── PATCHING.md                  # Detailed patching documentation
│
└── archive/                     # Old/obsolete files (for reference)
    ├── bash-scripts/
    ├── python-scripts/
    └── old-docs/
```

## Common Tasks

### Fresh Deployment (Clean Server)

```powershell
# 1. Install Docker
.\00-install-docker.ps1 -TargetIP 20.61.108.197

# 2. Deploy OpenSILEX with Feide
.\01-deploy-opensilex.ps1 -TargetIP 20.61.108.197 -ApiKeysFile ..\config\test-api-keys.conf
```

### Update Patches on Existing Deployment

```powershell
# Edit patch files in patches/ directory
# Then upload and rebuild:
.\02-apply-patches.ps1 -Rebuild
```

### Add Feide to Existing Deployment

```powershell
# Create API keys file with Feide credentials
# Then apply:
.\02-apply-patches.ps1 -Rebuild -ApiKeysFile ..\config\test-api-keys.conf
```

### Check Deployment Status

```bash
# SSH to server
ssh -i ~/.ssh/id_ed25519 azureuser@20.61.108.197

# Check container status
cd ~/opensilex-docker-compose
docker compose ps

# Check OpenSILEX logs
docker compose logs -f opensilex

# Test API
curl http://localhost:8080/sandbox/rest/core/ping
```

### Clean Rebuild (From Scratch)

```bash
# SSH to server
ssh -i ~/.ssh/id_ed25519 azureuser@20.61.108.197

# Remove everything
cd ~/opensilex-docker-compose
docker compose down -v
cd ~
rm -rf opensilex-docker-compose

# Then run deployment script again from local machine
.\01-deploy-opensilex.ps1 -TargetIP 20.61.108.197 -ApiKeysFile ..\config\test-api-keys.conf
```

## Troubleshooting

### Docker not found on server

**Error:** `Docker or Docker Compose not found on server`

**Fix:**
```powershell
.\00-install-docker.ps1 -TargetIP 20.61.108.197
```

### Build hangs during Maven compilation

**Cause:** Maven timeout issues (known issue with Maven 3.9+)

**Status:** Already fixed in `patches/opensilex-build-step.docker` with timeout settings

**If still hangs:** Check Docker build logs on server:
```bash
docker compose logs
```

### Feide login button not appearing

**Cause:** Feide credentials not loaded or OpenSILEX not restarted

**Fix:**
1. Check `opensilex.env` on server has `FEIDE_CLIENT_ID` and `FEIDE_CLIENT_SECRET`
2. Restart with `docker compose restart opensilex` (or use down/up to reload env vars)

### New Feide users get blank page

**Cause:** "Users" group does not exist

**Check if group exists:**
```bash
ssh -i ~/.ssh/id_ed25519 azureuser@20.61.108.197
curl -s http://localhost:8080/sandbox/rest/core/groups | jq '.result[] | select(.name=="Users")'
```

**Fix:** Create manually via UI or re-run with rebuild:
```powershell
.\02-apply-patches.ps1 -Rebuild
```

### GroupDAO NullPointerException when viewing groups

**Cause:** Patches not applied or build used pre-built ZIP instead of source

**Fix:** Ensure you're using the patched Dockerfile and rebuild from source:
```powershell
.\02-apply-patches.ps1 -Rebuild
```

## Technical Details

### Source Build vs Pre-built ZIP

**Official OpenSILEX Docker Compose** downloads a pre-built release ZIP (~2 min build). This approach **cannot** apply source-level Java patches.

**Our patched approach** builds OpenSILEX from source using a multi-stage Dockerfile:
- Stage 1: Maven builder (clones source, applies patches, compiles)
- Stage 2: Tomcat production (copies built artifacts)

**Trade-off:** First build takes 15-20 minutes, but patches are properly compiled in.

### Maven Build Timeouts

Maven 3.9+ uses Aether HTTP transport by default. The `maven.wagon.http.*` properties are **ignored** unless you force Wagon transport.

Our patched Dockerfile includes:
```bash
-Dmaven.resolver.transport=wagon
-Dmaven.wagon.http.connectionTimeout=5000
-Dmaven.wagon.http.readTimeout=10000
```

This prevents build hangs at module 10/19 when checking remote repos.

### Auto-Group Assignment How It Works

The `002-openid-auto-group-assignment.patch`:
1. Adds `SecurityAutoAssignmentService.java` to OpenSILEX source
2. Searches for group/profile by **NAME** (not hardcoded URI)
3. Calls `assignToDefaultGroupIfNew()` after OpenID/SAML user creation
4. Automatically adds new users to "Users" group with "Default profile"

**Graceful degradation:** If "Users" group doesn't exist, logs a warning but doesn't crash.

## Support

For issues or questions:
1. Check `PATCHING.md` for detailed patch documentation
2. Review server logs: `docker compose logs opensilex`
3. Check `archive/old-docs/` for historical documentation

## References

- Official OpenSILEX Docker Compose: https://github.com/OpenSILEX/opensilex-docker-compose
- OpenSILEX Documentation: https://opensilex.github.io/
- Feide Dataporten: https://dashboard.dataporten.no/
- Docker Installation Guide: https://docs.docker.com/engine/install/debian/
