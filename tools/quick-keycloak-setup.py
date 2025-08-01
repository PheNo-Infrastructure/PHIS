#!/usr/bin/env python3
"""
Quick Keycloak Setup Script
Python script for one-command Keycloak setup and testing
"""

import sys
import os
import subprocess
import time
import requests
import json
from pathlib import Path

# Add src to path for imports
current_dir = Path(__file__).parent
project_root = current_dir.parent
src_path = project_root / "src"
sys.path.insert(0, str(src_path))

class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    NC = '\033[0m'  # No Color

def print_status(message): print(f"{Colors.BLUE}[INFO]{Colors.NC} {message}")
def print_success(message): print(f"{Colors.GREEN}[SUCCESS]{Colors.NC} {message}")
def print_warning(message): print(f"{Colors.YELLOW}[WARNING]{Colors.NC} {message}")
def print_error(message): print(f"{Colors.RED}[ERROR]{Colors.NC} {message}")

class KeycloakSetup:
    def __init__(self, vm_ip=None):
        self.vm_ip = vm_ip or self.get_vm_ip()
        self.keycloak_admin_user = os.getenv('KEYCLOAK_ADMIN_USER', 'admin')
        self.keycloak_admin_password = os.getenv('KEYCLOAK_ADMIN_PASSWORD', 'admin')
        self.opensilex_client_id = os.getenv('OPENSILEX_CLIENT_ID', 'opensilex-client')
        self.keycloak_realm = os.getenv('KEYCLOAK_REALM', 'master')
        self.ssh_user = os.getenv('SSH_USER', 'azureuser')
        self.ssh_key_path = self.find_ssh_key()
        
    def get_vm_ip(self):
        """Get VM IP from user input or environment"""
        vm_ip = os.getenv('VM_IP')
        if not vm_ip:
            vm_ip = input("Enter VM IP address: ").strip()
        if not vm_ip:
            print_error("VM IP address is required")
            sys.exit(1)
        return vm_ip
    
    def find_ssh_key(self):
        """Find available SSH key"""
        ssh_dir = Path.home() / ".ssh"
        key_files = ['id_ed25519', 'id_rsa', 'id_ecdsa']
        
        for key_file in key_files:
            key_path = ssh_dir / key_file
            if key_path.exists():
                print_success(f"Using SSH key: {key_path}")
                return str(key_path)
        
        print_error("No SSH keys found")
        print_info("Available files in ~/.ssh/:")
        try:
            for f in ssh_dir.iterdir():
                print(f"  {f.name}")
        except:
            print("  Directory not accessible")
        sys.exit(1)
    
    def run_ssh_command(self, command, capture_output=False):
        """Execute command on remote VM via SSH"""
        ssh_cmd = [
            'ssh', '-i', self.ssh_key_path, 
            '-o', 'StrictHostKeyChecking=no',
            f'{self.ssh_user}@{self.vm_ip}',
            command
        ]
        
        try:
            if capture_output:
                result = subprocess.run(ssh_cmd, capture_output=True, text=True, check=True)
                return result.stdout.strip()
            else:
                subprocess.run(ssh_cmd, check=True)
                return True
        except subprocess.CalledProcessError as e:
            print_error(f"SSH command failed: {e}")
            if capture_output and e.stdout:
                print(f"stdout: {e.stdout}")
            if capture_output and e.stderr:
                print(f"stderr: {e.stderr}")
            return False
    
    def upload_file(self, local_path, remote_path):
        """Upload file to VM via SCP"""
        scp_cmd = [
            'scp', '-i', self.ssh_key_path,
            '-o', 'StrictHostKeyChecking=no',
            local_path, f'{self.ssh_user}@{self.vm_ip}:{remote_path}'
        ]
        
        try:
            subprocess.run(scp_cmd, check=True)
            return True
        except subprocess.CalledProcessError as e:
            print_error(f"File upload failed: {e}")
            return False
    
    def install_keycloak(self):
        """Install Keycloak on the VM"""
        print_status(f"Installing Keycloak on VM: {self.vm_ip}")
        
        # Create installation script
        install_script = f'''#!/bin/bash
set -e

RED='\\033[0;31m'
GREEN='\\033[0;32m'
BLUE='\\033[0;34m'
NC='\\033[0m'

echo -e "${{BLUE}}[INFO]${{NC}} Installing Keycloak via Docker..."

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${{BLUE}}[INFO]${{NC}} Starting Docker..."
    sudo systemctl start docker
    sleep 5
fi

# Stop existing Keycloak container if it exists
if docker ps -q -f name=keycloak >/dev/null 2>&1; then
    echo -e "${{BLUE}}[INFO]${{NC}} Stopping existing Keycloak container..."
    docker stop keycloak >/dev/null 2>&1 || true
    docker rm keycloak >/dev/null 2>&1 || true
fi

# Pull and start Keycloak
echo -e "${{BLUE}}[INFO]${{NC}} Pulling Keycloak image..."
docker pull quay.io/keycloak/keycloak:latest

echo -e "${{BLUE}}[INFO]${{NC}} Starting Keycloak container..."
docker run -d \\
    --name keycloak \\
    --restart unless-stopped \\
    -p 8080:8080 \\
    -e KEYCLOAK_ADMIN={self.keycloak_admin_user} \\
    -e KEYCLOAK_ADMIN_PASSWORD={self.keycloak_admin_password} \\
    -e KC_HTTP_ENABLED=true \\
    -e KC_HOSTNAME_STRICT=false \\
    -e KC_HOSTNAME_STRICT_HTTPS=false \\
    quay.io/keycloak/keycloak:latest start-dev

# Wait for Keycloak to start
echo -e "${{BLUE}}[INFO]${{NC}} Waiting for Keycloak to start..."
for i in {{1..60}}; do
    if curl -s -o /dev/null -w "%{{http_code}}" http://localhost:8080/ | grep -q "200\\|302\\|404"; then
        echo -e "${{GREEN}}[SUCCESS]${{NC}} Keycloak is running!"
        break
    fi
    sleep 5
    echo -n "."
done
echo

echo -e "${{GREEN}}[SUCCESS]${{NC}} Keycloak installation completed!"
echo -e "${{BLUE}}[INFO]${{NC}} Admin Console: http://$(curl -s ifconfig.me):8080/admin/"
echo -e "${{BLUE}}[INFO]${{NC}} Credentials: {self.keycloak_admin_user} / {self.keycloak_admin_password}"
'''
        
        # Write to temporary file and upload
        temp_script = Path('/tmp/install-keycloak.sh')
        temp_script.write_text(install_script)
        
        if not self.upload_file(str(temp_script), '~/install-keycloak.sh'):
            return False
        
        # Make executable and run
        if not self.run_ssh_command('chmod +x ~/install-keycloak.sh'):
            return False
        
        if not self.run_ssh_command('~/install-keycloak.sh'):
            return False
        
        # Cleanup
        temp_script.unlink()
        
        print_success("Keycloak installation completed!")
        return True
    
    def configure_keycloak(self):
        """Configure Keycloak client"""
        print_status("Configuring Keycloak client...")
        
        # Wait a bit more for Keycloak to be fully ready
        print_status("Waiting for Keycloak to be fully ready...")
        time.sleep(30)
        
        # Create configuration script
        config_script = f'''#!/bin/bash
set -e

RED='\\033[0;31m'
GREEN='\\033[0;32m'
BLUE='\\033[0;34m'
NC='\\033[0m'

KEYCLOAK_URL="http://localhost:8080"
ADMIN_USER="{self.keycloak_admin_user}"
ADMIN_PASSWORD="{self.keycloak_admin_password}"
REALM="{self.keycloak_realm}"
CLIENT_ID="{self.opensilex_client_id}"

echo -e "${{BLUE}}[INFO]${{NC}} Getting admin access token..."

# Get admin access token
ADMIN_TOKEN=$(curl -s -X POST "${{KEYCLOAK_URL}}/realms/master/protocol/openid-connect/token" \\
    -H "Content-Type: application/x-www-form-urlencoded" \\
    -d "username=${{ADMIN_USER}}" \\
    -d "password=${{ADMIN_PASSWORD}}" \\
    -d "grant_type=password" \\
    -d "client_id=admin-cli" \\
    | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
    echo -e "${{RED}}[ERROR]${{NC}} Failed to get admin access token"
    exit 1
fi

echo -e "${{GREEN}}[SUCCESS]${{NC}} Admin access token obtained"

# Create client
echo -e "${{BLUE}}[INFO]${{NC}} Creating OpenSilex client..."

curl -s -X POST "${{KEYCLOAK_URL}}/admin/realms/${{REALM}}/clients" \\
    -H "Authorization: Bearer $ADMIN_TOKEN" \\
    -H "Content-Type: application/json" \\
    -d '{{
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
        "attributes": {{
            "pkce.code.challenge.method": "S256"
        }}
    }}'

echo -e "${{GREEN}}[SUCCESS]${{NC}} Client created successfully!"

# Create test user
echo -e "${{BLUE}}[INFO]${{NC}} Creating test user..."

curl -s -X POST "${{KEYCLOAK_URL}}/admin/realms/${{REALM}}/users" \\
    -H "Authorization: Bearer $ADMIN_TOKEN" \\
    -H "Content-Type: application/json" \\
    -d '{{
        "username": "opensilex-user",
        "firstName": "OpenSilex",
        "lastName": "User",
        "email": "opensilex@example.com",
        "enabled": true,
        "credentials": [{{
            "type": "password",
            "value": "opensilex123",
            "temporary": false
        }}]
    }}'

echo -e "${{GREEN}}[SUCCESS]${{NC}} Configuration completed!"
echo -e "${{BLUE}}[INFO]${{NC}} Test user: opensilex-user (password: opensilex123)"
'''
        
        # Write to temporary file and upload
        temp_script = Path('/tmp/configure-keycloak.sh')
        temp_script.write_text(config_script)
        
        if not self.upload_file(str(temp_script), '~/configure-keycloak.sh'):
            return False
        
        # Make executable and run
        if not self.run_ssh_command('chmod +x ~/configure-keycloak.sh'):
            return False
        
        if not self.run_ssh_command('~/configure-keycloak.sh'):
            return False
        
        # Cleanup
        temp_script.unlink()
        
        print_success("Keycloak configuration completed!")
        return True
    
    def test_integration(self):
        """Test Keycloak integration with Python client"""
        print_status("Testing Keycloak integration...")
        
        try:
            # Test direct Keycloak authentication
            print_status("Testing direct Keycloak authentication...")
            
            from utils import KeycloakAuthManager
            
            auth_manager = KeycloakAuthManager(
                keycloak_url=f'http://{self.vm_ip}:8080',
                realm=self.keycloak_realm,
                client_id=self.opensilex_client_id
            )
            
            # Test with admin credentials
            if auth_manager.authenticate_with_password(self.keycloak_admin_user, self.keycloak_admin_password):
                print_success("✅ Admin authentication successful")
                token_info = auth_manager.get_token_info()
                print(f"   User: {token_info.get('username')}")
                print(f"   Auth method: {token_info.get('auth_method')}")
            else:
                print_error("❌ Admin authentication failed")
                return False
            
            # Test unified authentication
            print_status("Testing unified authentication...")
            
            from utils import UnifiedAuthManager, AuthMethod
            
            unified_auth = UnifiedAuthManager(
                auth_method=AuthMethod.AUTO,
                opensilex_host=f'http://{self.vm_ip}:8666',
                keycloak_config={
                    'keycloak_url': f'http://{self.vm_ip}:8080',
                    'realm': self.keycloak_realm,
                    'client_id': self.opensilex_client_id
                }
            )
            
            if unified_auth.authenticate(self.keycloak_admin_user, self.keycloak_admin_password):
                active_method = unified_auth.get_active_auth_method()
                token_info = unified_auth.get_token_info()
                print_success(f"✅ Unified authentication successful using {active_method}")
                print(f"   User: {token_info.get('username')}")
            else:
                print_error("❌ Unified authentication failed")
                return False
            
            print_success("🎉 All integration tests passed!")
            return True
            
        except ImportError as e:
            print_error(f"Import error: {e}")
            print_warning("Make sure you're running from the PHIS project root directory")
            return False
        except Exception as e:
            print_error(f"Test failed: {e}")
            return False
    
    def check_status(self):
        """Check Keycloak status"""
        print_status(f"Checking Keycloak status on VM: {self.vm_ip}")
        
        status_output = self.run_ssh_command(
            'docker ps --filter name=keycloak --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" | grep keycloak || echo "Container not running"',
            capture_output=True
        )
        
        if status_output and "keycloak" in status_output:
            print_success("✅ Keycloak container is running")
            print(f"   {status_output}")
            
            # Check if accessible
            try:
                response = requests.get(f'http://{self.vm_ip}:8080/', timeout=10)
                if response.status_code in [200, 302, 404]:
                    print_success("✅ Keycloak is accessible")
                    print(f"📍 Admin Console: http://{self.vm_ip}:8080/admin/")
                    print(f"🔑 Credentials: {self.keycloak_admin_user} / {self.keycloak_admin_password}")
                else:
                    print_warning(f"⚠️ Keycloak responding with status {response.status_code}")
            except Exception as e:
                print_warning(f"⚠️ Could not verify external access: {e}")
        else:
            print_error("❌ Keycloak container is not running")
    
    def full_setup(self):
        """Complete automated setup"""
        print_status("🚀 Starting full automated Keycloak setup...")
        print()
        
        # Step 1: Install Keycloak
        if not self.install_keycloak():
            print_error("Installation failed")
            return False
        
        # Step 2: Wait for startup
        print_status("Waiting for Keycloak to fully initialize...")
        time.sleep(30)
        
        # Step 3: Configure Keycloak
        if not self.configure_keycloak():
            print_error("Configuration failed")
            return False
        
        # Step 4: Test integration
        print_status("Waiting a moment before testing...")
        time.sleep(10)
        
        if not self.test_integration():
            print_warning("Tests failed, but Keycloak may still be functional")
        
        # Step 5: Final status check
        self.check_status()
        
        print()
        print_success("🎉 Keycloak setup completed!")
        print_success(f"📍 Access: http://{self.vm_ip}:8080/admin/")
        print_success(f"🔑 Admin: {self.keycloak_admin_user} / {self.keycloak_admin_password}")
        print_success("🧪 Test user: opensilex-user / opensilex123")
        print()
        print_status("Next steps:")
        print("  1. Run: python examples/keycloak_usage.py")
        print("  2. Use unified auth in your scripts")
        print("  3. Set up environment variables for easier config")
        
        return True

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Quick Keycloak Setup for PHIS")
    parser.add_argument('command', nargs='?', default='full-setup',
                      choices=['full-setup', 'install', 'configure', 'test', 'status'],
                      help='Command to execute')
    parser.add_argument('--vm-ip', help='VM IP address')
    parser.add_argument('--admin-user', default='admin', help='Keycloak admin username')
    parser.add_argument('--admin-password', default='admin', help='Keycloak admin password')
    parser.add_argument('--client-id', default='opensilex-client', help='OAuth client ID')
    parser.add_argument('--realm', default='master', help='Keycloak realm')
    
    args = parser.parse_args()
    
    # Set environment variables from args
    if args.admin_user: os.environ['KEYCLOAK_ADMIN_USER'] = args.admin_user
    if args.admin_password: os.environ['KEYCLOAK_ADMIN_PASSWORD'] = args.admin_password
    if args.client_id: os.environ['OPENSILEX_CLIENT_ID'] = args.client_id
    if args.realm: os.environ['KEYCLOAK_REALM'] = args.realm
    if args.vm_ip: os.environ['VM_IP'] = args.vm_ip
    
    # Create setup instance
    setup = KeycloakSetup(vm_ip=args.vm_ip)
    
    print("🚀 Quick Keycloak Setup for PHIS")
    print("=" * 40)
    print(f"VM IP: {setup.vm_ip}")
    print(f"Realm: {setup.keycloak_realm}")
    print(f"Client ID: {setup.opensilex_client_id}")
    print()
    
    # Execute command
    try:
        if args.command == 'full-setup':
            success = setup.full_setup()
        elif args.command == 'install':
            success = setup.install_keycloak()
        elif args.command == 'configure':
            success = setup.configure_keycloak()
        elif args.command == 'test':
            success = setup.test_integration()
        elif args.command == 'status':
            setup.check_status()
            success = True
        
        sys.exit(0 if success else 1)
        
    except KeyboardInterrupt:
        print()
        print_warning("Setup interrupted by user")
        sys.exit(1)
    except Exception as e:
        print_error(f"Setup failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()