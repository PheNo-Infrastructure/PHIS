<#
.SYNOPSIS
    Configures HTTPS for OpenSILEX production deployment

.DESCRIPTION
    Uploads and executes the HTTPS configuration script on the production server.
    Configures nginx + Let's Encrypt for HTTPS on the Docker Compose deployment.

    Prerequisites:
    - DNS must be configured (phis.pheno.no → server IP)
    - FEIDE redirect URI must be updated to HTTPS
    - OpenSILEX must be deployed and running

.PARAMETER Server
    Target server IP or hostname (default: 172.211.86.191)

.PARAMETER Domain
    Domain name for HTTPS (default: phis.pheno.no)

.PARAMETER AdminUsername
    SSH username (default: azureuser)

.PARAMETER PrivateKeyPath
    Path to SSH private key (default: ~/.ssh/id_ed25519)

.PARAMETER SkipDNSCheck
    Skip DNS verification (use if DNS is configured but not yet propagated)

.EXAMPLE
    .\05-configure-https.ps1

.EXAMPLE
    .\05-configure-https.ps1 -Server 172.211.86.191 -Domain phis.pheno.no

.EXAMPLE
    .\05-configure-https.ps1 -SkipDNSCheck
#>

param(
    [string]$Server = "172.211.86.191",
    [string]$Domain = "phis.pheno.no",
    [string]$AdminUsername = "azureuser",
    [string]$PrivateKeyPath = "~/.ssh/id_ed25519",
    [switch]$SkipDNSCheck
)

$ErrorActionPreference = "Stop"

# Resolve SSH key path
if ($PrivateKeyPath -match '^~') {
    $PrivateKeyPath = $PrivateKeyPath -replace '^~', $env:USERPROFILE
}

# Script locations
$LocalScriptPath = Join-Path $PSScriptRoot "05-configure-https.sh"
$RemoteScriptPath = "/home/$AdminUsername/05-configure-https.sh"

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  OpenSILEX HTTPS Configuration" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Server:  $Server" -ForegroundColor White
Write-Host "Domain:  $Domain" -ForegroundColor White
Write-Host ""

# Verify bash script exists
if (-not (Test-Path $LocalScriptPath)) {
    Write-Host "[ERROR] HTTPS configuration script not found: $LocalScriptPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Expected location:" -ForegroundColor Yellow
    Write-Host "  $LocalScriptPath" -ForegroundColor Gray
    exit 1
}

Write-Host "[INFO] Bash script found: 05-configure-https.sh" -ForegroundColor Gray
Write-Host ""

# Step 1: Check DNS (unless skipped)
if (-not $SkipDNSCheck) {
    Write-Host "[1/5] Checking DNS configuration..." -ForegroundColor Yellow
    Write-Host ""

    Write-Host "  Checking if '$Domain' resolves to '$Server'..." -ForegroundColor Gray

    try {
        $DnsResult = Resolve-DnsName -Name $Domain -Type A -ErrorAction Stop | Where-Object { $_.Type -eq "A" }
        $ResolvedIP = $DnsResult.IPAddress

        if ($ResolvedIP -eq $Server) {
            Write-Host "  [OK] DNS correctly configured: $Domain → $ResolvedIP" -ForegroundColor Green
        } else {
            Write-Host "  [WARNING] DNS mismatch!" -ForegroundColor Yellow
            Write-Host "    Expected: $Server" -ForegroundColor Gray
            Write-Host "    Resolved: $ResolvedIP" -ForegroundColor Gray
            Write-Host ""
            Write-Host "  This may cause Let's Encrypt certificate acquisition to fail." -ForegroundColor Yellow
            Write-Host ""
            $Continue = Read-Host "  Continue anyway? (yes/no)"
            if ($Continue -ne "yes" -and $Continue -ne "y") {
                Write-Host ""
                Write-Host "[CANCELLED] HTTPS configuration cancelled" -ForegroundColor Yellow
                exit 0
            }
        }
    } catch {
        Write-Host "  [ERROR] DNS lookup failed for '$Domain'" -ForegroundColor Red
        Write-Host "  $($_.Exception.Message)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "  Please ensure DNS is configured before proceeding:" -ForegroundColor Yellow
        Write-Host "    1. Create A record: $Domain → $Server" -ForegroundColor Gray
        Write-Host "    2. Wait for DNS propagation (5 min - 48 hours)" -ForegroundColor Gray
        Write-Host "    3. Verify with: nslookup $Domain" -ForegroundColor Gray
        Write-Host ""
        Write-Host "  Or use -SkipDNSCheck to skip this verification" -ForegroundColor Yellow
        Write-Host ""
        exit 1
    }
} else {
    Write-Host "[1/5] Skipping DNS check (as requested)" -ForegroundColor Yellow
}
Write-Host ""

# Step 2: Check FEIDE configuration
Write-Host "[2/5] FEIDE Configuration Check" -ForegroundColor Yellow
Write-Host ""
Write-Host "  IMPORTANT: Before proceeding, you must update FEIDE:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. Go to: https://dashboard.dataporten.no/" -ForegroundColor White
Write-Host "  2. Find your application (PHIS/PheNo)" -ForegroundColor White
Write-Host "  3. Update Redirect URI to:" -ForegroundColor White
Write-Host "     https://$Domain/app/openid" -ForegroundColor Cyan
Write-Host "  4. Save changes and wait 1-2 minutes" -ForegroundColor White
Write-Host ""
$FeideUpdated = Read-Host "  Have you updated FEIDE Dashboard? (yes/no)"

if ($FeideUpdated -ne "yes" -and $FeideUpdated -ne "y") {
    Write-Host ""
    Write-Host "[CANCELLED] Please update FEIDE first, then run this script again" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "See detailed instructions in:" -ForegroundColor Cyan
    Write-Host "  tools/docker-deployment/DNS-AND-HTTPS-SETUP.md" -ForegroundColor Gray
    Write-Host ""
    exit 0
}
Write-Host ""

# Step 3: Upload script to server
Write-Host "[3/5] Uploading HTTPS configuration script to server..." -ForegroundColor Yellow
Write-Host ""

Write-Host "  Uploading 05-configure-https.sh..." -ForegroundColor Gray
& scp -i $PrivateKeyPath -q "$LocalScriptPath" "${AdminUsername}@${Server}:${RemoteScriptPath}"

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Failed to upload script" -ForegroundColor Red
    exit 1
}

Write-Host "  [OK] Script uploaded successfully" -ForegroundColor Green
Write-Host ""

# Step 4: Make script executable
Write-Host "[4/5] Preparing script on server..." -ForegroundColor Yellow
Write-Host ""

Write-Host "  Setting executable permissions..." -ForegroundColor Gray
& ssh -i $PrivateKeyPath "$AdminUsername@$Server" "chmod +x $RemoteScriptPath"

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Failed to set permissions" -ForegroundColor Red
    exit 1
}

Write-Host "  [OK] Script ready to execute" -ForegroundColor Green
Write-Host ""

# Step 5: Execute HTTPS configuration
Write-Host "[5/5] Executing HTTPS configuration on server..." -ForegroundColor Yellow
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host ""

# Execute script with domain parameter
$ExecuteCommand = "sudo DOMAIN='$Domain' $RemoteScriptPath"
& ssh -i $PrivateKeyPath -t "$AdminUsername@$Server" $ExecuteCommand

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "[FAIL] HTTPS configuration failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Common issues:" -ForegroundColor Yellow
    Write-Host "  • DNS not fully propagated" -ForegroundColor Gray
    Write-Host "  • Port 80/443 blocked by firewall" -ForegroundColor Gray
    Write-Host "  • HAProxy not running" -ForegroundColor Gray
    Write-Host ""
    Write-Host "For troubleshooting, see:" -ForegroundColor Cyan
    Write-Host "  tools/docker-deployment/DNS-AND-HTTPS-SETUP.md" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host ""

# Success summary
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  HTTPS Configuration Complete!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "Your OpenSILEX deployment is now accessible via HTTPS:" -ForegroundColor White
Write-Host ""
Write-Host "  https://$Domain" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Test the application in your browser" -ForegroundColor White
Write-Host "  2. Test FEIDE login with your credentials" -ForegroundColor White
Write-Host "  3. Verify SSL certificate is valid (green padlock)" -ForegroundColor White
Write-Host "  4. Change default admin password" -ForegroundColor White
Write-Host ""
Write-Host "Credentials:" -ForegroundColor Yellow
Write-Host "  Default admin: admin@opensilex.org / admin" -ForegroundColor Gray
Write-Host "  (Change this immediately!)" -ForegroundColor Red
Write-Host ""
Write-Host "Certificate Auto-Renewal:" -ForegroundColor Yellow
Write-Host "  • Let's Encrypt certificates renew automatically" -ForegroundColor White
Write-Host "  • Valid for 90 days, renews at 30 days before expiry" -ForegroundColor White
Write-Host "  • Check status: ssh $AdminUsername@$Server sudo certbot certificates" -ForegroundColor Gray
Write-Host ""
Write-Host "For detailed documentation, see:" -ForegroundColor Cyan
Write-Host "  tools/docker-deployment/DNS-AND-HTTPS-SETUP.md" -ForegroundColor Gray
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
