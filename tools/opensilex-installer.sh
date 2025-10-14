#!/bin/bash
set -e

# Continue with azureuser for all operations
echo "Continuing OpenSILEX installation as azureuser..."

# Ensure required tools are available (in case setup script was skipped or failed)
if ! command -v unzip &> /dev/null; then
    echo "Installing missing required tools (unzip, curl, wget)..."
    sudo apt update
    sudo apt install -y unzip curl wget
fi

# Source environment variables
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export PATH=$JAVA_HOME/bin:$PATH
export NODE_ENV=production

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

# Create OpenSILEX directory structure following production guide
print_status "Creating OpenSILEX production directory structure..."
mkdir -p "$OPENSILEX_HOME/bin"
cd "$OPENSILEX_HOME"
mkdir -p "$OPENSILEX_HOME/config"
mkdir -p "$OPENSILEX_HOME/data"
mkdir -p "$OPENSILEX_HOME/logs"
mkdir -p "$OPENSILEX_HOME/data/files"
mkdir -p "$OPENSILEX_HOME/data/logs"

# Download OpenSILEX release following production guide
print_status "Downloading OpenSILEX 1.4.9-rdg release..."
cd "$OPENSILEX_HOME/bin"
OPENSILEX_VERSION="1.4.9-rdg"
RELEASE_URL="https://github.com/OpenSILEX/opensilex/releases/download/${OPENSILEX_VERSION}/opensilex-release-${OPENSILEX_VERSION}.zip"

if curl -s -I -L --fail "$RELEASE_URL" >/dev/null 2>&1; then
    print_status "Downloading pre-built OpenSILEX ${OPENSILEX_VERSION} release..."
    wget -O "opensilex-release-${OPENSILEX_VERSION}.zip" "$RELEASE_URL"
    unzip "opensilex-release-${OPENSILEX_VERSION}.zip"
    
    # Move contents following production structure
    if [ -d "opensilex-release-${OPENSILEX_VERSION}" ]; then
        mv "opensilex-release-${OPENSILEX_VERSION}"/* .
        rmdir "opensilex-release-${OPENSILEX_VERSION}"
    fi
    
    # Move jar to parent directory as per production guide
    if [ -f "opensilex.jar" ]; then
        mv opensilex.jar "$OPENSILEX_HOME/"
    fi
    
    rm "opensilex-release-${OPENSILEX_VERSION}.zip"
    print_success "OpenSILEX release downloaded and extracted successfully"
else
    print_error "Pre-built release not available for ${OPENSILEX_VERSION}"
    exit 1
fi

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

# Create configuration files following production guide
print_status "Creating production configuration files..."

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

# Main configuration file with dynamic IP
cat > "$OPENSILEX_HOME/config/opensilex.yml" << CONFIG_EOF
# OpenSILEX Production Configuration
ontologies:
  baseURI: "http://$VM_PUBLIC_IP/"
  baseURIAlias: "prod"
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
      database: "opensilex"

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

# Security configuration with email support
security:
  email:
    config:
      enable: false
      smtp:
        host: ""
        port: 587
        userId: ""
        userPassword: ""
        sender: ""

# Dashboard configuration with real-time metrics
front:
  dashboard:
    graph1:
      # Variable URI for dashboard visualization (leave empty for default logo)
      # After importing data, update this with a variable that has data points
      # Example: "http://opensilex.test/id/variable/air_temperature_datalogging_degreecelsius"
      variable: ""
      # Enhanced location information for data context
      dataLocationInformations: "Production Environment - Configure with variable URI after data import"
  # Agroportal ontology mappings for variable components
  agroportal:
    entity:
      - AGROVOC
      - PO
    trait:
      - PATO
    method:
      - TRANSFORMON
    unit:
      - OBOE
  # Geocoding service configuration
  geocodingService: Photon

# Logging configuration
logging:
  config:
    file: "/home/azureuser/opensilex/config/logback.xml"

# System configuration
system:
  defaultLanguage: "en"

core:
    enableLogs: true
    sharedResourceInstances:
      - uri: "http://opensilex.org/sandbox"
        apiUrl: "http://opensilex.org/sandbox/rest"
        label:
          fr: "SANDBOX"
          en: "SANDBOX"
        accountName: "guest@opensilex.org"
        accountPassword: "guest"
      - uri: "http://aims.fao.org/aos/agrovoc/"
        apiUrl: "https://agrovoc.fao.org/sparql"
        label:
          fr: "AGROVOC"
          en: "AGROVOC"
        accountName: ""
        accountPassword: ""
    # Metrics options (MetricsConfig) - Optimized for real-time dashboard
    metrics:
      # Activate access metrics (boolean)
      enableMetrics: true
      # Metrics configs about system (SystemMetricsConfig) - Real-time updates
      system:
        # First metrics after 2 minutes (reasonable startup time)
        timeBeforeFirstMetric: 2
        # Update system metrics every 5 minutes for responsive dashboard
        delayBetweenMetrics: 5
        # Use MINUTES for real-time dashboard responsiveness
        metricsTimeUnit: MINUTES
      # Metrics configs about experiments (ExperimentsMetricsConfig) - Daily tracking
      experiments:
        # Start experiment metrics after 2 minutes
        timeBeforeFirstMetric: 2
        # Update experiment metrics daily (appropriate for research data)
        delayBetweenMetrics: 1
        # Use DAYS for experiment overview tracking
        metricsTimeUnit: DAYS
# Additional production configurations
phisws:
  # Enable CORS for production
  cors:
    allowedOrigins:
      - "http://$VM_PUBLIC_IP"
      - "https://$VM_PUBLIC_IP"
    allowedMethods:
      - "GET"
      - "POST"
      - "PUT"
      - "DELETE"
      - "OPTIONS"
    allowedHeaders:
      - "*"
    allowCredentials: true
CONFIG_EOF

# Add Agroportal configuration if enabled
if [ "$AGROPORTAL_ENABLED" = true ]; then
    print_status "Adding Agroportal configuration..."
    cat >> "$OPENSILEX_HOME/config/opensilex.yml" << AGROPORTAL_EOF

# Agroportal configuration for ontology access
core:
  agroportal:
    basePath: "https://agroportal.lirmm.fr"
    baseAPIPath: "https://data.agroportal.lirmm.fr"
    externalAPIKey: "$AGROPORTAL_API_KEY"
AGROPORTAL_EOF
else
    print_status "Skipping Agroportal configuration - disabled"
fi

# Add FEIDE configuration if enabled
if [ "$FEIDE_ENABLED" = true ]; then
    print_status "Adding FEIDE (Dataporten) authentication configuration..."
    cat >> "$OPENSILEX_HOME/config/opensilex.yml" << FEIDE_EOF

# FEIDE/Dataporten OpenID Connect authentication configuration
security:
  openID:
    enable: true
    scopes: ["openid", "userid", "profile", "email", "userinfo-name", "userinfo-mail"]
    userIdClaim: "sub"
    userNameClaim: "name"
    userEmailClaim: "https://n.feide.no/claims/eduPersonPrincipalName"
    userFirstNameClaim: "given_name"
    userLastNameClaim: "family_name"
    providerURI: "https://auth.dataporten.no"
    redirectURI: "http://$VM_PUBLIC_IP/app/openid"
    clientID: "$FEIDE_CLIENT_ID"
    clientSecret: "$FEIDE_CLIENT_SECRET"
    connectionTitle:
      en: "Login with Feide"
      no: "Logg inn med Feide"
FEIDE_EOF
else
    print_status "Skipping FEIDE authentication configuration - disabled"
fi

# Logging configuration file
cat > "$OPENSILEX_HOME/config/logback.xml" << 'LOGBACK_EOF'
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <!-- Console appender -->
    <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>
    
    <!-- File appender -->
    <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>/home/azureuser/opensilex/logs/opensilex.log</file>
        <append>true</append>
        <immediateFlush>true</immediateFlush>
        <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
            <fileNamePattern>/home/azureuser/opensilex/logs/opensilex.%d{yyyy-MM-dd}.%i.log</fileNamePattern>
            <maxFileSize>100MB</maxFileSize>
            <maxHistory>30</maxHistory>
            <totalSizeCap>1GB</totalSizeCap>
        </rollingPolicy>
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>
    
    <!-- Root logger -->
    <root level="DEBUG">
        <appender-ref ref="STDOUT" />
        <appender-ref ref="FILE" />
    </root>
    
    <!-- OpenSILEX specific loggers -->
    <logger name="org.opensilex" level="DEBUG" />
    <logger name="org.opensilex.core.device" level="TRACE" />
    <logger name="org.opensilex.sparql" level="DEBUG" />
    <logger name="org.eclipse.rdf4j" level="DEBUG" />
    <logger name="org.eclipse.rdf4j.query" level="TRACE" />
    <logger name="org.eclipse.rdf4j.repository" level="DEBUG" />
    <logger name="org.mongodb" level="DEBUG" />
    <logger name="org.mongodb.driver" level="DEBUG" />
</configuration>
LOGBACK_EOF

# Docker compose configuration
print_status "Creating database services configuration..."
cat > "$OPENSILEX_HOME/docker-compose.yml" << 'DOCKER_EOF'
version: '3.8'
services:
  graphdb:
    image: ontotext/graphdb:10.6.4
    container_name: opensilex-graphdb
    ports:
      - "7200:7200"
    environment:
      - GDB_HEAP_SIZE=4g
      - GDB_MAX_HEAP_SIZE=8g
      - GDB_JAVA_OPTS=-XX:+UseG1GC -Djava.awt.headless=true
    volumes:
      - graphdb_data:/opt/graphdb/home
      - graphdb_work:/opt/graphdb/work
      - graphdb_logs:/opt/graphdb/logs
    networks:
      - opensilex_network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:7200/rest/repositories"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    restart: unless-stopped
    
  mongodb:
    image: mongo:5
    container_name: opensilex-mongodb
    ports:
      - "27017:27017"
    command: ["mongod", "--replSet", "opensilex", "--bind_ip_all"]
    volumes:
      - mongodb_data:/data/db
    networks:
      - opensilex_network
    restart: unless-stopped

volumes:
  graphdb_data:
  graphdb_work:
  graphdb_logs:
  mongodb_data:
  
networks:
  opensilex_network:
    driver: bridge
DOCKER_EOF

# Start database services
print_status "Starting database services..."
cd "$OPENSILEX_HOME"
docker compose up -d
sleep 30

# Initialize MongoDB replica set
print_status "Initializing MongoDB replica set..."
echo "Waiting for MongoDB to start..."
for i in {1..30}; do
    if docker exec opensilex-mongodb mongosh --eval "db.adminCommand('ismaster')" >/dev/null 2>&1; then
        echo "MongoDB is ready"
        break
    fi
    sleep 2
done

# Initialize replica set
docker exec opensilex-mongodb mongosh --eval "rs.initiate({_id: 'opensilex', members: [{_id: 0, host: 'localhost:27017'}]})"
sleep 15
docker exec opensilex-mongodb mongosh --eval "rs.status()"

# Create OpenSILEX wrapper script
print_status "Creating OpenSILEX wrapper script..."
VERSION="1.4.9-rdg"
mkdir -p "$OPENSILEX_HOME/bin/$VERSION"
mv "$OPENSILEX_HOME/opensilex.jar" "$OPENSILEX_HOME/bin/$VERSION/"
mv "$OPENSILEX_HOME/bin/modules" "$OPENSILEX_HOME/bin/$VERSION/"

# Create opensilex.sh script
cat > "$OPENSILEX_HOME/bin/$VERSION/opensilex.sh" << 'WRAPPER_EOF'
#!/bin/bash

SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"

CONFIG_FILE="/home/azureuser/opensilex/config/opensilex.yml"

cd $SCRIPT_DIR

java --add-opens java.base/java.io=ALL-UNNAMED \
     --add-opens java.base/java.lang=ALL-UNNAMED \
     --add-opens java.base/java.util=ALL-UNNAMED \
     --add-opens java.base/sun.nio.ch=ALL-UNNAMED \
     --add-opens java.base/java.net=ALL-UNNAMED \
     --add-opens java.base/java.lang.reflect=ALL-UNNAMED \
     --add-opens java.base/java.security=ALL-UNNAMED \
     --add-exports java.base/sun.util.calendar=ALL-UNNAMED \
     -jar $SCRIPT_DIR/opensilex.jar --BASE_DIRECTORY=$SCRIPT_DIR --CONFIG_FILE=$CONFIG_FILE "$@"
WRAPPER_EOF

chmod +x "$OPENSILEX_HOME/bin/$VERSION/opensilex.sh"

# Create alias for azureuser
echo 'alias opensilex="/home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh"' >> ~/.bash_aliases

# Wait for GraphDB to be ready and create repository if needed
print_status "Waiting for GraphDB to be ready..."
for i in {1..60}; do
    if docker exec opensilex-graphdb curl -s http://localhost:7200/rest/repositories >/dev/null 2>&1; then
        echo "GraphDB is ready"
        break
    fi
    echo "Waiting for GraphDB to start... ($i/60)"
    sleep 5
done

# Check if repository already exists
print_status "Checking if OpenSILEX repository exists..."
if docker exec opensilex-graphdb curl -s http://localhost:7200/rest/repositories/opensilex >/dev/null 2>&1; then
    echo "OpenSILEX repository already exists, skipping creation"
else
    print_status "Creating GraphDB repository..."
    
    # Create repository configuration file with dynamic IP
    docker exec opensilex-graphdb sh -c "cat > /tmp/repo-config.ttl << 'EOF'
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix rep: <http://www.openrdf.org/config/repository#> .
@prefix sr: <http://www.openrdf.org/config/repository/sail#> .
@prefix sail: <http://www.openrdf.org/config/sail#> .
@prefix owlim: <http://www.ontotext.com/trree/owlim#> .

[] a rep:Repository ;
   rep:repositoryID \"opensilex\" ;
   rdfs:label \"OpenSILEX Repository\" ;
   rep:repositoryImpl [
      rep:repositoryType \"graphdb:SailRepository\" ;
      sr:sailImpl [
         sail:sailType \"graphdb:Sail\" ;
         owlim:ruleset \"rdfs-optimized\" ;
         owlim:storage-folder \"storage\" ;
         owlim:base-URL \"http://$VM_PUBLIC_IP/\" ;
         owlim:repository-type \"file-repository\" ;
         owlim:entity-index-size \"10000000\" ;
         owlim:enable-context-index \"false\" ;
         owlim:enablePredicateList \"true\" ;
         owlim:enable-literal-index \"true\" ;
         owlim:check-for-inconsistencies \"false\" ;
         owlim:disable-sameAs \"true\" ;
         owlim:query-timeout \"0\" ;
         owlim:throw-QueryEvaluationException-on-timeout \"false\" ;
         owlim:read-only \"false\"
      ]
   ] .
EOF"

    # Create the repository using the TTL file
    if docker exec opensilex-graphdb curl -X POST \
        -H "Content-Type: multipart/form-data" \
        -F "config=@/tmp/repo-config.ttl" \
        http://localhost:7200/rest/repositories; then
        echo "GraphDB repository created successfully"
    else
        echo "WARNING: Repository creation failed, but continuing with installation"
    fi
    
    sleep 10
fi

# Initialize OpenSILEX system
print_status "Initializing OpenSILEX system..."
cd "$OPENSILEX_HOME"
/home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh system install

# Reset and load ontologies (triplestore initialization) - CRITICAL for GraphDB
print_status "Initializing triplestore with ontologies..."
# Wait for GraphDB repository to be fully accessible
sleep 15

# Retry the sparql reset-ontologies command up to 5 times (GraphDB may need more time)
for attempt in {1..5}; do
    echo "Attempt $attempt: Initializing triplestore with ontologies..."
    if /home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh sparql reset-ontologies; then
        echo "SUCCESS: Triplestore initialization completed"
        break
    else
        echo "Triplestore initialization failed on attempt $attempt"
        if [ $attempt -eq 5 ]; then
            echo "ERROR: Triplestore initialization failed after 5 attempts"
            echo "OpenSILEX may not work correctly without ontologies"
            echo "Run this command manually after installation:"
            echo "/home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh sparql reset-ontologies"
        else
            echo "Waiting 15 seconds before retry..."
            sleep 15
        fi
    fi
done

# Create admin user (automated)
print_status "Creating admin user..."
# Retry user creation up to 3 times
for attempt in {1..3}; do
    echo "Attempt $attempt: Creating admin user..."
    if /home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh user add \
        --admin \
        --email="admin@opensilex.org" \
        --firstName="System" \
        --lastName="Administrator" \
        --password="admin"; then
        echo "Admin user created successfully"
        break
    else
        echo "User creation failed on attempt $attempt"
        if [ $attempt -eq 3 ]; then
            echo "WARNING: Admin user creation failed after 3 attempts. You may need to run this manually after startup:"
            echo "/home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh user add --admin --email=admin@opensilex.org --firstName=System --lastName=Administrator --password=admin"
        else
            echo "Waiting 10 seconds before retry..."
            sleep 10
        fi
    fi
done

# Add useful aliases for azureuser  
print_status "Setting up OpenSILEX aliases..."
echo 'alias opensilex="/home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh"' >> ~/.bashrc
echo 'alias opensilex-start="sudo systemctl start opensilex"' >> ~/.bashrc
echo 'alias opensilex-stop="sudo systemctl stop opensilex"' >> ~/.bashrc
echo 'alias opensilex-status="sudo systemctl status opensilex"' >> ~/.bashrc
echo 'alias opensilex-logs="sudo journalctl -u opensilex -f"' >> ~/.bashrc

print_success "OpenSILEX aliases configured"

# Configure nginx reverse proxy
print_status "Configuring nginx reverse proxy..."

# Create nginx config with error handling
if sudo tee /etc/nginx/sites-available/opensilex << 'NGINX_CONFIG'
server {
    listen 80;
    server_name _;
    
    # Increase client max body size for file uploads
    client_max_body_size 100M;
    
    # Proxy settings for OpenSILEX
    location / {
        proxy_pass http://127.0.0.1:8666;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Handle WebSocket connections for real-time features
    location /ws {
        proxy_pass http://127.0.0.1:8666;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_CONFIG
then
    print_success "Nginx configuration file created successfully"
else
    print_error "Failed to create nginx configuration file"
    exit 1
fi

# Verify the config file was created
if [ ! -f "/etc/nginx/sites-available/opensilex" ]; then
    print_error "Nginx configuration file not found after creation"
    exit 1
fi

# Enable the site and disable default
print_status "Enabling OpenSILEX site and disabling default..."
sudo ln -sf /etc/nginx/sites-available/opensilex /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Verify the symlink was created
if [ ! -L "/etc/nginx/sites-enabled/opensilex" ]; then
    print_error "Failed to create nginx site symlink"
    exit 1
fi

# Test nginx configuration
print_status "Testing nginx configuration..."
if sudo nginx -t; then
    print_success "Nginx configuration test passed"
else
    print_error "Nginx configuration test failed"
    exit 1
fi

# Start and enable nginx
print_status "Starting and enabling nginx service..."
sudo systemctl start nginx
sudo systemctl enable nginx
sudo systemctl reload nginx

# Verify nginx is running
if sudo systemctl is-active --quiet nginx; then
    print_success "Nginx is running successfully"
else
    print_error "Nginx failed to start"
    sudo systemctl status nginx
    exit 1
fi

# Test if nginx is serving on port 80
sleep 5
if curl -s -I http://localhost/ | grep -q "nginx"; then
    print_success "Nginx configured as reverse proxy on port 80"
else
    print_warning "Nginx may not be properly configured - please check manually"
fi

# Test log file creation
print_status "Testing log file creation..."
sudo -u azureuser touch "$OPENSILEX_HOME/logs/opensilex.log"
sudo -u azureuser chmod 664 "$OPENSILEX_HOME/logs/opensilex.log"
echo "$(date): OpenSILEX installation log test" | sudo -u azureuser tee "$OPENSILEX_HOME/logs/opensilex.log" > /dev/null

if [ -f "$OPENSILEX_HOME/logs/opensilex.log" ]; then
    echo "Log file created successfully at $OPENSILEX_HOME/logs/opensilex.log"
else
    echo "WARNING: Failed to create log file"
fi

# Create systemd service
print_status "Creating systemd service..."
sudo tee /etc/systemd/system/opensilex.service << 'SERVICE_EOF'
[Unit]
Description=OpenSILEX Server (Production)
After=network.target docker.service
Requires=docker.service

[Service]
Type=exec
User=azureuser
WorkingDirectory=/home/azureuser/opensilex
Environment=JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
Environment=PATH=/usr/lib/jvm/java-17-openjdk-amd64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=production
ExecStartPre=/usr/bin/docker compose up -d
ExecStartPre=/bin/sleep 30
ExecStart=/home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh server start --host=0.0.0.0 --port=8666
ExecStop=/home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh server stop
ExecStopPost=/usr/bin/docker compose down
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
# Ensure log directory permissions
ExecStartPre=/bin/chown -R azureuser:azureuser /home/azureuser/opensilex/logs
ExecStartPre=/bin/chmod -R 755 /home/azureuser/opensilex/logs

[Install]
WantedBy=multi-user.target
SERVICE_EOF

sudo systemctl daemon-reload
sudo systemctl enable opensilex.service
sudo systemctl start opensilex.service

# Set up automatic group assignment for Feide/OpenID users
print_status "Setting up automatic group assignment for new users..."

# Wait for OpenSILEX to start up (may take a minute)
print_status "Waiting for OpenSILEX service to be fully ready..."
sleep 30
for i in {1..12}; do
    if curl -s http://localhost:8666/rest/system/info >/dev/null; then
        print_success "OpenSILEX API is responding"
        break
    fi
    if [ $i -eq 12 ]; then
        print_warning "API not responding yet, continuing with group setup anyway"
    else
        print_status "Waiting for API... (attempt $i/12)"
        sleep 10
    fi
done

# Create auto-group assignment directory
sudo mkdir -p /opt/opensilex-auto-groups

# Install Python dependencies
sudo apt install -y python3 python3-pip python3-venv jq curl

# Setup Python environment for HTTP requests (no client dependencies needed)
print_status "Setting up Python environment for HTTP requests..."

# Create Python virtual environment with only necessary HTTP libraries
sudo python3 -m venv /opt/opensilex-auto-groups/venv
sudo /opt/opensilex-auto-groups/venv/bin/pip install requests urllib3

# Create the monitoring script
sudo tee /opt/opensilex-auto-groups/monitor_new_users.py > /dev/null << 'MONITOR_EOF'
#!/usr/bin/env python3
"""
Working OpenSILEX New User Monitor using raw HTTP requests
Bypasses Python client deserialization issues
"""

import requests
import json
import time
import logging
import os
import sys
from datetime import datetime

# Configuration - Dynamic IP detection
import subprocess

def get_vm_ip():
    """Get VM public IP dynamically"""
    try:
        # Try multiple methods to get public IP
        commands = [
            ['curl', '-s', '--max-time', '10', 'ifconfig.me'],
            ['curl', '-s', '--max-time', '10', 'ipinfo.io/ip'],
            ['curl', '-s', '--max-time', '10', 'icanhazip.com']
        ]
        
        for cmd in commands:
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
                if result.returncode == 0 and result.stdout.strip():
                    ip = result.stdout.strip()
                    # Validate IP format
                    parts = ip.split('.')
                    if len(parts) == 4 and all(0 <= int(part) <= 255 for part in parts):
                        return ip
            except (subprocess.TimeoutExpired, subprocess.CalledProcessError, ValueError):
                continue
                
        return 'localhost'  # Fallback
    except Exception:
        return 'localhost'  # Fallback

VM_IP = get_vm_ip()
OPENSILEX_API_URL = f"http://{VM_IP}:8666/rest"
ADMIN_EMAIL = "admin@opensilex.org"
ADMIN_PASSWORD = "admin"
DEFAULT_GROUP_URI = "http://opensilex.org/groups/users"
DEFAULT_PROFILE_URI = "http://opensilex.org/profiles/default"
CHECK_INTERVAL = 10  # seconds - optimized for faster user detection
PROCESSED_USERS_FILE = "/opt/opensilex-auto-groups/processed_users.json"
USER_COUNT_FILE = "/opt/opensilex-auto-groups/user_count.json"

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/opensilex-auto-groups.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class RawOpenSILEXAutoGroups:
    def __init__(self):
        self.token = None
        self.processed_users = self.load_processed_users()
        
    def load_processed_users(self):
        """Load list of already processed users"""
        try:
            if os.path.exists(PROCESSED_USERS_FILE):
                with open(PROCESSED_USERS_FILE, 'r') as f:
                    return set(json.load(f))
        except Exception as e:
            logger.warning(f"Could not load processed users file: {e}")
        return set()
    
    def save_processed_users(self):
        """Save list of processed users"""
        try:
            with open(PROCESSED_USERS_FILE, 'w') as f:
                json.dump(list(self.processed_users), f)
        except Exception as e:
            logger.error(f"Could not save processed users file: {e}")
    
    def load_user_count(self):
        """Load last known user count"""
        try:
            if os.path.exists(USER_COUNT_FILE):
                with open(USER_COUNT_FILE, 'r') as f:
                    data = json.load(f)
                    return data.get('count', 0)
            return 0
        except Exception as e:
            logger.warning(f"Could not load user count: {e}")
            return 0
    
    def save_user_count(self, count):
        """Save current user count"""
        try:
            with open(USER_COUNT_FILE, 'w') as f:
                json.dump({'count': count, 'timestamp': time.time()}, f)
        except Exception as e:
            logger.error(f"Could not save user count: {e}")
    
    def detect_user_deletion(self, current_count):
        """Detect if users were deleted and reset processing if needed"""
        last_count = self.load_user_count()
        
        if last_count > 0 and current_count < last_count:
            logger.warning(f"🔄 User count decreased: {last_count} → {current_count} (deletion detected)")
            logger.info("🔄 Automatically resetting processed users cache...")
            self.processed_users = set()
            self.save_processed_users()
            logger.info("✅ Cache reset complete - will re-process all users")
            return True
        
        return False
    
    def authenticate(self):
        """Authenticate and get token"""
        try:
            auth_data = {"identifier": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
            response = requests.post(f"{OPENSILEX_API_URL}/security/authenticate", 
                                   json=auth_data, headers={"Content-Type": "application/json"})
            
            if response.status_code == 200:
                result = response.json()
                self.token = result.get('result', {}).get('token')
                if self.token:
                    logger.info("Successfully authenticated with OpenSILEX API")
                    return True
            
            logger.error(f"Authentication failed: {response.status_code}")
            return False
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            return False
    
    def get_users_from_api(self):
        """Get users using raw HTTP"""
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.get(f"{OPENSILEX_API_URL}/security/users", headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                return data.get('result', [])
            else:
                logger.error(f"Failed to get users: {response.status_code} - {response.text}")
                return []
        except Exception as e:
            logger.error(f"Error getting users: {e}")
            return []
    
    def get_group_by_uri(self, group_uri):
        """Get group data using raw HTTP"""
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            # URL encode the URI
            encoded_uri = group_uri.replace('/', '%2F').replace(':', '%3A')
            response = requests.get(f"{OPENSILEX_API_URL}/security/groups/{encoded_uri}", headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                return data.get('result', {})
            else:
                logger.error(f"Failed to get group: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            logger.error(f"Error getting group: {e}")
            return None
    
    def update_group_raw(self, group_data):
        """Update group using raw HTTP"""
        try:
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            
            response = requests.put(f"{OPENSILEX_API_URL}/security/groups", 
                                  json=group_data, headers=headers)
            
            if response.status_code == 200:
                return True
            else:
                logger.error(f"Failed to update group: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"Error updating group: {e}")
            return False
    
    def assign_user_to_group(self, user_data):
        """Assign user to default group using raw HTTP"""
        try:
            user_uri = user_data.get('uri')
            user_email = user_data.get('email', 'unknown')
            user_name = f"{user_data.get('first_name', '')} {user_data.get('last_name', '')}".strip()
            if not user_name:
                user_name = user_email
            
            logger.info(f"Processing user: {user_email} ({user_uri})")
            
            # Get current group
            group_data = self.get_group_by_uri(DEFAULT_GROUP_URI)
            if not group_data:
                logger.error("Could not retrieve Users group")
                return False
            
            # Check if user already in group
            user_profiles = group_data.get('user_profiles', [])
            for profile in user_profiles:
                if profile.get('user_uri') == user_uri:
                    logger.info(f"User {user_email} already in group")
                    return True
            
            # Add user to group
            new_user_profile = {
                "user_uri": user_uri,
                "user_name": user_name,
                "profile_uri": DEFAULT_PROFILE_URI,
                "profile_name": "Default User"
            }
            
            user_profiles.append(new_user_profile)
            group_data['user_profiles'] = user_profiles
            
            # Update the group
            if self.update_group_raw(group_data):
                logger.info(f"✅ Successfully assigned {user_email} to Users group")
                return True
            else:
                logger.error(f"❌ Failed to update group for {user_email}")
                return False
                
        except Exception as e:
            logger.error(f"Error assigning user to group: {e}")
            return False
    
    def get_current_group_members(self):
        """Get list of current Users group members"""
        try:
            group_data = self.get_group_by_uri(DEFAULT_GROUP_URI)
            if not group_data:
                return set()
            
            user_profiles = group_data.get('user_profiles', [])
            return set(profile.get('user_uri') for profile in user_profiles if profile.get('user_uri'))
        except Exception as e:
            logger.error(f"Error getting group members: {e}")
            return set()
    
    def process_new_users(self):
        """Process new users with enhanced group membership checking"""
        try:
            if not self.token and not self.authenticate():
                logger.warning("Failed to authenticate")
                return
            
            users = self.get_users_from_api()
            if not users:
                logger.debug("No users returned")
                return
            
            logger.info(f"Found {len(users)} total users")
            
            # Check for user deletions and auto-reset if needed
            self.detect_user_deletion(len(users))
            self.save_user_count(len(users))
            
            # Get current group members
            current_group_members = self.get_current_group_members()
            logger.debug(f"Current group has {len(current_group_members)} members")
            
            assigned_users = 0
            
            for user in users:
                user_uri = user.get('uri')
                user_email = user.get('email', 'unknown')
                
                if not user_uri:
                    continue
                
                # Skip admin user
                if user_email == ADMIN_EMAIL:
                    continue
                
                # Check if user is NOT in the group (regardless of processed status)
                if user_uri not in current_group_members:
                    logger.info(f"Found new user: {user_email}")
                    
                    # Assign to group
                    if self.assign_user_to_group(user):
                        self.processed_users.add(user_uri)
                        assigned_users += 1
                    else:
                        logger.error(f"Failed to assign {user_email}")
                else:
                    # User is in group - make sure they're marked as processed
                    if user_uri not in self.processed_users:
                        self.processed_users.add(user_uri)
                        logger.debug(f"Marked existing group member as processed: {user_email}")
            
            if assigned_users > 0:
                self.save_processed_users()
                logger.info(f"Processed {assigned_users} new users")
            else:
                logger.debug("No new users to process")
                
            # Save processed users even if no new assignments (for existing members)
            self.save_processed_users()
                
        except Exception as e:
            logger.error(f"Error in process_new_users: {e}")
            self.token = None  # Reset auth on error
    
    def run_monitor(self):
        """Main monitoring loop"""
        logger.info("🚀 Starting Intelligent OpenSILEX Monitor with auto-deletion detection")
        logger.info(f"Check interval: {CHECK_INTERVAL} seconds")
        logger.info("🧠 Automatically detects account deletions and resets cache")
        
        while True:
            try:
                self.process_new_users()
                time.sleep(CHECK_INTERVAL)
                
            except KeyboardInterrupt:
                logger.info("Shutting down...")
                break
            except Exception as e:
                logger.error(f"Unexpected error: {e}")
                time.sleep(CHECK_INTERVAL)
        
        logger.info("Monitor stopped")

if __name__ == "__main__":
    monitor = RawOpenSILEXAutoGroups()
    monitor.run_monitor()
MONITOR_EOF

# Create initial groups and profiles setup script using raw HTTP
sudo tee /opt/opensilex-auto-groups/setup_initial_groups.py > /dev/null << 'SETUP_EOF'
#!/usr/bin/env python3
"""
Setup OpenSILEX profiles and groups using raw HTTP requests
No client dependencies - pure HTTP implementation
"""

import requests
import json
import time
import sys
import logging

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Dynamic IP detection for API URL
import subprocess

def get_vm_ip():
    """Get VM public IP dynamically"""
    try:
        # Try multiple methods to get public IP
        commands = [
            ['curl', '-s', '--max-time', '10', 'ifconfig.me'],
            ['curl', '-s', '--max-time', '10', 'ipinfo.io/ip'],
            ['curl', '-s', '--max-time', '10', 'icanhazip.com']
        ]
        
        for cmd in commands:
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
                if result.returncode == 0 and result.stdout.strip():
                    ip = result.stdout.strip()
                    # Validate IP format
                    parts = ip.split('.')
                    if len(parts) == 4 and all(0 <= int(part) <= 255 for part in parts):
                        return ip
            except (subprocess.TimeoutExpired, subprocess.CalledProcessError, ValueError):
                continue
                
        return 'localhost'  # Fallback
    except Exception:
        return 'localhost'  # Fallback

VM_IP = get_vm_ip()
OPENSILEX_API_URL = f"http://{VM_IP}:8666/rest"
ADMIN_EMAIL = "admin@opensilex.org"
ADMIN_PASSWORD = "admin"

class RawOpenSILEXSetup:
    def __init__(self):
        self.token = None
        self.base_url = OPENSILEX_API_URL
        
    def authenticate(self):
        """Authenticate and get token using raw HTTP"""
        try:
            auth_data = {"identifier": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
            response = requests.post(f"{self.base_url}/security/authenticate", 
                                   json=auth_data, headers={"Content-Type": "application/json"})
            
            if response.status_code == 200:
                result = response.json()
                self.token = result.get('result', {}).get('token')
                if self.token:
                    logger.info("Successfully authenticated with OpenSILEX API")
                    return True
            
            logger.error(f"Authentication failed: {response.status_code}")
            return False
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            return False
    
    def delete_profile(self, profile_uri):
        """Delete profile using raw HTTP"""
        try:
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            # URL encode the URI
            encoded_uri = profile_uri.replace('/', '%2F').replace(':', '%3A')
            response = requests.delete(f"{self.base_url}/security/profiles/{encoded_uri}",
                                      headers=headers)

            if response.status_code == 200 or response.status_code == 204:
                return True
            elif response.status_code == 404:
                logger.info(f"Profile {profile_uri} does not exist")
                return True
            else:
                logger.error(f"Failed to delete profile: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"Error deleting profile: {e}")
            return False

    def get_profile(self, profile_uri):
        """Get profile by URI using raw HTTP"""
        try:
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            # URL encode the URI
            encoded_uri = profile_uri.replace('/', '%2F').replace(':', '%3A')
            response = requests.get(f"{self.base_url}/security/profiles/{encoded_uri}",
                                   headers=headers)

            if response.status_code == 200:
                return response.json().get('result', {})
            elif response.status_code == 404:
                return None
            else:
                logger.error(f"Failed to get profile: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            logger.error(f"Error getting profile: {e}")
            return None

    def update_profile(self, profile_data):
        """Update profile using raw HTTP"""
        try:
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            response = requests.put(f"{self.base_url}/security/profiles",
                                   json=profile_data, headers=headers)

            if response.status_code == 200:
                return True
            else:
                logger.error(f"Failed to update profile: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"Error updating profile: {e}")
            return False

    def create_profile(self, profile_data):
        """Create profile using raw HTTP"""
        try:
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            response = requests.post(f"{self.base_url}/security/profiles",
                                   json=profile_data, headers=headers)

            if response.status_code == 200 or response.status_code == 201:
                return True
            elif response.status_code == 409:
                logger.info(f"Profile {profile_data.get('name')} already exists - updating it")
                # Profile exists, update it instead
                return self.update_profile(profile_data)
            else:
                logger.error(f"Failed to create profile: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"Error creating profile: {e}")
            return False
    
    def create_group(self, group_data):
        """Create group using raw HTTP"""
        try:
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            response = requests.post(f"{self.base_url}/security/groups", 
                                   json=group_data, headers=headers)
            
            if response.status_code == 200 or response.status_code == 201:
                return True
            elif response.status_code == 409:
                logger.info(f"Group {group_data.get('name')} already exists")
                return True
            else:
                logger.error(f"Failed to create group: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"Error creating group: {e}")
            return False

def main():
    print("🚀 Setting up OpenSILEX profiles and groups for Feide/OpenID integration...")
    
    try:
        # Initialize setup
        setup = RawOpenSILEXSetup()
        
        # Authenticate with retry logic
        authenticated = False
        for attempt in range(5):
            print(f"Authentication attempt {attempt + 1}/5...")
            if setup.authenticate():
                authenticated = True
                print("✅ Authentication successful")
                break
            else:
                print(f"❌ Authentication failed (attempt {attempt+1}/5)")
                if attempt < 4:
                    print("Waiting 10 seconds before retry...")
                    time.sleep(10)
        
        if not authenticated:
            print("❌ Could not authenticate after 5 attempts")
            sys.exit(1)

        print("🔧 Cleaning up old profiles...")

        # Delete "Default Profile" if it exists (avoid confusion with "Default User")
        # This is the profile created during system installation with full access
        old_default_profile_uri = "http://www.opensilex.org/profiles/default-profile"
        if setup.delete_profile(old_default_profile_uri):
            print("✅ Removed old 'Default Profile' (if it existed)")

        print("🔧 Creating profiles with proper credentials...")

        # Create comprehensive admin profile with ALL credentials
        # This maps to ALL the credentials you listed
        admin_credentials = [
            # Accounts
            "account-access", "account-modification",
            # Annotations
            "annotation-access", "annotation-modification", "annotation-delete",
            # Area
            "area-access", "area-modification", "area-delete",
            # Data
            "data-access", "data-modification", "data-delete",
            # Dataverse
            "dataverse-access", "dataverse-modification",
            # Device
            "device-access", "device-modification", "device-delete",
            # Documents
            "document-access", "document-modification", "document-delete",
            # Events
            "event-access", "event-modification", "event-delete",
            # Experiments
            "experiment-access", "experiment-modification", "experiment-delete",
            # Facilities
            "facility-access", "facility-modification", "facility-delete",
            # Factors
            "factor-access", "factor-modification", "factor-delete",
            # Germplasm
            "germplasm-access", "germplasm-modification", "germplasm-delete",
            # Groups
            "group-access", "group-modification", "group-delete",
            # Organizations
            "organization-access", "organization-modification", "organization-delete",
            # Packages
            "package-access",
            # Persons
            "person-access", "person-modification",
            # Profiles
            "profile-access", "profile-modification", "profile-delete",
            # Projects
            "project-access", "project-modification", "project-delete",
            # Provenances
            "provenance-access", "provenance-modification", "provenance-delete",
            # Scientific objects
            "scientific-objects-access", "scientific-objects-modification", "scientific-objects-delete",
            # Spatial
            "spatial-access",
            # Users
            "user-access", "user-modification", "user-delete",
            # Variables
            "variable-access", "variable-modification", "variable-delete",
            # Vocabulary
            "vocabulary-access",
            # System/Admin access
            "admin-access", "dashboard-access", "menu-access", "profile-read-own"
        ]
        
        admin_profile_data = {
            "uri": "http://opensilex.org/profiles/admin",
            "name": "Administrator",
            "credentials": admin_credentials
        }
        
        if setup.create_profile(admin_profile_data):
            print("✅ Created/Updated Administrator profile with comprehensive permissions")
        else:
            print("❌ Failed to create Administrator profile")
        
        # Create default profile for new users with MENU ACCESS ONLY (read-only)
        # This profile provides navigation to all modules but NO modification rights
        # Maps to "Menu access" column from your credentials list
        default_user_credentials = [
            # Menu access only (no add/update/delete permissions)
            "account-access",           # Accounts: Menu access
            "annotation-access",        # Annotations: Menu access (implied)
            "area-access",              # Area: Menu access (implied)
            "data-access",              # Data: Menu access
            "dataverse-access",         # Dataverse: Menu access
            "device-access",            # Device: Menu access
            "document-access",          # Documents: Menu access
            "event-access",             # Events: Menu access
            "experiment-access",        # Experiments: Menu access
            "facility-access",          # Facilities: Menu access (implied)
            "factor-access",            # Factors: Menu access (implied)
            "germplasm-access",         # Germplasm: Menu access
            "group-access",             # Groups: Menu access
            "organization-access",      # Organizations: Menu access
            "package-access",           # Packages: Menu access
            "person-access",            # Persons: Menu access
            "profile-access",           # Profiles: Menu access
            "project-access",           # Projects: Menu access
            "provenance-access",        # Provenances: Menu access (implied)
            "scientific-objects-access",# Scientific objects: Menu access
            "spatial-access",           # Spatial: Menu access
            "variable-access",          # Variables: Menu access
            "vocabulary-access",        # Vocabulary: Menu access
            # Dashboard and own profile
            "dashboard-access", "menu-access", "profile-read-own"
        ]

        default_profile_data = {
            "uri": "http://opensilex.org/profiles/default",
            "name": "Default User",
            "credentials": default_user_credentials
        }
        
        if setup.create_profile(default_profile_data):
            print("✅ Created Default User profile")
        else:
            print("❌ Failed to create Default User profile")
        
        print("🔧 Creating groups...")
        
        # Create Users group for automatic Feide assignment
        users_group_data = {
            "uri": "http://opensilex.org/groups/users",
            "name": "Users",
            "description": "Default group for Feide/OpenID users - automatically assigned",
            "user_profiles": []
        }
        
        if setup.create_group(users_group_data):
            print("✅ Created Users group")
        else:
            print("❌ Failed to create Users group")
        
        # Create Administrators group for manual admin assignment
        admin_group_data = {
            "uri": "http://opensilex.org/groups/administrators",
            "name": "Administrators",
            "description": "System administrators with full access",
            "user_profiles": []
        }
        
        if setup.create_group(admin_group_data):
            print("✅ Created Administrators group")
        else:
            print("❌ Failed to create Administrators group")
        
        print("✅ Setup completed successfully!")
        print("")
        print("📋 Profile Configuration:")
        print("1. ✅ Old 'Default Profile' removed automatically")
        print("2. ✅ Administrator profile created with ALL credentials:")
        print("   • Full add/update/delete access to all modules")
        print("   • User, group, and profile management")
        print("3. ✅ Default User profile created with MENU ACCESS ONLY:")
        print("   • Can view/navigate all modules")
        print("   • NO add/update/delete permissions")
        print("4. ✅ Users group created for automatic assignment")
        print("5. ✅ Administrators group created")
        print("")
        print("🔧 Manual Action Required:")
        print("• Log into the OpenSILEX web interface as admin")
        print("• Go to Administration > Groups")
        print("• Edit the 'Administrators' group")
        print("• Add the admin user with 'Administrator' profile")
        print("• This enables full admin functionality via the API")
        print("")
        print("🚀 Automatic User Management:")
        print("• New Feide users automatically join 'Users' group")
        print("• They receive 'Default User' profile (menu access only)")
        print("• Monitoring service detects new users every 10 seconds")
        print("• Give them dashboard and menu access")
        
    except Exception as e:
        print(f"❌ Setup failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
SETUP_EOF

# Make scripts executable
sudo chmod +x /opt/opensilex-auto-groups/monitor_new_users.py
sudo chmod +x /opt/opensilex-auto-groups/setup_initial_groups.py

# Run initial setup
print_status "Creating initial profiles and groups..."
sudo /opt/opensilex-auto-groups/venv/bin/python /opt/opensilex-auto-groups/setup_initial_groups.py

# Create systemd service for monitoring
sudo tee /etc/systemd/system/opensilex-auto-groups.service > /dev/null << 'SERVICE_EOF'
[Unit]
Description=Intelligent OpenSILEX Auto Group Assignment (detects account deletions automatically)
After=network.target opensilex.service
Requires=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/opensilex-auto-groups
ExecStart=/opt/opensilex-auto-groups/venv/bin/python /opt/opensilex-auto-groups/monitor_new_users.py
Restart=always
RestartSec=10
StandardOutput=append:/var/log/opensilex-auto-groups.log
StandardError=append:/var/log/opensilex-auto-groups.log

Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
SERVICE_EOF

# Create log rotation
sudo tee /etc/logrotate.d/opensilex-auto-groups > /dev/null << 'LOGROTATE_EOF'
/var/log/opensilex-auto-groups.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
}
LOGROTATE_EOF

# Create reset monitoring script for account recreation scenarios
sudo tee /opt/opensilex-auto-groups/reset_monitoring.sh << 'RESET_EOF'
#!/bin/bash
# Reset OpenSILEX Auto Groups Monitoring
# Use this if a Feide user deleted/recreated their account and needs re-processing

echo "🔄 Resetting OpenSILEX Auto Groups Monitoring..."

# Clear processed users cache
echo "Clearing processed users cache..."
sudo echo "[]" > /opt/opensilex-auto-groups/processed_users.json

# Restart monitoring service
echo "Restarting monitoring service..."
sudo systemctl restart opensilex-auto-groups

echo "✅ Monitoring reset complete!"
echo "📊 The service will now re-process all users within 10 seconds."
echo ""
echo "Check status with: sudo systemctl status opensilex-auto-groups"
echo "View logs with: sudo journalctl -u opensilex-auto-groups -f"
RESET_EOF

sudo chmod +x /opt/opensilex-auto-groups/reset_monitoring.sh

# Enable and start the auto-groups service
sudo systemctl daemon-reload
sudo systemctl enable opensilex-auto-groups.service
sudo systemctl start opensilex-auto-groups.service

print_success "Automatic group assignment configured!"

print_success "OpenSILEX production installation completed!"
echo ""
echo "==============================================" 
echo "        Installation Summary"
echo "==============================================" 
echo "• Using azureuser for OpenSILEX installation"
echo "• Directory structure: /home/azureuser/opensilex/{bin,config,data,logs}"
echo "• Configuration files created with logging"
echo "• MongoDB and GraphDB services configured"
echo "• Triplestore initialized with ontologies"
echo "• Admin user created (admin@opensilex.org / admin)"
echo "• Nginx reverse proxy configured on port 80"
echo "• Startup scripts and aliases configured"
echo "• Systemd service configured"
echo "• Feide/OpenID authentication configured"
echo "• Automatic group assignment system installed"
echo ""
echo "🔐 User Management:"
echo "• New Feide users automatically join 'Users' group (10s detection)"
echo "• 🧠 Intelligent deletion detection - auto-resets on account recreation"
echo "• Default profile provides menu/dashboard access only"
echo "• Admin users must be manually assigned to 'Administrators' group"
echo "• Monitor service: systemctl status opensilex-auto-groups"
echo "• Monitor logs: journalctl -u opensilex-auto-groups -f"
echo "• Manual reset (if needed): /opt/opensilex-auto-groups/reset_monitoring.sh"
echo ""
echo "Next steps:"
echo "1. Access: http://$(curl -s ifconfig.me)/ (nginx) or :8666 (direct)"
echo "2. Login with Feide credentials (new users auto-assigned to Users group)"
echo "3. For admin access: manually add users to Administrators group"
echo "4. Run help: /home/azureuser/opensilex-help.sh"
echo "==============================================" 