#!/usr/bin/env python3
import sys
import os
import json

# Set UTF-8 encoding for Windows console
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

# Add src to path
current_dir = os.path.dirname(os.path.abspath(__file__))
src_path = os.path.join(current_dir, 'src')
opensilex_client_path = os.path.join(current_dir, 'src', 'opensilex_python_client')
sys.path.insert(0, src_path)
sys.path.insert(0, opensilex_client_path)

VM_IP = "98.71.237.204"

def test_keycloak_direct():
    print("🧪 Testing direct Keycloak authentication...")
    try:
        from utils import KeycloakAuthManager
        
        auth_manager = KeycloakAuthManager(
            keycloak_url=f'http://{VM_IP}:8080',
            realm='master',
            client_id='opensilex-client'
        )
        
        # Test with admin credentials
        if auth_manager.authenticate_with_password('admin', 'admin'):
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
                'realm': 'master',
                'client_id': 'opensilex-client'
            }
        )
        
        if auth_manager.authenticate('admin', 'admin'):
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
            username='admin',
            password='admin',
            auth_method='auto',
            opensilex_host=f'http://{VM_IP}:8666',
            keycloak_config={
                'keycloak_url': f'http://{VM_IP}:8080',
                'realm': 'master',
                'client_id': 'opensilex-client'
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