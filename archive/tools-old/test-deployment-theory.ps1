#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Test if custom CSS/JS files can be accessed from OpenSILEX

.DESCRIPTION
    This script helps diagnose why pheno-overrides.css and pheno-text-replace.js
    return 404 errors even though they're in the JAR.

.PARAMETER ServerHost
    The server to test

.PARAMETER ServerUser
    SSH username (default: azureuser)
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$ServerHost,

    [Parameter(Mandatory=$false)]
    [string]$ServerUser = "azureuser",

    [Parameter(Mandatory=$false)]
    [string]$OpenSilexPath = "/home/azureuser/opensilex"
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== OpenSILEX Static File Routing Test ===`n" -ForegroundColor Cyan

# Step 1: Check if files are in JAR
Write-Host "[1] Checking if files exist in JAR..." -ForegroundColor Yellow
$jarPath = "$OpenSilexPath/bin/1.4.9-rdg/modules/opensilex-front.jar"

$testFiles = @(
    "front/css/pheno-overrides.css",
    "front/js/pheno-text-replace.js",
    "front/css/app.css",
    "front/index.html"
)

foreach ($file in $testFiles) {
    $result = ssh "$ServerUser@$ServerHost" "jar -tf $jarPath | grep -c '^$file$'" 2>&1
    if ($result -eq "1") {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file NOT FOUND" -ForegroundColor Red
    }
}

# Step 2: Extract and examine file contents
Write-Host "`n[2] Extracting CSS file to verify it's not empty..." -ForegroundColor Yellow
$extractCmd = @"
cd /tmp &&
rm -rf pheno-test-$$ &&
mkdir pheno-test-$$ &&
cd pheno-test-$$ &&
jar -xf $jarPath front/css/pheno-overrides.css 2>&1 &&
ls -lh front/css/pheno-overrides.css 2>&1 &&
head -5 front/css/pheno-overrides.css 2>&1 &&
cd /tmp &&
rm -rf pheno-test-$$
"@

Write-Host "Command output:"
ssh "$ServerUser@$ServerHost" $extractCmd

# Step 3: Check OpenSILEX configuration
Write-Host "`n[3] Looking for Spring Boot static resource configuration..." -ForegroundColor Yellow
Write-Host "Checking if there's a static resource handler configuration..."

$configCheck = @"
cd $OpenSilexPath/bin/1.4.9-rdg/modules &&
jar -tf opensilex.jar | grep -E '(application\.properties|application\.yml|WebMvcConfigurer)' | head -10
"@

ssh "$ServerUser@$ServerHost" $configCheck 2>&1

# Step 4: Check what URLs are actually accessible
Write-Host "`n[4] Testing URL accessibility (requires OpenSILEX to be running)..." -ForegroundColor Yellow

$testUrls = @(
    "http://localhost:8666/css/pheno-overrides.css",
    "http://localhost:8666/osfront/css/app.css",
    "http://localhost:8666/js/pheno-text-replace.js",
    "http://localhost:8666/osfront/opensilex.png"
)

foreach ($url in $testUrls) {
    $curlCmd = "curl -s -o /dev/null -w '%{http_code}' '$url'"
    $statusCode = ssh "$ServerUser@$ServerHost" $curlCmd 2>&1
    $status = if ($statusCode -eq "200") { "✓" } else { "✗" }
    $color = if ($statusCode -eq "200") { "Green" } else { "Red" }
    Write-Host "  $status $url → HTTP $statusCode" -ForegroundColor $color
}

# Step 5: Compare with working app.css
Write-Host "`n[5] Comparing structure with working files..." -ForegroundColor Yellow
Write-Host "Files under front/css/ in JAR:"
ssh "$ServerUser@$ServerHost" "jar -tf $jarPath | grep '^front/css/'"

Write-Host "`nFiles under front/js/ in JAR:"
ssh "$ServerUser@$ServerHost" "jar -tf $jarPath | grep '^front/js/'"

Write-Host "`nFiles under front/osfront/css/ in JAR:"
ssh "$ServerUser@$ServerHost" "jar -tf $jarPath | grep '^front/osfront/css/'" | Select-Object -First 5

# Step 6: Theory test
Write-Host "`n[6] THEORY: Files might need to be under front/osfront/ instead" -ForegroundColor Yellow
Write-Host "Testing if we should use these paths instead:"
Write-Host "  front/osfront/css/pheno-overrides.css → /osfront/css/pheno-overrides.css"
Write-Host "  front/osfront/js/pheno-text-replace.js → /osfront/js/pheno-text-replace.js"
Write-Host ""
Write-Host "And update index.html to use:"
Write-Host '  <link href="osfront/css/pheno-overrides.css" rel="stylesheet">'
Write-Host '  <script src="osfront/js/pheno-text-replace.js"></script>'

Write-Host "`n=== Diagnosis Complete ===`n" -ForegroundColor Cyan
Write-Host "Next steps:"
Write-Host "1. If files are in JAR but return 404, the path mapping is wrong"
Write-Host "2. Try placing files under front/osfront/css/ and front/osfront/js/"
Write-Host "3. Update index.html links to use osfront/ prefix"
Write-Host "4. Or investigate Spring Boot ResourceHandlers in OpenSILEX source"
