# OpenSILEX Official Docker Compose - PHIS Deployment

This directory contains the official OpenSILEX docker-compose setup from:
https://github.com/OpenSILEX/opensilex-docker-compose

## Changes from Official Version

- Updated `OPENSILEX_RELEASE_TAG` from `1.4.9` to `1.4.9-rdg` (RDG variant needed for PHIS)

## Quick Start

```bash
# Start the stack
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f opensilex

# Stop the stack
docker compose down
```

## Deployment to Server

```bash
# Copy files to server
scp -r tools/opensilex-official-docker azureuser@SERVER_IP:~/

# SSH to server and start
ssh azureuser@SERVER_IP
cd opensilex-official-docker
docker compose up -d
```

## Access

- OpenSILEX: http://SERVER_IP:28081
- MongoDB Express: http://SERVER_IP:28889
- RDF4J: http://SERVER_IP:8080

## Next Steps

1. Test deployment as-is
2. Document any issues encountered
3. Add GroupDAO patch if needed
4. Customize configuration for production
