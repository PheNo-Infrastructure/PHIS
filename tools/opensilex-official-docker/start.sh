#!/bin/bash
# Start OpenSILEX Official Docker Compose
# This script sources the environment file and starts the stack

cd "$(dirname "$0")"

# Source environment variables
set -a
source opensilex.env
set +a

# Start the stack
docker compose up start_opensilex_stack -d

echo "OpenSILEX stack started!"
echo "Check status: docker compose ps"
echo "View logs: docker compose logs -f opensilex"
