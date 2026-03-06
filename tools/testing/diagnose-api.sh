#!/bin/bash
#
# Diagnostic script to investigate API test failures
#

API_URL="http://20.61.108.197/sandbox/rest"

echo "Getting auth token..."
TOKEN=$(curl -s "$API_URL/security/authenticate" -X POST -H "Content-Type: application/json" -d '{"identifier":"admin@opensilex.org","password":"admin"}' | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

echo "Token obtained: ${TOKEN:0:50}..."
echo ""

# Test 1: Create a test project
echo "=== Test 1: Creating test project ==="
PROJECT_RESPONSE=$(curl -s "$API_URL/core/projects" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "diagnostic_test_project",
    "shortname": "diag_test",
    "start_date": "2024-01-01",
    "end_date": "2024-12-31"
  }')

echo "Response:"
echo "$PROJECT_RESPONSE" | head -20
echo ""

PROJECT_URI=$(echo "$PROJECT_RESPONSE" | sed -n 's/.*"result"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
echo "Project URI: $PROJECT_URI"
echo ""

# Test 2: Try to search for the project by name
echo "=== Test 2: Search project by name ==="
echo "Trying parameter 'name':"
curl -s "$API_URL/core/projects?name=diagnostic" \
  -H "Authorization: Bearer $TOKEN" | head -30
echo ""

echo "Trying parameter 'pattern':"
curl -s "$API_URL/core/projects?pattern=diagnostic" \
  -H "Authorization: Bearer $TOKEN" | head -30
echo ""

# Test 3: Try to get non-existent project
echo "=== Test 3: Get non-existent project ==="
FAKE_URI="http://opensilex.test/nonexistent/12345"
ENCODED_URI=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$FAKE_URI', safe=''))" 2>/dev/null || echo "ENCODING_FAILED")

if [ "$ENCODED_URI" != "ENCODING_FAILED" ]; then
  echo "Testing with URI: $FAKE_URI"
  RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$API_URL/core/projects/$ENCODED_URI" \
    -H "Authorization: Bearer $TOKEN")
  echo "$RESPONSE"
else
  echo "Could not encode URI (Python not available)"
fi
echo ""

# Test 4: Try to delete the test project
echo "=== Test 4: Delete project and check status ==="
if [ -n "$PROJECT_URI" ]; then
  ENCODED_PROJECT=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$PROJECT_URI', safe=''))" 2>/dev/null || echo "$PROJECT_URI")

  echo "Deleting project: $PROJECT_URI"
  DELETE_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X DELETE \
    "$API_URL/core/projects/$ENCODED_PROJECT" \
    -H "Authorization: Bearer $TOKEN")
  echo "$DELETE_RESPONSE"
  echo ""

  echo "Trying to get deleted project:"
  GET_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    "$API_URL/core/projects/$ENCODED_PROJECT" \
    -H "Authorization: Bearer $TOKEN")
  echo "$GET_RESPONSE"
fi
echo ""

# Test 5: Try invalid date range
echo "=== Test 5: Create project with invalid dates ==="
INVALID_RESPONSE=$(curl -s "$API_URL/core/projects" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "invalid_date_test",
    "shortname": "inv_test",
    "start_date": "2024-12-31",
    "end_date": "2024-01-01"
  }')

echo "Response:"
echo "$INVALID_RESPONSE" | head -30
