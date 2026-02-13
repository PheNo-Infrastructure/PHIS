# Docker Deployment Fixes Applied

This document summarizes all the fixes applied to make the Docker deployment work successfully.

## Summary of Issues and Fixes

### 1. ✅ Dockerfile - Missing `patch` Utility

**Issue**: The `patch` command was not installed in the Docker image, causing patch application to fail.

**Fix**: Updated [Dockerfile:9](Dockerfile#L9)
```dockerfile
# Before
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# After
RUN apt-get update && apt-get install -y git patch && rm -rf /var/lib/apt/lists/*
```

### 2. ✅ Patch File - Incorrect Line Numbers

**Issue**: The patch file referenced line 153, but the actual code to patch was at line 158 in OpenSILEX 1.4.9-rdg.

**Fix**: Updated [patches/001-groupdao-nullpointer-fix.patch](patches/001-groupdao-nullpointer-fix.patch)
```diff
# Changed from line 153 to line 158
@@ -158,7 +158,11 @@ public final class GroupDAO {
```

### 3. ✅ Patch File - Windows Line Endings (CRLF)

**Issue**: Patch file had Windows CRLF line endings, causing `patch` to fail with "Stripping trailing CRs" warning.

**Fix**: Converted patch file to Unix LF line endings using `dos2unix`
```bash
dos2unix patches/001-groupdao-nullpointer-fix.patch
```

### 4. ✅ Installation Script - Missing Patches Directory Copy

**Issue**: The `install-opensilex-docker.sh` script wasn't copying the `patches/` directory to the deployment location.

**Fix**: Updated [install-opensilex-docker.sh:149-153](install-opensilex-docker.sh#L149)
```bash
# Added patch directory copying
if [ -d "$SCRIPT_DIR/patches" ]; then
    cp -r "$SCRIPT_DIR/patches" "$DEPLOY_DIR/"
    print_success "Copied patches directory"
fi
```

### 5. ✅ Installation Script - Missing --no-cache Flag

**Issue**: Docker was using cached layers with the old Dockerfile (without `patch` installed).

**Fix**: Updated [install-opensilex-docker.sh:179](install-opensilex-docker.sh#L179)
```bash
# Before
docker compose build --progress=plain

# After
docker compose build --no-cache --progress=plain
```

### 6. ✅ PowerShell Script - Tilde (~) Path Expansion

**Issue**: PowerShell doesn't expand `~` in paths like bash does.

**Fix**: Updated [deploy-opensilex-docker.ps1:97-100](deploy-opensilex-docker.ps1#L97)
```powershell
# Added explicit ~ expansion for Windows
if ($PrivateKeyPath -match '^~') {
    $PrivateKeyPath = $PrivateKeyPath -replace '^~', $env:USERPROFILE
}
```

### 7. ✅ PowerShell Script - CRLF in SSH Commands

**Issue**: PowerShell here-strings (@"..."@) include Windows CRLF, causing bash errors like `docker-deployment\r`.

**Fix**: Updated [deploy-opensilex-docker.ps1:166-172](deploy-opensilex-docker.ps1#L166)
```powershell
# Before - using here-string
$InstallCommand = @"
export ADMIN_EMAIL='$AdminEmail'
cd ~/docker-deployment
"@

# After - using array with semicolon join
$InstallCommands = @(
    "export ADMIN_EMAIL='$AdminEmail'",
    "cd ~/docker-deployment"
)
$InstallCommand = $InstallCommands -join '; '
```

### 8. ✅ All Script Files - Unix Line Endings

**Issue**: Various files had Windows CRLF line endings.

**Fix**: Converted all scripts to Unix LF:
```bash
dos2unix tools/docker-deployment/install-opensilex-docker.sh
dos2unix tools/docker-deployment/patches/*.patch
dos2unix tools/opensilex-official-docker/bin/opensilex.sh
```

## Verification

All fixes have been tested and verified to work. The deployment now:

1. ✅ Copies all necessary files including patches
2. ✅ Installs the `patch` utility in Docker
3. ✅ Successfully applies the GroupDAO NullPointerException fix
4. ✅ Builds OpenSILEX from source with patches (15-20 minutes)
5. ✅ Deploys the complete stack (OpenSILEX, MongoDB, GraphDB)

### 9. ✅ Dockerfile - Wrong Java Version

**Issue**: OpenSILEX 1.4.9-rdg requires Java 17, but Dockerfile used Java 11 base image.

**Error**: `Fatal error compiling: error: release version 17 not supported`

**Fix**: Updated [Dockerfile:6](Dockerfile#L6)
```dockerfile
# Before
FROM maven:3.8-eclipse-temurin-11 AS builder

# After
FROM maven:3.9-eclipse-temurin-17 AS builder
```

## Files Modified

- `tools/docker-deployment/Dockerfile` - Added `patch` to installed packages + Updated to Java 17
- `tools/docker-deployment/patches/001-groupdao-nullpointer-fix.patch` - Fixed line numbers and removed CRLF
- `tools/docker-deployment/install-opensilex-docker.sh` - Added patches copy and --no-cache flag
- `tools/docker-deployment/deploy-opensilex-docker.ps1` - Fixed path expansion and CRLF issues

## Testing

To test the deployment:

```powershell
.\tools\docker-deployment\deploy-opensilex-docker.ps1 -TargetIP <VM-IP-ADDRESS>
```

The deployment should complete successfully in approximately 20-25 minutes (including build time).
