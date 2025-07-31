#!/bin/bash

# OpenSILEX GitHub Installation Dependencies for Debian 12
# This script installs all prerequisites for OpenSILEX GitHub deployment

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_error "This script should not be run as root. Please run as a regular user with sudo privileges."
        exit 1
    fi
}

# Function to check if user has sudo privileges
check_sudo() {
    if ! sudo -n true 2>/dev/null; then
        print_error "This script requires sudo privileges. Please ensure your user can use sudo."
        exit 1
    fi
}

# Function to update system packages
update_system() {
    print_status "Updating system packages..."
    sudo apt update && sudo apt upgrade -y
    print_success "System packages updated"
}

# Function to install Java JDK 11
install_java() {
    if java -version 2>&1 | grep -q "openjdk version \"11\|1[1-9]\."; then
        print_success "Java JDK 11+ is already installed ($(java -version 2>&1 | head -n1))"
    else
        print_status "Installing OpenJDK 11..."
        sudo apt install -y openjdk-11-jdk openjdk-11-jre
        
        # Set JAVA_HOME
        echo 'export JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64' >> ~/.bashrc
        echo 'export PATH=$JAVA_HOME/bin:$PATH' >> ~/.bashrc
        export JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
        export PATH=$JAVA_HOME/bin:$PATH
        
        print_success "Java JDK 11 installed successfully"
    fi
}

# Function to install Maven 3.9+
install_maven() {
    if command -v mvn &> /dev/null; then
        MAVEN_VERSION=$(mvn -version | head -n 1 | cut -d' ' -f3)
        print_success "Maven is already installed (version $MAVEN_VERSION)"
    else
        print_status "Installing Maven..."
        
        # Download and install Maven 3.9.9
        cd /tmp
        wget https://archive.apache.org/dist/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.tar.gz
        tar -xzf apache-maven-3.9.9-bin.tar.gz
        sudo mv apache-maven-3.9.9 /opt/maven
        
        # Set Maven environment variables
        echo 'export MAVEN_HOME=/opt/maven' >> ~/.bashrc
        echo 'export PATH=$MAVEN_HOME/bin:$PATH' >> ~/.bashrc
        export MAVEN_HOME=/opt/maven
        export PATH=$MAVEN_HOME/bin:$PATH
        
        print_success "Maven 3.9.9 installed successfully"
    fi
}

# Function to install Git
install_git() {
    if command -v git &> /dev/null; then
        GIT_VERSION=$(git --version | cut -d' ' -f3)
        print_success "Git is already installed (version $GIT_VERSION)"
    else
        print_status "Installing Git..."
        sudo apt install -y git
        print_success "Git installed successfully"
    fi
}

# Function to install Docker
install_docker() {
    if command -v docker &> /dev/null; then
        print_success "Docker is already installed ($(docker --version))"
    else
        print_status "Installing Docker..."
        
        # Install prerequisites
        sudo apt install -y ca-certificates curl gnupg lsb-release
        
        # Add Docker's official GPG key
        sudo mkdir -p /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        
        # Add Docker repository
        echo \
          "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
          $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        
        # Update package index
        sudo apt update
        
        # Install Docker Engine, containerd, and Docker Compose
        sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        
        print_success "Docker installed successfully"
    fi
}

# Function to configure Docker for current user
configure_docker_user() {
    print_status "Configuring Docker for user $(whoami)..."
    
    # Add user to docker group
    sudo usermod -aG docker $(whoami)
    
    # Start and enable Docker service
    sudo systemctl start docker
    sudo systemctl enable docker
    
    # Fix Docker socket permissions (for immediate access)
    sudo chmod 666 /var/run/docker.sock
    
    print_success "Docker configured for user $(whoami)"
    print_warning "You may need to log out and log back in for Docker group changes to take effect"
}

# Function to install additional development tools
install_dev_tools() {
    print_status "Installing additional development tools..."
    
    # Install curl, wget, unzip if not already installed
    sudo apt install -y curl wget unzip build-essential
    
    # Install Node.js and npm (required for Vue.js frontend)
    if ! command -v node &> /dev/null; then
        print_status "Installing Node.js and npm..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt install -y nodejs
        print_success "Node.js and npm installed"
    else
        print_success "Node.js is already installed ($(node --version))"
    fi
    
    print_success "Development tools installed"
}

# Function to verify installations
verify_installations() {
    print_status "Verifying installations..."
    
    echo "Checking Java:"
    if java -version 2>&1 | head -n1; then
        print_success "Java verification passed"
    else
        print_error "Java verification failed"
        return 1
    fi
    
    echo "Checking Maven:"
    if mvn -version | head -n1; then
        print_success "Maven verification passed"
    else
        print_error "Maven verification failed"
        return 1
    fi
    
    echo "Checking Git:"
    if git --version; then
        print_success "Git verification passed"
    else
        print_error "Git verification failed"
        return 1
    fi
    
    echo "Checking Docker:"
    if docker --version; then
        print_success "Docker verification passed"
    else
        print_error "Docker verification failed"
        return 1
    fi
    
    echo "Checking Docker Compose:"
    if docker compose version; then
        print_success "Docker Compose verification passed"
    else
        print_error "Docker Compose verification failed"
        return 1
    fi
    
    echo "Checking Node.js:"
    if node --version; then
        print_success "Node.js verification passed"
    else
        print_error "Node.js verification failed"
        return 1
    fi
    
    print_success "All verifications completed!"
}

# Function to test Java and Maven
test_java_maven() {
    print_status "Testing Java and Maven installation..."
    
    # Test Java
    if java -version > /dev/null 2>&1; then
        print_success "Java test successful!"
    else
        print_warning "Java test failed. You may need to source ~/.bashrc or restart your terminal."
    fi
    
    # Test Maven
    if mvn -version > /dev/null 2>&1; then
        print_success "Maven test successful!"
    else
        print_warning "Maven test failed. You may need to source ~/.bashrc or restart your terminal."
    fi
}

# Function to display post-installation instructions
display_instructions() {
    print_success "Dependencies installation completed successfully!"
    echo
    print_status "Post-installation steps:"
    echo "1. IMPORTANT: Source your bashrc or restart your terminal session:"
    echo "   source ~/.bashrc"
    echo "2. IMPORTANT: Log out and log back in for Docker group changes to take effect"
    echo "3. Test installations with:"
    echo "   java -version"
    echo "   mvn -version"
    echo "   git --version"
    echo "   docker --version"
    echo "   node --version"
    echo
    print_status "Environment Variables Set:"
    echo "✓ JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64"
    echo "✓ MAVEN_HOME=/opt/maven"
    echo "✓ PATH updated with Java and Maven"
    echo
    print_status "Ready for OpenSILEX installation!"
    echo "Next step: Run the opensilex-installer.sh script"
}

# Main execution
main() {
    echo "=============================================="
    echo "OpenSILEX GitHub Dependencies Installer"
    echo "for Debian 12"
    echo "=============================================="
    echo
    
    # Pre-flight checks
    check_root
    check_sudo
    
    # Install core components
    update_system
    install_java
    install_maven
    install_git
    install_docker
    configure_docker_user
    install_dev_tools
    
    # Verify installations
    verify_installations
    
    # Test Java and Maven
    test_java_maven
    
    # Display final instructions
    display_instructions
}

# Execute main function
main "$@"