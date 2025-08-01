# Keycloak Setup Automation Script
# PowerShell script for automated Keycloak installation and configuration on Azure VM

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("Menu", "InstallKeycloak", "ConfigureKeycloak", "TestKeycloak", "FullSetup", "Status", "StartKeycloak", "StopKeycloak", "RemoveKeycloak")]
    [string]$Command = "Menu",
    
    [Parameter(Mandatory=$false)]
    [string]$VMName = "opensilex-github-vm",
    
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroupName = "RG-OPENSILEX-GITHUB",
    
    [Parameter(Mandatory=$false)]
    [string]$AdminUsername = "azureuser",
    
    [Parameter(Mandatory=$false)]
    [string]$VMIPAddress,
    
    [Parameter(Mandatory=$false)]
    [string]$KeycloakAdminUser = "admin",
    
    [Parameter(Mandatory=$false)]
    [string]$KeycloakAdminPassword = "admin",
    
    [Parameter(Mandatory=$false)]
    [string]$OpenSilexClientId = "opensilex-client",
    
    [Parameter(Mandatory=$false)]
    [string]$KeycloakRealm = "master"
)

# Colors for output
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"
$Blue = "Cyan"
$White = "White"

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = $White,
        [string]$Prefix = ""
    )
    
    $timestamp = Get-Date -Format "HH:mm:ss"
    if ($Prefix) {
        Write-Host "[$timestamp] [$Prefix] $Message" -ForegroundColor $Color
    } else {
        Write-Host "[$timestamp] $Message" -ForegroundColor $Color
    }
}

function Write-Success { param([string]$Message) Write-ColorOutput $Message $Green "SUCCESS" }
function Write-Info { param([string]$Message) Write-ColorOutput $Message $Blue "INFO" }
function Write-Warning { param([string]$Message) Write-ColorOutput $Message $Yellow "WARNING" }
function Write-Error { param([string]$Message) Write-ColorOutput $Message $Red "ERROR" }

function Get-VMIPAddress {
    if ($VMIPAddress) {
        return $VMIPAddress
    }
    
    try {
        $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
        if ($publicIP) {
            return $publicIP.IpAddress
        }
    }
    catch {
        Write-Warning "Could not retrieve VM IP from Azure"
    }
    
    $VMIPAddress = Read-Host "Please enter the VM IP address"
    return $VMIPAddress
}

function Get-SSHKeyPath {
    # Check for existing SSH keys in order of preference
    $keyPaths = @(
        "$env:USERPROFILE\.ssh\id_ed25519.pub",
        "$env:USERPROFILE\.ssh\id_rsa.pub",
        "$env:USERPROFILE\.ssh\id_ecdsa.pub"
    )
    
    foreach ($path in $keyPaths) {
        if (Test-Path $path) {
            return $path -replace "\.pub$", ""
        }
    }
    
    Write-Error "No SSH keys found. Please run the main VM setup script first."
    return $null
}

function Install-KeycloakOnVM {
    param([string]$TargetIP)
    
    Write-Info "Installing Keycloak on VM: $TargetIP"
    
    $sshKeyPath = Get-SSHKeyPath
    if (-not $sshKeyPath) {
        return $false
    }
    
    try {
        # Create Keycloak installation script
        $keycloakInstallScript = @"
#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "`${BLUE}[INFO]`${NC} `$1"; }
print_success() { echo -e "`${GREEN}[SUCCESS]`${NC} `$1"; }
print_warning() { echo -e "`${YELLOW}[WARNING]`${NC} `$1"; }
print_error() { echo -e "`${RED}[ERROR]`${NC} `$1"; }

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
    -e KEYCLOAK_ADMIN=$KeycloakAdminUser \
    -e KEYCLOAK_ADMIN_PASSWORD=$KeycloakAdminPassword \
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
    print_success "📍 Keycloak Admin Console: http://`$(curl -s ifconfig.me):8080/"
    print_success "🔑 Admin credentials: $KeycloakAdminUser / $KeycloakAdminPassword"
    
    # Show container status
    print_status "Container status:"
    docker ps --filter name=keycloak --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
else
    print_error "❌ Keycloak installation failed or not accessible"
    print_error "Check container logs with: docker logs keycloak"
    exit 1
fi
"@
        
        # Upload and execute installation script
        $tempScript = [System.IO.Path]::GetTempFileName()
        [System.IO.File]::WriteAllText($tempScript, $keycloakInstallScript)
        
        scp -i $sshKeyPath -o StrictHostKeyChecking=no $tempScript "$AdminUsername@${TargetIP}:~/install-keycloak.sh"
        Remove-Item $tempScript
        
        # Fix line endings and make executable
        ssh -i $sshKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "sed -i 's/\r$//' ~/install-keycloak.sh && chmod +x ~/install-keycloak.sh"
        
        # Execute installation
        ssh -i $sshKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "~/install-keycloak.sh"
        
        Write-Success "Keycloak installation completed!"
        Write-Info "Access URL: http://${TargetIP}:8080/"
        Write-Info "Admin Console: http://${TargetIP}:8080/admin/"
        Write-Info "Credentials: $KeycloakAdminUser / $KeycloakAdminPassword"
        
        return $true
    }
    catch {
        Write-Error "Keycloak installation failed: $($_.Exception.Message)"
        return $false
    }
}

function Configure-KeycloakClient {
    param([string]$TargetIP)
    
    Write-Info "Configuring Keycloak client for OpenSilex..."
    
    $sshKeyPath = Get-SSHKeyPath
    if (-not $sshKeyPath) {
        return $false
    }
    
    try {
        # Create Keycloak configuration script
        $keycloakConfigScript = @"
#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "`${BLUE}[INFO]`${NC} `$1"; }
print_success() { echo -e "`${GREEN}[SUCCESS]`${NC} `$1"; }
print_warning() { echo -e "`${YELLOW}[WARNING]`${NC} `$1"; }
print_error() { echo -e "`${RED}[ERROR]`${NC} `$1"; }

KEYCLOAK_URL="http://localhost:8080"
ADMIN_USER="$KeycloakAdminUser"
ADMIN_PASSWORD="$KeycloakAdminPassword"
REALM="$KeycloakRealm"
CLIENT_ID="$OpenSilexClientId"

print_status "Waiting for Keycloak admin console to be ready..."
for i in {1..30}; do
    if curl -s "`${KEYCLOAK_URL}/admin/" >/dev/null 2>&1; then
        print_success "Keycloak admin console is ready"
        break
    fi
    sleep 5
    echo -n "."
done
echo

# Get admin access token
print_status "Getting admin access token..."
ADMIN_TOKEN=`$(curl -s -X POST "`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=`${ADMIN_USER}" \
    -d "password=`${ADMIN_PASSWORD}" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "`$ADMIN_TOKEN" ]; then
    print_error "Failed to get admin access token"
    exit 1
fi

print_success "Admin access token obtained"

# Check if client already exists
print_status "Checking if client '`$CLIENT_ID' already exists..."
CLIENT_EXISTS=`$(curl -s -H "Authorization: Bearer `$ADMIN_TOKEN" \
    "`${KEYCLOAK_URL}/admin/realms/`${REALM}/clients?clientId=`${CLIENT_ID}" \
    | grep -c "`$CLIENT_ID" || echo "0")

if [ "`$CLIENT_EXISTS" -gt "0" ]; then
    print_warning "Client '`$CLIENT_ID' already exists. Updating configuration..."
    
    # Get client UUID
    CLIENT_UUID=`$(curl -s -H "Authorization: Bearer `$ADMIN_TOKEN" \
        "`${KEYCLOAK_URL}/admin/realms/`${REALM}/clients?clientId=`${CLIENT_ID}" \
        | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    # Update existing client
    curl -s -X PUT "`${KEYCLOAK_URL}/admin/realms/`${REALM}/clients/`${CLIENT_UUID}" \
        -H "Authorization: Bearer `$ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "clientId": "'"`$CLIENT_ID`"'",
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
    
    print_success "✅ Client '`$CLIENT_ID' updated successfully"
else
    print_status "Creating new client '`$CLIENT_ID'..."
    
    # Create new client
    CLIENT_RESPONSE=`$(curl -s -X POST "`${KEYCLOAK_URL}/admin/realms/`${REALM}/clients" \
        -H "Authorization: Bearer `$ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "clientId": "'"`$CLIENT_ID`"'",
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
        }')
    
    if [ `$? -eq 0 ]; then
        print_success "✅ Client '`$CLIENT_ID' created successfully"
    else
        print_error "❌ Failed to create client '`$CLIENT_ID'"
        exit 1
    fi
fi

# Create a test user for OpenSilex
print_status "Creating test user 'opensilex-user'..."
TEST_USER_EXISTS=`$(curl -s -H "Authorization: Bearer `$ADMIN_TOKEN" \
    "`${KEYCLOAK_URL}/admin/realms/`${REALM}/users?username=opensilex-user" \
    | grep -c "opensilex-user" || echo "0")

if [ "`$TEST_USER_EXISTS" -eq "0" ]; then
    curl -s -X POST "`${KEYCLOAK_URL}/admin/realms/`${REALM}/users" \
        -H "Authorization: Bearer `$ADMIN_TOKEN" \
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
print_info "  • Realm: `$REALM"
print_info "  • Client ID: `$CLIENT_ID"
print_info "  • Client Type: Public"
print_info "  • Direct Access Grants: Enabled"
print_info "  • PKCE: Enabled"
print_info "  • Admin User: `$ADMIN_USER"
print_info "  • Test User: opensilex-user (password: opensilex123)"
print_info "  • Admin Console: http://`$(curl -s ifconfig.me):8080/admin/"
"@
        
        # Upload and execute configuration script
        $tempScript = [System.IO.Path]::GetTempFileName()
        [System.IO.File]::WriteAllText($tempScript, $keycloakConfigScript)
        
        scp -i $sshKeyPath -o StrictHostKeyChecking=no $tempScript "$AdminUsername@${TargetIP}:~/configure-keycloak.sh"
        Remove-Item $tempScript
        
        # Fix line endings and make executable
        ssh -i $sshKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "sed -i 's/\r$//' ~/configure-keycloak.sh && chmod +x ~/configure-keycloak.sh"
        
        # Execute configuration
        ssh -i $sshKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP "~/configure-keycloak.sh"
        
        Write-Success "Keycloak client configuration completed!"
        return $true
    }
    catch {
        Write-Error "Keycloak configuration failed: $($_.Exception.Message)"
        return $false
    }
}

function Test-KeycloakInstallation {
    param([string]$TargetIP)
    
    Write-Info "Testing Keycloak installation and Python client integration..."
    
    try {
        # Create test script for Python client
        $testScript = @"
#!/usr/bin/env python3
import sys
import os
import json

# Add src to path
current_dir = os.path.dirname(os.path.abspath(__file__))
src_path = os.path.join(current_dir, '..', 'src')
sys.path.insert(0, src_path)

VM_IP = "$TargetIP"

def test_keycloak_direct():
    print("🧪 Testing direct Keycloak authentication...")
    try:
        from utils import KeycloakAuthManager
        
        auth_manager = KeycloakAuthManager(
            keycloak_url=f'http://{VM_IP}:8080',
            realm='$KeycloakRealm',
            client_id='$OpenSilexClientId'
        )
        
        # Test with admin credentials
        if auth_manager.authenticate_with_password('$KeycloakAdminUser', '$KeycloakAdminPassword'):
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
                'realm': '$KeycloakRealm',
                'client_id': '$OpenSilexClientId'
            }
        )
        
        if auth_manager.authenticate('$KeycloakAdminUser', '$KeycloakAdminPassword'):
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

def test_opensilex_integration():
    print("\\n🔗 Testing OpenSilex client integration...")
    try:
        from utils import quick_unified_auth
        from opensilex_client import OpenSilexClient
        
        # Authenticate
        auth_manager = quick_unified_auth(
            username='$KeycloakAdminUser',
            password='$KeycloakAdminPassword',
            auth_method='auto',
            opensilex_host=f'http://{VM_IP}:8666',
            keycloak_config={
                'keycloak_url': f'http://{VM_IP}:8080',
                'realm': '$KeycloakRealm',
                'client_id': '$OpenSilexClientId'
            }
        )
        
        # Create OpenSilex client
        client = OpenSilexClient(auto_auth=False)
        client.auth_manager = auth_manager
        
        # Test basic functionality
        status = client.get_status()
        print(f"✅ OpenSilex integration successful")
        print(f"   Server accessible: {status.get('server_accessible', False)}")
        print(f"   Auth method: {auth_manager.get_active_auth_method()}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    print("🚀 Keycloak Integration Test Suite")
    print("=" * 50)
    
    # Test individual components
    test1 = test_keycloak_direct()
    test2 = test_unified_auth()
    test3 = test_opensilex_integration()
    
    print("\\n📊 Test Results:")
    print(f"   Direct Keycloak Auth: {'✅ PASS' if test1 else '❌ FAIL'}")
    print(f"   Unified Auth: {'✅ PASS' if test2 else '❌ FAIL'}")
    print(f"   OpenSilex Integration: {'✅ PASS' if test3 else '❌ FAIL'}")
    
    if all([test1, test2, test3]):
        print("\\n🎉 All tests passed! Keycloak integration is working perfectly.")
        print("\\n📚 Next steps:")
        print("   1. Use 'python examples/keycloak_usage.py' for more examples")
        print("   2. Create your own scripts using the unified auth manager")
        print("   3. Set up environment variables for easier configuration")
        return True
    else:
        print("\\n❌ Some tests failed. Check the error messages above.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
"@
        
        # Write test script to local file
        $testScriptPath = Join-Path $PSScriptRoot "..\test_keycloak_integration.py"
        [System.IO.File]::WriteAllText($testScriptPath, $testScript)
        
        Write-Info "Running Python integration tests..."
        
        # Execute test script
        $originalLocation = Get-Location
        Set-Location (Join-Path $PSScriptRoot "..")
        
        $result = & python $testScriptPath
        $exitCode = $LASTEXITCODE
        
        Set-Location $originalLocation
        
        if ($exitCode -eq 0) {
            Write-Success "All Keycloak integration tests passed!"
            return $true
        } else {
            Write-Error "Some Keycloak integration tests failed"
            return $false
        }
    }
    catch {
        Write-Error "Test execution failed: $($_.Exception.Message)"
        return $false
    }
}

function Get-KeycloakStatus {
    param([string]$TargetIP)
    
    Write-Info "Checking Keycloak status on VM: $TargetIP"
    
    $sshKeyPath = Get-SSHKeyPath
    if (-not $sshKeyPath) {
        return $false
    }
    
    try {
        $statusCheck = ssh -i $sshKeyPath -o StrictHostKeyChecking=no $AdminUsername@$TargetIP @"
echo "🔍 Keycloak Status Check"
echo "======================="

# Check if container exists and is running
if docker ps --filter name=keycloak --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep keycloak; then
    echo "✅ Keycloak container is running"
    
    # Check if accessible
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ | grep -q "200\|302\|404"; then
        echo "✅ Keycloak is accessible on port 8080"
        echo "📍 Admin Console: http://`$(curl -s ifconfig.me):8080/admin/"
        echo "🔑 Admin credentials: $KeycloakAdminUser / $KeycloakAdminPassword"
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
"@
        
        Write-Success "Keycloak status check completed"
        return $true
    }
    catch {
        Write-Error "Failed to check Keycloak status: $($_.Exception.Message)"
        return $false
    }
}

function Show-Menu {
    Clear-Host
    Write-Host "=============================================" -ForegroundColor Blue
    Write-Host "       Keycloak Integration Manager        " -ForegroundColor Blue
    Write-Host "=============================================" -ForegroundColor Blue
    Write-Host ""
    Write-Host "Current Configuration:" -ForegroundColor Yellow
    Write-Host "  VM Name: $VMName" -ForegroundColor White
    Write-Host "  Resource Group: $ResourceGroupName" -ForegroundColor White
    Write-Host "  Keycloak Realm: $KeycloakRealm" -ForegroundColor White
    Write-Host "  Client ID: $OpenSilexClientId" -ForegroundColor White
    Write-Host ""
    Write-Host "Available Commands:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  🚀 Quick Setup:" -ForegroundColor Green
    Write-Host "    1. Full Automated Setup (Install + Configure + Test)" -ForegroundColor White
    Write-Host ""
    Write-Host "  🔧 Individual Steps:" -ForegroundColor Green
    Write-Host "    2. Install Keycloak Only" -ForegroundColor White
    Write-Host "    3. Configure Keycloak Client" -ForegroundColor White
    Write-Host "    4. Test Integration" -ForegroundColor White
    Write-Host ""
    Write-Host "  📊 Management:" -ForegroundColor Green
    Write-Host "    5. Check Status" -ForegroundColor White
    Write-Host "    6. Start Keycloak" -ForegroundColor White
    Write-Host "    7. Stop Keycloak" -ForegroundColor White
    Write-Host "    8. Remove Keycloak" -ForegroundColor White
    Write-Host ""
    Write-Host "    0. Exit" -ForegroundColor Red
    Write-Host ""
    
    $choice = Read-Host "Select an option (0-8)"
    
    $vmIP = Get-VMIPAddress
    if (-not $vmIP) {
        Write-Error "Could not determine VM IP address"
        return
    }
    
    switch ($choice) {
        "1" { 
            Write-Info "Starting full automated Keycloak setup..."
            if (Install-KeycloakOnVM -TargetIP $vmIP) {
                Start-Sleep -Seconds 30  # Wait for Keycloak to fully start
                if (Configure-KeycloakClient -TargetIP $vmIP) {
                    Start-Sleep -Seconds 10
                    Test-KeycloakInstallation -TargetIP $vmIP
                }
            }
        }
        "2" { Install-KeycloakOnVM -TargetIP $vmIP }
        "3" { Configure-KeycloakClient -TargetIP $vmIP }
        "4" { Test-KeycloakInstallation -TargetIP $vmIP }
        "5" { Get-KeycloakStatus -TargetIP $vmIP }
        "6" { 
            $sshKeyPath = Get-SSHKeyPath
            if ($sshKeyPath) {
                ssh -i $sshKeyPath -o StrictHostKeyChecking=no $AdminUsername@$vmIP "docker start keycloak"
                Write-Success "Keycloak started"
            }
        }
        "7" { 
            $sshKeyPath = Get-SSHKeyPath
            if ($sshKeyPath) {
                ssh -i $sshKeyPath -o StrictHostKeyChecking=no $AdminUsername@$vmIP "docker stop keycloak"
                Write-Success "Keycloak stopped"
            }
        }
        "8" { 
            $confirm = Read-Host "Are you sure you want to remove Keycloak? (yes/no)"
            if ($confirm -eq "yes") {
                $sshKeyPath = Get-SSHKeyPath
                if ($sshKeyPath) {
                    ssh -i $sshKeyPath -o StrictHostKeyChecking=no $AdminUsername@$vmIP "docker stop keycloak && docker rm keycloak && docker rmi quay.io/keycloak/keycloak:latest"
                    Write-Success "Keycloak removed"
                }
            }
        }
        "0" { 
            Write-Info "Goodbye!"
            exit 
        }
        default { 
            Write-Warning "Invalid selection. Please try again."
            Start-Sleep -Seconds 2
        }
    }
    
    if ($choice -ne "0") {
        Write-Host ""
        Read-Host "Press Enter to continue"
        Show-Menu
    }
}

# Main execution
try {
    Write-Host "Keycloak Integration Manager" -ForegroundColor Blue
    Write-Host "============================" -ForegroundColor Blue
    Write-Host ""
    
    $vmIP = Get-VMIPAddress
    
    switch ($Command.ToLower()) {
        "menu" { Show-Menu }
        "installkeycloak" { Install-KeycloakOnVM -TargetIP $vmIP }
        "configurekeycloak" { Configure-KeycloakClient -TargetIP $vmIP }
        "testkeycloak" { Test-KeycloakIntegration -TargetIP $vmIP }
        "fullsetup" { 
            if (Install-KeycloakOnVM -TargetIP $vmIP) {
                Start-Sleep -Seconds 30
                if (Configure-KeycloakClient -TargetIP $vmIP) {
                    Start-Sleep -Seconds 10
                    Test-KeycloakInstallation -TargetIP $vmIP
                }
            }
        }
        "status" { Get-KeycloakStatus -TargetIP $vmIP }
        "startkeycloak" { 
            $sshKeyPath = Get-SSHKeyPath
            if ($sshKeyPath) {
                ssh -i $sshKeyPath -o StrictHostKeyChecking=no $AdminUsername@$vmIP "docker start keycloak"
                Write-Success "Keycloak started"
            }
        }
        "stopkeycloak" { 
            $sshKeyPath = Get-SSHKeyPath
            if ($sshKeyPath) {
                ssh -i $sshKeyPath -o StrictHostKeyChecking=no $AdminUsername@$vmIP "docker stop keycloak"
                Write-Success "Keycloak stopped"
            }
        }
        "removekeycloak" { 
            $confirm = Read-Host "Are you sure you want to remove Keycloak? (yes/no)"
            if ($confirm -eq "yes") {
                $sshKeyPath = Get-SSHKeyPath
                if ($sshKeyPath) {
                    ssh -i $sshKeyPath -o StrictHostKeyChecking=no $AdminUsername@$vmIP "docker stop keycloak && docker rm keycloak"
                    Write-Success "Keycloak removed"
                }
            }
        }
        default {
            Write-Error "Unknown command: $Command"
            Write-Info "Available commands: Menu, InstallKeycloak, ConfigureKeycloak, TestKeycloak, FullSetup, Status, StartKeycloak, StopKeycloak, RemoveKeycloak"
        }
    }
}
catch {
    Write-Error "Script execution failed: $($_.Exception.Message)"
    Write-Error $_.ScriptStackTrace
}