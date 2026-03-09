# OpenSILEX Multi-Environment Deployment Guide

Complete guide for deploying OpenSILEX across different environments (sandbox, test, production) with automated configuration management.

---

## 🚀 Quick Start

### One-Command Full Deployment

```powershell
# Deploy complete test environment (VM + Docker + OpenSILEX + Feide + Patches + Theme)
.\deploy-environment.ps1 -Environment test

# Deploy production environment
.\deploy-environment.ps1 -Environment production

# Deploy sandbox for development
.\deploy-environment.ps1 -Environment sandbox
```

### Partial Deployment (Existing VM)

```powershell
# Redeploy OpenSILEX on existing VM (skip VM creation and Docker)
.\deploy-environment.ps1 -Environment test -SkipVM -SkipDocker

# Just update patches and theme
.\deploy-environment.ps1 -Environment test -SkipVM -SkipDocker -SkipOpenSILEX -SkipFeide
```

---

## 📁 Configuration Files

### VM Configuration
Located in `tools/config/`:
- **vm-config-test.json** - Test environment (uses existing IP 172.211.86.191)
- **vm-config-production.json** - Production environment
- **vm-config-sandbox.json** - Sandbox environment

### API Keys Configuration
Located in `tools/config/`:
- **api-keys-test.conf** - Test Feide/AWS credentials
- **api-keys-production.conf** - Production credentials (TEMPLATE - configure before use)
- **api-keys-sandbox.conf** - Sandbox/development (optional)

---

## 🎯 Environment Comparison

| Feature | Sandbox | Test | Production |
|---------|---------|------|------------|
| **Purpose** | Development/testing | Staging/pre-production | Live production |
| **VM Name** | phis-sandbox | phis-debian12-TEST | phis-production |
| **Resource Group** | RG-OPENSILEX-SANDBOX | RG-OPENSILEX-debian12-TEST | RG-OPENSILEX-PRODUCTION |
| **Public IP** | New dynamic IP | 172.211.86.191 (existing, DNS configured) | New static IP (configure DNS after) |
| **VM Size** | Standard_B4ms (4 vCPU, 16GB) | Standard_B4ms (4 vCPU, 16GB) | Standard_D4s_v3 (4 vCPU, 16GB, premium SSD) |
| **CI/CD Tests** | No | Yes (automated daily) | Yes (manual or scheduled) |
| **Feide Auth** | Optional | Yes (test credentials) | Yes (production credentials) |
| **AWS S3** | No | Yes (test bucket) | Yes (production bucket) |

---

## 📋 Deployment Steps Explained

The unified deployment script ([deploy-environment.ps1](deploy-environment.ps1)) performs these steps:

### 1. Create/Verify Azure VM
- Creates VM if it doesn't exist
- Reuses existing public IP if configured (test environment)
- Configures network security groups (SSH, HTTP, HTTPS, etc.)
- **Skip with:** `-SkipVM`

### 2. Install Docker
- Installs Docker Engine + Docker Compose
- Configures user permissions
- Verifies installation
- **Skip with:** `-SkipDocker`

### 3. Deploy OpenSILEX
- Clones official opensilex-docker-compose repository
- Configures environment (version, prefix, public URL)
- Builds and starts Docker stack (OpenSILEX + RDF4J + MongoDB + HAProxy)
- Creates admin user
- **Skip with:** `-SkipOpenSILEX`

### 4. Configure Feide/OpenID
- Adds Feide credentials from `api-keys-{environment}.conf`
- Configures OpenID Connect integration
- Enables Feide login
- **Skip with:** `-SkipFeide`

### 5. Apply Security Patches
- **Patch 001:** GroupDAO null pointer fix
- **Patch 002:** Auto-assign new Feide users to "Users" group
- Rebuilds OpenSILEX from source with patches
- **Skip with:** `-SkipPatches`

### 6. Apply PheNo Theme
- Updates branding colors (forest green #264030, leaf green #3D8526)
- Replaces logos with PheNo SVG logos
- Removes conflicting PNG logos from JAR
- **Skip with:** `-SkipTheme`

---

## 🔧 Manual Deployment (Step-by-Step)

If you prefer manual control over each step:

### Step 1: Create Azure VM

```powershell
# Create VM using environment config
.\create-azure-vm.ps1 -Environment test

# Or with manual parameters
.\create-azure-vm.ps1 `
    -VMName "phis-test" `
    -ResourceGroupName "my-rg" `
    -Location "westeurope" `
    -UseExistingPublicIP `
    -ExistingPublicIPName "my-ip"
```

### Step 2: Install Docker

```powershell
cd tools/docker-deployment
.\00-install-docker.ps1 -TargetIP 172.211.86.191
```

### Step 3: Deploy OpenSILEX

```powershell
.\01-deploy-opensilex.ps1 `
    -TargetIP 172.211.86.191 `
    -ApiKeysFile ..\config\api-keys-test.conf
```

### Step 4: Configure Feide

```powershell
.\02-configure-feide.ps1 `
    -TargetIP 172.211.86.191 `
    -ApiKeysFile ..\config\api-keys-test.conf
```

### Step 5: Apply Patches

```powershell
.\03-apply-patches.ps1 -TargetIP 172.211.86.191
```

### Step 6: Apply Theme

```powershell
.\04-apply-theme.ps1 -TargetIP 172.211.86.191
```

---

## 🔐 Configuring Production API Keys

Before deploying to production, configure credentials in `tools/config/api-keys-production.conf`:

```bash
# 1. Edit the file
code tools/config/api-keys-production.conf

# 2. Add your production credentials:
FEIDE_CLIENT_ID="your-production-feide-client-id"
FEIDE_CLIENT_SECRET="your-production-feide-client-secret"
AWS_ACCESS_KEY_ID="your-production-aws-key"
AWS_SECRET_ACCESS_KEY="your-production-aws-secret"
AWS_S3_BUCKET="opensilex-production-files"
```

**Security Note:** These files are in `.gitignore` - they will NOT be committed to version control.

---

## 🌐 Production Deployment Checklist

Before deploying to production:

- [ ] **1. Configure production API keys**
  ```powershell
  code tools\config\api-keys-production.conf
  # Add production Feide credentials
  # Add production AWS S3 credentials
  ```

- [ ] **2. Review production VM config**
  ```powershell
  code tools\config\vm-config-production.json
  # Verify VM size, location, network settings
  ```

- [ ] **3. Deploy production environment**
  ```powershell
  .\deploy-environment.ps1 -Environment production
  # Note the IP address from output
  ```

- [ ] **4. Configure DNS**
  - Point your domain to the production IP
  - Wait for DNS propagation (check with `nslookup your-domain.com`)

- [ ] **5. Update GitHub secrets for CI/CD**
  ```
  OPENSILEX_API_URL = http://[production-ip]/sandbox/rest
  OPENSILEX_SERVER = [production-ip]
  OPENSILEX_ADMIN_PASSWORD = [new-secure-password]
  SSH_PRIVATE_KEY = [production-ssh-key]
  ```

- [ ] **6. Change default admin password**
  - Log in to http://[production-ip]/sandbox/app/
  - Admin → Users → admin@opensilex.org → Change Password

- [ ] **7. Test Feide authentication**
  - Log out
  - Click "Login with Feide"
  - Verify authentication works
  - Check that new users are auto-assigned to "Users" group

- [ ] **8. Verify CI/CD tests pass**
  - Push a commit to production branch
  - Check GitHub Actions workflow runs successfully
  - Review test results

---

## 🔄 Common Scenarios

### Scenario 1: Rebuild Test Server (Preserve IP)

```powershell
# Delete old VM (keeps public IP intact)
Remove-AzVM -ResourceGroupName "RG-OPENSILEX-debian12-TEST" -Name "phis-debian12-TEST" -Force

# Redeploy everything
.\deploy-environment.ps1 -Environment test
# Automatically reattaches to 172.211.86.191
```

### Scenario 2: Update Only Patches/Theme

```powershell
# Skip VM, Docker, OpenSILEX, and Feide - just apply patches and theme
.\deploy-environment.ps1 -Environment test -SkipVM -SkipDocker -SkipOpenSILEX -SkipFeide
```

### Scenario 3: Fresh OpenSILEX Deployment (Keep VM)

```powershell
# Skip VM and Docker, redeploy OpenSILEX from scratch
.\deploy-environment.ps1 -Environment test -SkipVM -SkipDocker
```

### Scenario 4: Create Temporary Sandbox

```powershell
# Deploy sandbox for testing
.\deploy-environment.ps1 -Environment sandbox

# When done, delete entire resource group
Remove-AzResourceGroup -Name "RG-OPENSILEX-SANDBOX" -Force
```

---

## 🧪 Testing Deployment

After deployment, verify everything works:

### 1. Web Interface
```powershell
# Open in browser
start http://172.211.86.191/sandbox/app/

# Login with default admin
# Email: admin@opensilex.org
# Password: admin
```

### 2. API Endpoint
```powershell
# Test API responds
curl http://172.211.86.191/sandbox/rest/security/authentication | ConvertFrom-Json
```

### 3. Feide Authentication
```powershell
# Check Feide config applied
ssh azureuser@172.211.86.191
cd ~/opensilex-docker-compose
grep FEIDE opensilex.env
# Should show FEIDE_CLIENT_ID and FEIDE_CLIENT_SECRET
```

### 4. Theme Applied
```powershell
# Check branding colors
curl http://172.211.86.191/sandbox/rest/core/branding/theme | ConvertFrom-Json | Select primaryColor
# Should show #264030 (forest green)
```

---

## 🐛 Troubleshooting

### VM Creation Fails

```powershell
# Check Azure login
Get-AzContext

# If not logged in:
Connect-AzAccount

# Check resource group exists
Get-AzResourceGroup -Name "RG-OPENSILEX-debian12-TEST"
```

### OpenSILEX Container Won't Start

```powershell
# SSH to server
ssh azureuser@172.211.86.191

# Check container logs
cd ~/opensilex-docker-compose
sudo docker compose logs opensilex --tail=100

# Check all services
sudo docker compose ps
```

### Feide Authentication Not Working

```powershell
# Verify credentials are set
ssh azureuser@172.211.86.191
cd ~/opensilex-docker-compose
grep FEIDE opensilex.env

# Check OpenSILEX config
cat config/opensilex-custom-config.yml | grep -A 10 "Feide"
```

### Theme Not Applied

```powershell
# Re-apply theme
.\deploy-environment.ps1 -Environment test -SkipVM -SkipDocker -SkipOpenSILEX -SkipFeide -SkipPatches
```

---

## 📚 Additional Documentation

- **VM Configuration Guide**: [tools/config/README.md](tools/config/README.md)
- **Testing Infrastructure**: [tools/testing/README.md](tools/testing/README.md)
- **GitHub Actions CI/CD**: [.github/workflows/opensilex-testing.yml](.github/workflows/opensilex-testing.yml)
- **Deployment Scripts**: [tools/docker-deployment/](tools/docker-deployment/)

---

## 🤝 Support

For issues or questions:
- GitHub Issues: https://github.com/anthropics/phis/issues
- OpenSILEX Docs: https://opensilex.github.io/
- Feide/Dataporten: https://docs.feide.no/

---

**Last Updated:** March 2026
