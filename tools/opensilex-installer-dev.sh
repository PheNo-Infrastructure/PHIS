#!/bin/bash
set -e

# Continue with azureuser for all operations
echo "Continuing OpenSILEX development installation as azureuser..."

# Ensure required tools are available (in case setup script was skipped or failed)
if ! command -v git &> /dev/null; then
    echo "Installing missing required tools (git, maven, unzip, curl, wget)..."
    sudo apt update
    sudo apt install -y git maven unzip curl wget
fi

# Source environment variables
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export PATH=$JAVA_HOME/bin:$PATH
export NODE_ENV=development

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

OPENSILEX_HOME="/home/azureuser/opensilex"

# Create OpenSILEX directory structure following development guide
print_status "Creating OpenSILEX development directory structure..."
mkdir -p "$OPENSILEX_HOME/source"
cd "$OPENSILEX_HOME"
mkdir -p "$OPENSILEX_HOME/config"
mkdir -p "$OPENSILEX_HOME/data"
mkdir -p "$OPENSILEX_HOME/logs"
mkdir -p "$OPENSILEX_HOME/data/files"
mkdir -p "$OPENSILEX_HOME/data/logs"

# Download OpenSILEX release for development environment
OPENSILEX_VERSION="1.4.9-rdg"
print_status "Downloading OpenSILEX release v$OPENSILEX_VERSION for development..."

cd "$OPENSILEX_HOME"

# Download the release ZIP from GitHub  
DOWNLOAD_URL="https://github.com/OpenSILEX/opensilex/releases/download/$OPENSILEX_VERSION/opensilex-release-$OPENSILEX_VERSION.zip"
print_status "Downloading from: $DOWNLOAD_URL"

curl -L -o "opensilex-release-$OPENSILEX_VERSION.zip" "$DOWNLOAD_URL"

if [ ! -f "opensilex-release-$OPENSILEX_VERSION.zip" ]; then
    print_error "Failed to download OpenSILEX release"
    exit 1
fi

# Extract the release
print_status "Extracting OpenSILEX release..."
unzip -o "opensilex-release-$OPENSILEX_VERSION.zip"

# Move the JAR to the correct location
RELEASE_DIR="opensilex-release-$OPENSILEX_VERSION"
if [ -d "$RELEASE_DIR" ]; then
    if [ -f "$RELEASE_DIR/opensilex.jar" ]; then
        mv "$RELEASE_DIR/opensilex.jar" ./
        print_success "OpenSILEX JAR moved to $OPENSILEX_HOME/opensilex.jar"
    fi
    
    # Copy other necessary files
    if [ -d "$RELEASE_DIR/bin" ]; then
        cp -r "$RELEASE_DIR/bin" ./
    fi
    if [ -d "$RELEASE_DIR/config" ]; then
        cp -r "$RELEASE_DIR/config" ./config-templates
    fi
    
    # Clean up
    rm -rf "$RELEASE_DIR"
fi

# Also clone source code for development purposes
print_status "Cloning source code for development..."
mkdir -p "$OPENSILEX_HOME/source"
cd "$OPENSILEX_HOME/source"

if [ -d "opensilex" ]; then
    print_status "Source repository already exists, updating..."
    cd opensilex
    git fetch origin
    git checkout "$OPENSILEX_VERSION"
else
    git clone https://github.com/OpenSILEX/opensilex.git
    cd opensilex
    git checkout "$OPENSILEX_VERSION"
fi

print_status "Source code available at: $OPENSILEX_HOME/source/opensilex"
cd "$OPENSILEX_HOME"

# Get VM public IP for configuration
print_status "Fetching VM public IP address..."
VM_PUBLIC_IP=""
# Try multiple methods to get public IP
if command -v curl >/dev/null 2>&1; then
    VM_PUBLIC_IP=$(curl -s --max-time 10 ifconfig.me 2>/dev/null || curl -s --max-time 10 ipinfo.io/ip 2>/dev/null || curl -s --max-time 10 icanhazip.com 2>/dev/null)
fi

# Fallback if curl methods fail
if [ -z "$VM_PUBLIC_IP" ]; then
    VM_PUBLIC_IP="localhost"
    print_warning "Could not fetch public IP, using localhost. You may need to update publicURI manually."
else
    print_success "Using VM public IP: $VM_PUBLIC_IP"
fi

# Create configuration files for development
print_status "Creating development configuration files..."

# Create required directories with proper permissions
mkdir -p "$OPENSILEX_HOME/logs"
mkdir -p "$OPENSILEX_HOME/data/files"
mkdir -p "$OPENSILEX_HOME/config"
chown -R azureuser:azureuser "$OPENSILEX_HOME"
chmod -R 755 "$OPENSILEX_HOME"

# Check for API keys and FEIDE credentials - try multiple sources
AGROPORTAL_ENABLED=true
AGROPORTAL_API_KEY=""
FEIDE_ENABLED=false
FEIDE_CLIENT_ID=""
FEIDE_CLIENT_SECRET=""

# 1. Check for local config file (uploaded from tools/config/api-keys.conf)
CONFIG_FILE="$HOME/api-keys.conf"
if [ -f "$CONFIG_FILE" ]; then
    print_status "Loading configuration from config file..."
    source "$CONFIG_FILE"
    if [ ! -z "$AGROPORTAL_API_KEY" ]; then
        print_success "Using Agroportal API key from config file"
        AGROPORTAL_ENABLED=true
    fi
    if [ ! -z "$FEIDE_CLIENT_ID" ] && [ ! -z "$FEIDE_CLIENT_SECRET" ]; then
        print_success "Using FEIDE credentials from config file"
        FEIDE_ENABLED=true
    fi
else
    print_status "Configuration file not found at $CONFIG_FILE"
fi

# 2. Check environment variables (overrides config file)
if [ ! -z "$AGROPORTAL_API_KEY" ]; then
    print_success "Using Agroportal API key from environment variable"
    AGROPORTAL_ENABLED=true
fi

if [ ! -z "$FEIDE_CLIENT_ID" ] && [ ! -z "$FEIDE_CLIENT_SECRET" ]; then
    print_success "Using FEIDE credentials from environment variables"
    FEIDE_ENABLED=true
fi

# 3. Final status reporting
if [ "$AGROPORTAL_ENABLED" = false ]; then
    print_warning "No Agroportal API key found"
    print_status "Agroportal integration will be disabled"
    echo ""
    print_status "To enable Agroportal ontology integration:"
    print_status "1. Get your API key from: https://agroportal.lirmm.fr/account"
    print_status "2. Create file: config/api-keys.conf"
    print_status "3. Add line: AGROPORTAL_API_KEY=\"your-key-here\""
    print_status "4. See config/api-keys.conf.template for example"
    echo ""
fi

if [ "$FEIDE_ENABLED" = false ]; then
    print_warning "No FEIDE credentials found"
    print_status "FEIDE authentication will be disabled"
    echo ""
    print_status "To enable FEIDE (Dataporten) authentication:"
    print_status "1. Register your application at: https://dashboard.dataporten.no/"
    print_status "2. Set redirect URI to: http://$VM_PUBLIC_IP/app/openid"
    print_status "3. Enable attribute groups: email, userinfo-name, userinfo-mail"
    print_status "4. Enable scopes: openid, userid, profile, email"
    print_status "5. Create file: config/api-keys.conf"
    print_status "6. Add lines:"
    print_status "   FEIDE_CLIENT_ID=\"your-client-id-here\""
    print_status "   FEIDE_CLIENT_SECRET=\"your-client-secret-here\""
    echo ""
fi

# Development configuration file with dynamic IP
cat > "$OPENSILEX_HOME/config/opensilex.yml" << CONFIG_EOF
# OpenSILEX Development Configuration
ontologies:
  baseURI: "http://$VM_PUBLIC_IP/"
  baseURIAlias: "dev"
  sparql:
    config:
      serverURI: "http://localhost:7200"
      repository: "opensilex"
      # GraphDB connection settings to prevent connection issues
      maxConnections: 10
      connectionTimeout: 30000
      readTimeout: 60000
      queryTimeout: 120000

big-data:
  mongodb:
    implementation: org.opensilex.nosql.mongodb.MongoDBService
    config:
      host: "localhost"
      port: 27017
      database: "opensilex_dev"

# File system configuration with proper structure
file-system:
  fs:
    defaultFS: local
    config:
      connections:
        local:
          implementation: org.opensilex.fs.local.LocalFileSystemConnection
          config:
            basePath: "/home/azureuser/opensilex/data/files"

server:
  host: "0.0.0.0"
  port: 8666
  publicURI: "http://$VM_PUBLIC_IP:8666"
  # Development specific settings
  allowCORS: true
  devMode: true

# Enable debug logging for development
logging:
  config-file: "$OPENSILEX_HOME/config/logback-dev.xml"

CONFIG_EOF

# Create development-specific logging configuration
cat > "$OPENSILEX_HOME/config/logback-dev.xml" << LOGBACK_EOF
<configuration>
    <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>
    
    <appender name="FILE" class="ch.qos.logback.core.FileAppender">
        <file>$OPENSILEX_HOME/logs/opensilex-dev.log</file>
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>
    
    <root level="DEBUG">
        <appender-ref ref="STDOUT" />
        <appender-ref ref="FILE" />
    </root>
</configuration>
LOGBACK_EOF

# Create a development startup script
cat > "$OPENSILEX_HOME/start-dev.sh" << START_EOF
#!/bin/bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export PATH=\$JAVA_HOME/bin:\$PATH
export NODE_ENV=development

cd /home/azureuser/opensilex

echo "Starting OpenSILEX development server..."
echo "Configuration: \$(pwd)/config/opensilex.yml"
echo "Logs will be written to: \$(pwd)/logs/"
echo "Press Ctrl+C to stop the server"
echo ""

java --add-opens java.base/java.io=ALL-UNNAMED --add-opens java.base/java.lang=ALL-UNNAMED -jar opensilex.jar --CONFIG_FILE=\$(pwd)/config/opensilex.yml server start --host=0.0.0.0 --port=8666 --adminPort=8667 /tmp
START_EOF

chmod +x "$OPENSILEX_HOME/start-dev.sh"

# Create systemd service for development
print_status "Creating systemd service for development..."
sudo tee /etc/systemd/system/opensilex-dev.service > /dev/null <<EOF
[Unit]
Description=OpenSILEX Development Server
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=azureuser
Group=azureuser
WorkingDirectory=/home/azureuser/opensilex
ExecStart=/usr/bin/java --add-opens java.base/java.io=ALL-UNNAMED --add-opens java.base/java.lang=ALL-UNNAMED -jar opensilex.jar --CONFIG_FILE=/home/azureuser/opensilex/config/opensilex.yml server start --host=0.0.0.0 --port=8666 --adminPort=8667 /tmp
Restart=always
RestartSec=10

# Development environment variables
Environment=JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
Environment=PATH=/usr/lib/jvm/java-17-openjdk-amd64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=development

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=opensilex-dev

# Security (development settings)
NoNewPrivileges=true
PrivateTmp=true

# Resource limits
LimitNOFILE=65536
TimeoutStartSec=300
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
EOF

# Enable the service (but don't start it automatically)
sudo systemctl daemon-reload
sudo systemctl enable opensilex-dev

# Start required database containers
print_status "Starting database containers..."

# Start MongoDB container
print_status "Starting MongoDB container..."
sudo docker run -d --name mongo-opensilex-dev -p 27017:27017 -v "$OPENSILEX_HOME/data/mongodb:/data/db" mongo:4.4

# Start GraphDB container  
print_status "Starting GraphDB container..."
sudo docker run -d --name graphdb-opensilex-dev -p 7200:7200 -v "$OPENSILEX_HOME/data/graphdb:/opt/graphdb/home" -e GDB_HEAP_SIZE=2g ontotext/graphdb:10.7.3

# Wait for GraphDB to start
print_status "Waiting for GraphDB to initialize..."
sleep 20

# Create repository configuration for GraphDB
print_status "Creating GraphDB repository configuration..."
cat > /tmp/repo-config.ttl << 'REPO_EOF'
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix rep: <http://www.openrdf.org/config/repository#> .
@prefix sr: <http://www.openrdf.org/config/repository/sail#> .
@prefix sail: <http://www.openrdf.org/config/sail#> .
@prefix graphdb: <http://www.ontotext.com/config/graphdb#> .

[] a rep:Repository ;
   rep:repositoryID "opensilex" ;
   rdfs:label "OpenSILEX Development Repository" ;
   rep:repositoryImpl [
      rep:repositoryType "graphdb:SailRepository" ;
      sr:sailImpl [
         sail:sailType "graphdb:Sail" ;
         graphdb:read-only "false" ;
         graphdb:ruleset "rdfsplus-optimized" ;
      ]
   ] .
REPO_EOF

# Try to create the repository 
print_status "Attempting to create GraphDB repository..."
curl -s -X POST http://localhost:7200/rest/repositories -H "Content-Type: multipart/form-data" -F "config=@/tmp/repo-config.ttl" > /tmp/repo-creation.log 2>&1

if curl -s "http://localhost:7200/repositories" | grep -q "opensilex"; then
    print_success "GraphDB repository 'opensilex' created successfully"
else
    print_warning "GraphDB repository creation may need to be done manually via web interface"
    print_status "Repository creation log: $(cat /tmp/repo-creation.log 2>/dev/null || echo 'No log available')"
fi

print_success "Database containers started"
print_status "GraphDB Web Interface: http://$VM_PUBLIC_IP:7200"
print_status "If repository creation failed, please create 'opensilex' repository manually via the web interface"

print_success "Systemd service 'opensilex-dev' created and enabled"
print_status "To start the service: sudo systemctl start opensilex-dev"
print_status "To check status: sudo systemctl status opensilex-dev"
print_status "To view logs: sudo journalctl -u opensilex-dev -f"

print_success "OpenSILEX development installation completed successfully!"
print_status ""
print_status "Installation Summary:"
print_status "===================="
print_status "OpenSILEX Home: $OPENSILEX_HOME"
print_status "Source Code: $OPENSILEX_HOME/source/opensilex"
print_status "Configuration: $OPENSILEX_HOME/config/opensilex.yml"
print_status "Data Directory: $OPENSILEX_HOME/data"
print_status "Log Directory: $OPENSILEX_HOME/logs"
print_status ""
print_status "To start OpenSILEX development server:"
print_status "  cd $OPENSILEX_HOME"
print_status "  ./start-dev.sh"
print_status ""
print_status "Server will be available at: http://$VM_PUBLIC_IP:8666"
print_status ""
print_status "Development Environment Setup:"
print_status "- Stable release v$OPENSILEX_VERSION is ready to run"
print_status "- Source code available for modifications in: $OPENSILEX_HOME/source/opensilex"
print_status ""
print_status "For development workflow:"
print_status "1. Make changes to source code in: $OPENSILEX_HOME/source/opensilex"
print_status "2. Build from source: cd $OPENSILEX_HOME/source/opensilex && mvn clean install -DskipTests=true"
print_status "3. Extract new build: cd $OPENSILEX_HOME && unzip -o source/opensilex/opensilex-release/target/opensilex-release-*.zip"
print_status "4. Copy new JAR: mv opensilex-release-*/opensilex.jar ./"
print_status "5. Restart server with ./start-dev.sh"