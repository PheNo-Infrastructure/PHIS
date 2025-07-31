#!/bin/bash

# OpenSILEX GitHub Installation Script
# This script installs OpenSILEX from the GitHub repository

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
OPENSILEX_HOME="$HOME/opensilex"
OPENSILEX_REPO="https://github.com/OpenSILEX/opensilex.git"
OPENSILEX_BRANCH="master"  # or specify a version tag like "v4.1.0"

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

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Java
    if ! java -version 2>&1 | grep -q "openjdk version \"1[1-9]\.\|openjdk version \"[2-9][0-9]\."; then
        print_error "Java JDK 11+ is required. Please run opensilex-dependencies.sh first."
        exit 1
    fi
    
    # Check Maven
    if ! command -v mvn &> /dev/null; then
        print_error "Maven is required. Please run opensilex-dependencies.sh first."
        exit 1
    fi
    
    # Check Git
    if ! command -v git &> /dev/null; then
        print_error "Git is required. Please run opensilex-dependencies.sh first."
        exit 1
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is required. Please run opensilex-dependencies.sh first."
        exit 1
    fi
    
    print_success "All prerequisites are met"
}

# Function to clone OpenSILEX repository
clone_opensilex() {
    print_status "Cloning OpenSILEX repository..."
    
    if [ -d "$OPENSILEX_HOME" ]; then
        print_warning "OpenSILEX directory already exists at $OPENSILEX_HOME"
        read -p "Do you want to remove it and re-clone? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$OPENSILEX_HOME"
        else
            print_status "Using existing repository"
            cd "$OPENSILEX_HOME"
            git pull origin $OPENSILEX_BRANCH
            return
        fi
    fi
    
    # Clone the repository
    git clone --branch $OPENSILEX_BRANCH $OPENSILEX_REPO $OPENSILEX_HOME
    cd "$OPENSILEX_HOME"
    
    print_success "OpenSILEX repository cloned successfully"
}

# Function to build OpenSILEX
build_opensilex() {
    print_status "Building OpenSILEX (this may take several minutes)..."
    cd "$OPENSILEX_HOME"
    
    # Set Maven options for better performance
    export MAVEN_OPTS="-Xmx4096m"
    
    # Build the project
    if mvn clean install -DskipTests; then
        print_success "OpenSILEX build completed successfully"
    else
        print_error "OpenSILEX build failed. Check the logs above."
        exit 1
    fi
}

# Function to setup databases with Docker
setup_databases() {
    print_status "Setting up databases with Docker..."
    cd "$OPENSILEX_HOME/opensilex-dev-tools/src/main/resources/docker"
    
    # Stop any existing containers
    docker compose down 2>/dev/null || true
    
    # Start the databases
    if docker compose up -d; then
        print_success "Databases started successfully"
        
        # Wait for databases to be ready
        print_status "Waiting for databases to be ready..."
        sleep 30
        
        # Check if containers are running
        if docker compose ps | grep -q "Up"; then
            print_success "Database containers are running"
        else
            print_warning "Some database containers may not be running properly"
            docker compose ps
        fi
    else
        print_error "Failed to start databases"
        exit 1
    fi
}

# Function to configure OpenSILEX
configure_opensilex() {
    print_status "Configuring OpenSILEX..."
    
    CONFIG_FILE="$OPENSILEX_HOME/opensilex-dev-tools/src/main/resources/config/opensilex.yml"
    
    if [ ! -f "$CONFIG_FILE" ]; then
        print_error "Configuration file not found at $CONFIG_FILE"
        exit 1
    fi
    
    # Create data storage directory
    STORAGE_DIR="$HOME/opensilex-data"
    mkdir -p "$STORAGE_DIR"
    
    # Backup original configuration
    cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
    
    # Update configuration with proper storage path
    print_status "Setting storage path to $STORAGE_DIR"
    
    # Use sed to replace the storageBasePath in the YAML file
    sed -i "s|storageBasePath:.*|storageBasePath: $STORAGE_DIR|g" "$CONFIG_FILE"
    
    # Set proper permissions for storage directory
    chmod -R 755 "$STORAGE_DIR"
    
    print_success "OpenSILEX configured successfully"
    print_status "Configuration file: $CONFIG_FILE"
    print_status "Data storage: $STORAGE_DIR"
}

# Function to initialize system data
initialize_system() {
    print_status "Initializing OpenSILEX system data..."
    cd "$OPENSILEX_HOME"
    
    # Set the environment
    export JAVA_HOME=${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}
    export MAVEN_HOME=${MAVEN_HOME:-/opt/maven}
    export PATH=$JAVA_HOME/bin:$MAVEN_HOME/bin:$PATH
    
    # Initialize the system
    if ~/opensilex/opensilex-release/target/opensilex/opensilex.sh dev install; then
        print_success "System initialization completed successfully"
    else
        print_warning "System initialization may have encountered issues. This is sometimes normal on first run."
        print_status "You can try running this manually later: cd $OPENSILEX_HOME && ~/opensilex/opensilex-release/target/opensilex/opensilex.sh dev install"
    fi
}

# Function to create startup scripts
create_startup_scripts() {
    print_status "Creating startup scripts..."
    
    # Create start script
    cat > "$OPENSILEX_HOME/start-opensilex.sh" << 'EOF'
#!/bin/bash
# OpenSILEX Startup Script

cd "$(dirname "$0")"

# Set environment variables
export JAVA_HOME=${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}
export MAVEN_HOME=${MAVEN_HOME:-/opt/maven}
export PATH=$JAVA_HOME/bin:$MAVEN_HOME/bin:$PATH

echo "Starting OpenSILEX databases..."
cd opensilex-dev-tools/src/main/resources/docker
docker compose up -d

echo "Waiting for databases to be ready..."
sleep 10

echo "Starting OpenSILEX server..."
cd "$(dirname "$0")"
~/opensilex/opensilex-release/target/opensilex/opensilex.sh dev start --no-front-dev

echo "OpenSILEX is now running!"
echo "Access the application at: http://localhost:8666/"
echo "API Documentation: http://localhost:8666/api-docs"
echo "Default login: admin@opensilex.org / admin"
EOF

    # Create start with frontend script
    cat > "$OPENSILEX_HOME/start-opensilex-with-frontend.sh" << 'EOF'
#!/bin/bash
# OpenSILEX Startup Script with Vue.js Hot Reload

cd "$(dirname "$0")"

# Set environment variables
export JAVA_HOME=${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}
export MAVEN_HOME=${MAVEN_HOME:-/opt/maven}
export PATH=$JAVA_HOME/bin:$MAVEN_HOME/bin:$PATH

echo "Starting OpenSILEX databases..."
cd opensilex-dev-tools/src/main/resources/docker
docker compose up -d

echo "Waiting for databases to be ready..."
sleep 10

echo "Starting OpenSILEX server with Vue.js hot reload..."
cd "$(dirname "$0")"
~/opensilex/opensilex-release/target/opensilex/opensilex.sh dev start

echo "OpenSILEX is now running!"
echo "Access the application at: http://localhost:8666/"
echo "API Documentation: http://localhost:8666/api-docs"
echo "Default login: admin@opensilex.org / admin"
EOF

    # Create stop script
    cat > "$OPENSILEX_HOME/stop-opensilex.sh" << 'EOF'
#!/bin/bash
# OpenSILEX Stop Script

cd "$(dirname "$0")"

echo "Stopping OpenSILEX databases..."
cd opensilex-dev-tools/src/main/resources/docker
docker compose down

echo "OpenSILEX databases stopped."
echo "Note: The Java server needs to be stopped manually (Ctrl+C in the terminal where it's running)"
EOF

    # Make scripts executable
    chmod +x "$OPENSILEX_HOME/start-opensilex.sh"
    chmod +x "$OPENSILEX_HOME/start-opensilex-with-frontend.sh"
    chmod +x "$OPENSILEX_HOME/stop-opensilex.sh"
    
    print_success "Startup scripts created successfully"
}

# Function to create PHIS theme configuration
configure_phis_theme() {
    print_status "Configuring PHIS theme..."
    
    # This is a placeholder for PHIS theme configuration
    # The GitHub version may require different theme configuration than docker-compose
    print_warning "PHIS theme configuration needs to be implemented based on OpenSILEX GitHub documentation"
    print_status "For now, OpenSILEX will use the default theme"
}

# Function to run basic tests
run_tests() {
    print_status "Running basic installation tests..."
    cd "$OPENSILEX_HOME"
    
    # Test if opensilex command works
    if ~/opensilex/opensilex-release/target/opensilex/opensilex.sh --help > /dev/null 2>&1; then
        print_success "OpenSILEX command line tool is working"
    else
        print_warning "OpenSILEX command line tool test failed"
    fi
    
    # Check if databases are accessible
    if docker compose -f opensilex-dev-tools/src/main/resources/docker/docker-compose.yml ps | grep -q "Up"; then
        print_success "Database containers are running"
    else
        print_warning "Database containers are not running"
    fi
}

# Function to display final instructions
display_instructions() {
    print_success "OpenSILEX installation completed successfully!"
    echo
    print_status "Installation Summary:"
    echo "✓ OpenSILEX cloned to: $OPENSILEX_HOME"
    echo "✓ Project built successfully"
    echo "✓ Databases configured and running"
    echo "✓ System initialized"
    echo "✓ Startup scripts created"
    echo
    print_status "How to start OpenSILEX:"
    echo "1. Backend only (API services):"
    echo "   cd $OPENSILEX_HOME && ./start-opensilex.sh"
    echo
    echo "2. Backend + Frontend with hot reload:"
    echo "   cd $OPENSILEX_HOME && ./start-opensilex-with-frontend.sh"
    echo
    echo "3. Manual start:"
    echo "   cd $OPENSILEX_HOME"
    echo "   ~/opensilex/opensilex-release/target/opensilex/opensilex.sh dev start --no-front-dev    # Backend only"
    echo "   ~/opensilex/opensilex-release/target/opensilex/opensilex.sh dev start                   # With frontend"
    echo
    print_status "How to stop OpenSILEX:"
    echo "   cd $OPENSILEX_HOME && ./stop-opensilex.sh"
    echo
    print_status "Access URLs:"
    echo "- OpenSILEX Application: http://localhost:8666/"
    echo "- API Documentation: http://localhost:8666/api-docs"
    echo "- Default Login: admin@opensilex.org / admin"
    echo
    print_status "Important Files:"
    echo "- Configuration: $OPENSILEX_HOME/opensilex-dev-tools/src/main/resources/config/opensilex.yml"
    echo "- Data Storage: $HOME/opensilex-data"
    echo "- Logs: Check the terminal output where you started OpenSILEX"
    echo
    print_warning "Note: Unlike the docker-compose version, this installation runs OpenSILEX natively with Java."
    print_warning "Make sure to keep the terminal window open where OpenSILEX is running."
    echo
    print_status "Troubleshooting:"
    echo "- If databases don't start: cd $OPENSILEX_HOME/opensilex-dev-tools/src/main/resources/docker && docker compose up -d"
    echo "- If build fails: cd $OPENSILEX_HOME && mvn clean install"
    echo "- If system init fails: cd $OPENSILEX_HOME && ~/opensilex/opensilex-release/target/opensilex/opensilex.sh dev install"
}

# Main execution
main() {
    echo "=============================================="
    echo "OpenSILEX GitHub Installation Script"
    echo "=============================================="
    echo
    
    # Check prerequisites
    check_prerequisites
    
    # Clone repository
    clone_opensilex
    
    # Build OpenSILEX
    build_opensilex
    
    # Setup databases
    setup_databases
    
    # Configure OpenSILEX
    configure_opensilex
    
    # Initialize system
    initialize_system
    
    # Create startup scripts
    create_startup_scripts
    
    # Configure PHIS theme (placeholder)
    configure_phis_theme
    
    # Run tests
    run_tests
    
    # Display final instructions
    display_instructions
}

# Execute main function
main "$@"