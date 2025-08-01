#!/bin/bash
# Keycloak Setup Automation Script for Linux/Mac
# Bash script for automated Keycloak installation and configuration

set -e

# Configuration variables
VM_IP="${VM_IP:-}"
KEYCLOAK_ADMIN_USER="${KEYCLOAK_ADMIN_USER:-admin}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
OPENSILEX_CLIENT_ID="${OPENSILEX_CLIENT_ID:-opensilex-client}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-master}"
SSH_USER="${SSH_USER:-azureuser}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/id_rsa}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

show_usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  install      Install Keycloak on remote VM"
    echo "  configure    Configure Keycloak client"
    echo "  test         Test Keycloak integration"
    echo "  full-setup   Complete automated setup"
    echo "  status       Check Keycloak status"
    echo "  start        Start Keycloak container"
    echo "  stop         Stop Keycloak container"
    echo "  remove       Remove Keycloak container"
    echo "  menu         Show interactive menu"
    echo ""
    echo "Environment Variables:"
    echo "  VM_IP                    - Target VM IP address"
    echo "  KEYCLOAK_ADMIN_USER      - Keycloak admin username (default: admin)"
    echo "  KEYCLOAK_ADMIN_PASSWORD  - Keycloak admin password (default: admin)"
    echo "  OPENSILEX_CLIENT_ID      - OAuth client ID (default: opensilex-client)"
    echo "  KEYCLOAK_REALM           - Keycloak realm (default: master)"
    echo "  SSH_USER                 - SSH username (default: azureuser)"
    echo "  SSH_KEY_PATH             - SSH key path (default: ~/.ssh/id_rsa)"
    echo ""
    echo "Examples:"
    echo "  VM_IP=1.2.3.4 $0 full-setup"
    echo "  $0 menu"
}

get_vm_ip() {
    if [ -z "$VM_IP" ]; then
        echo -n "Enter VM IP address: "
        read VM_IP
    fi
    
    if [ -z "$VM_IP" ]; then
        print_error "VM IP address is required"
        exit 1
    fi
}

check_ssh_key() {
    if [ ! -f "$SSH_KEY_PATH" ]; then
        print_error "SSH key not found at $SSH_KEY_PATH"
        print_info "Available keys:"
        ls -la ~/.ssh/id_* 2>/dev/null || echo "No SSH keys found"
        exit 1
    fi
    print_success "Using SSH key: $SSH_KEY_PATH"
}

install_keycloak() {
    print_status "Installing Keycloak on VM: $VM_IP"
    
    # Create installation script
    cat > /tmp/install-keycloak.sh << 'INSTALL_SCRIPT'
#!/bin/bash
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

print_status "Installing Keycloak via Docker..."

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    print_error "Docker is not running. Starting Docker..."
    sudo systemctl start docker
    sleep 5
fi

# Stop existing Keycloak container if it exists
if docker ps -q -f name=keycloak >/dev/null 2>&1; then
    print_warning "Stopping existing Keycloak container..."
    docker stop keycloak >/dev/null 2>&1 || true
    docker rm keycloak >/dev/null 2>&1 || true
fi

# Pull latest Keycloak image
print_status "Pulling Keycloak Docker image..."
docker pull quay.io/keycloak/keycloak:latest

# Start Keycloak container
print_status "Starting Keycloak container..."
docker run -d \
    --name keycloak \
    --restart unless-stopped \
    -p 8080:8080 \
    -e KEYCLOAK_ADMIN=KEYCLOAK_ADMIN_USER_PLACEHOLDER \
    -e KEYCLOAK_ADMIN_PASSWORD=***REMOVED*** \
    -e KC_HTTP_ENABLED=true \
    -e KC_HOSTNAME_STRICT=false \
    -e KC_HOSTNAME_STRICT_HTTPS=false \
    quay.io/keycloak/keycloak:latest start-dev

# Wait for Keycloak to start
print_status "Waiting for Keycloak to start (this may take 2-3 minutes)..."
for i in {1..60}; do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ | grep -q "200\|302\|404"; then
        print_success "Keycloak is now running!"
        break
    fi
    sleep 5
    echo -n "."
done
echo

# Verify Keycloak is accessible
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ | grep -q "200\|302\|404"; then
    print_success "✅ Keycloak installation completed successfully!"
    print_success "📍 Keycloak Admin Console: http://$(curl -s ifconfig.me):8080/"
    print_success "🔑 Admin credentials: KEYCLOAK_ADMIN_USER_PLACEHOLDER / ***REMOVED***"
    
    # Show container status
    print_status "Container status:"
    docker ps --filter name=keycloak --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
else
    print_error "❌ Keycloak installation failed or not accessible"
    print_error "Check container logs with: docker logs keycloak"
    exit 1
fi
INSTALL_SCRIPT

    # Replace placeholders
    sed -i "s/KEYCLOAK_ADMIN_USER_PLACEHOLDER/$KEYCLOAK_ADMIN_USER/g" /tmp/install-keycloak.sh
    sed -i "s/***REMOVED***/$KEYCLOAK_ADMIN_PASSWORD/g" /tmp/install-keycloak.sh
    
    # Upload and execute
    scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no /tmp/install-keycloak.sh "$SSH_USER@$VM_IP:~/install-keycloak.sh"
    ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$SSH_USER@$VM_IP" "chmod +x ~/install-keycloak.sh && ~/install-keycloak.sh"
    
    # Cleanup
    rm /tmp/install-keycloak.sh
    
    print_success "Keycloak installation completed!"
    print_info "Access URL: http://$VM_IP:8080/"
    print_info "Admin Console: http://$VM_IP:8080/admin/"
    print_info "Credentials: $KEYCLOAK_ADMIN_USER / $KEYCLOAK_ADMIN_PASSWORD"
}

configure_keycloak() {
    print_status "Configuring Keycloak client for OpenSilex..."
    
    # Create configuration script
    cat > /tmp/configure-keycloak.sh << 'CONFIG_SCRIPT'
#!/bin/bash
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

KEYCLOAK_URL="http://localhost:8080"
ADMIN_USER="KEYCLOAK_ADMIN_USER_PLACEHOLDER"
ADMIN_PASSWORD="***REMOVED***"
REALM="KEYCLOAK_REALM_PLACEHOLDER"
CLIENT_ID="OPENSILEX_CLIENT_ID_PLACEHOLDER"

print_status "Waiting for Keycloak admin console to be ready..."
for i in {1..30}; do
    if curl -s "${KEYCLOAK_URL}/admin/" >/dev/null 2>&1; then
        print_success "Keycloak admin console is ready"
        break
    fi
    sleep 5
    echo -n "."
done
echo

# Get admin access token
print_status "Getting admin access token..."
ADMIN_TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=${ADMIN_USER}" \
    -d "password=${ADMIN_PASSWORD}" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
    print_error "Failed to get admin access token"
    exit 1
fi

print_success "Admin access token obtained"

# Check if client already exists
print_status "Checking if client '$CLIENT_ID' already exists..."
CLIENT_EXISTS=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" \
    | grep -c "$CLIENT_ID" || echo "0")

if [ "$CLIENT_EXISTS" -gt "0" ]; then
    print_warning "Client '$CLIENT_ID' already exists. Updating configuration..."
    
    # Get client UUID
    CLIENT_UUID=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
        "${KEYCLOAK_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" \
        | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    # Update existing client
    curl -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "clientId": "'"$CLIENT_ID"'",
            "name": "OpenSilex Python Client",
            "description": "Python client for OpenSilex with PHIS integration",
            "enabled": true,
            "publicClient": true,
            "directAccessGrantsEnabled": true,
            "standardFlowEnabled": true,
            "implicitFlowEnabled": false,
            "serviceAccountsEnabled": false,
            "redirectUris": [
                "http://localhost:8080/callback",
                "http://127.0.0.1:8080/callback",
                "http://localhost/*",
                "http://127.0.0.1/*"
            ],
            "webOrigins": ["*"],
            "attributes": {
                "pkce.code.challenge.method": "S256"
            }
        }'
    
    print_success "✅ Client '$CLIENT_ID' updated successfully"
else
    print_status "Creating new client '$CLIENT_ID'..."
    
    # Create new client
    curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/clients" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "clientId": "'"$CLIENT_ID"'",
            "name": "OpenSilex Python Client",
            "description": "Python client for OpenSilex with PHIS integration",
            "enabled": true,
            "publicClient": true,
            "directAccessGrantsEnabled": true,
            "standardFlowEnabled": true,
            "implicitFlowEnabled": false,
            "serviceAccountsEnabled": false,
            "redirectUris": [
                "http://localhost:8080/callback",
                "http://127.0.0.1:8080/callback",
                "http://localhost/*",
                "http://127.0.0.1/*"
            ],
            "webOrigins": ["*"],
            "attributes": {
                "pkce.code.challenge.method": "S256"
            }
        }'
    
    if [ $? -eq 0 ]; then
        print_success "✅ Client '$CLIENT_ID' created successfully"
    else
        print_error "❌ Failed to create client '$CLIENT_ID'"
        exit 1
    fi
fi

# Create a test user for OpenSilex
print_status "Creating test user 'opensilex-user'..."
TEST_USER_EXISTS=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=opensilex-user" \
    | grep -c "opensilex-user" || echo "0")

if [ "$TEST_USER_EXISTS" -eq "0" ]; then
    curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/users" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "username": "opensilex-user",
            "firstName": "OpenSilex",
            "lastName": "User",
            "email": "opensilex@example.com",
            "enabled": true,
            "credentials": [{
                "type": "password",
                "value": "opensilex123",
                "temporary": false
            }]
        }'
    
    print_success "✅ Test user 'opensilex-user' created (password: opensilex123)"
else
    print_warning "Test user 'opensilex-user' already exists"
fi

print_success "🎉 Keycloak configuration completed!"
print_info "📋 Configuration Summary:"
print_info "  • Realm: $REALM"
print_info "  • Client ID: $CLIENT_ID"
print_info "  • Client Type: Public"
print_info "  • Direct Access Grants: Enabled"
print_info "  • PKCE: Enabled"
print_info "  • Admin User: $ADMIN_USER"
print_info "  • Test User: opensilex-user (password: opensilex123)"
print_info "  • Admin Console: http://$(curl -s ifconfig.me):8080/admin/"
CONFIG_SCRIPT

    # Replace placeholders
    sed -i "s/KEYCLOAK_ADMIN_USER_PLACEHOLDER/$KEYCLOAK_ADMIN_USER/g" /tmp/configure-keycloak.sh
    sed -i "s/***REMOVED***/$KEYCLOAK_ADMIN_PASSWORD/g" /tmp/configure-keycloak.sh
    sed -i "s/KEYCLOAK_REALM_PLACEHOLDER/$KEYCLOAK_REALM/g" /tmp/configure-keycloak.sh
    sed -i "s/OPENSILEX_CLIENT_ID_PLACEHOLDER/$OPENSILEX_CLIENT_ID/g" /tmp/configure-keycloak.sh
    
    # Upload and execute
    scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no /tmp/configure-keycloak.sh "$SSH_USER@$VM_IP:~/configure-keycloak.sh"
    ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$SSH_USER@$VM_IP" "chmod +x ~/configure-keycloak.sh && ~/configure-keycloak.sh"
    
    # Cleanup
    rm /tmp/configure-keycloak.sh
    
    print_success "Keycloak client configuration completed!"
}

test_integration() {
    print_status "Testing Keycloak integration..."
    
    # Create test script
    cat > test_keycloak_integration.py << PYTHON_TEST
#!/usr/bin/env python3
import sys
import os

# Add src to path
current_dir = os.path.dirname(os.path.abspath(__file__))
src_path = os.path.join(current_dir, 'src')
sys.path.insert(0, src_path)

VM_IP = "$VM_IP"

def test_keycloak_direct():
    print("🧪 Testing direct Keycloak authentication...")
    try:
        from utils import KeycloakAuthManager
        
        auth_manager = KeycloakAuthManager(
            keycloak_url=f'http://{VM_IP}:8080',
            realm='$KEYCLOAK_REALM',
            client_id='$OPENSILEX_CLIENT_ID'
        )
        
        # Test with admin credentials
        if auth_manager.authenticate_with_password('$KEYCLOAK_ADMIN_USER', '$KEYCLOAK_ADMIN_PASSWORD'):
            print("✅ Admin authentication successful")
            token_info = auth_manager.get_token_info()
            print(f"   User: {token_info.get('username')}")
            print(f"   Auth method: {token_info.get('auth_method')}")
            return True
        else:
            print("❌ Admin authentication failed")
            return False
            
    except ImportError as e:
        print(f"❌ Import error: {e}")
        print("   Make sure you're running from the PHIS project root directory")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_unified_auth():
    print("\\n🔄 Testing unified authentication...")
    try:
        from utils import UnifiedAuthManager, AuthMethod
        
        auth_manager = UnifiedAuthManager(
            auth_method=AuthMethod.AUTO,
            opensilex_host=f'http://{VM_IP}:8666',
            keycloak_config={
                'keycloak_url': f'http://{VM_IP}:8080',
                'realm': '$KEYCLOAK_REALM',
                'client_id': '$OPENSILEX_CLIENT_ID'
            }
        )
        
        if auth_manager.authenticate('$KEYCLOAK_ADMIN_USER', '$KEYCLOAK_ADMIN_PASSWORD'):
            active_method = auth_manager.get_active_auth_method()
            token_info = auth_manager.get_token_info()
            print(f"✅ Unified authentication successful using {active_method}")
            print(f"   User: {token_info.get('username')}")
            return True
        else:
            print("❌ Unified authentication failed")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    print("🚀 Keycloak Integration Test Suite")
    print("=" * 50)
    
    # Test individual components
    test1 = test_keycloak_direct()
    test2 = test_unified_auth()
    
    print("\\n📊 Test Results:")
    print(f"   Direct Keycloak Auth: {'✅ PASS' if test1 else '❌ FAIL'}")
    print(f"   Unified Auth: {'✅ PASS' if test2 else '❌ FAIL'}")
    
    if all([test1, test2]):
        print("\\n🎉 All tests passed! Keycloak integration is working perfectly.")
        return True
    else:
        print("\\n❌ Some tests failed. Check the error messages above.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
PYTHON_TEST

    # Run the test
    if python3 test_keycloak_integration.py; then
        print_success "All integration tests passed!"
        rm test_keycloak_integration.py
        return 0
    else
        print_error "Some integration tests failed"
        rm test_keycloak_integration.py
        return 1
    fi
}

check_status() {
    print_status "Checking Keycloak status on VM: $VM_IP"
    
    ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$SSH_USER@$VM_IP" << 'STATUS_CHECK'
echo "🔍 Keycloak Status Check"
echo "======================="

# Check if container exists and is running
if docker ps --filter name=keycloak --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep keycloak; then
    echo "✅ Keycloak container is running"
    
    # Check if accessible
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ | grep -q "200\|302\|404"; then
        echo "✅ Keycloak is accessible on port 8080"
        echo "📍 Admin Console: http://$(curl -s ifconfig.me):8080/admin/"
    else
        echo "❌ Keycloak is not accessible on port 8080"
    fi
    
    # Show container details
    echo ""
    echo "Container Details:"
    docker inspect keycloak --format='{{.State.Status}}: {{.State.StartedAt}}'
    
else
    echo "❌ Keycloak container is not running"
    
    # Check if container exists but stopped
    if docker ps -a --filter name=keycloak --format "{{.Names}}" | grep -q keycloak; then
        echo "ℹ️ Keycloak container exists but is stopped"
        echo "   Use 'docker start keycloak' to start it"
    else
        echo "ℹ️ Keycloak container does not exist"
        echo "   Run installation first"
    fi
fi
STATUS_CHECK
}

start_keycloak() {
    print_status "Starting Keycloak container..."
    ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$SSH_USER@$VM_IP" "docker start keycloak"
    print_success "Keycloak started"
}

stop_keycloak() {
    print_status "Stopping Keycloak container..."
    ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$SSH_USER@$VM_IP" "docker stop keycloak"
    print_success "Keycloak stopped"
}

remove_keycloak() {
    echo -n "Are you sure you want to remove Keycloak? (yes/no): "
    read confirm
    
    if [ "$confirm" = "yes" ]; then
        print_status "Removing Keycloak container and image..."
        ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$SSH_USER@$VM_IP" "docker stop keycloak && docker rm keycloak && docker rmi quay.io/keycloak/keycloak:latest"
        print_success "Keycloak removed"
    else
        print_info "Removal cancelled"
    fi
}

show_menu() {
    clear
    echo "============================================="
    echo "       Keycloak Integration Manager        "
    echo "============================================="
    echo ""
    echo "Current Configuration:"
    echo "  VM IP: ${VM_IP:-Not Set}"
    echo "  SSH User: $SSH_USER"
    echo "  Keycloak Realm: $KEYCLOAK_REALM"
    echo "  Client ID: $OPENSILEX_CLIENT_ID"
    echo ""
    echo "Available Commands:"
    echo ""
    echo "  🚀 Quick Setup:"
    echo "    1. Full Automated Setup (Install + Configure + Test)"
    echo ""
    echo "  🔧 Individual Steps:"
    echo "    2. Install Keycloak Only"
    echo "    3. Configure Keycloak Client"
    echo "    4. Test Integration"
    echo ""
    echo "  📊 Management:"
    echo "    5. Check Status"
    echo "    6. Start Keycloak"
    echo "    7. Stop Keycloak"
    echo "    8. Remove Keycloak"
    echo ""
    echo "    0. Exit"
    echo ""
    
    echo -n "Select an option (0-8): "
    read choice
    
    get_vm_ip
    check_ssh_key
    
    case "$choice" in
        1)
            print_info "Starting full automated Keycloak setup..."
            install_keycloak
            sleep 30  # Wait for Keycloak to fully start
            configure_keycloak
            sleep 10
            test_integration
            ;;
        2) install_keycloak ;;
        3) configure_keycloak ;;
        4) test_integration ;;
        5) check_status ;;
        6) start_keycloak ;;
        7) stop_keycloak ;;
        8) remove_keycloak ;;
        0) 
            print_info "Goodbye!"
            exit 0
            ;;
        *)
            print_warning "Invalid selection. Please try again."
            sleep 2
            show_menu
            ;;
    esac
    
    if [ "$choice" != "0" ]; then
        echo ""
        echo -n "Press Enter to continue..."
        read
        show_menu
    fi
}

# Main execution
case "${1:-menu}" in
    "install")
        get_vm_ip
        check_ssh_key
        install_keycloak
        ;;
    "configure")
        get_vm_ip
        check_ssh_key
        configure_keycloak
        ;;
    "test")
        get_vm_ip
        test_integration
        ;;
    "full-setup")
        get_vm_ip
        check_ssh_key
        install_keycloak
        sleep 30
        configure_keycloak
        sleep 10
        test_integration
        ;;
    "status")
        get_vm_ip
        check_ssh_key
        check_status
        ;;
    "start")
        get_vm_ip
        check_ssh_key
        start_keycloak
        ;;
    "stop")
        get_vm_ip
        check_ssh_key
        stop_keycloak
        ;;
    "remove")
        get_vm_ip
        check_ssh_key
        remove_keycloak
        ;;
    "menu")
        show_menu
        ;;
    "help"|"--help"|"-h")
        show_usage
        ;;
    *)
        print_error "Unknown command: $1"
        show_usage
        exit 1
        ;;
esac