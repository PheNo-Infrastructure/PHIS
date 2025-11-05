# PheNo Branding Deployment Guide

This guide explains how to deploy PheNo branding (colors, logos, and typography) to OpenSILEX installations.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Automated Deployment](#automated-deployment)
4. [Manual Deployment](#manual-deployment)
5. [Troubleshooting](#troubleshooting)
6. [Rollback](#rollback)

---

## Quick Start

**Deploy to test server:**
```powershell
.\tools\deploy-pheno-branding.ps1 -ServerHost 20.234.181.44
```

**Deploy to production:**
```powershell
.\tools\deploy-pheno-branding.ps1 -ServerHost 172.211.86.191
```

---

## Prerequisites

### Local Machine (Windows)

1. **Node.js** (v16 or later)
   - Download from: https://nodejs.org/
   - Verify: `node --version`

2. **Sass compiler**
   ```powershell
   npm install -g sass
   ```

3. **SSH access** to the OpenSILEX server
   - SSH key configured (no password prompt)
   - Test: `ssh azureuser@SERVER_IP "echo connected"`

4. **Git repository** cloned with theme files
   ```
   PHIS/
   ├── theme/pheno/
   │   ├── _settings.scss       # PheNo colors
   │   ├── theme.scss           # Main SCSS
   │   ├── images/              # PheNo logos
   │   └── prepare-logos.js     # Logo resizing script
   └── tools/
       └── deploy-pheno-branding.ps1  # Deployment script
   ```

### Remote Server (Linux)

- OpenSILEX 1.4.9-rdg installed at `/home/azureuser/opensilex`
- Java `jar` command available
- `sudo` access for restarting OpenSILEX service
- SSH access for `azureuser`

---

## Automated Deployment

The automated script performs all steps in one command.

### Basic Usage

```powershell
# From PHIS repository root
.\tools\deploy-pheno-branding.ps1 -ServerHost <IP_ADDRESS>
```

### Advanced Options

```powershell
# Deploy without restarting (restart manually later)
.\tools\deploy-pheno-branding.ps1 -ServerHost 172.211.86.191 -SkipRestart

# Deploy without backup (not recommended for production)
.\tools\deploy-pheno-branding.ps1 -ServerHost 172.211.86.191 -SkipBackup

# Custom OpenSILEX path
.\tools\deploy-pheno-branding.ps1 -ServerHost 172.211.86.191 -OpenSilexPath /opt/opensilex

# Custom SSH user
.\tools\deploy-pheno-branding.ps1 -ServerHost 172.211.86.191 -ServerUser admin
```

### What the Script Does

1. ✓ Validates prerequisites (Node.js, Sass, SSH)
2. ✓ Prepares logos (resizes to 42x42, 216x216, 224x224)
3. ✓ Compiles SCSS to CSS
4. ✓ Creates backup of `opensilex-front.jar`
5. ✓ Uploads files to server
6. ✓ Injects files into JAR
7. ✓ Restarts OpenSILEX
8. ✓ Verifies deployment

**Total time:** ~2 minutes

---

## Manual Deployment

If you need to deploy manually or understand the process in detail:

### Step 1: Prepare Logos

```powershell
cd theme\pheno
node prepare-logos.js
```

This creates:
- `pheno-icon-42.png` (42x42) - Navbar miniature logo
- `pheno-icon-216.png` (216x216) - Main logo
- `pheno-icon-224.png` (224x224) - Loading screen logo

### Step 2: Compile SCSS

```powershell
cd theme\pheno
sass theme.scss compiled-theme.css --no-source-map
copy compiled-theme.css main.css
```

### Step 3: Upload Files

```powershell
# Create staging directory on server
ssh azureuser@SERVER_IP "mkdir -p /tmp/pheno-deploy/front/theme/opensilex/images"

# Upload theme files
scp theme\pheno\_settings.scss azureuser@SERVER_IP:/tmp/pheno-deploy/front/theme/opensilex/
scp theme\pheno\main.css azureuser@SERVER_IP:/tmp/pheno-deploy/front/theme/opensilex/

# Upload logos
scp theme\pheno\images\pheno-icon-224.png azureuser@SERVER_IP:/tmp/pheno-deploy/front/opensilex.png
scp theme\pheno\images\pheno-icon-216.png azureuser@SERVER_IP:/tmp/pheno-deploy/front/theme/opensilex/images/logo-opensilex.png
scp theme\pheno\images\pheno-icon-42.png azureuser@SERVER_IP:/tmp/pheno-deploy/front/theme/opensilex/images/logo-opensilex_miniature.png
scp theme\pheno\images\pheno-icon-224.png azureuser@SERVER_IP:/tmp/pheno-deploy/front/theme/opensilex/images/dashboardLogo.png
scp theme\pheno\images\PheNo_logo_long_Green.svg azureuser@SERVER_IP:/tmp/pheno-deploy/front/theme/opensilex/images/logo-phis.svg
```

### Step 4: Backup JAR

```bash
ssh azureuser@SERVER_IP
cd /home/azureuser/opensilex/bin/1.4.9-rdg/modules
cp opensilex-front.jar opensilex-front.jar.backup-$(date +%Y%m%d-%H%M%S)
```

### Step 5: Inject Files

```bash
cd /tmp/pheno-deploy
jar -uf /home/azureuser/opensilex/bin/1.4.9-rdg/modules/opensilex-front.jar \
    front/opensilex.png \
    front/theme/opensilex/_settings.scss \
    front/theme/opensilex/main.css \
    front/theme/opensilex/images/logo-opensilex.png \
    front/theme/opensilex/images/logo-opensilex_miniature.png \
    front/theme/opensilex/images/dashboardLogo.png \
    front/theme/opensilex/images/logo-phis.svg
```

### Step 6: Restart OpenSILEX

```bash
sudo systemctl restart opensilex

# Wait ~45 seconds, then verify
sudo systemctl status opensilex
```

### Step 7: Verify

1. Open browser to http://SERVER_IP
2. Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
3. Check for:
   - ✓ Forest green navbar (#264030)
   - ✓ Leaf green buttons (#3D8526)
   - ✓ PheNo logo on loading screen
   - ✓ PheNo logo in navbar
   - ✓ PheNo logo on dashboard

---

## Troubleshooting

### Logo Size Issues

**Problem:** Logo appears too large or too small

**Solution:** Verify logo dimensions match OpenSILEX expectations:
```bash
ssh azureuser@SERVER_IP
cd /tmp
jar -xf /home/azureuser/opensilex/bin/1.4.9-rdg/modules/opensilex-front.jar \
    front/opensilex.png \
    front/theme/opensilex/images/logo-opensilex.png \
    front/theme/opensilex/images/logo-opensilex_miniature.png

file front/opensilex.png  # Should be 224x224
file front/theme/opensilex/images/logo-opensilex.png  # Should be 216x216
file front/theme/opensilex/images/logo-opensilex_miniature.png  # Should be 42x42
```

### Logos Not Appearing

**Problem:** Some logos don't show up after deployment

**Causes:**
1. Browser cache not cleared
2. Files not injected into JAR
3. OpenSILEX not restarted

**Solution:**
```powershell
# 1. Clear browser cache (Ctrl+Shift+R)

# 2. Verify files in JAR
ssh azureuser@SERVER_IP "jar -tf /home/azureuser/opensilex/bin/1.4.9-rdg/modules/opensilex-front.jar | grep 'logo-opensilex'"

# 3. Check OpenSILEX service
ssh azureuser@SERVER_IP "sudo systemctl status opensilex"
ssh azureuser@SERVER_IP "sudo journalctl -u opensilex -n 50"
```

### Colors Not Applying

**Problem:** PheNo colors (greens) not visible, still seeing default theme

**Causes:**
1. CSS not compiled correctly
2. `main.css` not injected into JAR
3. Browser using cached CSS

**Solution:**
```powershell
# 1. Verify compiled CSS contains PheNo colors
Select-String -Path theme\pheno\main.css -Pattern "#264030|#3D8526"

# 2. Verify CSS in JAR on server
ssh azureuser@SERVER_IP @"
cd /tmp
jar -xf /home/azureuser/opensilex/bin/1.4.9-rdg/modules/opensilex-front.jar front/theme/opensilex/main.css
grep -E '#264030|#3D8526' front/theme/opensilex/main.css | head -3
"@

# 3. Force browser cache clear:
# Chrome: Ctrl+Shift+Delete → Clear browsing data → Cached images and files
# Firefox: Ctrl+Shift+Delete → Cached Web Content
```

### SSH Connection Issues

**Problem:** `deploy-pheno-branding.ps1` fails with SSH errors

**Solution:**
```powershell
# Test SSH connection
ssh azureuser@SERVER_IP "echo connected"

# If prompted for password, add SSH key:
ssh-add ~\.ssh\id_rsa

# Or use ssh-agent
ssh-agent pwsh
ssh-add ~\.ssh\id_rsa
.\tools\deploy-pheno-branding.ps1 -ServerHost SERVER_IP
```

### JAR Corruption

**Problem:** OpenSILEX fails to start after deployment

**Solution:** Restore from backup (see [Rollback](#rollback))

---

## Rollback

### Using Backup

If something goes wrong, restore the backup:

```bash
ssh azureuser@SERVER_IP
cd /home/azureuser/opensilex/bin/1.4.9-rdg/modules

# List available backups
ls -lh opensilex-front.jar.backup*

# Restore specific backup
cp opensilex-front.jar.backup-20251104-143000 opensilex-front.jar

# Restart
sudo systemctl restart opensilex
```

### Re-deploy Default Theme

If you want to remove PheNo branding completely:

```bash
ssh azureuser@SERVER_IP
cd /home/azureuser/opensilex/bin/1.4.9-rdg/modules

# Use the original backup (without timestamp)
cp opensilex-front.jar.backup opensilex-front.jar

sudo systemctl restart opensilex
```

---

## PheNo Color Palette

Reference for the colors used in the theme:

| Color Name | Hex Code | Usage |
|------------|----------|-------|
| Forest Green | `#264030` | Navbar, headers, dark elements |
| Leaf Green Dark | `#3D8526` | Primary buttons, links |
| Leaf Green Light | `#87CF82` | Success states, highlights |
| Straw Dark | `#E3EBA1` | Info states, secondary elements |
| Straw Light | `#F2F5DE` | Light backgrounds |

---

## File Locations

### In Repository (Windows)

```
PHIS/
├── theme/pheno/
│   ├── _settings.scss                    # PheNo color variables
│   ├── theme.scss                        # Main SCSS (imports all components)
│   ├── main.css                          # Compiled CSS (generated)
│   ├── compiled-theme.css                # Intermediate compiled CSS
│   ├── prepare-logos.js                  # Logo resizing script
│   ├── images/
│   │   ├── pheno-icon.png                # Original 2250x2250 logo
│   │   ├── pheno-icon-42.png             # Generated miniature
│   │   ├── pheno-icon-216.png            # Generated main logo
│   │   ├── pheno-icon-224.png            # Generated loading screen
│   │   └── PheNo_logo_long_Green.svg     # Full PheNo logo
│   └── [component SCSS files]
└── tools/
    └── deploy-pheno-branding.ps1         # Deployment script
```

### On Server (Linux)

```
/home/azureuser/opensilex/
├── bin/1.4.9-rdg/modules/
│   ├── opensilex-front.jar               # Modified with PheNo branding
│   └── opensilex-front.jar.backup-*      # Timestamped backups
└── config/
    └── opensilex.yml                     # No changes needed for this approach
```

### Inside JAR (modified files)

```
opensilex-front.jar:
├── front/
│   ├── opensilex.png                     # Loading screen logo (224x224)
│   └── theme/opensilex/
│       ├── _settings.scss                # PheNo colors
│       ├── main.css                      # Compiled PheNo CSS
│       └── images/
│           ├── logo-opensilex.png        # Main logo (216x216)
│           ├── logo-opensilex_miniature.png  # Navbar logo (42x42)
│           ├── dashboardLogo.png         # Dashboard logo (224x224)
│           └── logo-phis.svg             # Full PheNo logo (SVG)
```

---

## Support

If you encounter issues not covered in this guide:

1. Check OpenSILEX logs: `ssh SERVER_IP "sudo journalctl -u opensilex -n 100"`
2. Verify JAR contents: `ssh SERVER_IP "jar -tf /path/to/opensilex-front.jar | grep pheno"`
3. Review deployment script output for error messages
4. Restore from backup and try manual deployment steps

---

## Version History

- **2025-01-04**: Initial deployment script and documentation
  - Automated logo resizing
  - One-command deployment
  - Comprehensive troubleshooting guide
