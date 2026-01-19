# OpenSILEX Docker Deployment - One-Click Installation

This directory contains a Docker-based deployment for OpenSILEX 1.4.9-rdg with critical patches applied.

## 🚀 One-Click Installation

### From Windows (PowerShell)
```powershell
cd tools/docker-deployment
.\deploy-opensilex-docker.ps1 -TargetIP YOUR_SERVER_IP
```

### From Linux/Mac or directly on server
```bash
cd tools/docker-deployment
sudo bash install-opensilex-docker.sh
```

**That's it!** The script automatically:
- ✅ Installs Docker
- ✅ Builds OpenSILEX with patches (15-20 min)
- ✅ Deploys MongoDB, GraphDB, and OpenSILEX
- ✅ Initializes the system
- ✅ Creates admin user
- ✅ Displays access information

Access OpenSILEX at: **http://YOUR_SERVER_IP:8666**

## Custom Configuration

```powershell
# PowerShell with custom credentials
.\deploy-opensilex-docker.ps1 `
  -TargetIP 108.143.82.78 `
  -AdminEmail "admin@example.com" `
  -AdminPassword "SecurePass123"
```

```bash
# Bash with environment variables
export ADMIN_EMAIL="admin@example.com"
export ADMIN_PASSWORD="SecurePass123"
sudo -E bash install-opensilex-docker.sh
```

## Architecture

The stack consists of:
- **MongoDB 6.0** - Document database with replica set
- **GraphDB 10.0.2** - RDF triplestore for semantic data
- **OpenSILEX 1.4.9-rdg** - Built from source with GroupDAO patch

## Prerequisites

- Debian 11 server
- Root or sudo access
- 4GB+ RAM
- 20GB+ disk space

## File Structure

```
docker-deployment/
├── Dockerfile                      # OpenSILEX build with patches
├── docker-compose.yml              # Full stack definition
├── install-opensilex-docker.sh     # One-click bash installer
├── deploy-opensilex-docker.ps1     # One-click PowerShell installer
├── install-docker.sh               # Docker installation only
├── config/
│   └── opensilex.yml              # OpenSILEX configuration
└── README.md                       # This file
```

## Management Commands

```bash
# View logs
docker compose -f /opt/opensilex-docker/docker-compose.yml logs -f

# Stop services
docker compose -f /opt/opensilex-docker/docker-compose.yml down

# Start services
docker compose -f /opt/opensilex-docker/docker-compose.yml up -d

# Restart a service
docker compose -f /opt/opensilex-docker/docker-compose.yml restart opensilex

# Check status
docker compose -f /opt/opensilex-docker/docker-compose.yml ps
```

## Adding New Patches

Edit the Dockerfile to add patches:

```dockerfile
# Add after existing patch
RUN sed -i '200s/old code/new code/' path/to/File.java
```

Rebuild:
```bash
docker compose build --no-cache opensilex
docker compose up -d
```

## Advantages Over Bash Installation

1. **Reproducible** - Same build every time, no path issues
2. **Portable** - Works anywhere Docker runs
3. **Isolated** - No host dependency conflicts
4. **Testable** - Test locally before deploying
5. **Fast rollback** - `docker compose down && up`
6. **One-click** - Complete installation in one command

## Troubleshooting

**Container won't start:**
```bash
docker compose -f /opt/opensilex-docker/docker-compose.yml logs opensilex
```

**Rebuild from scratch:**
```bash
docker compose -f /opt/opensilex-docker/docker-compose.yml down -v
docker compose -f /opt/opensilex-docker/docker-compose.yml up -d --build
```

## Next Steps

- Set up HTTPS with reverse proxy (nginx/Traefik)
- Configure automatic backups
- Create pre-built images for faster deployment
- Migrate to Ansible for multi-server management
