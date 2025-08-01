# Keycloak Integration Guide

This guide explains how to integrate Keycloak authentication with the OpenSilex Python client.

## Overview

The OpenSilex Python client now supports multiple authentication methods:

1. **Native OpenSilex Authentication** - Original JWT-based authentication
2. **Keycloak OAuth2/OIDC** - Standards-based authentication via Keycloak
3. **Unified Authentication** - Automatic selection between methods

## Features

### Keycloak Authentication Features

- **OAuth2 Authorization Code Flow** - Standard web-based authentication
- **Resource Owner Password Credentials** - Direct username/password authentication
- **PKCE Support** - Enhanced security for public clients
- **Token Refresh** - Automatic token renewal
- **Token Storage** - Secure local token persistence
- **User Information** - Access to user profile from Keycloak

### Integration Features

- **Backward Compatibility** - Existing OpenSilex auth continues to work
- **Auto-Detection** - Automatically try Keycloak then fall back to OpenSilex
- **Unified Interface** - Single API for all authentication methods
- **Configuration Flexibility** - Environment variables or programmatic setup

## Setup

### 1. Keycloak Server Setup

First, ensure Keycloak is running and properly configured:

```bash
# Using Docker
docker run -p 8080:8080 -e KEYCLOAK_ADMIN=admin -e KEYCLOAK_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:latest start-dev
```

### 2. Keycloak Client Configuration

Create a client in Keycloak with these settings:

- **Client ID**: `opensilex-client` (or your preferred name)
- **Client Type**: `public` (for desktop apps) or `confidential` (for server apps)
- **Valid Redirect URIs**: `http://localhost:8080/callback`
- **Direct Access Grants**: `enabled` (for password authentication)

### 3. Environment Variables (Optional)

Set environment variables for default configuration:

```bash
export KEYCLOAK_URL="http://localhost:8080"
export KEYCLOAK_REALM="master"
export KEYCLOAK_CLIENT_ID="opensilex-client"
export KEYCLOAK_CLIENT_SECRET=""  # For confidential clients
export KEYCLOAK_REDIRECT_URI="http://localhost:8080/callback"
```

## Usage

### Method 1: Direct Keycloak Authentication

```python
from utils import KeycloakAuthManager

# Create Keycloak auth manager
auth_manager = KeycloakAuthManager(
    keycloak_url='http://localhost:8080',
    realm='master',
    client_id='opensilex-client'
)

# Authenticate with username/password
if auth_manager.authenticate_with_password('admin', 'admin'):
    print("✓ Keycloak authentication successful")
    
    # Get user information
    token_info = auth_manager.get_token_info()
    print(f"User: {token_info['username']}")
    print(f"Email: {token_info['email']}")
```

### Method 2: Quick Keycloak Authentication

```python
from utils import quick_keycloak_auth

# Quick authentication with prompts
auth_manager = quick_keycloak_auth(
    keycloak_url='http://localhost:8080',
    realm='master',
    client_id='opensilex-client'
)

# Access token is ready for API calls
access_token = auth_manager.get_access_token()
```

### Method 3: Unified Authentication (Recommended)

```python
from utils import UnifiedAuthManager, AuthMethod

# Create unified auth manager
auth_manager = UnifiedAuthManager(
    auth_method=AuthMethod.AUTO,  # Try Keycloak first, then OpenSilex
    opensilex_host='http://98.71.237.204:8666',
    keycloak_config={
        'keycloak_url': 'http://localhost:8080',
        'realm': 'master',
        'client_id': 'opensilex-client'
    }
)

# Authenticate - will try Keycloak first, then OpenSilex
if auth_manager.authenticate('admin', 'admin'):
    active_method = auth_manager.get_active_auth_method()
    print(f"✓ Authenticated using {active_method}")
```

### Method 4: Quick Unified Authentication

```python
from utils import quick_unified_auth

# One-line authentication with auto-detection
auth_manager = quick_unified_auth(
    auth_method='auto',
    opensilex_host='http://98.71.237.204:8666',
    keycloak_config={
        'keycloak_url': 'http://localhost:8080',
        'realm': 'master',
        'client_id': 'opensilex-client'
    }
)
```

### Method 5: OAuth2 Authorization Code Flow

For web applications, use the full OAuth2 flow:

```python
from utils import KeycloakAuthManager

auth_manager = KeycloakAuthManager(
    keycloak_url='http://localhost:8080',
    realm='master',
    client_id='opensilex-client',
    redirect_uri='http://localhost:8080/callback'
)

# Generate authorization URL
auth_url, state = auth_manager.get_authorization_url()
print(f"Open this URL: {auth_url}")

# After user completes authentication, get the code from callback
# authorization_code = get_code_from_callback()
# auth_manager.authenticate_with_code(authorization_code, state)
```

## Integration with OpenSilex Client

The OpenSilex client can use any authentication method:

```python
from opensilex_client import OpenSilexClient
from utils import quick_unified_auth

# Create authenticated manager
auth_manager = quick_unified_auth(
    auth_method='keycloak',  # Force Keycloak
    keycloak_config={
        'keycloak_url': 'http://localhost:8080',
        'realm': 'master',
        'client_id': 'opensilex-client'
    }
)

# Create OpenSilex client with Keycloak auth
client = OpenSilexClient(auto_auth=False)
client.auth_manager = auth_manager

# Now use the client normally
experiments = client.list_experiments()
```

## Configuration Options

### Keycloak Configuration

| Parameter | Description | Default | Environment Variable |
|-----------|-------------|---------|---------------------|
| `keycloak_url` | Keycloak server base URL | `http://localhost:8080` | `KEYCLOAK_URL` |
| `realm` | Keycloak realm name | `master` | `KEYCLOAK_REALM` |
| `client_id` | OAuth2 client ID | `opensilex-client` | `KEYCLOAK_CLIENT_ID` |
| `client_secret` | OAuth2 client secret (optional) | `None` | `KEYCLOAK_CLIENT_SECRET` |
| `redirect_uri` | OAuth2 redirect URI | `http://localhost:8080/callback` | `KEYCLOAK_REDIRECT_URI` |

### Authentication Methods

| Method | Description | Use Case |
|--------|-------------|----------|
| `AuthMethod.KEYCLOAK` | Keycloak only | When Keycloak is primary auth |
| `AuthMethod.OPENSILEX` | OpenSilex only | Legacy applications |
| `AuthMethod.AUTO` | Try Keycloak first, fallback to OpenSilex | Recommended for flexibility |

## Token Management

### Token Storage

Tokens are automatically saved to local files:
- Keycloak tokens: `~/.opensilex_keycloak_token.json`
- OpenSilex tokens: `~/.opensilex_token.json`

### Token Refresh

Keycloak tokens support automatic refresh:

```python
# Check if token needs refresh
if not auth_manager.is_authenticated():
    if auth_manager.refresh_token():
        print("✓ Token refreshed")
    else:
        print("✗ Need to re-authenticate")
```

### Logout

```python
# Logout and revoke tokens
auth_manager.logout(revoke_tokens=True)
```

## Security Considerations

1. **Client Types**:
   - Use `public` clients for desktop/mobile applications
   - Use `confidential` clients for server applications with client secrets

2. **PKCE**: Automatically enabled for authorization code flow

3. **Token Storage**: Tokens are stored in user's home directory with restricted permissions

4. **HTTPS**: Always use HTTPS in production environments

5. **Token Expiration**: Tokens have limited lifetime and support refresh

## Troubleshooting

### Common Issues

1. **Connection Refused**
   ```
   Error: [Errno 10061] No connection could be made
   ```
   - Ensure Keycloak server is running
   - Check the `keycloak_url` configuration

2. **Invalid Client**
   ```
   HTTP 400 - Invalid client
   ```
   - Verify client ID exists in Keycloak
   - Check client configuration

3. **Unauthorized**
   ```
   HTTP 401 - Invalid credentials
   ```
   - Verify username/password
   - Check if direct access grants are enabled

4. **Token Expired**
   ```
   Token has expired
   ```
   - Try token refresh or re-authenticate
   - Check token expiration settings in Keycloak

### Debug Mode

Enable debug logging:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Examples

See the complete examples in:
- `examples/keycloak_usage.py` - Comprehensive Keycloak examples
- `examples/basic_usage.py` - Updated with unified auth

## Migration Guide

### From OpenSilex Auth to Keycloak

1. **Keep existing code working**:
   ```python
   # This continues to work
   from utils import quick_auth
   auth_manager = quick_auth()
   ```

2. **Gradually migrate to unified auth**:
   ```python
   # Add Keycloak as primary, OpenSilex as fallback
   from utils import quick_unified_auth
   auth_manager = quick_unified_auth(
       auth_method='auto',
       keycloak_config={'keycloak_url': 'http://localhost:8080', ...}
   )
   ```

3. **Eventually switch to Keycloak only**:
   ```python
   # Pure Keycloak authentication
   from utils import quick_keycloak_auth
   auth_manager = quick_keycloak_auth()
   ```

### Configuration Migration

Environment variables can be gradually introduced:

```bash
# Add Keycloak config while keeping OpenSilex
export KEYCLOAK_URL="http://localhost:8080"
export KEYCLOAK_REALM="master"
export KEYCLOAK_CLIENT_ID="opensilex-client"

# Existing OpenSilex config continues to work
export OPENSILEX_HOST="http://98.71.237.204:8666"
```

## Advanced Usage

### Custom Token Validation

```python
def validate_token(auth_manager):
    token_info = auth_manager.get_token_info()
    
    if not token_info or not token_info['is_valid']:
        print("Token invalid, refreshing...")
        if not auth_manager.refresh_token():
            print("Re-authentication required")
            return False
    
    return True
```

### Multiple Realms

```python
# Different realms for different environments
auth_configs = {
    'development': {
        'keycloak_url': 'http://localhost:8080',
        'realm': 'dev',
        'client_id': 'opensilex-dev'
    },
    'production': {
        'keycloak_url': 'https://auth.example.com',
        'realm': 'prod',
        'client_id': 'opensilex-prod'
    }
}

env = os.getenv('ENVIRONMENT', 'development')
auth_manager = quick_keycloak_auth(**auth_configs[env])
```

### Token Introspection

```python
# Get detailed token information
token_info = auth_manager.get_token_info()
print(f"Username: {token_info['username']}")
print(f"Email: {token_info['email']}")
print(f"Roles: {token_info.get('realm_access', {}).get('roles', [])}")
print(f"Expires: {token_info['expires_at']}")
```