#!/bin/bash
# OpenSILEX Production Installation Script
# Linux/Ubuntu/Debian installation script for production deployment
# Based on official OpenSILEX production documentation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
OPENSILEX_VERSION="1.1.1"
OPENSILEX_USER="opensilex"
OPENSILEX_HOME="/home/opensilex"
JAVA_VERSION="17"
MONGODB_VERSION="6.0"
RDF4J_VERSION="5.0.3"
NGINX_ENABLED="true"
DOMAIN_NAME=""
SSL_ENABLED="false"
MONGODB_REPLICA_SET="opensilex"

# Functions
print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

print_header() {
    echo -e "${BLUE}"
    echo "=================================================================="
    echo "         OpenSILEX Production Installation Script"
    echo "=================================================================="
    echo -e "${NC}"
}

check_root() {
    if [[ $EUID -eq 0 ]]; then
       print_error "This script should not be run as root for security reasons."
       print_info "Please run as a regular user with sudo privileges."
       exit 1
    fi
    
    # Check if user has sudo privileges
    if ! sudo -n true 2>/dev/null; then
        print_error "User must have sudo privileges to run this script."
        exit 1
    fi
}

check_system() {
    print_status "Checking system requirements..."
    
    # Check if running on Linux
    if [[ "$OSTYPE" != "linux-gnu"* ]]; then
        print_error "This script is designed for Linux systems only."
        exit 1
    fi
    
    # Check distribution
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        print_success "Detected OS: $PRETTY_NAME"
        
        if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
            print_warning "This script is optimized for Ubuntu/Debian. Proceed with caution."
        fi
    else
        print_warning "Cannot detect OS distribution."
    fi
    
    # Check available disk space (need at least 10GB)
    available_space=$(df / | awk 'NR==2{printf "%.0f", $4/1024/1024}')
    if [ "$available_space" -lt 10 ]; then
        print_error "Insufficient disk space. Need at least 10GB available."
        exit 1
    fi
    
    print_success "System requirements check passed"
}

prompt_configuration() {
    print_status "Configuration setup..."
    
    echo "Please provide the following configuration:"
    
    # Domain name
    read -p "Enter domain name (e.g., opensilex.example.com) [localhost]: " input_domain
    DOMAIN_NAME=${input_domain:-localhost}
    
    # SSL configuration
    if [[ "$DOMAIN_NAME" != "localhost" && "$DOMAIN_NAME" != "127.0.0.1" ]]; then
        read -p "Enable SSL/HTTPS? (y/n) [n]: " ssl_choice
        if [[ "$ssl_choice" =~ ^[Yy]$ ]]; then
            SSL_ENABLED="true"
        fi
    fi
    
    # Nginx
    read -p "Install and configure Nginx reverse proxy? (y/n) [y]: " nginx_choice
    if [[ "$nginx_choice" =~ ^[Nn]$ ]]; then
        NGINX_ENABLED="false"
    fi
    
    print_success "Configuration completed"
}

install_dependencies() {
    print_status "Installing system dependencies..."
    
    # Update system
    sudo apt update
    sudo apt upgrade -y
    
    # Install essential packages
    sudo apt install -y \
        curl \
        wget \
        unzip \
        git \
        ca-certificates \
        gnupg \
        lsb-release \
        apt-transport-https \
        software-properties-common \
        build-essential
    
    print_success "System dependencies installed"
}

install_java() {
    print_status "Installing Java JDK $JAVA_VERSION..."
    
    # Install Java
    sudo apt install -y openjdk-${JAVA_VERSION}-jdk openjdk-${JAVA_VERSION}-jre
    
    # Set JAVA_HOME
    JAVA_HOME_PATH="/usr/lib/jvm/java-${JAVA_VERSION}-openjdk-amd64"
    echo "export JAVA_HOME=$JAVA_HOME_PATH" | sudo tee -a /etc/environment
    echo "export PATH=\$JAVA_HOME/bin:\$PATH" | sudo tee -a /etc/environment
    
    # Verify installation
    java_version=$(java -version 2>&1 | head -n 1 | awk -F '"' '{print $2}')
    print_success "Java $java_version installed successfully"
}

install_docker() {
    print_status "Installing Docker..."
    
    # Add Docker's official GPG key
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/$(lsb_release -is | tr '[:upper:]' '[:lower:]')/gpg | \
        sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    # Add Docker repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/$(lsb_release -is | tr '[:upper:]' '[:lower:]') \
        $(lsb_release -cs) stable" | \
        sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Configure Docker
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker $USER
    sudo usermod -aG docker $OPENSILEX_USER
    
    print_success "Docker installed successfully"
}

create_opensilex_user() {
    print_status "Creating OpenSILEX system user..."
    
    # Create user if it doesn't exist
    if ! id "$OPENSILEX_USER" &>/dev/null; then
        sudo useradd -s /bin/bash -d $OPENSILEX_HOME -m $OPENSILEX_USER
        print_success "Created user: $OPENSILEX_USER"
    else
        print_warning "User $OPENSILEX_USER already exists"
    fi
    
    # Create directory structure
    sudo -u $OPENSILEX_USER mkdir -p $OPENSILEX_HOME/{bin,config,data,logs,backups}
    sudo -u $OPENSILEX_USER chmod 755 $OPENSILEX_HOME/{bin,config,data,logs,backups}
    
    print_success "OpenSILEX user and directories created"
}

setup_mongodb() {
    print_status "Setting up MongoDB with replica set..."
    
    # Create Docker network for MongoDB cluster
    docker network create mongoCluster 2>/dev/null || true
    
    # Stop and remove existing MongoDB container if it exists
    docker stop mongo_opensilex 2>/dev/null || true
    docker rm mongo_opensilex 2>/dev/null || true
    
    # Create MongoDB data directory
    sudo -u $OPENSILEX_USER mkdir -p $OPENSILEX_HOME/data/mongodb
    
    # Start MongoDB with replica set
    docker run -d \
        --name mongo_opensilex \
        --network mongoCluster \
        -p 27017:27017 \
        -v $OPENSILEX_HOME/data/mongodb:/data/db \
        -e MONGO_INITDB_DATABASE=opensilex \
        mongo:$MONGODB_VERSION \
        mongod --replSet $MONGODB_REPLICA_SET --bind_ip localhost,mongo_opensilex
    
    # Wait for MongoDB to start
    print_status "Waiting for MongoDB to start..."
    sleep 10
    
    # Initialize replica set
    docker exec mongo_opensilex mongosh --eval "
        rs.initiate({
            _id: '$MONGODB_REPLICA_SET',
            members: [
                { _id: 0, host: 'mongo_opensilex:27017' }
            ]
        })
    "
    
    # Create MongoDB service file
    sudo tee /etc/systemd/system/opensilex-mongodb.service > /dev/null << EOF
[Unit]
Description=OpenSILEX MongoDB Container
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/docker start mongo_opensilex
ExecStop=/usr/bin/docker stop mongo_opensilex
User=root

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    sudo systemctl enable opensilex-mongodb.service
    
    print_success "MongoDB with replica set configured"
}

setup_rdf4j() {
    print_status "Setting up RDF4J triplestore..."
    
    # Stop and remove existing RDF4J container if it exists
    docker stop rdf4j_opensilex 2>/dev/null || true
    docker rm rdf4j_opensilex 2>/dev/null || true
    
    # Create RDF4J data directory
    sudo -u $OPENSILEX_USER mkdir -p $OPENSILEX_HOME/data/rdf4j
    
    # Start RDF4J
    docker run -d \
        --name rdf4j_opensilex \
        -p 8080:8080 \
        -v $OPENSILEX_HOME/data/rdf4j:/var/rdf4j \
        -v $OPENSILEX_HOME/logs:/usr/local/tomcat/logs \
        -e JAVA_OPTS="-Xms2g -Xmx4g" \
        eclipse/rdf4j-workbench:$RDF4J_VERSION
    
    # Wait for RDF4J to start
    print_status "Waiting for RDF4J to start..."
    sleep 15
    
    # Create RDF4J service file
    sudo tee /etc/systemd/system/opensilex-rdf4j.service > /dev/null << EOF
[Unit]
Description=OpenSILEX RDF4J Container
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/docker start rdf4j_opensilex
ExecStop=/usr/bin/docker stop rdf4j_opensilex
User=root

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    sudo systemctl enable opensilex-rdf4j.service
    
    print_success "RDF4J triplestore configured"
}

create_rdf4j_repository() {
    print_status "Creating RDF4J repository for OpenSILEX..."
    
    # Wait for RDF4J to be fully ready
    max_attempts=30
    attempt=1
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:8080/rdf4j-server/ > /dev/null; then
            break
        fi
        print_status "Waiting for RDF4J server... (attempt $attempt/$max_attempts)"
        sleep 5
        attempt=$((attempt + 1))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        print_error "RDF4J server failed to start properly"
        return 1
    fi
    
    # Create repository configuration
    cat > /tmp/opensilex-repo-config.ttl << 'EOF'
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
@prefix rep: <http://www.openrdf.org/config/repository#>.
@prefix sr: <http://www.openrdf.org/config/repository/sail#>.
@prefix sail: <http://www.openrdf.org/config/sail#>.
@prefix ms: <http://www.openrdf.org/config/sail/memory#>.

[] a rep:Repository ;
   rep:repositoryID "opensilex" ;
   rdfs:label "OpenSILEX Repository" ;
   rep:repositoryImpl [
      rep:repositoryType "openrdf:SailRepository" ;
      sr:sailImpl [
         sail:sailType "openrdf:MemoryStore" ;
         ms:persist true ;
         ms:syncDelay 120 ;
      ]
   ].
EOF
    
    # Create the repository
    curl -X POST \
        -H "Content-Type: application/x-turtle" \
        --data-binary @/tmp/opensilex-repo-config.ttl \
        http://localhost:8080/rdf4j-server/repositories/SYSTEM/statements
    
    rm /tmp/opensilex-repo-config.ttl
    
    # Verify repository creation
    if curl -s http://localhost:8080/rdf4j-server/repositories/opensilex | grep -q "opensilex"; then
        print_success "RDF4J repository 'opensilex' created successfully"
    else
        print_error "Failed to create RDF4J repository"
        return 1
    fi
}

install_opensilex() {
    print_status "Installing OpenSILEX application..."
    
    # Download OpenSILEX release
    cd $OPENSILEX_HOME/bin
    sudo -u $OPENSILEX_USER wget -O opensilex-release-${OPENSILEX_VERSION}.zip \
        "https://github.com/OpenSILEX/opensilex/releases/download/${OPENSILEX_VERSION}/opensilex-release-${OPENSILEX_VERSION}.zip"
    
    # Extract OpenSILEX
    sudo -u $OPENSILEX_USER unzip -o opensilex-release-${OPENSILEX_VERSION}.zip
    sudo -u $OPENSILEX_USER mv opensilex-release-${OPENSILEX_VERSION} opensilex
    sudo -u $OPENSILEX_USER chmod +x opensilex/opensilex.sh
    
    print_success "OpenSILEX application installed"
}

configure_opensilex() {
    print_status "Configuring OpenSILEX..."
    
    # Create OpenSILEX configuration file
    sudo -u $OPENSILEX_USER tee $OPENSILEX_HOME/config/opensilex.yml > /dev/null << EOF
# OpenSILEX Production Configuration

ontologies:
    baseURI: http://$DOMAIN_NAME/
    baseURIAlias: prod
    sparql:
        rdf4j:
            serverURI: http://localhost:8080/rdf4j-server/
            repository: opensilex

file-system:
    storageBasePath: $OPENSILEX_HOME/data/files
    fs:
        config:
            defaultFS: local
            connections:
                local:
                    implementation: org.opensilex.fs.local.LocalFileSystemConnection
                    config:
                        basePath: $OPENSILEX_HOME/data/files
                gridfs:
                    implementation: org.opensilex.fs.gridfs.GridFSConnection
                    config:
                        host: localhost
                        port: 27017
                        database: opensilex

big-data:
    nosql:
        mongodb:
            host: localhost
            port: 27017
            database: opensilex

logging:
    config:
        level:
            org.opensilex: INFO
            root: WARN
        file:
            path: $OPENSILEX_HOME/logs/opensilex.log
            maxFileSize: 10MB
            maxHistory: 30

server:
    host: 0.0.0.0
    port: 8080
    baseURL: http://$DOMAIN_NAME
    publicURL: http://$DOMAIN_NAME
    
security:
    jwt:
        secret: $(openssl rand -base64 64 | tr -d '\n')
        expiration: 3600
    admin:
        email: admin@$DOMAIN_NAME
        password: admin
        firstName: System
        lastName: Administrator

# Production optimizations
system:
    enableMetrics: true
    enableHealthCheck: true
    production: true
    
front:
    theme: default
    defaultLanguage: en
    enableDebug: false
    
# BRAPI Configuration
brapi:
    enable: true
    version: v2
    serverInfo:
        serverName: "OpenSILEX Production Server"
        serverDescription: "OpenSILEX BRAPI v2 API Production Instance"
        contactEmail: "admin@$DOMAIN_NAME"
        documentationURL: "http://$DOMAIN_NAME/api-docs"
        location: "Production Environment"
        organizationName: "OpenSILEX"
EOF
    
    # Create file storage directory
    sudo -u $OPENSILEX_USER mkdir -p $OPENSILEX_HOME/data/files
    sudo -u $OPENSILEX_USER chmod 755 $OPENSILEX_HOME/data/files
    
    print_success "OpenSILEX configuration created"
}

initialize_opensilex() {
    print_status "Initializing OpenSILEX system..."
    
    # Set environment variables
    export JAVA_HOME="/usr/lib/jvm/java-${JAVA_VERSION}-openjdk-amd64"
    export PATH="$JAVA_HOME/bin:$PATH"
    
    # Change to OpenSILEX directory
    cd $OPENSILEX_HOME/bin/opensilex
    
    # Initialize the system
    sudo -u $OPENSILEX_USER \
        -E env JAVA_HOME="$JAVA_HOME" PATH="$PATH" \
        ./opensilex.sh system install --config-file=$OPENSILEX_HOME/config/opensilex.yml
    
    # Create default admin user
    sudo -u $OPENSILEX_USER \
        -E env JAVA_HOME="$JAVA_HOME" PATH="$PATH" \
        ./opensilex.sh user add \
        --config-file=$OPENSILEX_HOME/config/opensilex.yml \
        --admin \
        --email="admin@$DOMAIN_NAME" \
        --first-name="System" \
        --last-name="Administrator" \
        --password="admin" || print_warning "Admin user may already exist"
    
    print_success "OpenSILEX system initialized"
}

create_systemd_service() {
    print_status "Creating OpenSILEX systemd service..."
    
    # Create systemd service file
    sudo tee /etc/systemd/system/opensilex.service > /dev/null << EOF
[Unit]
Description=OpenSILEX Application Server
After=network.target opensilex-mongodb.service opensilex-rdf4j.service
Requires=opensilex-mongodb.service opensilex-rdf4j.service

[Service]
Type=simple
User=$OPENSILEX_USER
Group=$OPENSILEX_USER
WorkingDirectory=$OPENSILEX_HOME/bin/opensilex
ExecStart=$OPENSILEX_HOME/bin/opensilex/opensilex.sh server start --no-front-dev --config-file=$OPENSILEX_HOME/config/opensilex.yml
Environment=JAVA_HOME=/usr/lib/jvm/java-${JAVA_VERSION}-openjdk-amd64
Environment=PATH=/usr/lib/jvm/java-${JAVA_VERSION}-openjdk-amd64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd and enable service
    sudo systemctl daemon-reload
    sudo systemctl enable opensilex.service
    
    print_success "OpenSILEX systemd service created"
}

setup_nginx() {
    if [[ "$NGINX_ENABLED" != "true" ]]; then
        print_status "Skipping Nginx setup"
        return 0
    fi
    
    print_status "Setting up Nginx reverse proxy..."
    
    # Install Nginx
    sudo apt install -y nginx
    
    # Create Nginx configuration
    sudo tee /etc/nginx/sites-available/opensilex > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Proxy to OpenSILEX
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Static files optimization
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host \$host;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Logs
    access_log /var/log/nginx/opensilex_access.log;
    error_log /var/log/nginx/opensilex_error.log;
}
EOF
    
    # Enable site
    sudo ln -sf /etc/nginx/sites-available/opensilex /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    
    # Test and reload Nginx
    sudo nginx -t
    sudo systemctl enable nginx
    sudo systemctl restart nginx
    
    print_success "Nginx reverse proxy configured"
}

setup_ssl() {
    if [[ "$SSL_ENABLED" != "true" || "$DOMAIN_NAME" == "localhost" ]]; then
        print_status "Skipping SSL setup"
        return 0
    fi
    
    print_status "Setting up SSL with Certbot..."
    
    # Install Certbot
    sudo apt install -y certbot python3-certbot-nginx
    
    # Obtain SSL certificate
    sudo certbot --nginx -d $DOMAIN_NAME --non-interactive --agree-tos --email admin@$DOMAIN_NAME
    
    # Setup automatic renewal
    sudo systemctl enable certbot.timer
    
    print_success "SSL certificate configured"
}

create_management_scripts() {
    print_status "Creating management scripts..."
    
    # Create start script
    sudo -u $OPENSILEX_USER tee $OPENSILEX_HOME/bin/start.sh > /dev/null << 'EOF'
#!/bin/bash
echo "Starting OpenSILEX services..."
sudo systemctl start opensilex-mongodb.service
sudo systemctl start opensilex-rdf4j.service
sleep 10
sudo systemctl start opensilex.service
echo "OpenSILEX services started"
EOF
    
    # Create stop script
    sudo -u $OPENSILEX_USER tee $OPENSILEX_HOME/bin/stop.sh > /dev/null << 'EOF'
#!/bin/bash
echo "Stopping OpenSILEX services..."
sudo systemctl stop opensilex.service
sudo systemctl stop opensilex-rdf4j.service
sudo systemctl stop opensilex-mongodb.service
echo "OpenSILEX services stopped"
EOF
    
    # Create status script
    sudo -u $OPENSILEX_USER tee $OPENSILEX_HOME/bin/status.sh > /dev/null << 'EOF'
#!/bin/bash
echo "=== OpenSILEX Service Status ==="
echo "MongoDB: $(sudo systemctl is-active opensilex-mongodb.service)"
echo "RDF4J: $(sudo systemctl is-active opensilex-rdf4j.service)"
echo "OpenSILEX: $(sudo systemctl is-active opensilex.service)"
echo "Nginx: $(sudo systemctl is-active nginx.service 2>/dev/null || echo 'not installed')"
echo ""
echo "=== Port Status ==="
echo "MongoDB (27017): $(ss -tuln | grep ':27017' > /dev/null && echo 'LISTENING' || echo 'NOT LISTENING')"
echo "RDF4J (8080): $(ss -tuln | grep ':8080' > /dev/null && echo 'LISTENING' || echo 'NOT LISTENING')"
echo "Nginx (80): $(ss -tuln | grep ':80' > /dev/null && echo 'LISTENING' || echo 'NOT LISTENING')"
echo "Nginx (443): $(ss -tuln | grep ':443' > /dev/null && echo 'LISTENING' || echo 'NOT LISTENING')"
EOF
    
    # Create backup script
    sudo -u $OPENSILEX_USER tee $OPENSILEX_HOME/bin/backup.sh > /dev/null << EOF
#!/bin/bash
BACKUP_DIR=$OPENSILEX_HOME/backups/\$(date +%Y%m%d_%H%M%S)
mkdir -p \$BACKUP_DIR

echo "Creating OpenSILEX backup..."

# Backup configuration file
cp $OPENSILEX_HOME/config/opensilex.yml \$BACKUP_DIR/

# Backup MongoDB
docker exec mongo_opensilex mongodump --out \$BACKUP_DIR/mongodb

# Backup RDF4J data  
cp -r $OPENSILEX_HOME/data/rdf4j \$BACKUP_DIR/

# Backup file storage
cp -r $OPENSILEX_HOME/data/files \$BACKUP_DIR/

echo "Backup completed: \$BACKUP_DIR"
EOF
    
    # Make scripts executable
    sudo -u $OPENSILEX_USER chmod +x $OPENSILEX_HOME/bin/*.sh
    
    print_success "Management scripts created"
}

setup_firewall() {
    print_status "Configuring firewall..."
    
    # Check if UFW is available
    if command -v ufw > /dev/null; then
        # Configure UFW firewall
        sudo ufw --force enable
        sudo ufw default deny incoming
        sudo ufw default allow outgoing
        
        # Allow SSH
        sudo ufw allow ssh
        
        # Allow HTTP and HTTPS
        sudo ufw allow 80/tcp
        if [[ "$SSL_ENABLED" == "true" ]]; then
            sudo ufw allow 443/tcp
        fi
        
        # If no Nginx, allow direct access to OpenSILEX
        if [[ "$NGINX_ENABLED" != "true" ]]; then
            sudo ufw allow 8080/tcp
        fi
        
        print_success "Firewall configured with UFW"
    else
        print_warning "UFW not available. Please configure firewall manually."
        print_info "Required ports: 22 (SSH), 80 (HTTP)"
        if [[ "$SSL_ENABLED" == "true" ]]; then
            print_info "Also required: 443 (HTTPS)"
        fi
        if [[ "$NGINX_ENABLED" != "true" ]]; then
            print_info "Also required: 8080 (OpenSILEX direct access)"
        fi
    fi
}

start_services() {
    print_status "Starting OpenSILEX services..."
    
    # Start database services
    sudo systemctl start opensilex-mongodb.service
    sudo systemctl start opensilex-rdf4j.service
    
    # Wait for databases to be ready
    sleep 15
    
    # Start OpenSILEX
    sudo systemctl start opensilex.service
    
    # Start Nginx if enabled
    if [[ "$NGINX_ENABLED" == "true" ]]; then
        sudo systemctl start nginx
    fi
    
    print_success "All services started"
}

verify_installation() {
    print_status "Verifying installation..."
    
    # Check services
    services=("opensilex-mongodb" "opensilex-rdf4j" "opensilex")
    for service in "${services[@]}"; do
        if sudo systemctl is-active --quiet $service.service; then
            print_success "$service service is running"
        else
            print_error "$service service is not running"
            return 1
        fi
    done
    
    # Check if OpenSILEX is responding
    sleep 10
    max_attempts=30
    attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:8080/rest/security/authenticate > /dev/null; then
            print_success "OpenSILEX API is responding"
            break
        fi
        print_status "Waiting for OpenSILEX API... (attempt $attempt/$max_attempts)"
        sleep 5
        attempt=$((attempt + 1))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        print_error "OpenSILEX API is not responding"
        return 1
    fi
    
    # Test authentication
    auth_response=$(curl -s -X POST "http://localhost:8080/rest/security/authenticate" \
        -H "Content-Type: application/json" \
        -d "{\"identifier\":\"admin@$DOMAIN_NAME\",\"password\":\"admin\"}" || echo "failed")
    
    if echo "$auth_response" | grep -q "token"; then
        print_success "Authentication test passed"
    else
        print_warning "Authentication test failed - this may be normal on first startup"
    fi
    
    print_success "Installation verification completed"
}

print_summary() {
    print_success "OpenSILEX production installation completed!"
    echo ""
    echo "=== Installation Summary ==="
    echo "OpenSILEX Version: $OPENSILEX_VERSION"
    echo "Installation Directory: $OPENSILEX_HOME"
    echo "System User: $OPENSILEX_USER"
    echo "Domain: $DOMAIN_NAME"
    echo "SSL Enabled: $SSL_ENABLED"
    echo "Nginx Enabled: $NGINX_ENABLED"
    echo ""
    echo "=== Access Information ==="
    if [[ "$NGINX_ENABLED" == "true" ]]; then
        if [[ "$SSL_ENABLED" == "true" ]]; then
            echo "OpenSILEX URL: https://$DOMAIN_NAME"
        else
            echo "OpenSILEX URL: http://$DOMAIN_NAME"
        fi
    else
        echo "OpenSILEX URL: http://$DOMAIN_NAME:8080"
    fi
    echo "Default Admin: admin@$DOMAIN_NAME"
    echo "Default Password: admin"
    echo ""
    echo "=== Management Commands ==="
    echo "Start services: sudo -u $OPENSILEX_USER $OPENSILEX_HOME/bin/start.sh"
    echo "Stop services: sudo -u $OPENSILEX_USER $OPENSILEX_HOME/bin/stop.sh"
    echo "Check status: sudo -u $OPENSILEX_USER $OPENSILEX_HOME/bin/status.sh"
    echo "Create backup: sudo -u $OPENSILEX_USER $OPENSILEX_HOME/bin/backup.sh"
    echo ""
    echo "=== Service Management ==="
    echo "systemctl status opensilex.service"
    echo "systemctl start/stop/restart opensilex.service"
    echo "journalctl -u opensilex.service -f"
    echo ""
    echo "=== Important Notes ==="
    echo "1. Change the default admin password immediately!"
    echo "2. Configure regular backups using the backup script"
    echo "3. Monitor system resources and adjust as needed"
    echo "4. Review logs regularly: $OPENSILEX_HOME/logs/"
    if [[ "$SSL_ENABLED" == "true" ]]; then
        echo "5. SSL certificates will auto-renew via certbot"
    fi
    echo ""
    print_warning "Please change the default admin password before using in production!"
}

# Main installation flow
main() {
    print_header
    
    # Checks
    check_root
    check_system
    
    # Configuration
    prompt_configuration
    
    # Installation steps
    install_dependencies
    install_java
    install_docker
    create_opensilex_user
    setup_mongodb
    setup_rdf4j
    create_rdf4j_repository
    install_opensilex
    configure_opensilex
    initialize_opensilex
    create_systemd_service
    setup_nginx
    setup_ssl
    create_management_scripts
    setup_firewall
    start_services
    
    # Verification
    verify_installation
    
    # Summary
    print_summary
}

# Command line argument handling
case "${1:-install}" in
    "install")
        main
        ;;
    "start")
        print_status "Starting OpenSILEX services..."
        sudo systemctl start opensilex-mongodb.service
        sudo systemctl start opensilex-rdf4j.service
        sleep 10
        sudo systemctl start opensilex.service
        print_success "Services started"
        ;;
    "stop")
        print_status "Stopping OpenSILEX services..."
        sudo systemctl stop opensilex.service
        sudo systemctl stop opensilex-rdf4j.service
        sudo systemctl stop opensilex-mongodb.service
        print_success "Services stopped"
        ;;
    "status")
        echo "=== OpenSILEX Service Status ==="
        echo "MongoDB: $(sudo systemctl is-active opensilex-mongodb.service)"
        echo "RDF4J: $(sudo systemctl is-active opensilex-rdf4j.service)"
        echo "OpenSILEX: $(sudo systemctl is-active opensilex.service)"
        echo "Nginx: $(sudo systemctl is-active nginx.service 2>/dev/null || echo 'not installed')"
        ;;
    "logs")
        sudo journalctl -u opensilex.service -f
        ;;
    "help")
        echo "Usage: $0 [install|start|stop|status|logs|help]"
        echo ""
        echo "  install  - Run full OpenSILEX production installation"
        echo "  start    - Start all OpenSILEX services"
        echo "  stop     - Stop all OpenSILEX services"
        echo "  status   - Show service status"
        echo "  logs     - Show OpenSILEX logs (follow mode)"
        echo "  help     - Show this help message"
        ;;
    *)
        print_error "Unknown command: $1"
        echo "Use '$0 help' for available commands"
        exit 1
        ;;
esac