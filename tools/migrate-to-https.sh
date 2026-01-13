#!/bin/bash
# OpenSILEX HTTPS Migration Script
# Migrates existing HTTP installation to HTTPS with Let's Encrypt
# Run this on the production server after DNS is configured

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
DOMAIN="phis.pheno.no"
OPENSILEX_HOME="/home/azureuser/opensilex"
OPENSILEX_CONFIG="$OPENSILEX_HOME/config/opensilex.yml"

echo "=========================================="
echo "  OpenSILEX HTTPS Migration Script"
echo "=========================================="
echo ""
print_status "Domain: $DOMAIN"
print_status "Target: Migration from HTTP to HTTPS"
echo ""

# Verify DNS is configured
print_status "Verifying DNS configuration..."
RESOLVED_IP=$(dig +short "$DOMAIN" | head -n1)
if [ -z "$RESOLVED_IP" ]; then
    print_error "DNS lookup failed for $DOMAIN"
    exit 1
fi
print_success "DNS resolved to: $RESOLVED_IP"
echo ""

# Check if FEIDE has been updated
print_warning "IMPORTANT: Before proceeding, ensure you have updated FEIDE:"
print_warning "1. Go to: https://dashboard.dataporten.no/"
print_warning "2. Update Redirect URI to: https://$DOMAIN/app/openid"
echo ""
read -p "Have you updated FEIDE Dashboard? (yes/no): " FEIDE_UPDATED
if [[ "$FEIDE_UPDATED" != "yes" && "$FEIDE_UPDATED" != "y" ]]; then
    print_error "Please update FEIDE first, then run this script again"
    exit 1
fi
echo ""

# Install Certbot
print_status "Installing Certbot for SSL certificate management..."
sudo apt update
sudo apt install -y certbot python3-certbot-nginx

# Obtain Let's Encrypt certificate
print_status "Obtaining Let's Encrypt SSL certificate..."
print_status "This may take a few moments..."
echo ""

if sudo certbot certonly --webroot -w /var/www/html -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email; then
    print_success "SSL certificate obtained successfully!"
    print_success "Certificate location: /etc/letsencrypt/live/$DOMAIN/"
else
    print_error "Failed to obtain SSL certificate"
    print_error "Please check that:"
    print_error "  1. DNS is properly configured"
    print_error "  2. Port 80 is accessible from the internet"
    print_error "  3. Nginx is running on port 80"
    exit 1
fi
echo ""

# Backup existing configuration
print_status "Backing up existing configurations..."
sudo cp "$OPENSILEX_CONFIG" "${OPENSILEX_CONFIG}.backup-$(date +%Y%m%d-%H%M%S)"
sudo cp /etc/nginx/sites-available/opensilex /etc/nginx/sites-available/opensilex.backup-$(date +%Y%m%d-%H%M%S)
print_success "Backups created"
echo ""

# Update OpenSILEX configuration
print_status "Updating OpenSILEX configuration..."
sudo sed -i "s|baseURI: \"http://$DOMAIN/\"|baseURI: \"https://$DOMAIN/\"|g" "$OPENSILEX_CONFIG"
sudo sed -i "s|publicURI: \"http://$DOMAIN\"|publicURI: \"https://$DOMAIN\"|g" "$OPENSILEX_CONFIG"
sudo sed -i "s|redirectURI: \"http://$DOMAIN/app/openid\"|redirectURI: \"https://$DOMAIN/app/openid\"|g" "$OPENSILEX_CONFIG"
sudo sed -i "s|- \"http://$DOMAIN\"|- \"https://$DOMAIN\"|g" "$OPENSILEX_CONFIG"
sudo sed -i "s|base-URL \"http://$DOMAIN/\"|base-URL \"https://$DOMAIN/\"|g" "$OPENSILEX_CONFIG"
print_success "OpenSILEX configuration updated"
echo ""

# Update Nginx configuration
print_status "Updating Nginx configuration for HTTPS..."
sudo tee /etc/nginx/sites-available/opensilex > /dev/null << 'NGINX_CONFIG'
# HTTP server - redirect to HTTPS
server {
    listen 80;
    server_name phis.pheno.no;

    # Allow Certbot challenges for SSL certificate renewal
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all other HTTP traffic to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS server - main application
server {
    listen 443 ssl http2;
    server_name phis.pheno.no;

    # SSL certificate paths
    ssl_certificate /etc/letsencrypt/live/phis.pheno.no/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/phis.pheno.no/privkey.pem;

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

    # Proxy settings for OpenSILEX
    location / {
        proxy_pass http://127.0.0.1:8666;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
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
        proxy_set_header X-Forwarded-Proto https;
    }
}
NGINX_CONFIG

print_success "Nginx configuration updated"
echo ""

# Test Nginx configuration
print_status "Testing Nginx configuration..."
if sudo nginx -t; then
    print_success "Nginx configuration test passed"
else
    print_error "Nginx configuration test failed"
    print_error "Restoring backup..."
    sudo cp /etc/nginx/sites-available/opensilex.backup-$(date +%Y%m%d)* /etc/nginx/sites-available/opensilex
    exit 1
fi
echo ""

# Reload Nginx
print_status "Reloading Nginx..."
sudo systemctl reload nginx
print_success "Nginx reloaded"
echo ""

# Restart OpenSILEX
print_status "Restarting OpenSILEX service..."
sudo systemctl restart opensilex
print_success "OpenSILEX restarted"
echo ""

# Wait for services to stabilize
print_status "Waiting for services to stabilize (30 seconds)..."
sleep 30

# Verify HTTPS is working
print_status "Verifying HTTPS configuration..."
if curl -k -s -I https://localhost/ | grep -q "HTTP"; then
    print_success "HTTPS is active on port 443"
else
    print_warning "HTTPS verification inconclusive - please check manually"
fi
echo ""

# Final summary
echo "=========================================="
echo "  Migration Complete!"
echo "=========================================="
print_success "OpenSILEX has been migrated to HTTPS"
echo ""
echo "Configuration Summary:"
echo "• Domain: https://$DOMAIN"
echo "• SSL Certificate: Let's Encrypt (auto-renewing)"
echo "• HTTP → HTTPS: Automatic redirect enabled"
echo "• FEIDE OAuth: Updated to HTTPS endpoint"
echo ""
echo "Next Steps:"
echo "1. Test the application: https://$DOMAIN"
echo "2. Test FEIDE login with your credentials"
echo "3. Verify all functionality works correctly"
echo ""
echo "Certificate Renewal:"
echo "• Certificates auto-renew via certbot timer"
echo "• Manual renewal: sudo certbot renew"
echo "• Check renewal status: sudo certbot certificates"
echo ""
echo "Backup Locations:"
echo "• OpenSILEX config: ${OPENSILEX_CONFIG}.backup-*"
echo "• Nginx config: /etc/nginx/sites-available/opensilex.backup-*"
echo ""
print_success "Migration completed successfully!"
echo "=========================================="
