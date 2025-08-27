#!/bin/bash
set -e

# Colors for output
export DEBIAN_FRONTEND=noninteractive
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "`${BLUE}[INFO]`${NC} `$1"; }
print_success() { echo -e "`${GREEN}[SUCCESS]`${NC} `$1"; }
print_warning() { echo -e "`${YELLOW}[WARNING]`${NC} `$1"; }
print_error() { echo -e "`${RED}[ERROR]`${NC} `$1"; }

print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

print_status "Using azureuser for OpenSILEX installation..."

print_status "Installing Java JDK 17 (official OpenSILEX requirement)..."
sudo apt install -y openjdk-17-jdk openjdk-17-jre
echo 'export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64' >> ~/.bashrc
echo 'export PATH=`$JAVA_HOME/bin:`$PATH' >> ~/.bashrc

# Environment variables already added to azureuser above

print_status "Installing Docker (required for MongoDB/RDF4J containers)..."
sudo apt install -y ca-certificates curl gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
# Fix GPG key download for non-interactive sessions
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || {
    print_warning "GPG method failed, trying alternative Docker installation..."
    # Alternative: use the convenience script
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm get-docker.sh
}
# Only add repository if GPG key was successful
if [ -f "/etc/apt/keyrings/docker.gpg" ]; then
    echo "deb [arch=`$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian `$(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

print_status "Configuring Docker..."
sudo usermod -aG docker `$(whoami)
sudo systemctl start docker
sudo systemctl enable docker
sudo chmod 666 /var/run/docker.sock

print_status "Installing essential tools..."
sudo apt install -y curl wget unzip

print_status "Installing and configuring nginx..."
sudo apt install -y nginx

print_success "System setup completed!"