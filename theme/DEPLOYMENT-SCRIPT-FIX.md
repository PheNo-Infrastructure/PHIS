# Deployment Script Fix Analysis

## Problem Summary

After running the theme deployment script on a new VM, you're getting these 404 errors:
```
pheno-overrides.css:1   Failed to load resource: the server responded with a status of 404 ()
pheno-text-replace.js:1   Failed to load resource: the server responded with a status of 404 ()
```

This means the custom CSS/JS files that provide PheNo branding colors are not being served by OpenSILEX.

## Root Cause Analysis

The deployment script (`tools/deploy-pheno-branding.ps1`) uploads files to these JAR paths:
- `front/css/pheno-overrides.css`
- `front/js/pheno-text-replace.js`

And index.html references them as:
- `/css/pheno-overrides.css`
- `/js/pheno-text-replace.js`

**However**, OpenSILEX's Spring Boot configuration likely only serves static files from the `front/osfront/` directory, not from `front/css/` or `front/js/` directly.

This is why:
- `front/osfront/css/app.css` → works as `/osfront/css/app.css` ✓
- `front/css/pheno-overrides.css` → **doesn't work** as `/css/pheno-overrides.css` ✗

## Investigation Steps

I've created three diagnostic tools to help you confirm this theory:

### 1. Enhanced Deployment Script
**File**: `tools/deploy-pheno-branding.ps1` (updated)

**Changes made**:
- Added verification before JAR injection to ensure files exist in staging directory
- Added verification after JAR injection to confirm files were added to JAR
- Enhanced final verification to check for critical CSS/JS files
- Better error messages with troubleshooting hints

**Run this first** to see if files are actually being added to the JAR correctly.

### 2. Diagnostic Script
**File**: `tools/diagnose-jar-contents.ps1` (new)

**Purpose**: Compare working test server vs failed deployment

**Usage**:
```powershell
.\tools\diagnose-jar-contents.ps1 -FailedServer YOUR_NEW_VM_IP
```

This will compare JAR contents between your working test server (20.234.181.44) and the failed deployment to identify differences.

### 3. Deployment Theory Test
**File**: `tools/test-deployment-theory.ps1` (new)

**Purpose**: Test if custom files can be accessed via different URL paths

**Usage**:
```powershell
.\tools\test-deployment-theory.ps1 -ServerHost YOUR_VM_IP
```

This will:
- Check if files exist in JAR
- Extract and verify file contents
- Test URL accessibility (requires OpenSILEX running)
- Compare with working files like app.css
- Suggest alternative path structure

### 4. Experimental Fix
**File**: `tools/deploy-pheno-branding-OSFRONT-PATH.ps1` (new)

**Purpose**: Test deployment using `osfront/` path structure

**Usage**:
```powershell
.\tools\deploy-pheno-branding-OSFRONT-PATH.ps1 -ServerHost YOUR_VM_IP
```

This experimental script:
- Places CSS/JS under `front/osfront/css/` and `front/osfront/js/` instead
- Modifies index.html to reference `osfront/css/pheno-overrides.css` instead of `/css/pheno-overrides.css`
- Tests if this path structure works with OpenSILEX's static resource configuration

## Recommended Action Plan

### Step 1: Run Diagnostics
```powershell
# First, verify files are in JAR
.\tools\test-deployment-theory.ps1 -ServerHost YOUR_NEW_VM_IP

# Compare with working server
.\tools\diagnose-jar-contents.ps1 -FailedServer YOUR_NEW_VM_IP
```

### Step 2A: If files ARE in JAR but return 404
This confirms the path mapping issue. Try the experimental fix:
```powershell
.\tools\deploy-pheno-branding-OSFRONT-PATH.ps1 -ServerHost YOUR_NEW_VM_IP
```

### Step 2B: If files are NOT in JAR
The updated deployment script should help identify where the upload is failing.

### Step 3: Compare Results
Check the browser console after each test:
- If you still see 404 errors → path structure is still wrong
- If CSS/JS loads but wrong colors → different issue (check file contents)
- If everything works → solution found! Update main script

## Why This Might Have Worked on Test Server

According to DEPLOYMENT-FINDINGS.md, the test server (20.234.181.44) is working correctly with the current structure. This could mean:

1. **Manual intervention**: You may have manually added files during development in a different way than the script does
2. **Different OpenSILEX version**: The test server might have different static resource configuration
3. **Additional configuration**: There might be a web.xml or Spring Boot configuration file that's different
4. **Timing**: Files might have been added before certain OpenSILEX configuration changes

## Next Steps After Testing

Once you identify which path structure works:

1. **Update main deployment script** (`deploy-pheno-branding.ps1`) to use the correct paths
2. **Update local index.html** to match the working path structure
3. **Test on production** server (172.211.86.191)
4. **Document the solution** in DEPLOYMENT-FINDINGS.md

## Questions to Answer

- [ ] Are the files actually in the JAR after deployment?
- [ ] What HTTP status code do you get for each custom file? (200, 404, 403, etc.)
- [ ] Does `http://YOUR_VM/osfront/css/pheno-overrides.css` work if you try that URL?
- [ ] What files exist under `front/osfront/` in the working test server JAR?
- [ ] Is there any difference in OpenSILEX configuration between working and failed servers?

## Files Modified

### Updated
1. `tools/deploy-pheno-branding.ps1` - Added verification and diagnostics

### Created
1. `tools/diagnose-jar-contents.ps1` - JAR comparison tool
2. `tools/test-deployment-theory.ps1` - URL accessibility tester
3. `tools/deploy-pheno-branding-OSFRONT-PATH.ps1` - Experimental fix
4. `theme/DEPLOYMENT-SCRIPT-FIX.md` - This document

## Reference

See also:
- `theme/DEPLOYMENT-FINDINGS.md` - Original investigation findings
- `theme/TROUBLESHOOTING-HAMBURGER-BUTTON.md` - main.css deployment issue
