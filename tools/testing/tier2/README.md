# Tier 2: Comprehensive API Testing

Comprehensive pytest-based test suite for OpenSILEX with 80+ test cases covering all major API endpoints and scientific workflows.

## Test Coverage

### API Tests (`api-tests/`)

| Module | Test File | Test Cases | Coverage |
|--------|-----------|------------|----------|
| **Projects** | test_projects.py | 25+ | CRUD, search, validation, performance |
| **Experiments** | test_experiments.py | 30+ | Lifecycle, project linking, dates |
| **Devices** | test_devices.py | 8+ | Registration, configuration |
| **Data** | test_data.py | 8+ | Query, filtering, pagination |
| **Variables** | test_variables.py | 6+ | Listing, search, filtering |

**Total: 80+ API test cases**

### Integration Tests (`integration-tests/`)

- **test_experiment_workflow.py** - End-to-end scientific workflow
  - Create project → experiment → devices → data → query

### Test Infrastructure

- **conftest.py** - Pytest configuration with reusable fixtures
  - Authenticated API client
  - Test data generators
  - Cleanup tracking
  - Custom markers (smoke, integration)

---

## Quick Start

### 1. Install Dependencies

```bash
# From tools/testing directory
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
# Load your server configuration
cd tier2
source ../test-config.env
```

### 3. Run All Tests

```bash
bash run-tier2-tests.sh
```

This will:
- Run all 80+ API tests
- Generate HTML report (`api-tests/report.html`)
- Display summary with pass/fail counts

---

## Running Specific Tests

### Run Only Smoke Tests (Fast)

```bash
cd api-tests
pytest -m smoke -v
```

### Run Specific Module

```bash
# Only project tests
pytest test_projects.py -v

# Only experiment tests
pytest test_experiments.py -v
```

### Run Integration Tests

```bash
cd integration-tests
pytest test_experiment_workflow.py -v
```

### Run With Different Verbosity

```bash
# Verbose output
pytest -v

# Very verbose (show print statements)
pytest -vv -s

# Quiet (only summary)
pytest -q
```

---

## Test Markers

Tests are organized with pytest markers:

- `@pytest.mark.smoke` - Quick validation tests (list, get operations)
- `@pytest.mark.integration` - End-to-end workflow tests (slower)
- `@pytest.mark.regression` - Regression protection tests

Run specific markers:
```bash
pytest -m smoke           # Only smoke tests
pytest -m integration     # Only integration tests
pytest -m "not integration"  # Skip slow tests
```

---

## HTML Reports

Every test run generates an HTML report with:
- Test results (passed/failed/skipped)
- Execution time per test
- Error details and stack traces
- Summary statistics

Open in browser:
```bash
# On Windows
start api-tests/report.html

# On Linux
xdg-open api-tests/report.html

# On Mac
open api-tests/report.html
```

---

## Test Data Management

### Automatic Cleanup

Tests automatically clean up created entities (projects, experiments, devices) after execution.

Configure cleanup behavior:
```bash
# Enable cleanup (default)
export OPENSILEX_CLEANUP_TEST_DATA=true

# Disable cleanup (for debugging)
export OPENSILEX_CLEANUP_TEST_DATA=false
```

### Test Entity Naming

All test entities use a unique prefix to avoid conflicts:
```bash
export OPENSILEX_TEST_PREFIX="test_automated_"
```

Test entities are named: `test_automated_1709876543210_project`

---

## Troubleshooting

### Tests Fail with "Authentication failed"

```bash
# Verify your credentials in test-config.env
echo $OPENSILEX_ADMIN_EMAIL
echo $OPENSILEX_ADMIN_PASSWORD

# Test authentication manually
curl -X POST "http://YOUR_SERVER/sandbox/rest/security/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"admin@opensilex.org","password":"admin"}'
```

### Tests Fail with Connection Errors

```bash
# Check server is accessible
curl -s "http://YOUR_SERVER/sandbox/rest/security/groups"

# Verify API URL in config
echo $OPENSILEX_API_URL
```

### Missing Python Modules

```bash
# Install all dependencies
pip install -r ../requirements.txt

# Or install individually
pip install pytest pytest-html requests
```

### Tests Timeout

```bash
# Increase timeout in test-config.env
export OPENSILEX_API_TIMEOUT=60  # seconds
```

---

## Writing New Tests

### 1. Create Test File

```python
# tier2/api-tests/test_mymodule.py

import pytest

class TestMyModuleAPI:
    @pytest.fixture(autouse=True)
    def setup(self, api_client):
        self.client = api_client

    def test_my_feature(self):
        response = self.client.get("/my/endpoint")
        assert response.status_code == 200
```

### 2. Use Fixtures

Available fixtures (from conftest.py):
- `api_client` - Authenticated HTTP client
- `admin_token` - JWT token string
- `unique_id` - Unique timestamp ID
- `test_project_data` - Sample project data
- `test_experiment_data` - Sample experiment data
- `test_device_data` - Sample device data

### 3. Add Cleanup

```python
def teardown_method(self):
    """Clean up after each test"""
    for uri in self.created_items:
        self.client.delete(f"/endpoint/{uri}")
```

---

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/tier2-tests.yml`:

```yaml
name: Tier 2 API Tests

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM

jobs:
  api-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install -r tools/testing/requirements.txt

      - name: Run Tier 2 tests
        env:
          OPENSILEX_API_URL: ${{ secrets.OPENSILEX_API_URL }}
          OPENSILEX_ADMIN_PASSWORD: ${{ secrets.ADMIN_PASSWORD }}
        run: |
          cd tools/testing/tier2
          bash run-tier2-tests.sh

      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: tier2-test-results
          path: tools/testing/tier2/api-tests/report.html
```

---

## Performance Expectations

**Tier 2 test suite:**
- **Total tests:** 80+
- **Execution time:** ~5-10 minutes (depends on server)
- **Smoke tests only:** ~1-2 minutes
- **Integration tests:** ~2-3 minutes

**Individual test performance:**
- List operations: <1s
- Create operations: <2s
- Update operations: <2s
- Delete operations: <1s

---

## Next Steps

After Tier 2 tests pass:

1. **Review HTML report** - Identify any failing tests
2. **Fix failures** - Address API issues or adjust tests
3. **Run regularly** - Weekly or after deployments
4. **Move to Tier 3** - Add performance testing, security validation, CI/CD

---

## Test Results Interpretation

### All Tests Pass ✅
- API is functioning correctly
- Scientific workflows work end-to-end
- Safe to deploy/use in production

### Some Tests Fail ⚠️
- Review `report.html` for details
- Check if failures are:
  - Configuration issues (wrong URLs, credentials)
  - Version differences (endpoint not available in 1.4.7)
  - Actual bugs (report to OpenSILEX team)

### Tests Timeout ⏱️
- Server may be slow or overloaded
- Network connectivity issues
- Increase `OPENSILEX_API_TIMEOUT`

---

## Support

For issues:
1. Check `report.html` for error details
2. Review `../BASELINE_RESULTS.md` for known issues
3. Verify configuration in `../test-config.env`
4. Open issue on GitHub with test output
