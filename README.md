# OpenSILEX Docker Deployment

> **Branch:** `docker-compose-official` - Docker-based deployment using official OpenSILEX Docker Compose

This branch contains **ONLY** Docker deployment scripts for OpenSILEX 1.4.9 with source patches and Feide authentication.

## Quick Start (3 Steps)

### 1. Create Azure VM

```powershell
.\create-azure-vm.ps1
```

Creates a Debian 12 VM on Azure with SSH key authentication. Takes ~3 minutes.

### 2. Install Docker on VM

```powershell
cd tools/docker-deployment
.\00-install-docker.ps1 -TargetIP <your-vm-ip>
```

Installs Docker and Docker Compose on the VM. Takes ~2 minutes.

### 3. Deploy OpenSILEX

```powershell
.\01-deploy-opensilex.ps1 -TargetIP <your-vm-ip> -ApiKeysFile ..\config\test-api-keys.conf
```

Deploys OpenSILEX from source with patches and Feide authentication. Takes ~20 minutes (first build).

**Done!** Access OpenSILEX at `http://<your-vm-ip>:28081/sandbox/app/`

## What This Branch Contains

```
PHIS/
├── README.md                           # This file
├── create-azure-vm.ps1                 # Step 1: Create VM
│
└── tools/docker-deployment/            # Docker deployment scripts
    ├── README.md                       # Detailed deployment docs
    ├── 00-install-docker.ps1           # Step 2: Install Docker
    ├── 01-deploy-opensilex.ps1         # Step 3: Full deployment
    ├── 02-apply-patches.ps1            # Update patches
    │
    ├── patches/                        # Source patches
    │   ├── 001-groupdao-nullpointer-fix.patch
    │   ├── 002-openid-auto-group-assignment.patch
    │   ├── opensilex-build-step.docker
    │   └── feide-openid-config.yml
    │
    ├── config/                         # API keys (gitignored)
    ├── PATCHING.md                     # Patch documentation
    └── archive/                        # Old files (reference)
```

## What Gets Deployed

- **OpenSILEX 1.4.9** - Built from source with patches
- **RDF4J 5.1.3** - Triplestore
- **MongoDB 8.0.11** - Document store
- **HAProxy 3.2** - Reverse proxy (port 28081)

### Source Patches

1. **GroupDAO NullPointerException Fix** - Prevents crashes when viewing groups
2. **OpenID/SAML Auto-Group Assignment** - Auto-assigns new Feide users to "Users" group

### Feide Authentication

Provide `-ApiKeysFile` to enable Feide/Dataporten OpenID Connect authentication:

```powershell
.\01-deploy-opensilex.ps1 -TargetIP <ip> -ApiKeysFile ..\config\test-api-keys.conf
```

Creates `tools/config/test-api-keys.conf`:

```bash
FEIDE_CLIENT_ID="your-client-id"
FEIDE_CLIENT_SECRET="your-client-secret"
```

Register at: https://dashboard.dataporten.no/

## Documentation

- [tools/docker-deployment/README.md](tools/docker-deployment/README.md) - Complete deployment guide
- [tools/docker-deployment/PATCHING.md](tools/docker-deployment/PATCHING.md) - Detailed patch documentation

## Other Branches

- **`debian-11-production`** (main) - Production Debian 11 deployment (non-Docker)
- **`docker-compose-official`** (this branch) - Docker deployment only

## Prerequisites

- Windows with PowerShell 7+ (or Linux/Mac with pwsh)
- Azure subscription (for VM creation)
- Azure CLI or Azure PowerShell module
- SSH key pair (`~/.ssh/id_ed25519`)

## Common Tasks

### Update Patches on Existing Deployment

```powershell
cd tools/docker-deployment
.\02-apply-patches.ps1 -Rebuild
```

### Check Deployment Status

```bash
ssh azureuser@<vm-ip>
cd ~/opensilex-docker-compose
docker compose ps
docker compose logs -f opensilex
```

### Clean Rebuild (From Scratch)

```bash
# On server
cd ~/opensilex-docker-compose
docker compose down -v
cd ~
rm -rf opensilex-docker-compose

# Then from local machine
.\01-deploy-opensilex.ps1 -TargetIP <ip> -ApiKeysFile ..\config\test-api-keys.conf
```

## Support

For detailed documentation, troubleshooting, and technical details, see:
- [tools/docker-deployment/README.md](tools/docker-deployment/README.md)

## References

- Official OpenSILEX Docker Compose: https://github.com/OpenSILEX/opensilex-docker-compose
- OpenSILEX Documentation: https://opensilex.github.io/
- Feide Dataporten: https://dashboard.dataporten.no/
