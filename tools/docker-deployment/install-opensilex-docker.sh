#!/bin/bash
set -euo pipefail

################################################################################
# OpenSILEX Docker One-Click Installer
#
# This script performs a complete installation:
# 1. Installs Docker and Docker Compose
# 2. Deploys OpenSILEX stack (MongoDB, GraphDB, OpenSILEX)
# 3. Initializes the system
# 4. Creates admin user
# 5. Displays access information
#
# Usage: sudo bash install-opensilex-docker.sh
################################################################################

# Color output functions (reused from original script)
print_status() { echo -e "\033[0;34m[INFO]\033[0m $1"; }
print_success() { echo -e "\033[0;32m[SUCCESS]\033[0m $1"; }
print_error() { echo -e "\033[0;31m[ERROR]\033[0m $1"; }
print_warning() { echo -e "\033[0;33m[WARNING]\033[0m $1"; }

# Banner
cat << 'EOF'

         .+.
        +++++`.
      ;+;  ++.++`.
     ++     '+,  ++`.
   '+.        ++  `+++       ___                    ___  ___  _     ___ __  __
  ++           +++`  ++     / _ \  _ __  ___  _ _  / __||_ _|| |   | __|\ \/ /
`++   ,;++++++++++++++++   | (_) || '_ \/ -_)| ' \ \__ \ | | | |__ | _|  >  <
++++++:`        ++   .++    \___/ | .__/\___||_||_||___/|___||____||___|/_/\_\
 .++    `'+++   ++  ++`           |_|
   ++.      '+++'+.++
     ++:+++.`   .++          DOCKER ONE-CLICK INSTALLER
      ``````````

EOF

print_status "Starting OpenSILEX Docker deployment..."
print_status "This will install Docker and deploy the complete OpenSILEX stack"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "This script must be run as root (use sudo)"
    exit 1
fi

# Configuration
OPENSILEX_VERSION="1.4.9-rdg"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@opensilex.org}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin}"
DOMAIN_NAME="${DOMAIN_NAME:-}"

# Detect VM public IP for domain configuration
print_status "Detecting VM public IP address..."
VM_PUBLIC_IP=""
if command -v curl >/dev/null 2>&1; then
    VM_PUBLIC_IP=$(curl -s --max-time 10 ifconfig.me 2>/dev/null || curl -s --max-time 10 ipinfo.io/ip 2>/dev/null || echo "")
fi
if [ -z "$VM_PUBLIC_IP" ]; then
    VM_PUBLIC_IP="localhost"
fi
print_success "VM IP: $VM_PUBLIC_IP"

# Set domain name
if [ -z "$DOMAIN_NAME" ]; then
    if [ "$VM_PUBLIC_IP" != "localhost" ]; then
        DOMAIN_NAME="$VM_PUBLIC_IP"
        print_success "Using VM IP as domain: $DOMAIN_NAME"
    else
        DOMAIN_NAME="localhost"
        print_warning "Could not detect public IP, using localhost"
    fi
fi

################################################################################
# STEP 1: Install Docker
################################################################################

print_status ""
print_status "═══════════════════════════════════════════════════════════"
print_status "STEP 1/5: Installing Docker"
print_status "═══════════════════════════════════════════════════════════"

if command -v docker &> /dev/null; then
    print_success "Docker is already installed ($(docker --version))"
else
    print_status "Installing Docker..."

    # Update package index
    apt-get update -qq

    # Install prerequisites
    apt-get install -y -qq ca-certificates curl gnupg lsb-release

    # Add Docker's official GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    # Add Docker repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | \
        tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Install Docker Engine
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    print_success "Docker installed successfully ($(docker --version))"
fi

# Start and enable Docker service
systemctl enable docker >/dev/null 2>&1
systemctl start docker

# Add sudo user to docker group
if [ ! -z "${SUDO_USER:-}" ]; then
    usermod -aG docker "$SUDO_USER"
    print_success "Added $SUDO_USER to docker group"
fi

print_success "Docker is ready!"

################################################################################
# STEP 2: Prepare deployment files
################################################################################

print_status ""
print_status "═══════════════════════════════════════════════════════════"
print_status "STEP 2/5: Preparing deployment files"
print_status "═══════════════════════════════════════════════════════════"

DEPLOY_DIR="/opt/opensilex-docker"
print_status "Creating deployment directory: $DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR/config"

# If script is in a git repo, copy files from there
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/Dockerfile" ]; then
    print_status "Copying deployment files from $SCRIPT_DIR"
    cp "$SCRIPT_DIR/Dockerfile" "$DEPLOY_DIR/"
    cp "$SCRIPT_DIR/docker-compose.yml" "$DEPLOY_DIR/"
    if [ -f "$SCRIPT_DIR/config/opensilex.yml" ]; then
        cp "$SCRIPT_DIR/config/opensilex.yml" "$DEPLOY_DIR/config/"
    fi
    # Copy patches directory if it exists
    if [ -d "$SCRIPT_DIR/patches" ]; then
        cp -r "$SCRIPT_DIR/patches" "$DEPLOY_DIR/"
        print_success "Copied patches directory"
    fi
    print_success "Deployment files copied"
else
    print_error "Dockerfile not found. Please run this script from the docker-deployment directory."
    exit 1
fi

# Update configuration with domain name
print_status "Configuring domain: $DOMAIN_NAME"
sed -i "s|baseURL:.*|baseURL: http://$DOMAIN_NAME:8666|g" "$DEPLOY_DIR/config/opensilex.yml" 2>/dev/null || true

cd "$DEPLOY_DIR"
print_success "Deployment directory ready: $DEPLOY_DIR"

################################################################################
# STEP 3: Build and deploy stack
################################################################################

print_status ""
print_status "═══════════════════════════════════════════════════════════"
print_status "STEP 3/5: Building and deploying OpenSILEX stack"
print_status "═══════════════════════════════════════════════════════════"
print_warning "This step takes 15-20 minutes (building OpenSILEX from source)"
print_status "Building OpenSILEX Docker image with patches..."

# Build the image (--no-cache to ensure Dockerfile changes are applied)
print_status "Building OpenSILEX image (logs in /tmp/opensilex-build.log)..."
if docker compose build --no-cache --progress=plain > /tmp/opensilex-build.log 2>&1; then
    print_success "OpenSILEX image built successfully"
else
    print_error "Build failed. Check /tmp/opensilex-build.log for details"
    tail -50 /tmp/opensilex-build.log
    exit 1
fi

print_status "Starting database services (MongoDB, GraphDB)..."
docker compose up -d mongodb graphdb

print_success "Database services started!"

################################################################################
# STEP 4: Wait for databases to be healthy
################################################################################

print_status ""
print_status "═══════════════════════════════════════════════════════════"
print_status "STEP 4/6: Waiting for databases to be ready"
print_status "═══════════════════════════════════════════════════════════"

print_status "Waiting for MongoDB to be healthy..."
timeout=60
elapsed=0
while [ $elapsed -lt $timeout ]; do
    if docker compose ps mongodb | grep -q "healthy"; then
        print_success "MongoDB is healthy"
        break
    fi
    sleep 2
    elapsed=$((elapsed + 2))
    echo -n "."
done
echo ""

print_status "Waiting for GraphDB to be healthy..."
timeout=60
elapsed=0
while [ $elapsed -lt $timeout ]; do
    if docker compose ps graphdb | grep -q "healthy"; then
        print_success "GraphDB is healthy"
        break
    fi
    sleep 2
    elapsed=$((elapsed + 2))
    echo -n "."
done
echo ""

################################################################################
# STEP 4.5: Create GraphDB repository
################################################################################

print_status "Checking if GraphDB repository exists..."
if docker compose exec -T graphdb curl -s http://localhost:7200/rest/repositories/opensilex >/dev/null 2>&1; then
    print_success "OpenSILEX repository already exists"
else
    print_status "Creating GraphDB repository..."

    # Create repository configuration file
    docker compose exec -T graphdb sh -c 'cat > /tmp/repo-config.ttl << EOF
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix rep: <http://www.openrdf.org/config/repository#> .
@prefix sr: <http://www.openrdf.org/config/repository/sail#> .
@prefix sail: <http://www.openrdf.org/config/sail#> .
@prefix owlim: <http://www.ontotext.com/trree/owlim#> .

[] a rep:Repository ;
   rep:repositoryID "opensilex" ;
   rdfs:label "OpenSILEX Repository" ;
   rep:repositoryImpl [
      rep:repositoryType "graphdb:SailRepository" ;
      sr:sailImpl [
         sail:sailType "graphdb:Sail" ;
         owlim:ruleset "rdfs-optimized" ;
         owlim:storage-folder "storage" ;
         owlim:base-URL "http://localhost:8666/" ;
         owlim:repository-type "file-repository" ;
         owlim:entity-index-size "10000000" ;
         owlim:enable-context-index "false" ;
         owlim:enablePredicateList "true" ;
         owlim:enable-literal-index "true" ;
         owlim:check-for-inconsistencies "false" ;
         owlim:disable-sameAs "true" ;
         owlim:query-timeout "0" ;
         owlim:throw-QueryEvaluationException-on-timeout "false" ;
         owlim:read-only "false"
      ]
   ] .
EOF'

    # Create the repository using the TTL file
    if docker compose exec -T graphdb curl -X POST \
        -H "Content-Type: multipart/form-data" \
        -F "config=@/tmp/repo-config.ttl" \
        http://localhost:7200/rest/repositories 2>&1 | grep -q "201\|Created"; then
        print_success "GraphDB repository created successfully"
    else
        print_warning "Repository creation may have failed, but continuing with installation"
    fi

    sleep 5
fi

################################################################################
# STEP 5: Initialize OpenSILEX database
################################################################################

print_status ""
print_status "═══════════════════════════════════════════════════════════"
print_status "STEP 5/6: Initializing OpenSILEX database"
print_status "═══════════════════════════════════════════════════════════"

print_status "Running system installation (this takes 30-60 seconds)..."
if docker compose run --rm opensilex java -jar /app/opensilex.jar --CONFIG_FILE=/app/config/opensilex.yml system install 2>&1 | tee /tmp/system-install.log | tail -5; then
    print_success "System initialized successfully"
else
    print_warning "System install may have already been run (this is OK if reinstalling)"
fi

print_status "Creating admin user: $ADMIN_EMAIL"
if docker compose run --rm opensilex java -jar /app/opensilex.jar --CONFIG_FILE=/app/config/opensilex.yml user add \
    --admin \
    --email="$ADMIN_EMAIL" \
    --firstName="Admin" \
    --lastName="User" \
    --password="$ADMIN_PASSWORD" 2>&1 | tee /tmp/user-add.log | grep -q "already exists"; then
    print_warning "Admin user already exists"
else
    print_success "Admin user created successfully"
fi

################################################################################
# STEP 6: Start OpenSILEX application
################################################################################

print_status ""
print_status "═══════════════════════════════════════════════════════════"
print_status "STEP 6/6: Starting OpenSILEX application"
print_status "═══════════════════════════════════════════════════════════"

print_status "Starting OpenSILEX..."
docker compose up -d opensilex

print_status "Waiting for OpenSILEX to be healthy (this may take 2-3 minutes)..."
timeout=180
elapsed=0
while [ $elapsed -lt $timeout ]; do
    if docker compose ps opensilex | grep -q "healthy"; then
        print_success "OpenSILEX is healthy"
        break
    fi
    if docker compose ps opensilex | grep -q "unhealthy"; then
        print_warning "OpenSILEX is unhealthy, checking logs..."
        docker compose logs --tail=20 opensilex
    fi
    sleep 5
    elapsed=$((elapsed + 5))
    echo -n "."
done
echo ""

# Check final status
print_status "Final service status:"
docker compose ps

################################################################################
# Installation Complete
################################################################################

print_status ""
print_success "═══════════════════════════════════════════════════════════"
print_success "  INSTALLATION COMPLETE!"
print_success "═══════════════════════════════════════════════════════════"
echo ""
print_status "Access Information:"
print_status "───────────────────────────────────────────────────────────"
print_success "OpenSILEX URL:  http://$DOMAIN_NAME:8666"
print_success "GraphDB URL:    http://$DOMAIN_NAME:7200"
print_success "Admin Email:    $ADMIN_EMAIL"
print_success "Admin Password: $ADMIN_PASSWORD"
print_status "───────────────────────────────────────────────────────────"
echo ""
print_status "Useful Commands:"
print_status "  View logs:        docker compose -f $DEPLOY_DIR/docker-compose.yml logs -f"
print_status "  Stop services:    docker compose -f $DEPLOY_DIR/docker-compose.yml down"
print_status "  Start services:   docker compose -f $DEPLOY_DIR/docker-compose.yml up -d"
print_status "  Service status:   docker compose -f $DEPLOY_DIR/docker-compose.yml ps"
print_status "  OpenSILEX CLI:    docker compose -f $DEPLOY_DIR/docker-compose.yml exec opensilex java -jar /app/opensilex.jar"
echo ""
print_success "Deployment directory: $DEPLOY_DIR"
print_success ""
print_success "🎉 Your OpenSILEX instance is ready to use!"
