# HTTPS Migration Complete - Full Summary

## Date: 2026-01-13

---

## Overview

Successfully migrated the PHIS production server from HTTP to HTTPS with a valid SSL certificate from Let's Encrypt. The system is now fully secured and production-ready.

---

## What Was Done

### 1. Production Server Migration (172.211.86.191 → phis.pheno.no)

**Server Details:**
- **Domain:** phis.pheno.no
- **IP Address:** 172.211.86.191
- **Platform:** Debian 12 (Bookworm)
- **User:** azureuser

**Migration Steps Completed:**

1. **Uploaded migration script** to production server
2. **Installed dependencies:**
   - `dnsutils` (for DNS verification)
   - `certbot` (for SSL certificate management)
   - `python3-certbot-nginx` (nginx plugin)

3. **Created webroot directory** for ACME challenges:
   - Directory: `/var/www/letsencrypt`
   - Owner: `www-data:www-data`
   - Purpose: Let's Encrypt uses this to verify domain ownership

4. **Obtained Let's Encrypt SSL certificate:**
   - Certificate issued for: `phis.pheno.no`
   - Certificate expiry: **2026-04-13** (89 days from now)
   - Auto-renewal: **Enabled** via certbot systemd timer

5. **Updated OpenSILEX configuration:**
   - Backed up original: `/home/azureuser/opensilex/config/opensilex.yml.backup-*`
   - Changed all HTTP URLs to HTTPS:
     - `baseURI: "https://phis.pheno.no/"`
     - `publicURI: "https://phis.pheno.no"`
     - `redirectURI: "https://phis.pheno.no/app/openid"`
     - CORS `allowedOrigins` updated to HTTPS

6. **Updated Nginx configuration:**
   - HTTP (port 80): Redirects all traffic to HTTPS
   - HTTPS (port 443): Main application with SSL
   - ACME challenge support for certificate renewal
   - **Critical fix:** Added `proxy_redirect` to handle OpenSILEX redirects

7. **Restarted services:**
   - Nginx: Reloaded configuration
   - OpenSILEX: Restarted to apply new HTTPS settings

---

## SSL Certificate - Everything You Need to Know

### What is an SSL Certificate?

An SSL (Secure Sockets Layer) certificate is a digital certificate that:
- **Encrypts** all data between the server and users' browsers
- **Authenticates** that your server is really phis.pheno.no (not an imposter)
- **Enables HTTPS** (the padlock icon in browsers)
- **Required** for secure logins, data transmission, and modern web applications

### Your Certificate Details

**Certificate Authority:** Let's Encrypt
- A free, automated, and trusted certificate authority
- Certificates are trusted by all major browsers
- Used by millions of websites worldwide

**Certificate Location on Server:**
```
Certificate: /etc/letsencrypt/live/phis.pheno.no/fullchain.pem
Private Key: /etc/letsencrypt/live/phis.pheno.no/privkey.pem
```

**Important:** Never share or expose the private key file!

**Registered Email:** `siv017@uit.no`
- Used for expiry warnings if auto-renewal fails (20, 10, and 1 day before expiry)
- Used for security notifications from Let's Encrypt
- ✅ Updated on 2026-01-13

### Certificate Validity Period

**Issue Date:** 2026-01-13
**Expiry Date:** 2026-04-13 (90 days)
**Days Remaining:** 89 days

### Certificate Auto-Renewal

**How it works:**
- Let's Encrypt certificates are valid for **90 days only**
- A systemd timer automatically renews certificates **every 12 hours**
- Renewal happens automatically when certificate is **30 days from expiry**
- No manual intervention needed

**Check renewal timer status:**
```bash
ssh azureuser@172.211.86.191
sudo systemctl status certbot.timer
```

**Manually test renewal (dry run - doesn't actually renew):**
```bash
sudo certbot renew --dry-run
```

**Force manual renewal (if needed):**
```bash
sudo certbot renew
sudo systemctl reload nginx
```

**Check certificate status:**
```bash
sudo certbot certificates
```

**View renewal logs:**
```bash
sudo journalctl -u certbot.timer
```

### What Happens If Certificate Expires?

If auto-renewal fails and the certificate expires:

1. **Browsers will show security warnings:**
   - "Your connection is not private"
   - "NET::ERR_CERT_DATE_INVALID"
   - Users cannot access the site easily

2. **How to fix:**
   ```bash
   ssh azureuser@172.211.86.191
   sudo certbot renew --force-renewal
   sudo systemctl reload nginx
   ```

3. **Common renewal failure reasons:**
   - Port 80 blocked (firewall/Azure network security group)
   - DNS changed (domain no longer points to server)
   - Nginx not running or misconfigured
   - `/var/www/letsencrypt` directory missing or wrong permissions

### Certificate Monitoring

**Recommended:** Set up monitoring to alert you 30 days before expiry

**Manual check (from your laptop):**
```bash
curl -I https://phis.pheno.no/
```
Look for `HTTP/1.1 200` or `HTTP/1.1 301` (success)

**Browser check:**
- Visit: https://phis.pheno.no
- Click padlock icon → "Connection is secure" → "Certificate is valid"
- Should show: Valid until April 13, 2026

**Online tools:**
- https://www.ssllabs.com/ssltest/analyze.html?d=phis.pheno.no
- Will give you a grade (A, B, C, etc.) and show certificate details

---

## Network Configuration

### Ports

**Required open ports:**
- **Port 80 (HTTP):** Required for Let's Encrypt validation and HTTP→HTTPS redirect
- **Port 443 (HTTPS):** Main application access
- **Port 22 (SSH):** Server administration

**Important:** Both port 80 and 443 must remain open for the system to work:
- Port 80: Let's Encrypt needs this to renew certificates
- Port 443: All HTTPS traffic

### DNS Configuration

**Current setup:**
```
phis.pheno.no → 172.211.86.191
```

**Verify DNS:**
```bash
nslookup phis.pheno.no
# or
dig phis.pheno.no +short
```

**Important:** If you change the server IP address, you must:
1. Update DNS records
2. Wait for DNS propagation (up to 48 hours)
3. Obtain new SSL certificate for new IP

---

## FEIDE Authentication

**FEIDE configuration updated:**
- Dashboard: https://dashboard.dataporten.no/
- Redirect URI: **https://phis.pheno.no/app/openid** (changed from HTTP)
- Status: **Already updated** (as confirmed in migration_summary.txt)

**Test FEIDE login:**
1. Go to https://phis.pheno.no
2. Click "Login with Feide"
3. Authenticate with your FEIDE credentials
4. Should redirect back to PHIS successfully

---

## Files Modified/Created

### On Production Server (172.211.86.191)

**Created:**
- `/var/www/letsencrypt/` - Directory for Let's Encrypt ACME challenges
- `/etc/letsencrypt/live/phis.pheno.no/` - SSL certificate location
- Various backup files with timestamps

**Modified:**
- `/home/azureuser/opensilex/config/opensilex.yml` - Updated HTTP→HTTPS
- `/etc/nginx/sites-available/opensilex` - Added HTTPS configuration

**Backups created:**
- `/home/azureuser/opensilex/config/opensilex.yml.backup-20260113-*`
- `/etc/nginx/sites-available/opensilex.backup-20260113-*`

### In Git Repository (Local)

**Updated:**
1. **tools/migrate-to-https.sh**
   - Fixed webroot path (`/var/www/letsencrypt`)
   - Added webroot directory creation
   - Added `proxy_redirect` directives

2. **tools/opensilex-installer.sh**
   - Fixed webroot path (`/var/www/letsencrypt`)
   - Added webroot directory creation
   - Added dynamic `proxy_redirect` directives

**Note:** These script updates will be used for future installations and migrations.

---

## Technical Details

### Nginx Configuration Explained

**HTTP Server Block (Port 80):**
```nginx
server {
    listen 80;
    server_name phis.pheno.no;

    # Let's Encrypt certificate renewal
    location /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }

    # Redirect everything else to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}
```
- Allows Let's Encrypt to verify domain ownership
- Redirects all HTTP traffic to HTTPS automatically

**HTTPS Server Block (Port 443):**
```nginx
server {
    listen 443 ssl http2;
    server_name phis.pheno.no;

    # SSL certificate files
    ssl_certificate /etc/letsencrypt/live/phis.pheno.no/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/phis.pheno.no/privkey.pem;

    # Modern security settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:...;

    # Proxy to OpenSILEX backend
    location / {
        proxy_pass http://127.0.0.1:8666;
        proxy_set_header X-Forwarded-Proto https;
        # CRITICAL: Fix OpenSILEX redirects
        proxy_redirect http://phis.pheno.no/ https://phis.pheno.no/;
        proxy_redirect http://phis.pheno.no https://phis.pheno.no;
    }
}
```

### The proxy_redirect Fix (Important!)

**Problem:** OpenSILEX (Java/Tomcat) doesn't know it's behind HTTPS. When it redirects from `/` to `/app/`, it uses `http://` in the redirect.

**Solution:** Nginx intercepts redirects and rewrites them:
```nginx
proxy_redirect http://phis.pheno.no/ https://phis.pheno.no/;
```

**Result:** Users always see HTTPS URLs, no security warnings.

### Security Settings

**TLS Protocols:** TLSv1.2 and TLSv1.3 only (modern and secure)
**HSTS:** Enabled (tells browsers to always use HTTPS)
**Cipher Suites:** Modern, strong encryption only

**Security test:** https://www.ssllabs.com/ssltest/analyze.html?d=phis.pheno.no

---

## Verification & Testing

### Successful Verification Completed

**1. HTTPS Working:**
```bash
curl -I https://phis.pheno.no/
# Result: HTTP/1.1 301 (redirect to /app/)
# Location: https://phis.pheno.no/app/ (HTTPS, not HTTP!)
```

**2. Certificate Valid:**
```bash
sudo certbot certificates
# Result: VALID for 89 days (expires 2026-04-13)
```

**3. Services Running:**
```bash
sudo systemctl status nginx    # Active (running)
sudo systemctl status opensilex # Active (running)
```

**4. HTTP→HTTPS Redirect:**
```bash
curl -I http://phis.pheno.no/
# Result: 301 Moved Permanently → https://phis.pheno.no/
```

### Manual Testing Checklist

- [ ] Visit https://phis.pheno.no in browser
- [ ] Verify padlock icon shows (secure connection)
- [ ] Click padlock → verify certificate is valid
- [ ] Test FEIDE login
- [ ] Upload/download files (test 100MB limit works)
- [ ] Check WebSocket connections work (real-time features)
- [ ] Verify no console errors (F12 developer tools)

---

## Troubleshooting Guide

### Issue: "Your connection is not private" warning

**Cause:** Certificate expired or invalid

**Fix:**
```bash
ssh azureuser@172.211.86.191
sudo certbot renew --force-renewal
sudo systemctl reload nginx
```

### Issue: Certificate renewal fails

**Check port 80 is accessible:**
```bash
curl -I http://phis.pheno.no/.well-known/acme-challenge/test
# Should NOT be blocked by firewall
```

**Check DNS:**
```bash
dig phis.pheno.no +short
# Should return: 172.211.86.191
```

**Check webroot directory:**
```bash
ls -la /var/www/letsencrypt/
sudo chown -R www-data:www-data /var/www/letsencrypt
```

**Manual renewal with verbose output:**
```bash
sudo certbot renew --force-renewal -v
```

### Issue: Website redirects to HTTP instead of HTTPS

**Check nginx configuration:**
```bash
sudo nginx -t  # Test configuration
grep proxy_redirect /etc/nginx/sites-available/opensilex
# Should show: proxy_redirect http://phis.pheno.no/ https://phis.pheno.no/;
```

**Reload nginx:**
```bash
sudo systemctl reload nginx
```

### Issue: Port 80 or 443 not accessible

**Check Azure Network Security Group:**
1. Azure Portal → Virtual Machine → Networking
2. Verify inbound rules allow:
   - Port 80 from Internet
   - Port 443 from Internet

**Check local firewall (if any):**
```bash
sudo ufw status  # If UFW is installed
sudo iptables -L  # Check iptables rules
```

### Issue: OpenSILEX not starting

**Check logs:**
```bash
sudo journalctl -u opensilex -f
sudo journalctl -u opensilex --since "10 minutes ago"
```

**Check configuration:**
```bash
grep https /home/azureuser/opensilex/config/opensilex.yml
# All URLs should use https://
```

**Restart service:**
```bash
sudo systemctl restart opensilex
# Wait 30 seconds for startup
sudo systemctl status opensilex
```

---

## Rollback Procedure (If Needed)

If something goes wrong and you need to revert to HTTP:

**1. Restore backups:**
```bash
ssh azureuser@172.211.86.191

# Find backup files
ls -la /home/azureuser/opensilex/config/*.backup-*
ls -la /etc/nginx/sites-available/*.backup-*

# Restore OpenSILEX config
sudo cp /home/azureuser/opensilex/config/opensilex.yml.backup-TIMESTAMP /home/azureuser/opensilex/config/opensilex.yml

# Restore Nginx config
sudo cp /etc/nginx/sites-available/opensilex.backup-TIMESTAMP /etc/nginx/sites-available/opensilex
```

**2. Reload services:**
```bash
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
sudo systemctl restart opensilex
```

**3. Revert FEIDE redirect URI:**
- Go to: https://dashboard.dataporten.no/
- Change redirect URI back to: `http://phis.pheno.no/app/openid`

**Note:** Rollback is NOT recommended. HTTPS is required for security and modern web standards.

---

## Maintenance Schedule

### Daily (Automatic)
- Certificate renewal check (via certbot.timer)
- No action required

### Weekly (Recommended)
- Check website is accessible: https://phis.pheno.no
- Verify certificate validity (padlock icon in browser)

### Monthly (Recommended)
- Review certificate status:
  ```bash
  sudo certbot certificates
  ```
- Check renewal logs:
  ```bash
  sudo journalctl -u certbot.timer --since "1 month ago"
  ```

### Before Certificate Expiry (Automatic)
- Certbot automatically renews 30 days before expiry
- You'll see renewal in logs around **2026-03-13**

---

## Important Reminders

1. **Keep port 80 open** - Required for certificate renewal (not just port 443!)

2. **DNS must stay the same** - If you change phis.pheno.no to point elsewhere, certificate renewal will fail

3. **Don't delete /var/www/letsencrypt** - Required for certificate renewal

4. **Don't modify nginx SSL config** - Unless you know what you're doing

5. **Monitor certificate expiry** - Auto-renewal should work, but monitor just in case

6. **Backup before changes** - Always backup configs before modifying nginx or OpenSILEX

7. **Test after updates** - After any system updates, verify HTTPS still works

---

## Next Steps / Recommendations

### Immediate (Completed)
1. ✅ **Let's Encrypt email updated** - Now set to `siv017@uit.no`
   - You'll receive notifications if auto-renewal fails
   - No further action needed

### Immediate (Recommended)
1. **Test all functionality** - Login, file uploads, data access, etc.
2. **Update any documentation** - That references http://phis.pheno.no
3. **Notify users** - That the site is now https://phis.pheno.no

### Future Improvements (Optional)
1. **Set up monitoring** - Email alerts for certificate expiry
2. **Configure backup MX records** - For redundancy
3. **Enable rate limiting** - In nginx (prevent abuse)
4. **Add fail2ban** - Protect against brute force attacks
5. **Regular backups** - Automate OpenSILEX data backups

---

## Support Resources

### Let's Encrypt
- Documentation: https://letsencrypt.org/docs/
- Community: https://community.letsencrypt.org/

### Certbot
- Documentation: https://certbot.eff.org/docs/
- Command help: `certbot --help`

### Nginx
- Documentation: https://nginx.org/en/docs/
- SSL module: https://nginx.org/en/docs/http/ngx_http_ssl_module.html

### Testing Tools
- SSL Labs: https://www.ssllabs.com/ssltest/
- Certificate Checker: https://www.sslshopper.com/ssl-checker.html
- DNS Checker: https://dnschecker.org/

---

## Summary

**Status:** ✅ **Migration Complete and Successful**

**Production URL:** https://phis.pheno.no

**Certificate Status:** Valid until 2026-04-13 (auto-renewing)

**Security:** Modern TLS 1.2/1.3 with strong ciphers

**All services:** Running and operational

**User impact:** Seamless transition, all HTTP traffic auto-redirects to HTTPS

**Maintenance required:** Minimal - auto-renewal handles certificate updates

---

## Contact & Questions

For any issues or questions about SSL certificates, HTTPS configuration, or the migration:

1. Check this document first
2. Review troubleshooting section
3. Check certbot logs: `sudo journalctl -u certbot.timer`
4. Check nginx logs: `sudo tail -f /var/log/nginx/error.log`
5. Contact your system administrator

---

**Document created:** 2026-01-13
**Last updated:** 2026-01-13
**Next review:** 2026-03-13 (before certificate renewal)
