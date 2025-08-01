# 🔐 Automated Keycloak Setup Guide

This guide shows you how to use the automated scripts to set up Keycloak integration with your PHIS project in just a few commands.

## 🚀 **One-Command Setup** (Recommended)

### For Windows (PowerShell):
```powershell
# Run the automated PowerShell script
.\tools\setup-keycloak.ps1 -Command FullSetup

# Or use interactive menu
.\tools\setup-keycloak.ps1
```

### For Linux/Mac (Bash):
```bash
# Make script executable
chmod +x tools/setup-keycloak.sh

# Run full automated setup
VM_IP=YOUR_VM_IP ./tools/setup-keycloak.sh full-setup

# Or use interactive menu
./tools/setup-keycloak.sh menu
```

### Using Python Script (Cross-platform):
```bash
# One command setup
python tools/quick-keycloak-setup.py full-setup --vm-ip YOUR_VM_IP

# With custom settings
python tools/quick-keycloak-setup.py full-setup \
    --vm-ip YOUR_VM_IP \
    --admin-user admin \
    --admin-password admin \
    --client-id opensilex-client
```

## 📋 **What These Scripts Do**

### ✅ **Automated Installation**
1. **Install Keycloak** via Docker on your Azure VM
2. **Configure Docker** with proper settings and restart policies
3. **Wait for startup** and verify accessibility
4. **Open required ports** (8080 for Keycloak)

### ✅ **Automated Configuration**
1. **Create OAuth2 client** (`opensilex-client`)
2. **Enable direct access grants** for password authentication
3. **Configure PKCE** for enhanced security
4. **Set up redirect URIs** for web flows
5. **Create test user** (`opensilex-user`)

### ✅ **Automated Testing**
1. **Test direct Keycloak auth** with admin credentials
2. **Test unified authentication** (auto-fallback)
3. **Verify Python client integration**
4. **Check all endpoints** are accessible

## 🎯 **Step-by-Step Breakdown**

### Step 1: Choose Your Method

**Option A: PowerShell (Windows)**
```powershell
# Interactive menu with all options
.\tools\setup-keycloak.ps1
```

**Option B: Bash (Linux/Mac)**
```bash
# Interactive menu
./tools/setup-keycloak.sh menu
```

**Option C: Python (Cross-platform)**
```bash
# Full automation
python tools/quick-keycloak-setup.py full-setup
```

### Step 2: The Scripts Will Automatically:

1. **🔍 Detect your VM IP** (or ask for it)
2. **🔑 Find your SSH keys** automatically
3. **🐳 Install Keycloak via Docker**
4. **⚙️ Configure the OAuth2 client**
5. **🧪 Test the integration**
6. **📊 Show status and access URLs**

### Step 3: Ready to Use!

After successful setup, you'll see:
```
🎉 Keycloak setup completed!
📍 Access: http://YOUR_VM_IP:8080/admin/
🔑 Admin: admin / admin
🧪 Test user: opensilex-user / opensilex123
```

## 🛠️ **Individual Commands**

If you want to run steps individually:

### PowerShell:
```powershell
# Install only
.\tools\setup-keycloak.ps1 -Command InstallKeycloak

# Configure only
.\tools\setup-keycloak.ps1 -Command ConfigureKeycloak

# Test only
.\tools\setup-keycloak.ps1 -Command TestKeycloak

# Check status
.\tools\setup-keycloak.ps1 -Command Status
```

### Bash:
```bash
# Install only
./tools/setup-keycloak.sh install

# Configure only
./tools/setup-keycloak.sh configure

# Test only
./tools/setup-keycloak.sh test

# Check status
./tools/setup-keycloak.sh status
```

### Python:
```bash
# Install only
python tools/quick-keycloak-setup.py install

# Configure only
python tools/quick-keycloak-setup.py configure

# Test only
python tools/quick-keycloak-setup.py test

# Check status
python tools/quick-keycloak-setup.py status
```

## 🌍 **Environment Variables**

Set these for easier automation:

```bash
# Windows (PowerShell)
$env:VM_IP="1.2.3.4"
$env:KEYCLOAK_ADMIN_USER="admin"
$env:KEYCLOAK_ADMIN_PASSWORD="admin"
$env:OPENSILEX_CLIENT_ID="opensilex-client"

# Linux/Mac (Bash)
export VM_IP="1.2.3.4"
export KEYCLOAK_ADMIN_USER="admin"
export KEYCLOAK_ADMIN_PASSWORD="admin"
export OPENSILEX_CLIENT_ID="opensilex-client"
```

Then just run:
```bash
# No need to specify parameters
python tools/quick-keycloak-setup.py full-setup
```

## 🧪 **Testing Your Setup**

### Quick Test (Python):
```python
#!/usr/bin/env python3
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from utils import quick_unified_auth

# Replace with your VM IP
VM_IP = "YOUR_VM_IP"

# One-line authentication test
auth = quick_unified_auth(
    auth_method='auto',
    opensilex_host=f'http://{VM_IP}:8666',
    keycloak_config={
        'keycloak_url': f'http://{VM_IP}:8080',
        'realm': 'master',
        'client_id': 'opensilex-client'
    }
)

print(f"🎉 Success! Using {auth.get_active_auth_method()} authentication")
```

### Run Examples:
```bash
# Run comprehensive examples
python examples/keycloak_usage.py
```

## 🔧 **Management Commands**

### Start/Stop Keycloak:
```bash
# PowerShell
.\tools\setup-keycloak.ps1 -Command StartKeycloak
.\tools\setup-keycloak.ps1 -Command StopKeycloak

# Bash
./tools/setup-keycloak.sh start
./tools/setup-keycloak.sh stop

# Python (via SSH)
python tools/quick-keycloak-setup.py status
```

### Remove Keycloak:
```bash
# PowerShell
.\tools\setup-keycloak.ps1 -Command RemoveKeycloak

# Bash
./tools/setup-keycloak.sh remove
```

## 🚨 **Troubleshooting**

### If Setup Fails:

1. **Check VM is running**:
   ```bash
   # Test SSH connection
   ssh azureuser@YOUR_VM_IP
   ```

2. **Check Docker is running**:
   ```bash
   ssh azureuser@YOUR_VM_IP "docker info"
   ```

3. **Check port 8080 is open**:
   ```bash
   # Test from your local machine
   curl -I http://YOUR_VM_IP:8080
   ```

4. **View container logs**:
   ```bash
   ssh azureuser@YOUR_VM_IP "docker logs keycloak"
   ```

### Common Issues:

1. **"Permission denied" SSH error**:
   - Check SSH key path: `ls -la ~/.ssh/`
   - Verify key permissions: `chmod 600 ~/.ssh/id_rsa`

2. **"Connection refused" to port 8080**:
   - Check Azure Network Security Group allows port 8080
   - Verify Keycloak container is running: `docker ps`

3. **"Import error" in Python tests**:
   - Make sure you're in the PHIS project root directory
   - Check Python path: `python -c "import sys; print(sys.path)"`

## 🎊 **Success Indicators**

You'll know setup worked when you see:

✅ **Container Running**: `docker ps` shows keycloak container  
✅ **Web Accessible**: Browser opens `http://YOUR_VM_IP:8080`  
✅ **Admin Login**: Can login to admin console  
✅ **Python Tests**: Integration tests pass  
✅ **Client Created**: `opensilex-client` exists in Keycloak  

## 📚 **Next Steps**

After successful setup:

1. **Use in your scripts**:
   ```python
   from utils import quick_unified_auth
   auth = quick_unified_auth(auth_method='auto')
   ```

2. **Explore examples**:
   ```bash
   python examples/keycloak_usage.py
   ```

3. **Set up production config** with proper passwords and client secrets

4. **Create additional users** in Keycloak admin console

5. **Configure roles and permissions** for your team

## 🆘 **Getting Help**

- **View script options**: `python tools/quick-keycloak-setup.py --help`
- **Use interactive menus**: All scripts have menu modes
- **Check logs**: Scripts show detailed progress and error messages
- **Manual verification**: All setup steps can be verified manually

The automated scripts handle all the complexity - you just need to run one command! 🚀