# OpenSILEX Docker Deployment

This directory contains a Docker-based deployment for OpenSILEX 1.4.9-rdg with critical patches applied.

## What This Solves

This approach eliminates the file path and build issues from the original bash script installation by:
- Building OpenSILEX in a controlled container environment with fixed paths
- Applying patches during build time (GroupDAO NullPointerException fix)
- Using Docker Compose for orchestration of all services
- Making the deployment reproducible and portable

## Architecture

The stack consists of:
- **MongoDB 6.0** - Document database with replica set
- **GraphDB 10.0.2** - RDF triplestore for semantic data
- **OpenSILEX 1.4.9-rdg** - Built from source with patches

## Prerequisites

- Debian 11 server
- Root or sudo access
- At least 4GB RAM
- 20GB disk space

## Quick Start

### 1. Install Docker

Run the installation script on your server:

```bash
sudo bash install-docker.sh
```

This will install Docker and Docker Compose.

### 2. Deploy the Stack

Build and start all services:

```bash
docker compose up -d --build
```

The first build will take 15-20 minutes as it compiles OpenSILEX from source.

### 3. Monitor Startup

Watch the logs:

```bash
docker compose logs -f
```

Wait for all services to be healthy:

```bash
docker compose ps
```

### 4. Initialize OpenSILEX

Run the system installation:

```bash
docker compose exec opensilex java -jar /app/opensilex.jar system install
```

### 5. Create Admin User

```bash
docker compose exec opensilex java -jar /app/opensilex.jar user add \
  --admin \
  --email="admin@opensilex.org" \
  --firstName="Admin" \
  --lastName="User" \
  --password="admin"
```

### 6. Access the Application

Open your browser to:
- OpenSILEX: http://YOUR_SERVER_IP:8666
- GraphDB: http://YOUR_SERVER_IP:7200

## File Structure

```
docker-deployment/
├── Dockerfile                 # OpenSILEX build with patches
├── docker-compose.yml         # Full stack definition
├── install-docker.sh          # Docker installation script
├── config/
│   └── opensilex.yml         # OpenSILEX configuration
└── README.md                  # This file
```

## Configuration

Edit `config/opensilex.yml` to customize OpenSILEX settings. Changes require restart:

```bash
docker compose restart opensilex
```

## Management Commands

### Start the stack
```bash
docker compose up -d
```

### Stop the stack
```bash
docker compose down
```

### View logs
```bash
docker compose logs -f opensilex
```

### Rebuild after changes
```bash
docker compose up -d --build
```

### Access OpenSILEX CLI
```bash
docker compose exec opensilex java -jar /app/opensilex.jar --help
```

## Data Persistence

All data is stored in Docker volumes:
- `mongodb_data` - MongoDB database
- `graphdb_data` - GraphDB repositories
- `opensilex_data` - OpenSILEX user data
- `opensilex_logs` - Application logs

To backup:
```bash
docker run --rm -v opensilex_data:/data -v $(pwd):/backup ubuntu tar czf /backup/opensilex-backup.tar.gz /data
```

## Troubleshooting

### Container won't start
Check logs:
```bash
docker compose logs opensilex
```

### Port already in use
Stop conflicting services or change ports in docker-compose.yml

### Out of memory
Increase Docker memory limit or server RAM

### Rebuild from scratch
```bash
docker compose down -v  # WARNING: Deletes all data
docker compose up -d --build
```

## Patches Applied

This Dockerfile applies the following critical patches:

1. **GroupDAO NullPointerException Fix**
   - File: `opensilex-security/src/main/java/org/opensilex/security/group/dal/GroupDAO.java:156`
   - Issue: `inURIFilter()` returns null causing authentication failures
   - Fix: Add null check before adding filter

## Advantages Over Bash Installation

1. **Reproducible** - Same build every time
2. **Portable** - Works anywhere Docker runs
3. **Isolated** - No host dependency conflicts
4. **Testable** - Can test locally before deploying
5. **Rollback** - Easy to revert to previous versions
6. **Scalable** - Can add replicas for load balancing

## Migration Path to Production

This deployment can evolve into:
1. **Pre-built images** - Push to Docker registry, skip build time
2. **Kubernetes** - Scale horizontally across multiple nodes
3. **Ansible automation** - Combine with configuration management
4. **CI/CD pipeline** - Automated testing and deployment

## Next Steps

After successful deployment, consider:
1. Set up HTTPS with reverse proxy (nginx/Traefik)
2. Configure automatic backups
3. Set up monitoring (Prometheus/Grafana)
4. Create pre-built Docker images for faster deployment
5. Migrate to Ansible for multi-server management
