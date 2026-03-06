# GitHub Actions CI/CD Setup Guide

Step-by-step guide to enable automated testing for your OpenSILEX deployment.

---

## Prerequisites

✅ GitHub repository: https://github.com/lversen/PHIS
✅ GitHub Actions workflow created: `.github/workflows/opensilex-testing.yml`
✅ SSH access to server: azureuser@20.61.108.197
✅ Admin access to GitHub repository settings

---

## Step 1: Configure GitHub Secrets

GitHub Actions needs secure access to your server and OpenSILEX API. You'll add these as encrypted secrets.

### Navigate to Repository Secrets

1. Go to: https://github.com/lversen/PHIS
2. Click **Settings** (top menu)
3. In left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret** button

### Add Required Secrets

You need to add **4 secrets**:

---

#### Secret 1: `OPENSILEX_API_URL`

**Value:** `http://20.61.108.197/sandbox/rest`

**Steps:**
1. Click "New repository secret"
2. Name: `OPENSILEX_API_URL`
3. Value: `http://20.61.108.197/sandbox/rest`
4. Click "Add secret"

---

#### Secret 2: `OPENSILEX_ADMIN_PASSWORD`

**Value:** Your OpenSILEX admin password (default: `admin`)

**Steps:**
1. Click "New repository secret"
2. Name: `OPENSILEX_ADMIN_PASSWORD`
3. Value: `admin` (or your actual admin password if changed)
4. Click "Add secret"

**Security note:** GitHub encrypts all secrets. They're never visible in logs or to other users.

---

#### Secret 3: `OPENSILEX_SERVER`

**Value:** `20.61.108.197`

**Steps:**
1. Click "New repository secret"
2. Name: `OPENSILEX_SERVER`
3. Value: `20.61.108.197`
4. Click "Add secret"

---

#### Secret 4: `SSH_PRIVATE_KEY`

**Value:** Your SSH private key content (from `~/.ssh/id_ed25519`)

**⚠️ IMPORTANT:** This is your SSH private key. Handle carefully!

**How to get your SSH private key:**

**On Windows (Git Bash or WSL):**
```bash
cat ~/.ssh/id_ed25519
```

**On PowerShell:**
```powershell
Get-Content $HOME\.ssh\id_ed25519 | Out-String
```

**Copy the ENTIRE output**, including:
- The `-----BEGIN OPENSSH PRIVATE KEY-----` line
- All the key content
- The `-----END OPENSSH PRIVATE KEY-----` line

**Steps:**
1. Click "New repository secret"
2. Name: `SSH_PRIVATE_KEY`
3. Value: Paste the entire SSH private key (including BEGIN/END lines)
4. Click "Add secret"

**Example format:**
```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACBvZ... (many lines)
...X1NzaC1rZXktdjEAAAAA
-----END OPENSSH PRIVATE KEY-----
```

---

## Step 2: Verify Secrets Configuration

After adding all 4 secrets, verify:

1. Go back to: https://github.com/lversen/PHIS/settings/secrets/actions
2. You should see:
   - ✅ `OPENSILEX_API_URL`
   - ✅ `OPENSILEX_ADMIN_PASSWORD`
   - ✅ `OPENSILEX_SERVER`
   - ✅ `SSH_PRIVATE_KEY`

**Note:** Secret values are hidden after creation. You can update but not view them.

---

## Step 3: Commit and Push Workflow

Now commit the workflow file to GitHub:

```bash
cd c:\Users\siv017\Documents\GitHub\PHIS

# Check what will be committed
git status

# Add the workflow file
git add .github/workflows/opensilex-testing.yml

# Commit
git commit -m "Enable CI/CD automated testing with GitHub Actions

- Run 120+ tests on every push
- Daily scheduled health checks at 2 AM UTC
- Performance benchmarking and tracking
- Security validation (authorization, JWT)
- Database integrity checks (MongoDB + RDF4J)
- Automatic issue creation on scheduled test failures

Tests covered:
- Tier 2: 80+ comprehensive API tests
- Tier 3: Performance, security, database validation

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push to GitHub
git push origin docker-compose-official
```

---

## Step 4: Monitor First Workflow Run

After pushing, GitHub Actions will automatically start:

### View Workflow Run

1. Go to: https://github.com/lversen/PHIS/actions
2. You'll see "OpenSILEX Testing Suite" workflow running
3. Click on the workflow run to see details

### What You'll See

```
OpenSILEX Testing Suite #1
Triggered by: push (docker-compose-official)

Jobs:
  🔵 Tier 2 - Comprehensive API Tests (running)
  ⏳ Tier 3 - Performance Benchmarks (waiting)
  ⏳ Tier 3 - Security Validation (waiting)
  ⏳ Tier 3 - Database Integrity (waiting)
  ⏳ Test Summary & Notifications (waiting)
```

After completion (5-10 minutes):
```
  ✅ Tier 2 - Comprehensive API Tests (1m 45s)
  ✅ Tier 3 - Performance Benchmarks (2m 30s)
  ✅ Tier 3 - Security Validation (1m 20s)
  ✅ Tier 3 - Database Integrity (3m 15s)
  ✅ Test Summary & Notifications (5s)

Overall: ✅ Success
```

### Download Test Reports

1. Scroll down to **Artifacts** section
2. Download:
   - `tier2-api-test-report-XXX` - HTML test report
   - `performance-benchmarks-XXX` - Performance metrics
   - `security-test-results-XXX` - Security validation results
   - `database-integrity-results-XXX` - Database checks

---

## Step 5: Enable Branch Protection (Optional)

Prevent merging code that breaks tests:

1. Go to: https://github.com/lversen/PHIS/settings/branches
2. Click "Add rule" (or edit existing rule for `docker-compose-official`)
3. Branch name pattern: `docker-compose-official`
4. Enable:
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
5. Select status checks:
   - ✅ Tier 2 - Comprehensive API Tests
   - ✅ Tier 3 - Performance Benchmarks
   - ✅ Tier 3 - Security Validation
   - ✅ Tier 3 - Database Integrity
6. Click "Create" or "Save changes"

**Result:** Pull requests cannot be merged if tests fail ✅

---

## How to Use CI/CD Daily

### Automatic Execution

Tests run automatically on:
- ✅ Every push to protected branches
- ✅ Every pull request
- ✅ Daily at 2 AM UTC (health check)

**You don't need to do anything!** GitHub Actions handles it.

---

### Manual Execution

To manually trigger tests:

1. Go to: https://github.com/lversen/PHIS/actions
2. Click "OpenSILEX Testing Suite" in left sidebar
3. Click "Run workflow" button (top right)
4. Select branch: `docker-compose-official`
5. Click "Run workflow"

**Use when:**
- Testing after manual server changes
- Validating before important deployments
- Investigating performance issues

---

### Viewing Results

**For recent runs:**
1. Visit: https://github.com/lversen/PHIS/actions
2. Click on any workflow run
3. View job details and logs

**For pull requests:**
- GitHub shows test status directly on PR
- ✅ Green checkmark = All tests passed, safe to merge
- ❌ Red X = Tests failed, do not merge

**For scheduled runs:**
- Tests run daily at 2 AM UTC
- If tests fail, GitHub automatically creates an issue
- Issue includes: what failed, when, link to workflow run

---

## Understanding Workflow Status

### ✅ All Green - Success
```
✅ Tier 2 - Comprehensive API Tests
✅ Tier 3 - Performance Benchmarks
✅ Tier 3 - Security Validation
✅ Tier 3 - Database Integrity
```

**Meaning:** All 120+ tests passed. Platform is healthy. Safe to deploy.

---

### ❌ Red X - Failure

**Example:**
```
✅ Tier 2 - Comprehensive API Tests
❌ Tier 3 - Performance Benchmarks (FAILED)
✅ Tier 3 - Security Validation
✅ Tier 3 - Database Integrity
```

**Meaning:** Performance tests failed. API response times exceed targets.

**Actions:**
1. Click on failed job for details
2. Review logs to see which test failed
3. Download artifacts for full report
4. Investigate on server: `ssh azureuser@20.61.108.197`
5. Fix issue and push again

---

### 🟡 Yellow - Skipped

**Example:**
```
✅ Tier 2 - Comprehensive API Tests
⏭️  Tier 3 - Performance Benchmarks (skipped)
⏭️  Tier 3 - Security Validation (skipped)
⏭️  Tier 3 - Database Integrity (skipped)
```

**Meaning:** Tier 2 failed, so Tier 3 jobs were skipped (they depend on Tier 2 passing).

**Actions:**
1. Fix Tier 2 failures first
2. Re-run workflow

---

## Troubleshooting

### "SSH connection failed"

**Problem:** GitHub Actions can't connect to your server

**Solutions:**

1. **Check SSH key is correct:**
   - Verify you copied the ENTIRE key including BEGIN/END lines
   - No extra spaces or newlines at start/end
   - Must be the private key, not the public key (.pub)

2. **Check server allows GitHub Actions IPs:**
   ```bash
   # On your server, check SSH logs
   ssh azureuser@20.61.108.197
   sudo tail -f /var/log/auth.log | grep sshd
   ```

3. **Verify key works locally:**
   ```bash
   ssh -i ~/.ssh/id_ed25519 azureuser@20.61.108.197 "echo SSH works"
   ```

---

### "Authentication failed"

**Problem:** GitHub Actions can't authenticate to OpenSILEX API

**Solutions:**

1. **Verify admin password secret:**
   - Go to: https://github.com/lversen/PHIS/settings/secrets/actions
   - Check `OPENSILEX_ADMIN_PASSWORD` exists
   - Update if password was changed

2. **Test authentication manually:**
   ```bash
   curl -X POST "http://20.61.108.197/sandbox/rest/security/authenticate" \
     -H "Content-Type: application/json" \
     -d '{"identifier":"admin@opensilex.org","password":"admin"}'
   ```

---

### "Tests timeout"

**Problem:** Tests taking too long to complete

**Solutions:**

1. **Increase timeout in workflow:**
   Edit `.github/workflows/opensilex-testing.yml`:
   ```yaml
   timeout-minutes: 45  # Increase from 30
   ```

2. **Check server performance:**
   ```bash
   ssh azureuser@20.61.108.197
   top  # Check CPU/memory usage
   docker stats  # Check container resources
   ```

---

### "Artifacts not uploaded"

**Problem:** Can't download test reports

**Solutions:**

1. Check artifact path exists:
   ```yaml
   - name: Upload API test report
     path: tools/testing/tier2/api-tests/report.html  # Verify this path
   ```

2. Artifacts expire after retention period (30-90 days)

---

## Cost & Usage Limits

### GitHub Actions Free Tier

**For Public Repositories (PHIS is public):**
- ✅ **Unlimited free minutes**
- ✅ **20 concurrent jobs**
- ✅ **No credit card required**

**For Private Repositories:**
- 2000 free minutes/month
- Your test suite uses ~10 minutes/run
- Daily runs = ~300 minutes/month
- Still well within free tier ✅

### Storage Limits

**Artifact retention:**
- Test reports: 30 days (configurable)
- Performance data: 90 days (configurable)
- Total storage: 500 MB free (plenty for test reports)

---

## Next Steps After Setup

### 1. Monitor First Run

After pushing the workflow:
1. Visit: https://github.com/lversen/PHIS/actions
2. Watch the first run complete (~5-10 minutes)
3. Verify all jobs pass ✅

### 2. Review Test Reports

1. Click on completed workflow run
2. Scroll to **Artifacts** section
3. Download `tier2-api-test-report-XXX`
4. Open HTML file to see detailed results

### 3. Set Up Notifications (Optional)

**Email notifications:**
- GitHub automatically emails you on workflow failures
- Configure in: https://github.com/settings/notifications

**Slack notifications:**
- Can add Slack integration to workflow
- Requires Slack webhook URL

**Custom notifications:**
- Edit workflow file to add notification steps
- Can integrate with MS Teams, Discord, etc.

### 4. Enable Branch Protection

Force all changes to pass tests before merge:
1. https://github.com/lversen/PHIS/settings/branches
2. Add rule for `docker-compose-official`
3. Require status checks to pass
4. Save

---

## Workflow Triggers Summary

| Trigger | When | Use Case |
|---------|------|----------|
| **Push** | Every commit to main branches | Validate changes immediately |
| **Pull Request** | When PR is created/updated | Block bad code before merge |
| **Schedule** | Daily at 2 AM UTC | Health monitoring |
| **Manual** | On-demand via Actions UI | Ad-hoc testing |

---

## Monitoring Best Practices

### Weekly
- Review GitHub Actions tab for any failures
- Check artifact storage usage

### Monthly
- Review performance trend from benchmark artifacts
- Update performance baselines if needed

### After Failures
- Download test report artifacts
- Review logs in failed job
- Fix issues and re-run

---

## What Happens Next

Once setup is complete:

### Every Code Push
```
You: git push
  ↓ (30 seconds)
GitHub: Starts testing automatically
  ↓ (5-10 minutes)
GitHub: All tests complete
  ↓
Email: "✅ Workflow run completed"
```

### Every Day at 2 AM
```
GitHub: Scheduled run starts
  ↓ (5-10 minutes)
GitHub: Tests complete
  ↓
If failed → Creates GitHub issue automatically
If passed → No action needed
```

### Every Pull Request
```
Contributor: Opens PR
  ↓ (immediate)
GitHub: Tests run automatically
  ↓ (5-10 minutes)
PR page shows: ✅ All checks passed (safe to merge)
               OR ❌ Tests failed (do not merge)
```

---

## Security Considerations

### What GitHub Actions Can Access

✅ **Has access to:**
- Your code (public on GitHub)
- OpenSILEX API (read-only operations via tests)
- Server via SSH (read-only database queries)

❌ **Does NOT have access to:**
- Your local machine
- Other servers
- Private data not in the repository

### SSH Key Security

- ✅ Encrypted by GitHub (AES-256)
- ✅ Only accessible during workflow runs
- ✅ Never visible in logs or UI
- ✅ Automatically deleted after job completes

### Best Practices

1. **Use read-only SSH keys** if possible
2. **Rotate SSH keys periodically** (update secret)
3. **Don't commit secrets to code** (always use GitHub Secrets)
4. **Review workflow logs** for any leaked information

---

## Quick Reference

### View Workflows
https://github.com/lversen/PHIS/actions

### Manage Secrets
https://github.com/lversen/PHIS/settings/secrets/actions

### Workflow File
`.github/workflows/opensilex-testing.yml`

### Manual Trigger
Actions tab → OpenSILEX Testing Suite → Run workflow

### Branch Protection
https://github.com/lversen/PHIS/settings/branches

---

## Support

If you encounter issues during setup:

1. **Check secret names** - Must match exactly (case-sensitive)
2. **Verify SSH key format** - Must include BEGIN/END lines
3. **Test SSH locally** - Ensure key works before adding to GitHub
4. **Review workflow logs** - Click on failed job for details
5. **Check server firewall** - Ensure GitHub IPs can connect

**GitHub Actions IPs:** GitHub publishes IP ranges that can be allowlisted if needed:
https://api.github.com/meta (see `actions` field)

---

## Ready to Enable?

Follow these steps in order:

- [ ] Step 1: Add 4 GitHub Secrets (5 minutes)
- [ ] Step 2: Verify secrets are configured correctly
- [ ] Step 3: Commit and push workflow file
- [ ] Step 4: Watch first workflow run complete
- [ ] Step 5: Download and review test artifacts
- [ ] Optional: Enable branch protection

**Total setup time:** ~15 minutes

**Result:** Automated testing on every code change! 🎉
