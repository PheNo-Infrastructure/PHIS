#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Unified deployment script for OpenSILEX across multiple environments

.DESCRIPTION
    Simplifies OpenSILEX deployment by using environment profiles that automatically configure:
    - VM deployment (creates/reuses Azure VM with correct IP)
    - Docker installation
    - OpenSILEX deployment with GraphDB triplestore (default, replaces RDF4J)
    - Feide/OpenID configuration with environment-specific credentials
    - Security patches
    - PheNo theme

.PARAMETER Environment
    Environment to deploy (sandbox, test, production)
    Automatically loads configuration from tools/config/vm-config-{environment}.json
    and tools/config/api-keys-{environment}.conf

.PARAMETER SkipVM
    Skip VM creation (use this if VM already exists)

.PARAMETER SkipDocker
    Skip Docker installation (use if Docker already installed)

.PARAMETER SkipOpenSILEX
    Skip OpenSILEX deployment (use for testing other steps)

.PARAMETER SkipFeide
    Skip Feide/OpenID configuration

.PARAMETER SkipPatches
    Skip applying security patches

.PARAMETER SkipTheme
    Skip applying PheNo theme

.EXAMPLE
    # Full deployment to test environment (VM + Docker + OpenSILEX + everything)
    .\deploy-environment.ps1 -Environment test

    # Production deployment
    .\deploy-environment.ps1 -Environment production

    # Redeploy OpenSILEX on existing VM (skip VM creation and Docker install)
    .\deploy-environment.ps1 -Environment test -SkipVM -SkipDocker

    # Just apply patches and theme to existing deployment
    .\deploy-environment.ps1 -Environment test -SkipVM -SkipDocker -SkipOpenSILEX -SkipFeide
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("sandbox", "test", "production")]
    [string]$Environment,

    [switch]$SkipVM,
    [switch]$SkipDocker,
    [switch]$SkipOpenSILEX,
    [switch]$SkipFeide,
    [switch]$SkipPatches,
    [switch]$SkipTheme,

    # Pre-built patched image from ghcr.io. Build via GitHub Actions before deploying.
    # e.g. ghcr.io/siv017/opensilex-phis:latest
    [string]$PatchedImage = ""
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  OpenSILEX Environment Deployment: $($Environment.ToUpper())" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# Load environment configuration
# ─────────────────────────────────────────────────────────────────────────────

$ConfigPath = Join-Path $PSScriptRoot "tools\config\vm-config-$Environment.json"
$ApiKeysPath = Join-Path $PSScriptRoot "tools\config\api-keys-$Environment.conf"

if (-not (Test-Path $ConfigPath)) {
    Write-Host "[FAIL] VM config not found: $ConfigPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $ApiKeysPath)) {
    Write-Host "[WARNING] API keys config not found: $ApiKeysPath" -ForegroundColor Yellow
    Write-Host "          Feide/OpenID authentication will be skipped" -ForegroundColor Yellow
    $SkipFeide = $true
}

Write-Host "Loading configuration..." -ForegroundColor Yellow
$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json

Write-Host "  Environment: $($config.environment)" -ForegroundColor Green
Write-Host "  VM Name: $($config.vmName)" -ForegroundColor Gray
Write-Host "  Resource Group: $($config.resourceGroupName)" -ForegroundColor Gray
Write-Host "  Location: $($config.location)" -ForegroundColor Gray
if ($config.staticIP) {
    Write-Host "  Static IP: $($config.staticIP)" -ForegroundColor Yellow
}
Write-Host ""

# Determine target IP (existing or to-be-created)
$TargetIP = $config.staticIP
if (-not $TargetIP) {
    if ($SkipVM) {
        Write-Host "[FAIL] SkipVM specified but no staticIP in config - cannot determine target IP" -ForegroundColor Red
        exit 1
    }
    Write-Host "  VM will be created with new IP (will be determined after VM creation)" -ForegroundColor Yellow
}

# Derive base URI: use HTTPS domain for production, IP for sandbox/test
$BaseURI = if ($config.domain) { "https://$($config.domain)/" } else { "http://$TargetIP/" }

# Derive alias: first segment of domain (e.g. "phis" from "phis.pheno.no") or environment name
$BaseURIAlias = if ($config.domain) { $config.domain.Split('.')[0] } else { $Environment }

# Auto-detect patched image from git remote if not specified
if (-not $PatchedImage) {
    $GitRemote = git remote get-url origin 2>$null
    if ($GitRemote -match 'github\.com[:/]([^/]+)/') {
        $PatchedImage = "ghcr.io/$($Matches[1])/opensilex-phis:latest"
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Create/Verify Azure VM
# ─────────────────────────────────────────────────────────────────────────────

if (-not $SkipVM) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  [1/6] Creating/Verifying Azure VM" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""

    & "$PSScriptRoot\create-azure-vm.ps1" -Environment $Environment

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[FAIL] VM creation failed" -ForegroundColor Red
        exit 1
    }

    # If we created a new VM, get the IP
    if (-not $TargetIP) {
        $publicIP = Get-AzPublicIpAddress -ResourceGroupName $config.resourceGroupName -Name "$($config.vmName)-ip" -ErrorAction SilentlyContinue
        if ($publicIP) {
            $TargetIP = $publicIP.IpAddress
            Write-Host ""
            Write-Host "  New VM IP: $TargetIP" -ForegroundColor Green
        } else {
            Write-Host "[FAIL] Could not determine VM IP address" -ForegroundColor Red
            exit 1
        }
    }
} else {
    Write-Host "[SKIP] VM creation (using existing VM at $TargetIP)" -ForegroundColor Yellow
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Install Docker
# ─────────────────────────────────────────────────────────────────────────────

if (-not $SkipDocker) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  [2/6] Installing Docker" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""

    & "$PSScriptRoot\tools\docker-deployment\00-install-docker.ps1" -TargetIP $TargetIP

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[FAIL] Docker installation failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[SKIP] Docker installation" -ForegroundColor Yellow
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Deploy OpenSILEX
# ─────────────────────────────────────────────────────────────────────────────

if (-not $SkipOpenSILEX) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  [3/6] Deploying OpenSILEX with GraphDB" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""

    if (Test-Path $ApiKeysPath) {
        & "$PSScriptRoot\tools\docker-deployment\01-deploy-opensilex-graphdb.ps1" `
            -TargetIP $TargetIP `
            -BaseURI $BaseURI `
            -BaseURIAlias $BaseURIAlias `
            -ApiKeysFile $ApiKeysPath
    } else {
        & "$PSScriptRoot\tools\docker-deployment\01-deploy-opensilex-graphdb.ps1" `
            -TargetIP $TargetIP `
            -BaseURI $BaseURI `
            -BaseURIAlias $BaseURIAlias
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[FAIL] OpenSILEX deployment failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[SKIP] OpenSILEX deployment" -ForegroundColor Yellow
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 4: Configure Feide/OpenID
# ─────────────────────────────────────────────────────────────────────────────

if (-not $SkipFeide -and (Test-Path $ApiKeysPath)) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  [4/6] Configuring Feide/OpenID" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""

    & "$PSScriptRoot\tools\docker-deployment\02-configure-feide.ps1" `
        -TargetIP $TargetIP `
        -ApiKeysFile $ApiKeysPath

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[FAIL] Feide configuration failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[SKIP] Feide/OpenID configuration" -ForegroundColor Yellow
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 5: Apply Security Patches
# ─────────────────────────────────────────────────────────────────────────────

if (-not $SkipPatches) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  [5/6] Applying Security Patches" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""

    & "$PSScriptRoot\tools\docker-deployment\03-apply-patches.ps1" -Server $TargetIP -ApiKeysFile $ApiKeysPath -PatchedImage $PatchedImage

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[FAIL] Patch application failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[SKIP] Security patches" -ForegroundColor Yellow
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 6: Apply PheNo Theme
# ─────────────────────────────────────────────────────────────────────────────

if (-not $SkipTheme) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  [6/6] Applying PheNo Theme" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""

    & "$PSScriptRoot\tools\docker-deployment\04-apply-theme.ps1" -Server $TargetIP

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[FAIL] Theme application failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[SKIP] PheNo theme" -ForegroundColor Yellow
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 7: Configure HTTPS (Production Only)
# ─────────────────────────────────────────────────────────────────────────────

if ($Environment -eq "production" -and $config.domain) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  [7/6] Configuring HTTPS (Production)" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""

    & "$PSScriptRoot\tools\docker-deployment\05-configure-https.ps1" `
        -Server $TargetIP `
        -Domain $config.domain

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[FAIL] HTTPS configuration failed" -ForegroundColor Red
        Write-Host "Note: You can configure HTTPS manually later using:" -ForegroundColor Yellow
        Write-Host "  .\tools\docker-deployment\05-configure-https.ps1 -Server $TargetIP -Domain $($config.domain)" -ForegroundColor Gray
        exit 1
    }
} else {
    if ($Environment -eq "production") {
        Write-Host "[SKIP] HTTPS configuration (no domain specified in vm-config-production.json)" -ForegroundColor Yellow
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# Deployment Complete!
# ─────────────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  🎉 Deployment Complete: $($Environment.ToUpper())" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "Environment Details:" -ForegroundColor Cyan
Write-Host "  Environment: $Environment" -ForegroundColor White
Write-Host "  VM Name: $($config.vmName)" -ForegroundColor White
Write-Host "  IP Address: $TargetIP" -ForegroundColor White
Write-Host "  Resource Group: $($config.resourceGroupName)" -ForegroundColor White
Write-Host ""
Write-Host "Access OpenSILEX:" -ForegroundColor Cyan
if ($Environment -eq "production" -and $config.domain) {
    Write-Host "  URL: https://$($config.domain)/sandbox/app/" -ForegroundColor White
} else {
    Write-Host "  URL: http://$TargetIP/sandbox/app/" -ForegroundColor White
}
Write-Host "  Admin: admin@opensilex.org / admin" -ForegroundColor Gray
Write-Host ""
Write-Host "SSH Access:" -ForegroundColor Cyan
Write-Host "  ssh $($config.adminUsername)@$TargetIP" -ForegroundColor White
Write-Host ""

if ($Environment -eq "production") {
    Write-Host "NEXT STEPS FOR PRODUCTION:" -ForegroundColor Yellow
    if ($config.domain) {
        Write-Host "  1. ✅ DNS configured: $($config.domain) → $TargetIP" -ForegroundColor Green
        Write-Host "  2. ✅ HTTPS configured with Let's Encrypt SSL" -ForegroundColor Green
        Write-Host "  3. Update FEIDE redirect URI to: https://$($config.domain)/sandbox/app/openid" -ForegroundColor White
        Write-Host "  4. Change default admin password immediately" -ForegroundColor White
        Write-Host "  5. Update GitHub secrets for CI/CD:" -ForegroundColor White
        Write-Host "     - OPENSILEX_API_URL = https://$($config.domain)/sandbox/rest" -ForegroundColor Gray
        Write-Host "     - OPENSILEX_SERVER = $TargetIP" -ForegroundColor Gray
        Write-Host "     - OPENSILEX_ADMIN_PASSWORD = [set production password]" -ForegroundColor Gray
    } else {
        Write-Host "  1. Configure DNS to point to: $TargetIP" -ForegroundColor White
        Write-Host "  2. Update GitHub secrets for CI/CD:" -ForegroundColor White
        Write-Host "     - OPENSILEX_API_URL = http://$TargetIP/sandbox/rest" -ForegroundColor Gray
        Write-Host "     - OPENSILEX_SERVER = $TargetIP" -ForegroundColor Gray
        Write-Host "     - OPENSILEX_ADMIN_PASSWORD = [set production password]" -ForegroundColor Gray
        Write-Host "  3. Change default admin password immediately" -ForegroundColor White
    }
    Write-Host ""
}
