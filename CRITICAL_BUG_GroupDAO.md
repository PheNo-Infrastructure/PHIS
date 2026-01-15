# CRITICAL BUG: OpenSILEX GroupDAO Cannot Read Security Data

**Date:** 2026-01-15
**Severity:** CRITICAL - System Authentication Broken
**Affected Version:** OpenSILEX 1.4.9-rdg
**Status:** 🔴 **UNFIXED** - Requires Java source code patch and rebuild

## Impact

**ALL users (including admin) have ZERO credentials in their JWT tokens**, resulting in:
- ❌ Blank UI for all users
- ❌ No access to any modules (experiments, projects, data, etc.)
- ❌ Groups and Profiles pages show empty/error
- ❌ Cannot manage users, groups, or profiles via UI
- ❌ New Feide users cannot access the system at all

## Root Cause

### The Bug
`org.opensilex.security.group.dal.GroupDAO.loadGroupUserProfileModelsIntoGroups()` line 156

**Error:**
```
java.lang.NullPointerException: Cannot invoke "org.apache.jena.sparql.expr.Expr.visit(org.apache.jena.sparql.expr.ExprVisitor)"
because the return value of "org.apache.jena.sparql.syntax.ElementFilter.getExpr()" is null
```

**Cause:**
The SPARQL query builder in `GroupDAO.search()` is adding an `ElementFilter` with a null expression. This happens when:
- The code builds a filter based on optional parameters
- When parameters are null/empty, it creates a null `Expr` object
- The null `Expr` is still added to the query via `new ElementFilter(nullExpr)`
- When Jena tries to execute the query, it throws NullPointerException

### Affected Code Path

```
GroupAPI.searchGroups()
  └─> GroupDAO.search()
      └─> GroupDAO.loadGroupUserProfileModelsIntoGroups()
          └─> sparql.searchWithPagination()
              └─> [NullPointerException in Jena query builder]
```

This breaks:
1. **`GET /security/groups`** - Cannot list groups
2. **`GET /security/groups/{uri}`** - Cannot get specific group
3. **Authentication** - Cannot load user credentials for JWT tokens
4. **Frontend** - Cannot display groups or profiles

## Evidence

### Data Exists in GraphDB
```sparql
# This query works and returns correct data:
PREFIX security: <http://www.opensilex.org/security#>
SELECT * WHERE {
  <http://opensilex.org/groups/users> ?p ?o
}
# Result: Group exists with correct structure
```

### API is Broken
```bash
curl -X GET "http://localhost:8666/rest/security/groups" \
  -H "Authorization: Bearer $TOKEN"
# Result: NullPointerException
```

### JWT Tokens Have No Credentials
```bash
# Decode admin JWT token:
echo "$TOKEN" | cut -d. -f2 | base64 -d
# Result: "credentials_list": []
```

Even the admin user gets an empty credentials list!

## Attempted Fixes

### ❌ Fixed (Attempted):
1. **GraphDB direct queries** - Confirmed data exists correctly
2. **Removed duplicate graphs** - Not the issue
3. **Restarted OpenSILEX** - Didn't clear the bug
4. **Added profile credentials** - Credentials exist but can't be loaded
5. **Python daemon workaround** - Only fixes group assignment, not authentication

### ✅ Workarounds Implemented:
1. **Auto-groups daemon** - Uses GraphDB SPARQL directly to assign users to groups
   - File: `tools/monitor_new_users_fixed.py`
   - Bypasses broken GroupDAO
   - Works for group assignment only
2. **Added credentials to default profile** - 81 read-only credentials added
   - Credentials exist in GraphDB
   - But cannot be loaded into JWT tokens due to GroupDAO bug

## Required Fix

### Solution: Patch GroupDAO.java

**File:** `opensilex-security/src/main/java/org/opensilex/security/group/dal/GroupDAO.java`

**Pattern to Fix (from Gemini analysis):**

```java
// BEFORE (Buggy):
Expr filterExpr = createFilterExpression(param);  // Can return null
query.addFilter(filterExpr);  // BUG: null filter added

// AFTER (Fixed):
Expr filterExpr = createFilterExpression(param);
if (filterExpr != null) {  // FIX: Check for null
    query.addFilter(filterExpr);
}
```

**Specific Location:**
Around line 156 in `loadGroupUserProfileModelsIntoGroups()` where it calls:
```java
sparql.searchWithPagination(...)
```

The SPARQL query builder needs null checks before adding filters.

### Steps to Fix

1. **Clone OpenSILEX source:**
   ```bash
   git clone https://github.com/OpenSILEX/opensilex.git
   cd opensilex
   git checkout 1.4.9-rdg
   ```

2. **Create patch file:**
   ```bash
   # See tools/patches/GroupDAO-fix-null-filter.patch
   ```

3. **Apply patch:**
   ```bash
   patch -p1 < tools/patches/GroupDAO-fix-null-filter.patch
   ```

4. **Rebuild:**
   ```bash
   mvn clean install -DskipTests
   ```

5. **Deploy:**
   ```bash
   # Copy new opensilex.jar to server
   scp target/opensilex.jar azureuser@172.211.86.191:/home/azureuser/opensilex/bin/1.4.9-rdg/
   sudo systemctl restart opensilex
   ```

## Temporary Mitigation

Until the GroupDAO is fixed, users **CANNOT** authenticate properly. The system is effectively non-functional for regular users.

### What Still Works:
- ✅ Admin can authenticate (but with no credentials)
- ✅ Auto-groups daemon can assign users to groups
- ✅ GraphDB contains correct data
- ✅ Direct SPARQL queries work

### What Doesn't Work:
- ❌ Users cannot access UI (blank page)
- ❌ JWT tokens have no credentials
- ❌ Groups/Profiles management via UI
- ❌ Any authenticated API calls

## Next Steps

1. **URGENT:** Patch GroupDAO.java and rebuild OpenSILEX
2. Deploy patched JAR to production
3. Verify JWT tokens now contain credentials
4. Test user authentication and UI access
5. Consider reporting this bug to OpenSILEX project

## Alternative: Use Older OpenSILEX Version

If fixing the source is not feasible, consider:
- Downgrading to an older OpenSILEX version where GroupDAO works
- Checking if a newer version (> 1.4.9-rdg) has fixed this bug
- Contacting OpenSILEX maintainers for a hotfix

## Contact

- **Bug Reporter:** Sebastian T. Iversen
- **System:** PHIS-TEST (172.211.86.191)
- **Date Discovered:** 2026-01-15
- **OpenSILEX Version:** 1.4.9-rdg

---

**This is a blocking issue that prevents the system from being usable.**
