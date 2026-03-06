# Tier 3: Rigorous Testing & Validation

Enterprise-grade testing suite with performance benchmarking, security validation, data integrity checks, and CI/CD automation.

## Test Coverage

### Performance Tests (`performance-tests/`)

| Test Suite | Tool | Focus |
|------------|------|-------|
| **Load Testing** | Locust | 50-100 concurrent users |
| **API Benchmarks** | pytest | Response time tracking (p50, p95, p99) |
| **Stress Testing** | Locust | Peak load capacity |

### Security Tests (`security-tests/`)

| Test File | Coverage |
|-----------|----------|
| test_authorization.py | RBAC validation, unauthorized access |
| test_jwt_security.py | Token expiry, refresh, invalidation |
| test_api_security.py | Input validation, injection prevention |

### Database Integrity (`database-tests/`)

| Test Script | Database | Validation |
|-------------|----------|------------|
| test-mongodb-integrity.sh | MongoDB | Orphaned records, referential integrity |
| test-rdf4j-integrity.sh | RDF4J | SPARQL data consistency |
| test-cross-db-consistency.py | Both | MongoDB ↔ RDF4J synchronization |

---

## Quick Start

### 1. Install Additional Dependencies

```bash
# From tools/testing directory
pip install -r requirements-tier3.txt
```

### 2. Configure Environment

```bash
# Load server configuration
cd tier3
source ../test-config.env
```

### 3. Run All Tier 3 Tests

```bash
bash run-tier3-tests.sh
```

This will:
- Run performance benchmarks and generate baseline metrics
- Execute security validation tests
- Validate database integrity across MongoDB and RDF4J
- Generate comprehensive HTML reports

---

## Performance Testing

### Load Testing with Locust

Simulates realistic scientific user behavior:

```bash
cd performance-tests
locust -f locust_opensilex.py --host http://20.61.108.197
```

**Test scenarios:**
- User authentication (login/logout)
- Experiment creation and modification
- Data upload (CSV/JSON)
- Data queries (by experiment, variable, time range)
- Device management operations

**Performance targets:**
- API response time p95 < 500ms
- Data upload (10KB) < 1s
- Query results (100 records) < 2s
- Concurrent users: 50+ without degradation
- Error rate < 1%

**Output:** HTML report at `performance-tests/locust-report.html`

---

### API Benchmarks

Run pytest with timing analysis:

```bash
cd performance-tests
pytest test_api_benchmarks.py -v --benchmark-only
```

**Tracked metrics:**
- Authentication endpoint latency
- CRUD operation response times
- Search query performance
- Pagination overhead
- Data export performance

**Output:** CSV file at `performance-tests/benchmark-results.csv`

---

## Security Testing

### Authorization Validation

Tests RBAC (Role-Based Access Control):

```bash
cd security-tests
pytest test_authorization.py -v
```

**Test cases:**
- Unauthorized access to protected endpoints (expect 401/403)
- Cross-user data access (user A cannot access user B's experiments)
- Admin-only operations (group management, user creation)
- Guest/public access limitations

---

### JWT Security

Tests authentication token security:

```bash
pytest test_jwt_security.py -v
```

**Test cases:**
- Token expiration enforcement
- Token refresh mechanism
- Invalid token rejection
- Token revocation
- Token tampering detection

---

### API Security

Tests input validation and security best practices:

```bash
pytest test_api_security.py -v
```

**Test cases:**
- SQL injection attempts (should be blocked)
- XSS payload rejection
- Large payload handling (prevent DoS)
- Special character sanitization
- File upload validation

---

## Database Integrity Testing

### MongoDB Integrity

Validates referential integrity in MongoDB:

```bash
cd database-tests
bash test-mongodb-integrity.sh
```

**Validations:**
- No orphaned data records (data without valid experiment reference)
- No orphaned devices (devices without valid project/experiment links)
- No missing foreign keys
- Collection statistics and health

**Output:** Text report with findings and counts

---

### RDF4J Integrity

Validates semantic triplestore consistency:

```bash
bash test-rdf4j-integrity.sh
```

**SPARQL validations:**
- Variables have ontology references
- No orphaned experimental data
- No broken URI references
- Ontology consistency

**Output:** Text report with SPARQL query results

---

### Cross-Database Consistency

Validates MongoDB ↔ RDF4J synchronization:

```bash
pytest test_cross_db_consistency.py -v
```

**Consistency checks:**
- Experiment URIs exist in both databases
- Variable definitions match across systems
- Data counts consistent between MongoDB and RDF4J
- No synchronization lag or missing records

---

## CI/CD Integration

### GitHub Actions Workflow

Automated testing on every push and daily schedule:

**Location:** `.github/workflows/tier3-tests.yml`

**Triggers:**
- Every push to main/production branches
- Daily at 2 AM (scheduled)
- Manual trigger via GitHub UI

**Actions:**
- Run all API tests (Tier 2)
- Run performance benchmarks
- Run security validation
- Run database integrity checks
- Upload test artifacts
- Post summary to PR comments

**Setup:**

```bash
# Create workflow file
mkdir -p .github/workflows
cp tools/testing/tier3/github-workflow-example.yml .github/workflows/tier3-tests.yml

# Configure GitHub secrets
gh secret set OPENSILEX_API_URL --body "http://20.61.108.197/sandbox/rest"
gh secret set OPENSILEX_ADMIN_PASSWORD --body "your_password"
```

---

## Performance Baselines

After first Tier 3 run, establish baseline metrics:

**Response Time Baselines (1.4.7 on Azure):**

| Endpoint | p50 | p95 | p99 |
|----------|-----|-----|-----|
| POST /security/authenticate | TBD | TBD | TBD |
| GET /core/projects | TBD | TBD | TBD |
| POST /core/projects | TBD | TBD | TBD |
| GET /core/experiments | TBD | TBD | TBD |
| POST /core/experiments | TBD | TBD | TBD |
| GET /core/devices | TBD | TBD | TBD |
| POST /core/data | TBD | TBD | TBD |
| GET /core/data | TBD | TBD | TBD |

Update these baselines after first run.

**Database Size Baselines:**

| Metric | Value |
|--------|-------|
| MongoDB size | TBD |
| RDF4J triples count | TBD |
| Projects count | TBD |
| Experiments count | TBD |
| Devices count | TBD |
| Data records count | TBD |

---

## Test Execution Timeline

**Full Tier 3 test suite:**
- Performance tests: ~10-15 minutes
- Security tests: ~5 minutes
- Database integrity: ~5 minutes
- **Total:** ~20-25 minutes per run

**Recommended schedule:**
- After each deployment: Full suite
- Daily: Tier 2 + security tests
- Weekly: Full Tier 3 with performance baselines

---

## Interpreting Results

### All Tests Pass ✅
- Platform is production-ready
- Performance within acceptable range
- No security vulnerabilities detected
- Data integrity validated

### Performance Degradation ⚠️
- Response times exceed baselines by >20%
- May indicate:
  - Database indexes need optimization
  - Memory/CPU constraints
  - Network latency issues
  - Query optimization needed

### Security Failures 🔴
- CRITICAL: Investigate immediately
- May indicate:
  - Authorization bypass vulnerabilities
  - Token validation issues
  - Input validation gaps

### Integrity Failures 🔴
- CRITICAL: Data corruption detected
- May indicate:
  - MongoDB ↔ RDF4J sync issues
  - Orphaned records from failed operations
  - Transaction rollback problems

---

## Troubleshooting

### Locust Installation Fails

```bash
# Install with specific version
pip install locust==2.15.1

# Or use conda
conda install -c conda-forge locust
```

### Performance Tests Timeout

```bash
# Increase Locust wait time
locust -f locustfile.py --host http://YOUR_SERVER --run-time 10m
```

### Database Access Issues

```bash
# Verify MongoDB connection
docker compose --env-file ~/opensilex-docker-compose/opensilex.env exec mongo mongosh --eval "db.adminCommand('ping')"

# Verify RDF4J connection
curl -s http://20.61.108.197:8080/rdf4j-server/repositories
```

---

## Next Steps

After Tier 3 implementation:

1. **Establish baselines** - Run full suite to capture initial performance metrics
2. **Schedule automation** - Set up GitHub Actions for continuous testing
3. **Monitor trends** - Track performance over time
4. **Iterate** - Add tests for new features as platform evolves

---

## Support

For issues:
1. Check HTML reports for detailed error messages
2. Review performance baselines in `BASELINE_RESULTS.md`
3. Verify Docker containers are healthy (`docker compose ps`)
4. Check database connections and sizes
5. Open GitHub issue with test output and environment details
