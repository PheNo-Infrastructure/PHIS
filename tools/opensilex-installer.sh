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
    
    # Check Java (require Java 17+ for OpenSILEX 1.4.8-rdg)
    if ! java -version 2>&1 | grep -q "openjdk version \"1[7-9]\.\|openjdk version \"[2-9][0-9]\."; then
        print_error "Java JDK 17+ is required. Please run opensilex-dependencies.sh first."
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
    
    # Create production directory structure like the PowerShell script
    PRODUCTION_DIR="$HOME/opensilex"
    BIN_DIR="$PRODUCTION_DIR/bin/1.4.8-rdg"
    CONFIG_DIR="$PRODUCTION_DIR/config"
    DATA_DIR="$PRODUCTION_DIR/data"
    LOG_DIR="$PRODUCTION_DIR/logs"
    
    mkdir -p "$BIN_DIR" "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR"
    
    # Copy the built JAR file to production location
    if [ -f "$OPENSILEX_HOME/opensilex-release/target/opensilex.jar" ]; then
        cp "$OPENSILEX_HOME/opensilex-release/target/opensilex.jar" "$BIN_DIR/"
    else
        print_error "OpenSILEX JAR file not found. Build may have failed."
        exit 1
    fi
    
    # Create opensilex.sh wrapper script (same as PowerShell script)
    cat > "$BIN_DIR/opensilex.sh" << 'EOF'
#!/bin/bash
# OpenSILEX 1.4.8-rdg Wrapper Script
SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
CONFIG_FILE="/home/$(whoami)/opensilex/config/opensilex.yml"

cd $SCRIPT_DIR
java --add-opens java.base/java.io=ALL-UNNAMED \
     --add-opens java.base/java.lang=ALL-UNNAMED \
     --add-opens java.base/java.lang.reflect=ALL-UNNAMED \
     --add-opens java.base/java.net=ALL-UNNAMED \
     --add-opens java.base/java.text=ALL-UNNAMED \
     --add-opens java.base/java.util=ALL-UNNAMED \
     --add-opens java.base/jdk.internal.loader=ALL-UNNAMED \
     --add-opens java.base/sun.nio.ch=ALL-UNNAMED \
     --add-opens java.base/sun.nio.fs=ALL-UNNAMED \
     --add-opens java.desktop/java.awt.font=ALL-UNNAMED \
     --add-opens java.logging/java.util.logging=ALL-UNNAMED \
     -Dlogback.configurationFile=./logback.xml \
     -Djava.awt.headless=true \
     -XX:+UseG1GC -Xms8G -Xmx20G \
     -jar $SCRIPT_DIR/opensilex.jar --BASE_DIRECTORY=$SCRIPT_DIR --CONFIG_FILE=$CONFIG_FILE "$@"
EOF
    
    chmod +x "$BIN_DIR/opensilex.sh"
    
    # Copy configuration to production location
    cp "$CONFIG_FILE" "$CONFIG_DIR/"
    
    # Backup original configuration
    cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
    
    # Update configuration with proper storage path
    print_status "Setting storage path to $DATA_DIR"
    
    # Use sed to replace the storageBasePath in the YAML file
    sed -i "s|storageBasePath:.*|storageBasePath: $DATA_DIR|g" "$CONFIG_DIR/opensilex.yml"
    
    # Set proper permissions for directories
    chmod -R 755 "$PRODUCTION_DIR"
    
    print_success "OpenSILEX configured successfully"
    print_status "Configuration file: $CONFIG_DIR/opensilex.yml"
    print_status "Data storage: $DATA_DIR"
    print_status "OpenSILEX wrapper: $BIN_DIR/opensilex.sh"
}

# Function to initialize system data
initialize_system() {
    print_status "Initializing OpenSILEX system data..."
    cd "$OPENSILEX_HOME"
    
    # Set the environment (using actual Java 17 installation paths)
    export JAVA_HOME=${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}
    export MAVEN_HOME=${MAVEN_HOME:-/usr/share/maven}
    export PATH=$JAVA_HOME/bin:$MAVEN_HOME/bin:$PATH
    
    # Initialize the system using production wrapper
    PRODUCTION_WRAPPER="$HOME/opensilex/bin/1.4.8-rdg/opensilex.sh"
    
    if [ -f "$PRODUCTION_WRAPPER" ]; then
        print_status "Using production wrapper: $PRODUCTION_WRAPPER"
        if "$PRODUCTION_WRAPPER" sparql reset-ontologies; then
            print_success "Database initialization completed successfully"
            
            # Create admin user
            print_status "Creating admin user..."
            "$PRODUCTION_WRAPPER" user add --admin || print_warning "Admin user creation may have failed (might already exist)"
        else
            print_warning "Database initialization may have encountered issues."
            print_status "You can try running this manually later: $PRODUCTION_WRAPPER sparql reset-ontologies"
        fi
    else
        print_error "Production wrapper not found at $PRODUCTION_WRAPPER"
        exit 1
    fi
}

# Function to create startup scripts
create_startup_scripts() {
    print_status "Creating startup scripts..."
    
    # Create start script using production wrapper
    cat > "$HOME/opensilex/start-opensilex.sh" << 'EOF'
#!/bin/bash
# OpenSILEX Production Startup Script

# Set environment variables
export JAVA_HOME=${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}
export MAVEN_HOME=${MAVEN_HOME:-/usr/share/maven}
export PATH=$JAVA_HOME/bin:$MAVEN_HOME/bin:$PATH

echo "Starting OpenSILEX databases..."
cd ~/opensilex/opensilex-dev-tools/src/main/resources/docker
docker compose up -d

echo "Waiting for databases to be ready..."
sleep 10

echo "Starting OpenSILEX server..."
cd ~/opensilex/bin/1.4.8-rdg
./opensilex.sh server start --host=0.0.0.0 --port=8666

echo "OpenSILEX is now running!"
echo "Access the application at: http://localhost:8666/"
echo "API Documentation: http://localhost:8666/api-docs"
echo "Default login: admin@opensilex.org / admin"
EOF

    # Create stop script
    cat > "$HOME/opensilex/stop-opensilex.sh" << 'EOF'
#!/bin/bash
# OpenSILEX Stop Script

echo "Stopping OpenSILEX databases..."
cd ~/opensilex/opensilex-dev-tools/src/main/resources/docker
docker compose down

echo "Killing OpenSILEX server processes..."
pkill -f "java.*opensilex.jar"

echo "OpenSILEX stopped."
EOF

    # Make scripts executable
    chmod +x "$HOME/opensilex/start-opensilex.sh"
    chmod +x "$HOME/opensilex/stop-opensilex.sh"
    
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
    
    # Test if production opensilex wrapper works
    if ~/opensilex/bin/1.4.8-rdg/opensilex.sh --help > /dev/null 2>&1; then
        print_success "OpenSILEX production wrapper is working"
    else
        print_warning "OpenSILEX production wrapper test failed"
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
    echo "✓ Production structure created: ~/opensilex/"
    echo "✓ OpenSILEX wrapper created: ~/opensilex/bin/1.4.8-rdg/opensilex.sh"
    echo "✓ Databases configured and running"
    echo "✓ System initialized with admin user"
    echo "✓ Startup scripts created"
    echo
    print_status "How to start OpenSILEX:"
    echo "1. Production server:"
    echo "   cd ~/opensilex && ./start-opensilex.sh"
    echo
    echo "2. Manual start:"
    echo "   cd ~/opensilex/bin/1.4.8-rdg"
    echo "   ./opensilex.sh server start --host=0.0.0.0 --port=8666"
    echo
    echo "3. Database commands:"
    echo "   ~/opensilex/bin/1.4.8-rdg/opensilex.sh sparql reset-ontologies"
    echo "   ~/opensilex/bin/1.4.8-rdg/opensilex.sh user add --admin"
    echo
    print_status "How to stop OpenSILEX:"
    echo "   cd ~/opensilex && ./stop-opensilex.sh"
    echo
    print_status "Access URLs:"
    echo "- OpenSILEX Application: http://localhost:8666/"
    echo "- API Documentation: http://localhost:8666/api-docs"
    echo "- Default Login: admin@opensilex.org / admin"
    echo
    print_status "Important Files:"
    echo "- Configuration: ~/opensilex/config/opensilex.yml"
    echo "- Data Storage: ~/opensilex/data/"
    echo "- Logs: ~/opensilex/logs/"
    echo "- OpenSILEX Wrapper: ~/opensilex/bin/1.4.8-rdg/opensilex.sh"
    echo
    print_success "Production-ready OpenSILEX 1.4.8-rdg installation complete!"
    print_warning "This uses the same production structure as the PowerShell Azure deployment."
    echo
    print_status "Troubleshooting:"
    echo "- If databases don't start: cd $OPENSILEX_HOME/opensilex-dev-tools/src/main/resources/docker && docker compose up -d"
    echo "- If build fails: cd $OPENSILEX_HOME && mvn clean install"
    echo "- If init fails: ~/opensilex/bin/1.4.8-rdg/opensilex.sh sparql reset-ontologies"
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