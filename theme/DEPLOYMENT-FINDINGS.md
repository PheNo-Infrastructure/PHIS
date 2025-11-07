# PheNo Theme Deployment Findings

## Current Status
✅ **FIXED!** The deployment script (`tools/deploy-pheno-branding.ps1`) is now working correctly.

**Root Cause**: The index.html was using absolute paths (`/css/` and `/js/`) instead of relative paths (`css/` and `js/`). When OpenSILEX is served under a subpath (e.g., `/app/`), absolute paths resolve to the root domain instead of relative to the app context.

**Solution**: Changed index.html to use relative paths for custom CSS/JS files.

## Working Configuration (Test Server 20.234.181.44)

The test server at 20.234.181.44 is working correctly with green PheNo colors. Here's its exact configuration:

### Files in JAR
```
front/index.html (146 lines)
front/css/pheno-overrides.css
front/js/pheno-text-replace.js
front/theme/opensilex/_settings.scss (with PheNo colors)
front/theme/opensilex/main.css (780 lines - original OpenSILEX version)
front/theme/opensilex/images/logo-opensilex.png (pheno-logo-navbar.png)
front/theme/opensilex/images/logo-opensilex_miniature.png (pheno-logo-navbar-mini.png)
front/opensilex.png (pheno-icon-224.png)
```

### Key Path Mappings
Files in JAR are served with these URL paths:
- `front/css/pheno-overrides.css` → `/css/pheno-overrides.css`
- `front/js/pheno-text-replace.js` → `/js/pheno-text-replace.js`
- `front/theme/opensilex/main.css` → `/osfront/css/main.css`
- `front/opensilex.png` → `/osfront/opensilex.png`

**CRITICAL**: Custom files at `front/css/` map to `/css/` (NOT `/osfront/css/`)

### Working index.html Links
```html
<link href="/css/pheno-overrides.css" rel="stylesheet">
<script src="/js/pheno-text-replace.js"></script>
```

### Working main.css
- **780 lines** (original OpenSILEX version)
- Contains hamburger button styles
- Does NOT contain compiled PheNo theme

### Working _settings.scss
Contains PheNo color variables:
```scss
$pheno-forest-green: #264030;
$pheno-leaf-green-dark: #3D8526;
$pheno-leaf-green-light: #87CF82;
$pheno-straw-dark: #E3EBA1;
$pheno-straw-light: #F2F5DE;

$theme: $pheno-forest-green;
$dark: $pheno-forest-green;
$primary: $pheno-leaf-green-dark;
```

### How Colors Are Applied on Test Server
Colors come from `pheno-overrides.css` file which loads successfully as `/css/pheno-overrides.css`. The file contains comprehensive CSS overrides for:
- Navbar background: #264030 (Forest Green)
- Primary buttons: #3D8526 (Leaf Green Dark)
- Links: #3D8526
- Success elements: #87CF82 (Leaf Green Light)
- Info elements: #E3EBA1 (Straw Dark)

## Failed Configuration (Production & New Test VM)

Both production server (172.211.86.191) and fresh test VM show the same issues after running the deployment script.

### Problems Encountered
1. **404 errors**: `/css/pheno-overrides.css` and `/js/pheno-text-replace.js` return 404
2. **Wrong colors**: OpenSILEX default blue colors instead of PheNo green
3. **Logo and text hiding works**: So some parts of the deployment are successful

### What the Script Does Wrong
The script appears to upload files correctly to `front/css/` and `front/js/` in the temp directory, and the `jar -uf` command includes them, but they don't get served by Tomcat/OpenSILEX.

### Potential Root Causes
1. **JAR structure issue**: Maybe the way files are added to JAR doesn't make them accessible
2. **OpenSILEX routing**: Perhaps OpenSILEX only serves files from specific directories
3. **Build process**: The working test server may have had files added during build, not post-deployment
4. **Tomcat configuration**: Maybe custom path mappings need to be configured

## Critical Lessons Learned

### 1. Do NOT Deploy Compiled main.css
- Original OpenSILEX main.css: **780 lines** (includes hamburger button styles)
- Compiled PheNo main.css: **6,852 lines** (breaks hamburger button)
- **ONLY deploy _settings.scss**, never deploy main.css
- This is documented in `theme/TROUBLESHOOTING-HAMBURGER-BUTTON.md`

### 2. File Path Requirements
Files must be at these JAR locations:
- `front/css/pheno-overrides.css` (NOT `front/osfront/css/`)
- `front/js/pheno-text-replace.js` (NOT `front/osfront/js/`)

Links in index.html must use:
- `href="/css/pheno-overrides.css"` (NOT `href="osfront/css/..."`)
- `src="/js/pheno-text-replace.js"` (NOT `src="osfront/js/..."`)

### 3. Logo Requirements
- Logo file: 249×80px PNG (2x resolution)
- Displays at: 140px width via CSS
- Inline CSS in index.html handles sizing and text hiding
- Logo files replace original OpenSILEX images in JAR

### 4. Deployment Script Status
Current script (`tools/deploy-pheno-branding.ps1`):
- ✅ Correctly uploads to `front/css/` and `front/js/`
- ✅ Only deploys _settings.scss (not main.css)
- ✅ Creates backups
- ✅ Handles logo files correctly
- ❌ **But doesn't produce working deployment**

## Files Modified in This Session

### Local Theme Files (Updated)
1. `theme/pheno/index.html` - Fixed CSS/JS links to use `/css/` and `/js/` paths
2. `theme/pheno/_settings.scss` - Contains PheNo color variables
3. `theme/pheno/pheno-overrides.css` - Comprehensive color overrides
4. `theme/pheno/pheno-text-replace.js` - JavaScript for hiding OpenSILEX text

### Documentation Created
1. `theme/TROUBLESHOOTING-HAMBURGER-BUTTON.md` - Documents main.css issue
2. `theme/DEPLOYMENT-FINDINGS.md` - This file

## Next Steps for New Context

1. **Compare JAR contents**: Extract and diff the working test server JAR vs failed deployment JAR
2. **Test manual JAR injection**: Try manually creating the exact JAR structure that works on test server
3. **Check OpenSILEX source**: Look at how OpenSILEX serves static files to understand routing
4. **Alternative approach**: Consider using OpenSILEX's built-in theming system instead of JAR injection
5. **Container-based deployment**: If OpenSILEX runs in Docker, modify the container image instead

## Questions to Answer

1. How did the working test server get its files? Was it deployed differently?
2. Why does Tomcat serve `front/css/app.css` as `/osfront/css/app.css` but NOT serve `front/css/pheno-overrides.css` as `/css/pheno-overrides.css`?
3. Is there a web.xml or servlet configuration that defines which paths are accessible?
4. Can we replicate the exact JAR from test server to understand what's different?

## Reference: Working Test Server Details

- **Host**: 20.234.181.44
- **User**: azureuser
- **OpenSILEX Path**: ~/opensilex
- **Version**: 1.4.9-rdg
- **JAR Path**: ~/opensilex/bin/1.4.9-rdg/modules/opensilex-front.jar
- **main.css**: 780 lines (confirmed working with hamburger button)
- **Colors**: Green PheNo colors showing correctly
- **Console**: pheno-overrides.css loads without 404 errors

## Resolution Details (2025-11-07)

### Problem
After deployment, custom CSS/JS files returned 404 errors:
- `/css/pheno-overrides.css` → 404
- `/js/pheno-text-replace.js` → 404

Files were correctly in the JAR at `front/css/` and `front/js/`, but browsers couldn't access them.

### Root Cause
OpenSILEX is served under `/app/` path via nginx proxy. The index.html used absolute paths starting with `/`:
```html
<link href="/css/pheno-overrides.css" rel="stylesheet">
<script src="/js/pheno-text-replace.js"></script>
```

When browser loaded `http://SERVER/app/`, it tried to fetch:
- `http://SERVER/css/pheno-overrides.css` (wrong - absolute path from root)
- Should be: `http://SERVER/app/css/pheno-overrides.css` (relative to app context)

### Solution
Changed to relative paths in index.html:
```html
<link href="css/pheno-overrides.css" rel="stylesheet">
<script src="js/pheno-text-replace.js"></script>
```

Now browsers correctly resolve relative to the current page (`/app/`):
- `http://SERVER/app/css/pheno-overrides.css` ✓
- `http://SERVER/app/js/pheno-text-replace.js` ✓

### Files Modified
- `theme/pheno/index.html` - Changed absolute paths to relative paths

### Deployment Confirmed Working
- Server: 172.201.60.223
- Both files return HTTP 200
- Green PheNo colors should now display correctly
