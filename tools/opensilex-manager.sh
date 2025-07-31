#!/bin/bash

# OpenSILEX Management Script
# This script provides management functions for OpenSILEX GitHub installation

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
OPENSILEX_HOME="$HOME/opensilex"
DOCKER_COMPOSE_DIR="$OPENSILEX_HOME/opensilex-dev-tools/src/main/resources/docker"

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

# Function to check if OpenSILEX is installed
check_installation() {
    if [ ! -d "$OPENSILEX_HOME" ]; then
        print_error "OpenSILEX installation not found at $OPENSILEX_HOME"
        print_status "Please run opensilex-installer.sh first"
        exit 1
    fi
}

# Function to start databases
start_databases() {
    print_status "Starting OpenSILEX databases..."
    cd "$DOCKER_COMPOSE_DIR"
    
    if docker compose up -d; then
        print_success "Databases started successfully"
        
        # Wait for databases to be ready
        print_status "Waiting for databases to be ready..."
        sleep 10
        
        # Check container status
        docker compose ps
    else
        print_error "Failed to start databases"
        exit 1
    fi
}

# Function to stop databases
stop_databases() {
    print_status "Stopping OpenSILEX databases..."
    cd "$DOCKER_COMPOSE_DIR"
    
    if docker compose down; then
        print_success "Databases stopped successfully"
    else
        print_error "Failed to stop databases"
        exit 1
    fi
}

# Function to restart databases
restart_databases() {
    print_status "Restarting OpenSILEX databases..."
    stop_databases
    sleep 2
    start_databases
}

# Function to check database status
check_database_status() {
    print_status "Checking database status..."
    cd "$DOCKER_COMPOSE_DIR"
    
    if docker compose ps; then
        echo
        if docker compose ps | grep -q "Up"; then
            print_success "Databases are running"
        else
            print_warning "Databases are not running"
        fi
    else
        print_error "Failed to check database status"
    fi
}

# Function to start OpenSILEX server (backend only)
start_server() {
    check_installation
    
    print_status "Starting OpenSILEX server (backend only)..."
    cd "$OPENSILEX_HOME"
    
    # Set environment variables
    export JAVA_HOME=${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}
    export MAVEN_HOME=${MAVEN_HOME:-/opt/maven}
    export PATH=$JAVA_HOME/bin:$MAVEN_HOME/bin:$PATH
    
    # Start databases first
    start_databases
    
    # Start the server
    print_status "Starting OpenSILEX server..."
    ~/opensilex/opensilex-release/target/opensilex/opensilex.sh dev start --no-front-dev
}

# Function to start OpenSILEX with frontend
start_server_with_frontend() {
    check_installation
    
    print_status "Starting OpenSILEX server with Vue.js hot reload..."
    cd "$OPENSILEX_HOME"
    
    # Set environment variables
    export JAVA_HOME=${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}
    export MAVEN_HOME=${MAVEN_HOME:-/opt/maven}
    export PATH=$JAVA_HOME/bin:$MAVEN_HOME/bin:$PATH
    
    # Start databases first
    start_databases
    
    # Start the server with frontend
    print_status "Starting OpenSILEX server with frontend..."
    ~/opensilex/opensilex-release/target/opensilex/opensilex.sh dev start
}

# Function to check OpenSILEX status
check_status() {
    check_installation
    
    print_status "OpenSILEX Installation Status"
    echo "================================"
    
    # Check installation directory
    if [ -d "$OPENSILEX_HOME" ]; then
        print_success "Installation directory: $OPENSILEX_HOME"
    else
        print_error "Installation directory not found"
        return 1
    fi
    
    # Check if opensilex command exists
    if [ -f "$OPENSILEX_HOME/opensilex-release/target/opensilex/opensilex.sh" ]; then
        print_success "OpenSILEX command available"
    else
        print_error "OpenSILEX command not found"
    fi
    
    # Check Java
    if java -version > /dev/null 2>&1; then
        print_success "Java: $(java -version 2>&1 | head -n1)"
    else
        print_error "Java not found or not configured"
    fi
    
    # Check Maven
    if mvn -version > /dev/null 2>&1; then
        print_success "Maven: $(mvn -version | head -n1)"
    else
        print_error "Maven not found or not configured"
    fi
    
    # Check database status
    echo
    check_database_status
    
    # Check if OpenSILEX server is running
    echo
    if netstat -tuln 2>/dev/null | grep -q ":8666"; then
        print_success "OpenSILEX server is running on port 8666"
        print_status "Access at: http://localhost:8666/"
    else
        print_warning "OpenSILEX server is not running on port 8666"
    fi
}

# Function to view logs
view_logs() {
    check_installation
    
    print_status "OpenSILEX Logs"
    echo "=============="
    
    echo "Database logs:"
    cd "$DOCKER_COMPOSE_DIR"
    docker compose logs --tail=50
    
    echo
    print_status "For OpenSILEX server logs, check the terminal where you started the server"
}

# Function to rebuild OpenSILEX
rebuild() {
    check_installation
    
    print_status "Rebuilding OpenSILEX..."
    cd "$OPENSILEX_HOME"
    
    # Set environment variables
    export JAVA_HOME=${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}
    export MAVEN_HOME=${MAVEN_HOME:-/opt/maven}
    export PATH=$JAVA_HOME/bin:$MAVEN_HOME/bin:$PATH
    export MAVEN_OPTS="-Xmx4096m"
    
    if mvn clean install -DskipTests; then
        print_success "OpenSILEX rebuild completed successfully"
    else
        print_error "OpenSILEX rebuild failed"
        exit 1
    fi
}

# Function to update OpenSILEX
update() {
    check_installation
    
    print_status "Updating OpenSILEX from GitHub..."
    cd "$OPENSILEX_HOME"
    
    # Pull latest changes
    if git pull origin master; then
        print_success "Code updated successfully"
        
        # Rebuild the project
        rebuild
        
        print_success "OpenSILEX updated successfully"
    else
        print_error "Failed to update OpenSILEX"
        exit 1
    fi
}

# Function to backup configuration
backup_config() {
    check_installation
    
    BACKUP_DIR="$HOME/opensilex-backup-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    print_status "Creating backup in $BACKUP_DIR..."
    
    # Backup configuration
    cp -r "$OPENSILEX_HOME/opensilex-dev-tools/src/main/resources/config" "$BACKUP_DIR/"
    
    # Backup data directory if it exists
    if [ -d "$HOME/opensilex-data" ]; then
        cp -r "$HOME/opensilex-data" "$BACKUP_DIR/"
    fi
    
    print_success "Backup created successfully at $BACKUP_DIR"
}

# Function to clean up temporary files
cleanup() {
    check_installation
    
    print_status "Cleaning up temporary files..."
    cd "$OPENSILEX_HOME"
    
    # Clean Maven build files
    mvn clean
    
    # Clean Docker volumes (be careful with this)
    read -p "Do you want to clean Docker volumes? This will delete all database data! (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd "$DOCKER_COMPOSE_DIR"
        docker compose down -v
        print_warning "Docker volumes cleaned. You'll need to run '~/opensilex/opensilex-release/target/opensilex/opensilex.sh dev install' again."
    fi
    
    print_success "Cleanup completed"
}

# Function to show help
show_help() {
    echo "OpenSILEX Management Script"
    echo "=========================="
    echo
    echo "Usage: $0 [COMMAND]"
    echo
    echo "Commands:"
    echo "  start-db          Start only the databases"
    echo "  stop-db           Stop the databases"
    echo "  restart-db        Restart the databases"
    echo "  status-db         Check database status"
    echo "  start             Start OpenSILEX server (backend only)"
    echo "  start-full        Start OpenSILEX server with frontend"
    echo "  status            Check OpenSILEX installation status"
    echo "  logs              View database logs"
    echo "  rebuild           Rebuild OpenSILEX from source"
    echo "  update            Update OpenSILEX from GitHub and rebuild"
    echo "  backup            Backup configuration and data"
    echo "  cleanup           Clean temporary files and optionally database"
    echo "  help              Show this help message"
    echo
    echo "Examples:"
    echo "  $0 start          # Start OpenSILEX server (backend only)"
    echo "  $0 start-full     # Start with Vue.js frontend hot reload"
    echo "  $0 status         # Check installation status"
    echo "  $0 logs           # View logs"
    echo
    echo "Access URLs:"
    echo "  - Application: http://localhost:8666/"
    echo "  - API Docs: http://localhost:8666/api-docs" 
    echo "  - Default Login: admin@opensilex.org / admin"
}

# Main execution
main() {
    case "${1:-help}" in
        "start-db")
            start_databases
            ;;
        "stop-db")
            stop_databases
            ;;
        "restart-db")
            restart_databases
            ;;
        "status-db")
            check_database_status
            ;;
        "start")
            start_server
            ;;
        "start-full")
            start_server_with_frontend
            ;;
        "status")
            check_status
            ;;
        "logs")
            view_logs
            ;;
        "rebuild")
            rebuild
            ;;
        "update")
            update
            ;;
        "backup")
            backup_config
            ;;
        "cleanup")
            cleanup
            ;;
        "help"|"--help"|"-h")
            show_help
            ;;
        *)
            print_error "Unknown command: $1"
            echo
            show_help
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"