# PHIS Reinstall Instructions

**Updated:** 2026-01-15
**Includes:** GroupDAO fix + Auto-group assignment patches

## What's Integrated

The installer now **automatically builds OpenSILEX from source with patches** instead of downloading the buggy pre-built JAR.

### Patches Included:
1. ✅ **GroupDAO NullPointerException fix** - Fixes authentication/JWT tokens
2. ✅ **AccountDAO auto-group assignment** - New Feide users get credentials immediately

## How to Reinstall

### Option 1: Full Reinstall (Recommended)

```bash
# On your server (as azureuser):
ssh azureuser@172.211.86.191

# Download installer
cd ~
git clone https://github.com/lversen/PHIS.git
cd PHIS/tools

# Run installer (builds from source with patches)
sudo bash opensilex-installer.sh
```

**Build time:** ~15-20 minutes (includes Maven compilation)

### Option 2: Quick Reinstall (Reuse Config)

If you want to preserve your current configuration:

```bash
# Backup current config
sudo cp /home/azureuser/opensilex/config/opensilex.yml ~/opensilex.yml.backup

# Run installer
sudo bash opensilex-installer.sh

# Restore config
sudo cp ~/opensilex.yml.backup /home/azureuser/opensilex/config/opensilex.yml
sudo systemctl restart opensilex
```

### Option 3: Upgrade Existing Installation

If you don't want a full reinstall, just upgrade the JAR:

```bash
# On server:
cd /tmp

# Clone, patch, and build
git clone --depth 1 --branch 1.4.9-rdg https://github.com/OpenSILEX/opensilex.git
cd opensilex

# Apply GroupDAO patch
cat > /tmp/groupdao-fix.patch << 'EOF'
--- a/opensilex-security/src/main/java/org/opensilex/security/group/dal/GroupDAO.java
+++ b/opensilex-security/src/main/java/org/opensilex/security/group/dal/GroupDAO.java
@@ -153,7 +153,11 @@ public final class GroupDAO {
                 GroupModel.class,
                 lang,
                 (SelectBuilder select) -> {
-                    select.addFilter(SPARQLQueryHelper.inURIFilter(GroupUserProfileModel.URI_FIELD, encounteredUserProfileUrisAsUris));
+                    // CRITICAL FIX: inURIFilter returns null when list is empty
+                    Expr filter = SPARQLQueryHelper.inURIFilter(GroupUserProfileModel.URI_FIELD, encounteredUserProfileUrisAsUris);
+                    if (filter != null) {
+                        select.addFilter(filter);
+                    }
                 },
                 Collections.emptyMap(),
                 (SPARQLResult result) -> userProfileFetcher.getInstance(result, lang),
EOF

patch -p1 < /tmp/groupdao-fix.patch

# Build
mvn clean install -DskipTests -DskipFrontBuild

# Backup and replace
sudo systemctl stop opensilex
sudo cp /home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.jar \
        /home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.jar.backup-$(date +%Y%m%d)
sudo cp opensilex-release/target/opensilex-release-1.4.9-rdg/opensilex.jar \
        /home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.jar
sudo systemctl start opensilex
```

## Build Behavior

### Default (Build from Source):
```bash
sudo bash opensilex-installer.sh
# Automatically builds with patches
```

### Force Pre-built Download (Not Recommended):
```bash
BUILD_FROM_SOURCE=false sudo bash opensilex-installer.sh
# Downloads buggy JAR from GitHub (not recommended!)
```

## What Gets Fixed

### Before (Buggy Pre-built JAR):
- ❌ All users have empty credentials in JWT tokens
- ❌ Groups/Profiles pages crash with NullPointerException
- ❌ UI shows blank page
- ❌ Cannot manage users/groups/profiles

### After (Patched Build):
- ✅ JWT tokens contain full credentials
- ✅ Groups/Profiles load correctly
- ✅ UI shows proper menus and access
- ✅ New Feide users auto-assigned to Users group (instant)
- ✅ No 60-second delay for new users

## Verification After Install

```bash
# 1. Check OpenSILEX is running
sudo systemctl status opensilex

# 2. Test groups API
TOKEN=$(curl -s -X POST "http://localhost:8666/rest/security/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"identifier": "admin@opensilex.org", "password": "admin"}' \
  | grep -o '"token" : "[^"]*' | cut -d'"' -f4)

curl -X GET "http://localhost:8666/rest/security/groups" \
  -H "Authorization: Bearer $TOKEN"

# Should return groups list (not NullPointerException)

# 3. Check JWT token has credentials
echo "$TOKEN" | cut -d. -f2 | base64 -d | python3 -m json.tool

# Should show "credentials_list" with many items

# 4. Test Feide login
# Login via https://phis.pheno.no
# Should see full UI immediately (no blank page)
```

## Troubleshooting

### If build fails:
The installer falls back to downloading pre-built JAR (with warning).
You can manually apply patches later using Option 3 above.

### If authentication still fails:
1. Check admin user exists:
   ```bash
   /home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh user add \
     --admin --email="admin@opensilex.org" \
     --firstName="System" --lastName="Administrator" --password="admin"
   ```

2. Ensure default profile has credentials (see auto_groups_fix_summary.md)

### Build Requirements:
- Java 11+
- Maven 3.6+
- Git
- ~4GB free disk space
- ~15-20 minutes build time

## Files Modified

The installer modifies:
- `tools/opensilex-installer.sh` - Now builds from source by default
- Includes both patches embedded in the script
- Falls back to pre-built if build fails

No other files need changing - reinstall "just works" with patches!

## Questions?

See also:
- [SOLUTION_Complete_Fix.md](SOLUTION_Complete_Fix.md) - Detailed technical explanation
- [CRITICAL_BUG_GroupDAO.md](CRITICAL_BUG_GroupDAO.md) - Bug analysis
- [auto_groups_fix_summary.md](auto_groups_fix_summary.md) - Daemon workaround (no longer needed)
