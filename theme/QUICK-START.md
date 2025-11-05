# PheNo Branding - Quick Start

## TL;DR

Deploy PheNo branding to OpenSILEX in one command:

```powershell
# Test server
.\tools\deploy-pheno-branding.ps1 -ServerHost 20.234.181.44

# Production server
.\tools\deploy-pheno-branding.ps1 -ServerHost 172.211.86.191
```

That's it! The script will:
- Prepare logos (resize to correct sizes)
- Compile SCSS to CSS
- Backup existing JAR
- Deploy to server
- Restart OpenSILEX

**Time:** ~2 minutes

---

## First Time Setup

Only needed once on your machine:

```powershell
# 1. Install Node.js
# Download from: https://nodejs.org/

# 2. Install Sass compiler
npm install -g sass

# 3. Install image processing dependencies
cd theme\pheno\images
npm install

# 4. Test logo preparation
cd ..
node prepare-logos.js
```

---

## Deployment Options

```powershell
# Basic deployment (with backup and restart)
.\tools\deploy-pheno-branding.ps1 -ServerHost 20.234.181.44

# Deploy without automatic restart (restart manually later)
.\tools\deploy-pheno-branding.ps1 -ServerHost 172.211.86.191 -SkipRestart

# Deploy without backup (not recommended for production!)
.\tools\deploy-pheno-branding.ps1 -ServerHost 172.211.86.191 -SkipBackup

# Custom OpenSILEX path
.\tools\deploy-pheno-branding.ps1 -ServerHost 172.211.86.191 -OpenSilexPath /opt/opensilex

# Get help
Get-Help .\tools\deploy-pheno-branding.ps1 -Detailed
```

---

## What Gets Changed

The script modifies the `opensilex-front.jar` file to replace:

| OpenSILEX File | Replaced With | Purpose |
|----------------|---------------|---------|
| `front/theme/opensilex/_settings.scss` | PheNo color variables | Forest green, leaf green colors |
| `front/theme/opensilex/main.css` | Compiled PheNo CSS | Apply colors to all components |
| `front/opensilex.png` | PheNo icon (224x224) | Loading screen logo |
| `front/theme/opensilex/images/logo-opensilex.png` | PheNo icon (216x216) | Main logo |
| `front/theme/opensilex/images/logo-opensilex_miniature.png` | PheNo icon (42x42) | Navbar logo |
| `front/theme/opensilex/images/dashboardLogo.png` | PheNo icon (224x224) | Dashboard logo |
| `front/theme/opensilex/images/logo-phis.svg` | PheNo full logo (SVG) | High-res logo |

**Note:** No configuration files are changed. The default "opensilex" theme is modified in place.

---

## Verify Deployment

After deployment completes:

1. **Open browser** to http://SERVER_IP
2. **Hard refresh:** `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
3. **Check for:**
   - ✓ Forest green navbar (#264030)
   - ✓ Leaf green buttons (#3D8526)
   - ✓ PheNo logo on loading screen
   - ✓ PheNo logo in navbar (top-left)
   - ✓ PheNo logo on dashboard

---

## Rollback

If something goes wrong:

```bash
# SSH to server
ssh azureuser@SERVER_IP

# Go to modules directory
cd /home/azureuser/opensilex/bin/1.4.9-rdg/modules

# List available backups
ls -lh opensilex-front.jar.backup*

# Restore backup (use latest timestamp)
cp opensilex-front.jar.backup-20251104-143000 opensilex-front.jar

# Restart
sudo systemctl restart opensilex
```

---

## Troubleshooting

### Logos too large/small
Hard refresh browser: `Ctrl+Shift+R`

### Colors not showing
```powershell
# Verify CSS compilation
Select-String -Path theme\pheno\main.css -Pattern "#264030"

# Re-run deployment
.\tools\deploy-pheno-branding.ps1 -ServerHost SERVER_IP
```

### SSH connection fails
```powershell
# Test SSH
ssh azureuser@SERVER_IP "echo connected"

# Add SSH key if prompted for password
ssh-add ~\.ssh\id_rsa
```

### OpenSILEX won't start
```bash
# Check logs
ssh azureuser@SERVER_IP "sudo journalctl -u opensilex -n 50"

# Restore backup
ssh azureuser@SERVER_IP "cd /home/azureuser/opensilex/bin/1.4.9-rdg/modules && cp opensilex-front.jar.backup opensilex-front.jar && sudo systemctl restart opensilex"
```

---

## Manual Deployment (if script fails)

See [README-DEPLOYMENT.md](README-DEPLOYMENT.md) for detailed manual steps.

---

## File Structure

```
PHIS/
├── theme/
│   ├── QUICK-START.md                  ← You are here
│   ├── README-DEPLOYMENT.md            ← Detailed guide
│   └── pheno/
│       ├── prepare-logos.js            ← Logo resizing script
│       ├── _settings.scss              ← PheNo colors
│       ├── theme.scss                  ← Main SCSS
│       ├── main.css                    ← Compiled CSS (generated)
│       └── images/
│           ├── pheno-icon.png          ← Original logo (2250x2250)
│           ├── pheno-icon-42.png       ← Generated
│           ├── pheno-icon-216.png      ← Generated
│           └── pheno-icon-224.png      ← Generated
└── tools/
    └── deploy-pheno-branding.ps1       ← Main deployment script
```

---

## PheNo Colors

| Color | Hex | Use |
|-------|-----|-----|
| Forest Green | `#264030` | Navbar, headers |
| Leaf Green Dark | `#3D8526` | Buttons, links |
| Leaf Green Light | `#87CF82` | Success states |
| Straw Dark | `#E3EBA1` | Info |
| Straw Light | `#F2F5DE` | Backgrounds |

---

## Support

Full documentation: [README-DEPLOYMENT.md](README-DEPLOYMENT.md)
