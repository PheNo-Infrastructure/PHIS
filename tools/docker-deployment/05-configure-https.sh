#!/bin/bash
# OpenSILEX Docker Compose HTTPS Configuration Script
# Configures nginx + Let's Encrypt for HTTPS on Docker Compose deployment
# Run this AFTER DNS is configured to point to the server

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
DOMAIN="${DOMAIN:-phis.pheno.no}"
# Use /home/azureuser even when running with sudo (which changes $HOME to /root)
DEPLOY_DIR="${DEPLOY_DIR:-/home/azureuser/opensilex-docker-compose}"

# Auto-detect OpenSILEX exposed port (nginx will proxy directly to OpenSILEX, not HAProxy)
# This avoids port 80 conflict between nginx and HAProxy
OPENSILEX_CONTAINER=$(docker ps --filter "name=opensilex.*app" --format "{{.Names}}" | head -n1)
if [ -n "$OPENSILEX_CONTAINER" ]; then
    OPENSILEX_PORT=$(docker port "$OPENSILEX_CONTAINER" 8081 | cut -d: -f2)
    print_status "Detected OpenSILEX on port: $OPENSILEX_PORT"
else
    # Fallback to common port
    OPENSILEX_PORT="28081"
    print_warning "Could not detect OpenSILEX port, using default: $OPENSILEX_PORT"
fi

echo "=========================================="
echo "  OpenSILEX HTTPS Configuration"
echo "=========================================="
echo ""
print_status "Domain: $DOMAIN"
print_status "Deploy directory: $DEPLOY_DIR"
echo ""

# Check if running on the server
if [ ! -d "$DEPLOY_DIR" ]; then
    print_error "Deploy directory not found: $DEPLOY_DIR"
    print_error "This script must be run ON the production server"
    exit 1
fi

# Verify DNS is configured
print_status "Verifying DNS configuration for $DOMAIN..."
if command -v dig &> /dev/null; then
    RESOLVED_IP=$(dig +short "$DOMAIN" | head -n1)
    if [ -z "$RESOLVED_IP" ]; then
        print_error "DNS lookup failed for $DOMAIN"
        print_error "Please configure DNS first:"
        print_error "  - Point $DOMAIN to this server's IP"
        print_error "  - Wait for DNS propagation (may take up to 24 hours)"
        exit 1
    fi
    print_success "DNS resolved to: $RESOLVED_IP"
else
    print_warning "dig command not found, skipping DNS verification"
    print_warning "Please ensure DNS is configured before proceeding"
    read -p "Continue anyway? (yes/no): " CONTINUE
    if [[ "$CONTINUE" != "yes" && "$CONTINUE" != "y" ]]; then
        exit 1
    fi
fi
echo ""

# Check FEIDE update requirement
print_warning "IMPORTANT: Before proceeding, update FEIDE configuration:"
print_warning "1. Go to: https://dashboard.dataporten.no/"
print_warning "2. Find your application (PHIS)"
print_warning "3. Update Redirect URI to: https://$DOMAIN/sandbox/app/openid"
print_warning "   Note: The config template uses /sandbox/app/openid for FEIDE OAuth"
print_warning "4. Save changes"
echo ""
read -p "Have you updated FEIDE Dashboard? (yes/no): " FEIDE_UPDATED
if [[ "$FEIDE_UPDATED" != "yes" && "$FEIDE_UPDATED" != "y" ]]; then
    print_error "Please update FEIDE first, then run this script again"
    exit 1
fi
echo ""

# Install nginx and certbot
print_status "Installing nginx and certbot..."
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
print_success "Packages installed"
echo ""

# Stop services to free port 80 for certbot
print_status "Temporarily stopping services to free port 80..."
sudo systemctl stop nginx 2>/dev/null || true

# Find and stop HAProxy container directly (docker compose needs env vars)
HAPROXY_CONTAINER=$(docker ps --filter "name=haproxy" --format "{{.Names}}" | head -n1)
if [ -n "$HAPROXY_CONTAINER" ]; then
    print_status "Stopping HAProxy container: $HAPROXY_CONTAINER"
    docker stop "$HAPROXY_CONTAINER"
    HAPROXY_WAS_RUNNING=1
    HAPROXY_CONTAINER_NAME="$HAPROXY_CONTAINER"
else
    print_status "No HAProxy container found running"
    HAPROXY_WAS_RUNNING=0
fi

print_success "Port 80 is now free for certificate acquisition"
echo ""

# Obtain Let's Encrypt certificate
print_status "Obtaining Let's Encrypt SSL certificate for $DOMAIN..."
print_status "This may take a few moments..."
echo ""

# Create webroot directory for ACME challenges (for future renewals)
sudo mkdir -p /var/www/letsencrypt
sudo chown -R www-data:www-data /var/www/letsencrypt

# Use standalone mode since nginx is stopped
if sudo certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos --email "admin@${DOMAIN}" --preferred-challenges http; then
    print_success "SSL certificate obtained successfully!"
    print_success "Certificate location: /etc/letsencrypt/live/$DOMAIN/"
else
    print_error "Failed to obtain SSL certificate"
    print_error "Please check that:"
    print_error "  1. DNS is properly configured and propagated"
    print_error "  2. Port 80 is accessible from the internet"
    print_error "  3. No firewall is blocking port 80"
    print_error "  4. HAProxy was stopped (it should be)"
    # Restart HAProxy if it was running
    if [ "$HAPROXY_WAS_RUNNING" -eq 1 ]; then
        docker start "$HAPROXY_CONTAINER_NAME"
    fi
    exit 1
fi
echo ""

# Configure nginx
print_status "Configuring nginx as HTTPS reverse proxy..."

# Backup existing nginx config if present
if [ -f /etc/nginx/sites-available/opensilex ]; then
    sudo cp /etc/nginx/sites-available/opensilex \
        /etc/nginx/sites-available/opensilex.backup-$(date +%Y%m%d-%H%M%S)
    print_status "Existing nginx config backed up"
fi

# Create nginx configuration
sudo tee /etc/nginx/sites-available/opensilex > /dev/null <<NGINX_CONFIG
# HTTP server - redirect to HTTPS and handle Let's Encrypt challenges
server {
    listen 80;
    server_name ${DOMAIN};

    # Allow Certbot challenges for SSL certificate renewal
    location /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }

    # Redirect all other HTTP traffic to HTTPS
    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS server - main application (proxy to OpenSILEX)
server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    # SSL certificate paths
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    # SSL configuration - modern security settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # HSTS (optional but recommended)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Increase client max body size for file uploads
    client_max_body_size 100M;

    # Redirect /sandbox/app/ to /app/ (for Feide/OpenID callback compatibility)
    # Note: Feide may redirect to /sandbox/app/openid but OpenSILEX serves frontend at /app/
    location /sandbox/app/ {
        rewrite ^/sandbox(/app/.*)$ \$1 permanent;
    }

    # Redirect root to /app/ (OpenSILEX serves frontend here)
    # Note: OpenSILEX has inconsistent path behavior - frontend on /app/, API on /sandbox/rest/
    location = / {
        return 301 /app/;
    }

    # Proxy all other requests to OpenSILEX container
    # Note: We proxy to OpenSILEX directly instead of HAProxy to avoid port 80 conflict
    # HAProxy was using port 80, but nginx now handles HTTPS on port 80/443
    location / {
        proxy_pass http://127.0.0.1:${OPENSILEX_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        # Timeout configuration - allow up to 6 minutes for complex RDF4J queries
        # This prevents nginx from killing connections before patch 003 can complete
        # Patch 003 forces JSON format to avoid RDF4J binary parser bug on device creation
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
        proxy_read_timeout 360s;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX_CONFIG

print_success "Nginx configuration created"
echo ""

# Enable site
print_status "Enabling nginx site..."
sudo ln -sf /etc/nginx/sites-available/opensilex /etc/nginx/sites-enabled/opensilex
sudo rm -f /etc/nginx/sites-enabled/default  # Remove default site

# Test nginx configuration
print_status "Testing nginx configuration..."
if sudo nginx -t; then
    print_success "Nginx configuration test passed"
else
    print_error "Nginx configuration test failed"
    exit 1
fi
echo ""

# Start nginx
print_status "Starting nginx..."
sudo systemctl enable nginx
sudo systemctl start nginx
print_success "Nginx started and enabled"
echo ""

# Note: HAProxy is NOT restarted to avoid port 80 conflict with nginx
# nginx now handles HTTPS and proxies directly to OpenSILEX
if [ "$HAPROXY_WAS_RUNNING" -eq 1 ]; then
    print_warning "HAProxy was stopped and will remain stopped to avoid port 80 conflict"
    print_status "nginx is now proxying directly to OpenSILEX on port $OPENSILEX_PORT"
    print_status "HAProxy is no longer needed for production deployment"
    echo ""
fi

# Update OpenSILEX configuration templates for HTTPS (so it persists across restarts)
print_status "Updating OpenSILEX configuration templates for HTTPS..."

# Update the custom config template (this is what generates opensilex.yml on container start)
OPENSILEX_CUSTOM_CONFIG="$DEPLOY_DIR/config/opensilex-custom-config.yml"
if [ -f "$OPENSILEX_CUSTOM_CONFIG" ]; then
    # Backup template
    cp "$OPENSILEX_CUSTOM_CONFIG" "${OPENSILEX_CUSTOM_CONFIG}.backup-$(date +%Y%m%d-%H%M%S)"

    # Hardcode HTTPS redirectURI in template (replaces template variable)
    sed -i "/redirectURI:/c\    redirectURI: \"https://${DOMAIN}/sandbox/app/openid\"" "$OPENSILEX_CUSTOM_CONFIG"

    # Add publicURI override at the end of the config (ensures it takes precedence)
    # This fixes the "Web API" button redirect issue
    if ! grep -q "# Override publicURI to use HTTPS domain" "$OPENSILEX_CUSTOM_CONFIG"; then
        echo "" >> "$OPENSILEX_CUSTOM_CONFIG"
        echo "# Override publicURI to use HTTPS domain" >> "$OPENSILEX_CUSTOM_CONFIG"
        echo "server:" >> "$OPENSILEX_CUSTOM_CONFIG"
        echo "  publicURI: \"https://${DOMAIN}/\"" >> "$OPENSILEX_CUSTOM_CONFIG"
        print_status "Added publicURI override to config template"
    else
        print_status "publicURI override already exists in config template"
    fi

    print_success "Template updated: opensilex-custom-config.yml"
else
    print_warning "Custom config template not found at: $OPENSILEX_CUSTOM_CONFIG"
fi

# Update environment variable for publicURI
OPENSILEX_ENV="$DEPLOY_DIR/opensilex.env"
if [ -f "$OPENSILEX_ENV" ]; then
    # Backup env file
    cp "$OPENSILEX_ENV" "${OPENSILEX_ENV}.backup-$(date +%Y%m%d-%H%M%S)"

    # Update OPENSILEX_PUBLIC_URL to use HTTPS domain
    sed -i "s|OPENSILEX_PUBLIC_URL=.*|OPENSILEX_PUBLIC_URL=https://${DOMAIN}/|g" "$OPENSILEX_ENV"

    print_success "Environment updated: opensilex.env"
else
    print_warning "OpenSILEX env file not found at: $OPENSILEX_ENV"
fi

print_success "OpenSILEX configuration templates updated for HTTPS"
echo ""

# Restart OpenSILEX container to apply config changes
print_status "Restarting OpenSILEX container: $OPENSILEX_CONTAINER"
if docker restart "$OPENSILEX_CONTAINER"; then
    print_success "OpenSILEX restarted"
    print_status "Waiting for OpenSILEX to start (15 seconds)..."
    sleep 15
else
    print_warning "Failed to restart OpenSILEX - you may need to restart manually"
fi
echo ""

# Wait for services to stabilize
print_status "Waiting for services to stabilize (30 seconds)..."
sleep 30

# Verify HTTPS is working
print_status "Verifying HTTPS configuration..."
if curl -k -s -I "https://${DOMAIN}/" | grep -q "HTTP"; then
    print_success "HTTPS is responding on port 443"
else
    print_warning "HTTPS verification inconclusive - please check manually"
fi
echo ""

# Set up automatic certificate renewal
print_status "Configuring automatic certificate renewal..."
print_status "Certbot timer should be enabled by default"
sudo systemctl enable certbot.timer 2>/dev/null || true
sudo systemctl start certbot.timer 2>/dev/null || true
print_success "Certificate auto-renewal configured"
echo ""

# Final summary
echo "=========================================="
echo "  HTTPS Configuration Complete!"
echo "=========================================="
print_success "OpenSILEX is now accessible via HTTPS"
echo ""
echo "Configuration Summary:"
echo "• Domain: https://$DOMAIN"
echo "• Web App: https://$DOMAIN/app/"
echo "• REST API: https://$DOMAIN/sandbox/rest/"
echo "• SSL Certificate: Let's Encrypt (auto-renewing)"
echo "• HTTP → HTTPS: Automatic redirect enabled"
echo "• FEIDE OAuth: Using HTTPS endpoint"
echo ""
echo "Next Steps:"
echo "1. Test the application: https://$DOMAIN"
echo "2. Test FEIDE login with your credentials"
echo "3. Verify all functionality works correctly"
echo "4. Change default admin password"
echo ""
echo "Certificate Management:"
echo "• Certificates auto-renew via certbot timer"
echo "• Manual renewal: sudo certbot renew"
echo "• Check renewal status: sudo certbot certificates"
echo "• Certificate expiry: 90 days (auto-renews at 30 days)"
echo ""
echo "Backup Locations:"
if [ -f "${OPENSILEX_CONFIG}.backup-"* ]; then
    echo "• OpenSILEX config: ${OPENSILEX_CONFIG}.backup-*"
fi
if [ -f /etc/nginx/sites-available/opensilex.backup-* ]; then
    echo "• Nginx config: /etc/nginx/sites-available/opensilex.backup-*"
fi
echo ""
print_success "HTTPS migration completed successfully!"
echo "=========================================="
