# PheNo Theme for OpenSILEX

Complete branding package for applying Norwegian Plant Phenotyping Infrastructure (PheNo) visual identity to OpenSILEX installations.

## Quick Links

- 🚀 **[Quick Start Guide](QUICK-START.md)** - Deploy in 5 minutes
- 📖 **[Full Documentation](README-DEPLOYMENT.md)** - Complete deployment guide
- 📋 **[Future Improvements](TODO-STYLE-IMPROVEMENTS.md)** - Roadmap and enhancements

---

## What's Included

### Visual Elements

**Colors:**
- Forest Green (#264030) - Primary navigation and headers
- Leaf Green Dark (#3D8526) - Buttons and primary actions
- Leaf Green Light (#87CF82) - Success states and highlights
- Straw Dark (#E3EBA1) - Info states and accents
- Straw Light (#F2F5DE) - Light backgrounds

**Logos:**
- Loading screen logo (224x224)
- Navbar logo (42x42)
- Main logo (216x216)
- Dashboard logo (224x224)
- Full PheNo logo (SVG)

**Typography:**
- Primary: Aptos font family
- Fallback: System fonts (Segoe UI, Roboto, Arial)

### Tools & Scripts

1. **[deploy-pheno-branding.ps1](../tools/deploy-pheno-branding.ps1)**
   - One-command deployment
   - Automatic backups
   - Validation and verification

2. **[prepare-logos.js](pheno/prepare-logos.js)**
   - Automated logo resizing
   - Generates all required sizes

3. **Theme Files**
   - SCSS source files with PheNo colors
   - Pre-compiled CSS
   - Component-specific styles

---

## Installation

### Prerequisites

```powershell
# Install Node.js from https://nodejs.org/
node --version  # Verify installation

# Install Sass compiler
npm install -g sass

# Install image processing tools
cd theme\pheno\images
npm install
```

### Deploy to Server

```powershell
# Basic deployment
.\tools\deploy-pheno-branding.ps1 -ServerHost YOUR_SERVER_IP

# Advanced options
.\tools\deploy-pheno-branding.ps1 `
    -ServerHost 172.211.86.191 `
    -ServerUser azureuser `
    -OpenSilexPath /home/azureuser/opensilex
```

See [QUICK-START.md](QUICK-START.md) for more examples.

---

## Repository Structure

```
PHIS/
├── theme/
│   ├── README.md                       ← You are here
│   ├── QUICK-START.md                  ← Start here for deployment
│   ├── README-DEPLOYMENT.md            ← Detailed deployment guide
│   ├── TODO-STYLE-IMPROVEMENTS.md      ← Future enhancements
│   └── pheno/
│       ├── prepare-logos.js            ← Logo resizing script
│       ├── _settings.scss              ← PheNo color variables
│       ├── theme.scss                  ← Main SCSS entry point
│       ├── main.css                    ← Compiled CSS (auto-generated)
│       ├── [component].scss            ← Component-specific styles
│       └── images/
│           ├── pheno-icon.png          ← Original 2250x2250 logo
│           ├── pheno-icon-42.png       ← Navbar (generated)
│           ├── pheno-icon-216.png      ← Main (generated)
│           ├── pheno-icon-224.png      ← Loading screen (generated)
│           └── PheNo_logo_long_*.svg   ← Full logos
└── tools/
    └── deploy-pheno-branding.ps1       ← Main deployment script
```

---

## How It Works

### Deployment Process

1. **Preparation**
   - Validates prerequisites (Node.js, Sass, SSH)
   - Resizes logos to OpenSILEX-required dimensions
   - Compiles SCSS to CSS with PheNo colors

2. **Backup**
   - Creates timestamped backup of `opensilex-front.jar`
   - Preserves original theme files

3. **Injection**
   - Uploads theme files to server
   - Injects into `opensilex-front.jar` using `jar -uf`
   - Replaces:
     - `front/theme/opensilex/_settings.scss` (colors)
     - `front/theme/opensilex/main.css` (compiled styles)
     - `front/opensilex.png` (loading logo)
     - `front/theme/opensilex/images/logo-*.png` (various logos)

4. **Activation**
   - Restarts OpenSILEX service
   - Verifies deployment
   - Confirms theme files in JAR

### Technical Approach

Instead of creating a new theme, we **modify the default OpenSILEX theme** in place:

**Pros:**
- ✅ Simple implementation
- ✅ No configuration changes needed
- ✅ Compatible with existing OpenSILEX setup
- ✅ Easy to maintain

**Cons:**
- ⚠️ Updates to OpenSILEX may overwrite theme
- ⚠️ Must redeploy after OpenSILEX upgrades

**Alternative:** Creating a custom theme would be more robust but requires deeper OpenSILEX integration knowledge.

---

## Development

### Modifying Colors

1. Edit [pheno/_settings.scss](pheno/_settings.scss)
2. Change color variables:
   ```scss
   $pheno-forest-green: #264030;    // Your new color
   $pheno-leaf-green-dark: #3D8526; // Your new color
   ```
3. Compile: `sass theme.scss main.css`
4. Deploy: `.\tools\deploy-pheno-branding.ps1 -ServerHost SERVER_IP`

### Modifying Components

1. Edit specific component file (e.g., [_navigation.scss](pheno/_navigation.scss))
2. Compile and deploy as above

### Adding New Logos

1. Place logo in [pheno/images/](pheno/images/)
2. Update [prepare-logos.js](pheno/prepare-logos.js) with new size
3. Update [deploy-pheno-branding.ps1](../tools/deploy-pheno-branding.ps1) to include new logo
4. Run deployment

---

## Troubleshooting

### Logos Not Showing

**Clear browser cache:**
- Chrome/Edge: `Ctrl+Shift+Delete`
- Firefox: `Ctrl+Shift+Delete`
- Or hard refresh: `Ctrl+Shift+R`

**Verify deployment:**
```bash
ssh user@server "jar -tf /path/to/opensilex-front.jar | grep logo-opensilex"
```

### Colors Not Applying

**Check compiled CSS:**
```powershell
Select-String -Path theme\pheno\main.css -Pattern "#264030"
```

**Verify on server:**
```bash
jar -xf opensilex-front.jar front/theme/opensilex/main.css
grep "#264030" front/theme/opensilex/main.css
```

### Deployment Fails

**Check SSH connection:**
```powershell
ssh user@server "echo connected"
```

**Restore backup:**
```bash
cd /home/azureuser/opensilex/bin/1.4.9-rdg/modules
cp opensilex-front.jar.backup opensilex-front.jar
sudo systemctl restart opensilex
```

See [README-DEPLOYMENT.md](README-DEPLOYMENT.md) for comprehensive troubleshooting.

---

## Maintenance

### After OpenSILEX Updates

When updating OpenSILEX:

1. OpenSILEX update will replace `opensilex-front.jar`
2. PheNo theme will be lost
3. **Re-run deployment:**
   ```powershell
   .\tools\deploy-pheno-branding.ps1 -ServerHost SERVER_IP
   ```

**Recommendation:** Create a post-update checklist including theme redeployment.

### Keeping Theme Updated

```bash
# Pull latest theme changes
git pull origin main

# Navigate to PHIS directory
cd path/to/PHIS

# Redeploy
.\tools\deploy-pheno-branding.ps1 -ServerHost SERVER_IP
```

---

## Version History

### v1.0.0 (2025-01-04)
- ✅ Initial release
- ✅ PheNo color palette implementation
- ✅ Logo replacement system
- ✅ Automated deployment script
- ✅ Comprehensive documentation

### Future Versions

See [TODO-STYLE-IMPROVEMENTS.md](TODO-STYLE-IMPROVEMENTS.md) for planned enhancements.

---

## Support

### Documentation
- Quick start: [QUICK-START.md](QUICK-START.md)
- Full guide: [README-DEPLOYMENT.md](README-DEPLOYMENT.md)
- Improvements: [TODO-STYLE-IMPROVEMENTS.md](TODO-STYLE-IMPROVEMENTS.md)

### Resources
- [OpenSILEX GitHub](https://github.com/OpenSILEX/opensilex)
- [Sass Documentation](https://sass-lang.com/documentation)
- [Node.js Downloads](https://nodejs.org/)

### Getting Help

1. Check [README-DEPLOYMENT.md](README-DEPLOYMENT.md) troubleshooting section
2. Review OpenSILEX logs: `sudo journalctl -u opensilex -n 100`
3. Verify JAR contents: `jar -tf opensilex-front.jar | grep pheno`

---

## License

This theme package is for use with Norwegian Plant Phenotyping Infrastructure (PheNo) installations of OpenSILEX.

PheNo branding elements (logos, colors) are property of PheNo.
OpenSILEX is licensed under AGPL-3.0.

---

## Credits

**Theme Development:** Created during OpenSILEX branding implementation
**Design Source:** PheNo Design Guidelines
**Built For:** Norwegian Plant Phenotyping Infrastructure

---

## Quick Command Reference

```powershell
# Deploy to test server
.\tools\deploy-pheno-branding.ps1 -ServerHost 20.234.181.44

# Deploy to production
.\tools\deploy-pheno-branding.ps1 -ServerHost 172.211.86.191

# Prepare logos only
cd theme\pheno
node prepare-logos.js

# Compile SCSS only
cd theme\pheno
sass theme.scss main.css

# Check deployment status
ssh user@server "jar -tf /path/to/opensilex-front.jar | grep 'pheno\|logo'"

# View OpenSILEX logs
ssh user@server "sudo journalctl -u opensilex -f"

# Restore from backup
ssh user@server "cd /path/to/modules && cp opensilex-front.jar.backup-TIMESTAMP opensilex-front.jar && sudo systemctl restart opensilex"
```

---

**Last Updated:** 2025-01-04
**Version:** 1.0.0
