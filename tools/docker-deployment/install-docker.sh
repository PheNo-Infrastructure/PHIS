#!/bin/bash
set -euo pipefail

# OpenSILEX Docker Deployment Installer
# Simplified installation script that only sets up Docker and deploys the stack

# Color output functions
print_status() { echo -e "\033[0;34m[INFO]\033[0m $1"; }
print_success() { echo -e "\033[0;32m[SUCCESS]\033[0m $1"; }
print_error() { echo -e "\033[0;31m[ERROR]\033[0m $1"; }
print_warning() { echo -e "\033[0;33m[WARNING]\033[0m $1"; }

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "This script must be run as root (use sudo)"
    exit 1
fi

print_status "Starting OpenSILEX Docker deployment..."

# Update system packages
print_status "Updating system packages..."
apt-get update
apt-get upgrade -y

# Install Docker if not already installed
if ! command -v docker &> /dev/null; then
    print_status "Installing Docker..."

    # Install prerequisites
    apt-get install -y ca-certificates curl gnupg

    # Add Docker's official GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    # Add Docker repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
        tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Install Docker Engine
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    print_success "Docker installed successfully"
else
    print_success "Docker is already installed"
fi

# Start and enable Docker service
systemctl enable docker
systemctl start docker

# Add current user to docker group (if not root)
if [ ! -z "${SUDO_USER:-}" ]; then
    usermod -aG docker "$SUDO_USER"
    print_success "Added $SUDO_USER to docker group (logout/login required)"
fi

# Verify Docker installation
docker --version
docker compose version

print_success "Docker setup completed!"
print_status ""
print_status "Next steps:"
print_status "1. Copy the docker-deployment directory to your server"
print_status "2. Navigate to the directory: cd docker-deployment"
print_status "3. Build and start the stack: docker compose up -d"
print_status "4. Check logs: docker compose logs -f"
print_status "5. Initialize OpenSILEX: docker compose exec opensilex java -jar /app/opensilex.jar system install"
print_status ""
print_status "Access OpenSILEX at: http://YOUR_SERVER_IP:8666"
