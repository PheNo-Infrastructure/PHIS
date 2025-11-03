# PheNo Theme for OpenSILEX

This directory contains the custom PheNo (Norwegian Plant Phenotyping Infrastructure) branding theme for OpenSILEX.

## Overview

The PheNo theme applies the official brand design guidelines to the OpenSILEX web interface, including:

- **Color Palette**: Forest green, leaf greens, and straw colors
- **Typography**: Aptos font family
- **Logo**: PheNo branded logos
- **Icons**: Custom PheNo icon set

## Directory Structure

```
theme/
├── css/
│   └── pheno-theme.css          # Main theme stylesheet
├── images/
│   └── README.md                # Instructions for logo files
├── fonts/                       # Custom fonts (if needed)
└── README.md                    # This file
```

## Design Specifications

Based on the PheNo Design Guidelines:

### Color Palette

| Color Name | Hex Code | RGB | Usage |
|------------|----------|-----|-------|
| Straw Light | `#F2F5DE` | 242, 245, 222 | Light backgrounds, subtle accents |
| Straw Dark | `#E3EBA1` | 227, 235, 161 | Secondary backgrounds |
| Leaf Green Light | `#87CF82` | 135, 207, 130 | Hover states, highlights |
| Leaf Green Dark | `#3D8526` | 61, 133, 38 | Primary buttons, active states |
| Forest Green | `#264030` | 38, 64, 48 | Headers, navigation, text |

### Typography

- **Font Family**: Aptos (fallback to system sans-serif)
- **Weights**: Regular (400), Medium (500), Semibold (600)
- **Usage**: All UI elements, headings, body text

### Logo Guidelines

- **Spacing**: Equal to height of lowercase letter (e/o)
- **Position**: Top left (primary), bottom (signature)
- **Variants**:
  - Green (light backgrounds)
  - White (dark backgrounds)
  - Black (non-brand backgrounds)

## Installation

### Prerequisites

1. OpenSILEX instance running on a server
2. SSH access to the server
3. Logo files added to `theme/images/` directory

### Deployment Steps

#### Option 1: Automated Deployment (Recommended for Testing)

```powershell
# Deploy to test VM only
.\tools\deploy-theme.ps1 -VMIPAddress <test-vm-ip> -AdminUsername azureuser -Action All
```

This will:
1. Copy theme files to the server
2. Install and configure Nginx as a reverse proxy
3. Inject the custom CSS into all OpenSILEX pages

#### Option 2: Manual Deployment

1. **Upload theme files to server:**
   ```bash
   scp -r theme/* azureuser@<vm-ip>:/home/azureuser/opensilex/data/files/theme/
   ```

2. **Set permissions:**
   ```bash
   ssh azureuser@<vm-ip> "chmod -R 755 /home/azureuser/opensilex/data/files/theme"
   ```

3. **Install Nginx (for theme injection):**
   ```bash
   ssh azureuser@<vm-ip> "sudo apt-get update && sudo apt-get install -y nginx"
   ```

4. **Configure Nginx** (see Nginx Configuration section below)

### Nginx Configuration

The theme uses Nginx as a reverse proxy to inject the custom CSS into OpenSILEX pages without modifying the JAR file.

Configuration file location: `/etc/nginx/sites-available/opensilex-pheno`

```nginx
server {
    listen 80;
    server_name _;

    # Serve theme files directly
    location /theme/ {
        alias /home/azureuser/opensilex/data/files/theme/;
        expires 1d;
        add_header Cache-Control "public, immutable";
    }

    # Proxy to OpenSILEX with CSS injection
    location / {
        proxy_pass http://localhost:8666;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Inject custom CSS
        sub_filter '</head>' '<link rel="stylesheet" href="/theme/css/pheno-theme.css"></head>';
        sub_filter_once off;
        sub_filter_types text/html;
    }
}
```

## Adding Logo Files

Before deploying, add the following logo files to `theme/images/`:

1. `pheno-logo-green.svg` or `pheno-logo-green.png` - Primary logo
2. `pheno-logo-white.svg` or `pheno-logo-white.png` - For dark backgrounds
3. `pheno-logo-black.svg` or `pheno-logo-black.png` - Alternative version
4. `pheno-icon.svg` or `pheno-icon.png` - Icon only (64x64px minimum)

See `theme/images/README.md` for detailed requirements.

## Testing

### Test Environment Setup

**IMPORTANT**: Always test on a dedicated test VM first, never on production!

1. Create a test VM using the installer:
   ```powershell
   .\tools\opensilex-github.ps1 -Command FullInstall -VMName "phis-test" -ResourceGroupName "RG-OPENSILEX-TEST"
   ```

2. Deploy the theme:
   ```powershell
   .\tools\deploy-theme.ps1 -VMIPAddress <test-vm-ip> -Action All
   ```

3. Verify the theme:
   - Navigate to `http://<test-vm-ip>`
   - Check color scheme matches PheNo guidelines
   - Verify logo placement and sizing
   - Test all UI components (buttons, forms, tables, etc.)

### Verification Checklist

- [ ] Primary colors applied (forest green header/navigation)
- [ ] Secondary colors visible (leaf green buttons)
- [ ] Typography changed to Aptos font
- [ ] Logo displayed correctly
- [ ] Buttons use correct hover states
- [ ] Forms have proper styling
- [ ] Tables have straw-colored headers
- [ ] All pages load without errors

## Troubleshooting

### Theme not loading

Check Nginx status:
```bash
ssh azureuser@<vm-ip> "sudo systemctl status nginx"
```

View Nginx error log:
```bash
ssh azureuser@<vm-ip> "sudo tail -f /var/log/nginx/error.log"
```

### CSS not being injected

Verify sub_filter module is enabled:
```bash
ssh azureuser@<vm-ip> "nginx -V 2>&1 | grep sub_filter"
```

Test Nginx configuration:
```bash
ssh azureuser@<vm-ip> "sudo nginx -t"
```

### Theme files not accessible

Check file permissions:
```bash
ssh azureuser@<vm-ip> "ls -la /home/azureuser/opensilex/data/files/theme/"
```

## Reverting to Original Theme

To remove the PheNo theme:

1. **Remove Nginx configuration:**
   ```bash
   ssh azureuser@<vm-ip> "sudo rm /etc/nginx/sites-enabled/opensilex-pheno && sudo systemctl restart nginx"
   ```

2. **Access OpenSILEX directly on port 8666:**
   ```
   http://<vm-ip>:8666
   ```

## Production Deployment

When ready to deploy to production:

1. **Test thoroughly** on test VM
2. **Schedule maintenance window** (minimal downtime)
3. **Backup current configuration**
4. **Deploy using the same process** as testing
5. **Monitor for issues** post-deployment

## Customization

### Modifying Colors

Edit `theme/css/pheno-theme.css` and update the CSS variables at the top:

```css
:root {
  --pheno-straw-light: #F2F5DE;
  --pheno-straw-dark: #E3EBA1;
  --pheno-leaf-green-light: #87CF82;
  --pheno-leaf-green-dark: #3D8526;
  --pheno-forest-green: #264030;
}
```

### Adding Custom Styles

Append your custom CSS to `theme/css/pheno-theme.css` or create a new CSS file in `theme/css/`.

## Maintenance

### Updating the Theme

1. Modify theme files in the Git repository
2. Commit changes
3. Redeploy to test VM first
4. Test thoroughly
5. Deploy to production if successful

### Version Control

All theme files are version-controlled in Git. This ensures:
- Reproducibility across environments
- Easy rollback if needed
- Change tracking and history

## Support

For issues or questions:
- Review the PheNo Design Guidelines PDF
- Check OpenSILEX documentation
- Review Nginx documentation for proxy configuration

## License

This theme follows the PheNo brand guidelines and is intended for use with the Norwegian Plant Phenotyping Infrastructure project.

## References

- PheNo Design Guidelines: `PheNo Design guidelines.pdf`
- OpenSILEX Documentation: https://github.com/OpenSILEX/opensilex
- Nginx sub_filter module: http://nginx.org/en/docs/http/ngx_http_sub_module.html
