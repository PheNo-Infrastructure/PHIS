# OpenSILEX Testing Suite

Comprehensive testing infrastructure for OpenSILEX deployment validation.

## Directory Structure

```
tools/testing/
├── tier1/                      # Essential smoke tests (15 min)
│   ├── test-docker-health.sh
│   ├── test-api-smoke.sh
│   ├── test-core-workflows.py
│   ├── test-data-integrity.py
│   └── run-all-tests.sh
├── tier2/                      # Comprehensive API tests (30 min)
│   ├── api-tests/              # 200+ pytest test cases
│   ├── integration-tests/      # End-to-end workflows
│   └── regression-tests/       # Regression validation
├── tier3/                      # Rigorous testing (continuous)
│   ├── performance-tests/      # Load testing with Locust
│   ├── security-tests/         # OWASP validation
│   ├── database-tests/         # Deep integrity checks
│   ├── github-workflow-example.yml  # CI/CD template
│   ├── run-tier3-tests.sh      # Master test runner
│   └── README.md               # Tier 3 documentation
├── test-config.env             # Your server configuration
├── test-config.env.example     # Template for new servers
├── requirements.txt            # Python dependencies (Tier 1-2)
├── requirements-tier3.txt      # Additional deps for Tier 3
└── README.md                   # This file
```

## Quick Start

### 1. Configure Your Environment

```bash
cd tools/testing

# Copy the example configuration
cp test-config.env.example test-config.env

# Edit with your server details
nano test-config.env
```

Update these key settings in `test-config.env`:
- `OPENSILEX_SERVER` - Your server IP/hostname
- `OPENSILEX_USER` - SSH username
- `OPENSILEX_SSH_KEY` - Path to your SSH key
- `OPENSILEX_BASE_URL` - Your OpenSILEX URL
- `OPENSILEX_ADMIN_PASSWORD` - Admin password (if changed from default)

### 2. Run Tests

**Tier 1 (Essential - 15 minutes):**
```bash
cd tier1
source ../test-config.env

# Run all Tier 1 smoke tests
bash run-all-tests.sh

# Or run individually
bash test-docker-health.sh
bash test-api-smoke.sh
```

**Tier 2 (Comprehensive - 30 minutes):**
```bash
cd tier2/api-tests
source ../../test-config.env

# Run all API tests with HTML report
pytest --html=report.html --self-contained-html -v
```

**Tier 3 (Rigorous - continuous):**
```bash
cd tier3
source ../test-config.env

# Run all Tier 3 tests (performance, security, database integrity)
bash run-tier3-tests.sh

# Or run individual test suites
cd performance-tests && pytest test_api_benchmarks.py -v
cd security-tests && pytest test_authorization.py test_jwt_security.py -v
cd database-tests && bash test-mongodb-integrity.sh && bash test-rdf4j-integrity.sh
```

---

## Test Tiers

### Tier 1: Essential (Smoke Tests)

**Purpose:** Quick validation of critical functionality
**Time:** ~15 minutes
**When:** After deployments, weekly manual runs

**Tests included:**
1. **test-docker-health.sh** - Container health and service availability
2. **test-api-smoke.sh** - API endpoint availability
3. **test-core-workflows.py** - Basic CRUD operations (experiments, devices, data)
4. **test-data-integrity.py** - Database consistency validation

### Tier 2: Standard (Comprehensive API Testing)

**Purpose:** Full API validation and integration testing
**Time:** ~30 minutes
**When:** Before releases, daily automated runs

**Tests included:**
- 200+ API test cases across all modules
- End-to-end workflow testing
- Regression test suite
- HTML test reports

### Tier 3: Rigorous (Enterprise Testing)

**Purpose:** Production-ready continuous testing
**Time:** ~20-25 minutes per manual run, or continuous via CI/CD
**When:** Automated on every push, scheduled daily, or manual after major changes

**Tests included:**
- **Performance benchmarks:** API response time tracking (p50, p95, p99 percentiles)
- **Load testing:** Locust-based concurrent user simulation (50-100 users)
- **Security validation:**
  - Authorization and RBAC tests
  - JWT token security (expiration, tampering, refresh)
  - Input validation (SQL injection, XSS prevention)
  - Brute force protection
- **Database integrity:**
  - MongoDB orphaned record detection
  - RDF4J triplestore consistency
  - Cross-database synchronization validation
  - SPARQL query validation
- **CI/CD automation:** GitHub Actions workflow template for automated testing

**Test files:**
- `performance-tests/locust_opensilex.py` - Load testing scenarios
- `performance-tests/test_api_benchmarks.py` - Response time benchmarks
- `security-tests/test_authorization.py` - RBAC and access control
- `security-tests/test_jwt_security.py` - JWT token security
- `database-tests/test-mongodb-integrity.sh` - MongoDB validation
- `database-tests/test-rdf4j-integrity.sh` - RDF4J validation
- `database-tests/test_cross_db_consistency.py` - Cross-DB sync
- `github-workflow-example.yml` - CI/CD template

---

## Deploying Tests to a New Server

### Prerequisites

1. **SSH access** to the target server
2. **SSH key** configured for passwordless access
3. **Python 3.8+** on your local machine (for Python tests)
4. **Git** to clone this repository

### Setup Steps

```bash
# 1. Clone the repository on your local machine
git clone https://github.com/lversen/PHIS.git
cd PHIS/tools/testing

# 2. Copy and configure test settings
cp test-config.env.example test-config.env

# 3. Edit test-config.env with your new server details
# Example for a new server:
export OPENSILEX_SERVER="new-server.example.com"
export OPENSILEX_USER="admin"
export OPENSILEX_SSH_KEY="$HOME/.ssh/new_server_key"
export OPENSILEX_BASE_URL="http://new-server.example.com/opensilex"
# ... etc

# 4. Verify SSH connectivity
source test-config.env
ssh -i $OPENSILEX_SSH_KEY $OPENSILEX_USER@$OPENSILEX_SERVER "echo 'SSH OK'"

# 5. Install Python dependencies (for Python tests)
pip install -r requirements.txt

# 6. Run tests
bash test-docker-health.sh
```

### Configuration for Different Deployment Types

#### Local Docker Deployment (same machine)
```bash
export OPENSILEX_TEST_MODE="local"
export OPENSILEX_BASE_URL="http://localhost:8080/sandbox"
export OPENSILEX_DEPLOY_DIR="$PWD/opensilex-docker-compose"
```

#### Remote Server (SSH required)
```bash
export OPENSILEX_TEST_MODE="remote"
export OPENSILEX_SERVER="your-server.com"
export OPENSILEX_SSH_KEY="$HOME/.ssh/id_rsa"
```

#### Cloud Deployment (Azure, AWS, etc.)
```bash
export OPENSILEX_SERVER="20.30.40.50"  # Public IP
export OPENSILEX_SSH_KEY="$HOME/.ssh/cloud_key.pem"
export OPENSILEX_BASE_URL="https://opensilex.yourdomain.com"
```

---

## Test Details

### test-docker-health.sh

**Tests:**
1. SSH connectivity to server
2. Docker and Docker Compose availability
3. All containers running (mongodb, rdf4j, opensilex, haproxy)
4. MongoDB ping response
5. RDF4J repositories endpoint accessible
6. OpenSILEX core ping endpoint responds
7. Web UI accessible (HTTP 200)
8. REST API accessible
9. MongoDB data volume mounted
10. RDF4J data volume mounted

**Expected output:**
```
========================================
OpenSILEX Docker Health Check Test
Server: 20.61.108.197
========================================

=== 1. Container Status Tests ===

Testing: SSH connectivity to server ... PASS
Testing: Docker Compose availability ... PASS
Testing: All containers running ... PASS

...

========================================
Test Summary
========================================
Tests passed: 10
Tests failed: 0

✓ All Docker health checks passed!
```

### test-api-smoke.sh

**Tests:**
- Authentication endpoint (`/rest/security/authenticate`)
- Core endpoints (`/rest/core/ping`, `/rest/core/groups`)
- All major module endpoints (experiments, devices, data, etc.)
- JWT token validation
- Response time < 5 seconds

### test-core-workflows.py

**Tests:**
- Create project → verify created
- Create experiment → verify created
- Register device → verify registered
- Upload data → verify stored
- Query data → verify retrievable
- Delete test entities → verify cleanup

### test-data-integrity.py

**Tests:**
- MongoDB: No orphaned data records
- MongoDB: All experiments have valid projects
- RDF4J: No variables without ontology links
- RDF4J: No orphaned experimental data
- Cross-database: MongoDB and RDF4J URIs match

---

## Troubleshooting

### SSH Connection Fails

```bash
# Check SSH key permissions
chmod 600 $OPENSILEX_SSH_KEY

# Test manual SSH
ssh -i $OPENSILEX_SSH_KEY $OPENSILEX_USER@$OPENSILEX_SERVER

# Add StrictHostKeyChecking=no for first connection
ssh -o StrictHostKeyChecking=no -i $OPENSILEX_SSH_KEY $OPENSILEX_USER@$OPENSILEX_SERVER
```

### Tests Fail with "Container not running"

```bash
# Check container status on server
source test-config.env
ssh -i $OPENSILEX_SSH_KEY $OPENSILEX_USER@$OPENSILEX_SERVER \
  "cd $OPENSILEX_DEPLOY_DIR && docker compose ps"

# Restart containers if needed
ssh -i $OPENSILEX_SSH_KEY $OPENSILEX_USER@$OPENSILEX_SERVER \
  "cd $OPENSILEX_DEPLOY_DIR && docker compose restart"
```

### API Tests Fail with Authentication Error

```bash
# Verify admin credentials in test-config.env
echo "Testing auth with: $OPENSILEX_ADMIN_EMAIL"

# Test authentication manually
curl -X POST "$OPENSILEX_API_URL/security/authenticate" \
  -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$OPENSILEX_ADMIN_EMAIL\",\"password\":\"$OPENSILEX_ADMIN_PASSWORD\"}"
```

### Python Tests Fail with Import Errors

```bash
# Install Python dependencies
pip install requests pytest pytest-html

# Or use requirements.txt
pip install -r requirements.txt
```

---

## Integration with CI/CD

### GitHub Actions Example

Create `.github/workflows/test-opensilex.yml`:

```yaml
name: OpenSILEX Tests

on:
  push:
    branches: [main, docker-compose-official]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM

jobs:
  smoke-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Configure tests
        run: |
          cd tools/testing
          cp test-config.env.example test-config.env
          sed -i "s/OPENSILEX_SERVER=.*/OPENSILEX_SERVER=${{ secrets.SERVER_IP }}/" test-config.env
          sed -i "s/OPENSILEX_ADMIN_PASSWORD=.*/OPENSILEX_ADMIN_PASSWORD=${{ secrets.ADMIN_PASSWORD }}/" test-config.env

      - name: Setup SSH key
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519

      - name: Run smoke tests
        run: |
          cd tools/testing
          source test-config.env
          bash test-docker-health.sh
          bash test-api-smoke.sh
```

Add these secrets to your GitHub repository:
- `SERVER_IP` - Your OpenSILEX server IP
- `SSH_PRIVATE_KEY` - SSH private key for server access
- `ADMIN_PASSWORD` - OpenSILEX admin password

---

## Test Development

### Adding New Tests

1. **Bash scripts:** Use `test-docker-health.sh` as template
2. **Python tests:** Use `test-core-workflows.py` as template
3. **Always:** Load configuration from environment variables
4. **Document:** Add test description to this README

### Test Naming Convention

- `test-*.sh` - Bash scripts
- `test_*.py` - Python pytest files
- `*_test.py` - Alternative Python test files

### Best Practices

1. **Use environment variables** from `test-config.env`
2. **Provide clear output** with pass/fail status
3. **Exit code 0 on success**, non-zero on failure
4. **Clean up test data** after tests complete
5. **Document expected outcomes** in comments
6. **Handle timeouts gracefully** with configurable values

---

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review test output for error details
3. Verify configuration in `test-config.env`
4. Check OpenSILEX logs: `docker compose logs -f opensilex`
5. Open an issue on GitHub with test output

---

## Test Coverage Status

✅ **Completed:**
- [x] Tier 1: Essential smoke tests - 23 tests, 100% pass rate
- [x] Tier 2: Comprehensive API tests - 47 tests (43 passed, 4 skipped)
- [x] Tier 2: Integration workflow tests
- [x] Tier 3: Performance benchmarking with pytest
- [x] Tier 3: Load testing with Locust
- [x] Tier 3: Security validation (authorization, JWT)
- [x] Tier 3: Database integrity checks (MongoDB + RDF4J)
- [x] Tier 3: CI/CD GitHub Actions workflow template

⏳ **Optional Future Work:**
- [ ] Source code testing: Maven/JUnit integration (Week 4+)
- [ ] Performance baseline tracking over time
- [ ] Additional security tests (penetration testing, OWASP Top 10)
- [ ] Multi-user concurrent access testing
