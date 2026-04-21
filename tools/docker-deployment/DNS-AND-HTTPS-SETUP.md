# DNS and HTTPS Setup Guide for OpenSILEX Production

This guide walks through configuring DNS and HTTPS for the production OpenSILEX deployment.

## Prerequisites

- OpenSILEX deployed via Docker Compose (completed)
- Production server: **172.211.86.191**
- Domain: **phis.pheno.no**
- Access to DNS management (pheno.no domain)

---

## Step 1: Configure DNS

### 1.1 Access DNS Management

The domain `pheno.no` needs to be configured to point `phis.pheno.no` to the production server.

**Who manages pheno.no DNS?**
- Check with NMBU IT or domain administrator
- Common DNS providers: Azure DNS, GoDaddy, Cloudflare, etc.

### 1.2 Create DNS A Record

Add an **A record** with these settings:

| Field | Value |
|-------|-------|
| **Name/Host** | `phis` |
| **Type** | `A` |
| **Value/Points to** | `172.211.86.191` |
| **TTL** | `3600` (1 hour) or default |

**Example for different DNS providers:**

#### Azure DNS
```bash
az network dns record-set a add-record \
  --resource-group <resource-group> \
  --zone-name pheno.no \
  --record-set-name phis \
  --ipv4-address 172.211.86.191
```

#### Cloudflare
1. Log in to Cloudflare dashboard
2. Select `pheno.no` domain
3. Go to DNS settings
4. Click "Add record"
5. Type: `A`, Name: `phis`, IPv4 address: `172.211.86.191`
6. Proxy status: DNS only (gray cloud)
7. Save

#### GoDaddy/Other Web UI
1. Find DNS management page
2. Add new record
3. Type: `A`
4. Host: `phis`
5. Points to: `172.211.86.191`
6. TTL: 1 hour
7. Save

### 1.3 Verify DNS Propagation

**From your local machine:**
```bash
# Check if DNS is configured
nslookup phis.pheno.no

# Or using dig (more detailed)
dig phis.pheno.no

# Expected output should show:
# phis.pheno.no.  3600  IN  A  172.211.86.191
```

**From the production server:**
```bash
ssh azureuser@172.211.86.191
dig +short phis.pheno.no
# Should return: 172.211.86.191
```

**DNS Propagation Time:**
- **Minimum:** 5-15 minutes (if DNS was not previously set)
- **Maximum:** Up to 48 hours (worst case)
- **Typical:** 1-2 hours

**Check propagation status online:**
- https://www.whatsmydns.net/#A/phis.pheno.no
- Should show `172.211.86.191` from multiple locations worldwide

---

## Step 2: Update FEIDE Configuration

**BEFORE running the HTTPS script**, update FEIDE settings:

### 2.1 Log in to FEIDE Dashboard
1. Go to: https://dashboard.dataporten.no/
2. Log in with your FEIDE credentials
3. Find your application (PHIS/PheNo)

### 2.2 Update Redirect URI
1. Go to "OAuth2/OIDC" settings
2. Find "Redirect URIs"
3. **Add new redirect URI:**
   ```
   https://phis.pheno.no/app/openid
   ```
4. **Keep the old HTTP URI** temporarily:
   ```
   http://172.211.86.191/sandbox/app/openid
   ```
   (You can remove this later after HTTPS is confirmed working)

### 2.3 Verify Scopes and Attributes
Ensure these are enabled:
- **Scopes:** `openid`, `profile`, `email`, `userid`
- **Attribute groups:** `email`, `userinfo-name`, `userinfo-mail`

### 2.4 Save Changes
Click "Save" and wait 1-2 minutes for changes to propagate.

---

## Step 3: Configure HTTPS

### 3.1 Upload HTTPS Script to Server

**From your local machine:**
```powershell
# Upload the HTTPS configuration script
scp -i ~/.ssh/id_ed25519 `
  tools/docker-deployment/06-configure-https.sh `
  azureuser@172.211.86.191:~/
```

### 3.2 Run HTTPS Configuration Script

**SSH to the server:**
```bash
ssh azureuser@172.211.86.191
```

**Run the script:**
```bash
chmod +x ~/06-configure-https.sh
sudo ~/06-configure-https.sh
```

### 3.3 What the Script Does

The script will automatically:

1. ✅ Verify DNS is configured correctly
2. ✅ Install nginx and certbot
3. ✅ Obtain Let's Encrypt SSL certificate
4. ✅ Configure nginx as HTTPS reverse proxy
5. ✅ Update OpenSILEX config to use HTTPS URLs
6. ✅ Restart OpenSILEX container
7. ✅ Configure automatic certificate renewal

**Script output:**
- Green `[SUCCESS]` messages indicate steps completed
- Yellow `[WARNING]` messages are informational
- Red `[ERROR]` messages indicate failures

### 3.4 Manual Configuration (if script fails)

If the script fails at DNS verification but you know DNS is configured:

```bash
# Set domain explicitly and skip DNS check
export DOMAIN="phis.pheno.no"
sudo DOMAIN="$DOMAIN" ~/06-configure-https.sh
```

---

## Step 4: Verify HTTPS is Working

### 4.1 Test HTTPS Access

**From your browser:**
1. Navigate to: https://phis.pheno.no
2. Should redirect from HTTP to HTTPS automatically
3. Check for valid SSL certificate (green padlock)
4. No certificate warnings should appear

**From command line:**
```bash
# Test HTTPS response
curl -I https://phis.pheno.no

# Expected output:
# HTTP/2 200
# server: nginx
# ...

# Test HTTP redirect
curl -I http://phis.pheno.no

# Expected output:
# HTTP/1.1 301 Moved Permanently
# Location: https://phis.pheno.no/
```

### 4.2 Test FEIDE Login

1. Go to: https://phis.pheno.no
2. Click "Login with FEIDE"
3. Authenticate with FEIDE credentials
4. Should redirect back to OpenSILEX successfully
5. Verify user is logged in and has correct group membership (Users group)

### 4.3 Check SSL Certificate Details

**From browser:**
- Click the padlock icon in address bar
- View certificate details
- Verify:
  - Issued to: `phis.pheno.no`
  - Issued by: `Let's Encrypt`
  - Valid until: (90 days from today)

**From command line:**
```bash
# Check certificate expiry
sudo certbot certificates

# Expected output:
# Certificate Name: phis.pheno.no
# Domains: phis.pheno.no
# Expiry Date: 2026-06-07 (VALID: 89 days)
```

---

## Step 5: Post-HTTPS Configuration

### 5.1 Update Firewall Rules (if applicable)

Ensure these ports are open:
- **Port 80 (HTTP):** For Let's Encrypt challenges and HTTP→HTTPS redirect
- **Port 443 (HTTPS):** For main application access

**Azure NSG (Network Security Group):**
```bash
# Allow HTTPS
az network nsg rule create \
  --resource-group RG-OPENSILEX-debian12-TEST \
  --nsg-name <nsg-name> \
  --name AllowHTTPS \
  --priority 1002 \
  --destination-port-ranges 443 \
  --protocol Tcp \
  --access Allow
```

### 5.2 Remove Old FEIDE Redirect URI

Once HTTPS is confirmed working:
1. Go back to https://dashboard.dataporten.no/
2. Remove the old HTTP redirect URI: `http://172.211.86.191/sandbox/app/openid`
3. Keep only: `https://phis.pheno.no/app/openid`

### 5.3 Update Documentation and Bookmarks

Update any references to the old HTTP URL:
- ❌ Old: `http://172.211.86.191/sandbox/app/`
- ✅ New: `https://phis.pheno.no`

---

## Troubleshooting

### DNS Issues

**Problem:** `dig phis.pheno.no` returns no results

**Solutions:**
1. Check DNS configuration with domain administrator
2. Verify A record was created correctly
3. Wait longer for DNS propagation (up to 48 hours)
4. Try different DNS servers: `dig @8.8.8.8 phis.pheno.no`

---

### Certificate Acquisition Fails

**Problem:** Certbot fails with "Failed authorization procedure"

**Solutions:**
1. Verify DNS is fully propagated: `dig +short phis.pheno.no`
2. Check port 80 is accessible from internet: `nc -zv <server-ip> 80`
3. Ensure no firewall blocking port 80
4. Check HAProxy is running: `docker ps | grep haproxy`

**Manual certificate request with verbose output:**
```bash
sudo certbot certonly --standalone -d phis.pheno.no --verbose
```

---

### HTTPS Not Working

**Problem:** Browser shows "Connection refused" or "Site can't be reached"

**Solutions:**
1. Check nginx is running: `sudo systemctl status nginx`
2. Check nginx error logs: `sudo tail -f /var/log/nginx/error.log`
3. Verify nginx listening on port 443: `sudo netstat -tlnp | grep :443`
4. Test nginx config: `sudo nginx -t`
5. Restart nginx: `sudo systemctl restart nginx`

---

### FEIDE Login Fails After HTTPS

**Problem:** FEIDE redirects to error page or "redirect_uri mismatch"

**Solutions:**
1. Verify FEIDE redirect URI is exactly: `https://phis.pheno.no/app/openid`
2. Check for trailing slashes (none should be present)
3. Wait 5 minutes for FEIDE config to propagate
4. Check OpenSILEX config has HTTPS URLs:
   ```bash
   grep -i "https" ~/opensilex-docker-compose/config/opensilex.yml
   ```

---

### Certificate Renewal Issues

**Problem:** Certificate expires or auto-renewal fails

**Solutions:**
1. Check certbot timer: `sudo systemctl status certbot.timer`
2. Test renewal dry-run: `sudo certbot renew --dry-run`
3. Manual renewal: `sudo certbot renew`
4. After renewal, reload nginx: `sudo systemctl reload nginx`

---

## Certificate Auto-Renewal

Let's Encrypt certificates are **valid for 90 days** and auto-renew at **30 days** before expiry.

### How Auto-Renewal Works

1. **Certbot timer** runs twice daily
2. Checks if certificates are within 30 days of expiry
3. If yes, requests renewal from Let's Encrypt
4. Let's Encrypt verifies domain ownership via HTTP challenge
5. New certificate installed automatically
6. Nginx reloaded to use new certificate

### Check Auto-Renewal Status

```bash
# Check timer status
sudo systemctl status certbot.timer

# Test renewal (dry run - doesn't actually renew)
sudo certbot renew --dry-run

# View certificate expiry dates
sudo certbot certificates
```

### Manual Renewal (if needed)

```bash
# Force renewal
sudo certbot renew --force-renewal

# Reload nginx after renewal
sudo systemctl reload nginx
```

---

## Architecture Overview

After HTTPS configuration, the complete architecture is:

```
┌─────────────────────────────────────────────────────────────┐
│ Internet (HTTPS)                                            │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │  phis.pheno.no │
                    │  172.211.86.191│
                    └────────┬───────┘
                             │
                   ┌─────────┴─────────┐
                   │  nginx (host)     │
                   │  Port 443 (HTTPS) │
                   │  + Let's Encrypt  │
                   └─────────┬─────────┘
                             │ HTTP
                             ▼
                   ┌─────────────────┐
                   │ HAProxy (Docker)│
                   │ Port 80         │
                   └─────────┬───────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
                ▼            ▼            ▼
         ┌──────────┐  ┌─────────┐  ┌─────────┐
         │OpenSILEX │  │ RDF4J   │  │ MongoDB │
         │ :8081    │  │ :8080   │  │ :27017  │
         └──────────┘  └─────────┘  └─────────┘
```

**Traffic Flow:**
1. User requests `https://phis.pheno.no`
2. nginx terminates SSL/TLS on port 443
3. nginx proxies request to HAProxy on port 80
4. HAProxy routes to appropriate backend (OpenSILEX/RDF4J/MongoDB)
5. Response flows back through HAProxy → nginx → user

---

## Quick Reference

### Key URLs
- **Production:** https://phis.pheno.no
- **FEIDE Dashboard:** https://dashboard.dataporten.no/
- **OpenSILEX API docs:** https://phis.pheno.no/sandbox/api-docs

### Key Files
- **nginx config:** `/etc/nginx/sites-available/opensilex`
- **SSL certificates:** `/etc/letsencrypt/live/phis.pheno.no/`
- **OpenSILEX config:** `~/opensilex-docker-compose/config/opensilex.yml`
- **nginx logs:** `/var/log/nginx/access.log`, `/var/log/nginx/error.log`

### Useful Commands
```bash
# Check nginx status
sudo systemctl status nginx

# Test nginx config
sudo nginx -t

# Reload nginx (after config changes)
sudo systemctl reload nginx

# View SSL certificate
sudo certbot certificates

# Test certificate renewal
sudo certbot renew --dry-run

# Check Docker containers
cd ~/opensilex-docker-compose && docker compose ps

# View OpenSILEX logs
docker logs -f <container-name>

# Restart OpenSILEX
cd ~/opensilex-docker-compose && docker compose restart opensilex
```

---

## Success Checklist

- [ ] DNS configured: `phis.pheno.no` → `172.211.86.191`
- [ ] DNS propagated (verified with `dig phis.pheno.no`)
- [ ] FEIDE redirect URI updated to `https://phis.pheno.no/app/openid`
- [ ] HTTPS configuration script executed successfully
- [ ] nginx installed and running
- [ ] SSL certificate obtained from Let's Encrypt
- [ ] OpenSILEX accessible at `https://phis.pheno.no`
- [ ] HTTP automatically redirects to HTTPS
- [ ] SSL certificate shows as valid (green padlock)
- [ ] FEIDE login works with HTTPS
- [ ] Certificate auto-renewal configured
- [ ] Firewall allows ports 80 and 443
- [ ] Old bookmarks/documentation updated to HTTPS URL
- [ ] Default admin password changed

---

## Next Steps After HTTPS

1. **Security hardening:**
   - Change default admin password
   - Review user permissions
   - Enable audit logging

2. **Monitoring:**
   - Set up certificate expiry monitoring
   - Monitor nginx error logs
   - Set up uptime monitoring (e.g., UptimeRobot)

3. **Backups:**
   - Backup OpenSILEX data (MongoDB + RDF4J)
   - Backup configuration files
   - Document restore procedures

4. **Testing:**
   - Run comprehensive testing (experiments, data upload, devices)
   - Validate all FEIDE user flows
   - Test with real scientific workflows

5. **Documentation:**
   - Update user guides with new HTTPS URL
   - Create runbook for common operations
   - Document troubleshooting procedures
