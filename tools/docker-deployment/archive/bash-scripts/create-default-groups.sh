#!/bin/bash
# Create default Users group and Default User profile for OpenSILEX
# These are required by the auto-group assignment patch

set -e

OPENSILEX_ADMIN_EMAIL="${1:-admin@opensilex.org}"
OPENSILEX_ADMIN_PASSWORD="${2:-admin}"
OPENSILEX_URL="${3:-http://localhost:28081/sandbox}"

echo "Creating default Users group and Default User profile..."
echo "Admin: $OPENSILEX_ADMIN_EMAIL"
echo "URL: $OPENSILEX_URL"
echo ""

# Authenticate as admin
echo "[1/3] Authenticating as admin..."
TOKEN=$(curl -s -X POST "$OPENSILEX_URL/rest/security/authenticate" \
  -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$OPENSILEX_ADMIN_EMAIL\",\"password\":\"$OPENSILEX_ADMIN_PASSWORD\"}" | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Failed to authenticate. Check credentials."
  exit 1
fi

echo "✓ Authenticated"
echo ""

# Create Default User profile (if it doesn't exist)
echo "[2/3] Creating Default User profile..."
PROFILE_RESPONSE=$(curl -s -X POST "$OPENSILEX_URL/rest/security/profiles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "uri": "http://opensilex.org/profiles/default",
    "name": "Default User",
    "credentials": []
  }')

if echo "$PROFILE_RESPONSE" | grep -q "uri"; then
  echo "✓ Profile created or already exists"
else
  echo "Response: $PROFILE_RESPONSE"
fi

echo ""

# Create Users group (if it doesn't exist)
echo "[3/3] Creating Users group..."
GROUP_RESPONSE=$(curl -s -X POST "$OPENSILEX_URL/rest/core/groups" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "uri": "http://opensilex.org/groups/users",
    "name": "Users",
    "description": "Default group for all users",
    "user_profiles": []
  }')

if echo "$GROUP_RESPONSE" | grep -q "uri"; then
  echo "✓ Group created or already exists"
else
  echo "Response: $GROUP_RESPONSE"
fi

echo ""
echo "=== Complete ==="
echo ""
echo "Default entities created:"
echo "  - Profile: http://opensilex.org/profiles/default"
echo "  - Group: http://opensilex.org/groups/users"
echo ""
echo "New Feide users will now be auto-assigned to the Users group."
