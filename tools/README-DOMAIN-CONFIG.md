# OpenSILEX Domain Configuration Guide

## Overview

The OpenSILEX installer automatically configures the domain/URL for your installation based on the environment.

## Automatic Domain Detection

The installer uses the following priority order:

1. **`OPENSILEX_DOMAIN` environment variable** (highest priority)
2. **VM Public IP address** (for test environments)
3. **`phis.pheno.no`** (production default)

## Default Behavior

### Test VMs
- The installer **automatically detects the VM's public IP address**
- Uses the IP address as the domain name
- FEIDE redirect URI will be: `http://<vm-ip>/app/openid`
- No manual configuration needed!

### Production VM (phis.pheno.no)
- If the detected IP is the production server's IP, it uses `phis.pheno.no`
- FEIDE redirect URI will be: `http://phis.pheno.no/app/openid`

## Custom Domain Configuration

If you want to override the automatic detection and use a specific domain:

### Method 1: Environment Variable (Recommended)

**Before running the installer**, set the `OPENSILEX_DOMAIN` environment variable:

```bash
# In your PowerShell script or terminal
export OPENSILEX_DOMAIN="custom.domain.com"
```

Or add it to your `test-api-keys.conf`:
```bash
OPENSILEX_DOMAIN="custom.domain.com"
FEIDE_CLIENT_ID="your-client-id"
FEIDE_CLIENT_SECRET="your-client-secret"
```

### Method 2: Modify After Installation

If you need to change the domain after installation:

1. SSH into the VM
2. Edit `/home/azureuser/opensilex/config/opensilex.yml`
3. Update these values:
   ```yaml
   server:
     publicURI: "http://YOUR-NEW-DOMAIN"

   security:
     openID:
       redirectURI: "http://YOUR-NEW-DOMAIN/app/openid"

   phisws:
     cors:
       allowedOrigins:
         - "http://YOUR-NEW-DOMAIN"
         - "https://YOUR-NEW-DOMAIN"
   ```
4. Restart OpenSILEX: `sudo systemctl restart opensilex`

## FEIDE Configuration

When configuring FEIDE/Dataporten for your environment:

### Test Environment
1. Go to https://dashboard.dataporten.no/
2. Create/edit your test application
3. Set redirect URI to: `http://<your-test-vm-ip>/app/openid`
4. Copy the Client ID and Client Secret
5. Add them to `tools/config/test-api-keys.conf`:
   ```bash
   FEIDE_CLIENT_ID="your-test-client-id"
   FEIDE_CLIENT_SECRET="your-test-client-secret"
   ```

### Production Environment
1. Use a separate FEIDE application configuration
2. Set redirect URI to: `http://phis.pheno.no/app/openid`
3. Add credentials to `tools/config/api-keys.conf` (production config file)

## Troubleshooting

### Issue: FEIDE redirects to wrong URL

**Symptom**: When logging in with FEIDE on test VM, it redirects to `phis.pheno.no`

**Solution**:
1. Check what domain the installer used:
   ```bash
   ssh azureuser@<vm-ip>
   grep "redirectURI" /home/azureuser/opensilex/config/opensilex.yml
   ```

2. Verify your FEIDE configuration matches:
   - Go to https://dashboard.dataporten.no/
   - Check the redirect URI in your application settings
   - It should match the `redirectURI` from step 1

3. If they don't match, either:
   - Update FEIDE dashboard to match OpenSILEX config, OR
   - Update OpenSILEX config to match FEIDE (see "Method 2" above)

### Issue: Need to switch from IP to domain name

If you initially installed using IP address but now have a domain:

1. Set up DNS to point the domain to your VM IP
2. Update OpenSILEX configuration (see "Method 2" above)
3. Update FEIDE redirect URI in dashboard
4. Restart OpenSILEX

## Examples

### Test VM Installation (automatic IP detection)
```powershell
# No special configuration needed!
# The installer automatically uses the VM's public IP
.\opensilex-github.ps1 -Command Install -VMName "test-vm"
```

### Test VM with Custom Domain
```powershell
# Add to test-api-keys.conf first:
# OPENSILEX_DOMAIN="test.pheno.no"

.\opensilex-github.ps1 -Command Install -VMName "test-vm"
```

### Production Installation
```powershell
# Automatically uses phis.pheno.no
.\opensilex-github.ps1 -Command Install -VMName "prod-vm"
```
