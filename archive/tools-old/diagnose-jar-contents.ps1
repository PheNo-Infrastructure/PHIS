#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Compare JAR contents between working and non-working servers

.DESCRIPTION
    This diagnostic script extracts and compares the opensilex-front.jar
    contents from a working server vs a failed deployment to identify differences.

.PARAMETER WorkingServer
    The working test server (default: 20.234.181.44)

.PARAMETER FailedServer
    The server with failed deployment

.PARAMETER ServerUser
    SSH username (default: azureuser)

.EXAMPLE
    .\diagnose-jar-contents.ps1 -FailedServer 172.211.86.191
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$WorkingServer = "20.234.181.44",

    [Parameter(Mandatory=$true)]
    [string]$FailedServer,

    [Parameter(Mandatory=$false)]
    [string]$ServerUser = "azureuser",

    [Parameter(Mandatory=$false)]
    [string]$OpenSilexPath = "/home/azureuser/opensilex"
)

Write-Host "`n=== OpenSILEX JAR Diagnostic Tool ===`n" -ForegroundColor Cyan

# Check critical files in both JARs
$criticalFiles = @(
    "front/index.html"
    "front/css/pheno-overrides.css"
    "front/js/pheno-text-replace.js"
    "front/theme/opensilex/_settings.scss"
    "front/theme/opensilex/images/logo-opensilex.png"
)

Write-Host "Checking WORKING server ($WorkingServer)..." -ForegroundColor Green
foreach ($file in $criticalFiles) {
    $checkCmd = "jar -tf $OpenSilexPath/bin/1.4.9-rdg/modules/opensilex-front.jar | grep -c '$file'"
    $result = ssh "$ServerUser@$WorkingServer" $checkCmd 2>&1
    $status = if ($result -eq "1") { "✓" } else { "✗" }
    Write-Host "  $status $file" -ForegroundColor $(if ($result -eq "1") { "Green" } else { "Red" })
}

Write-Host "`nChecking FAILED server ($FailedServer)..." -ForegroundColor Yellow
foreach ($file in $criticalFiles) {
    $checkCmd = "jar -tf $OpenSilexPath/bin/1.4.9-rdg/modules/opensilex-front.jar | grep -c '$file'"
    $result = ssh "$ServerUser@$FailedServer" $checkCmd 2>&1
    $status = if ($result -eq "1") { "✓" } else { "✗" }
    Write-Host "  $status $file" -ForegroundColor $(if ($result -eq "1") { "Green" } else { "Red" })
}

# Compare file sizes
Write-Host "`nComparing file sizes in JARs..." -ForegroundColor Cyan
foreach ($file in $criticalFiles) {
    Write-Host "`n$file" -ForegroundColor White

    # Extract from working server
    $workingCmd = "cd /tmp && jar -xf $OpenSilexPath/bin/1.4.9-rdg/modules/opensilex-front.jar $file 2>/dev/null && ls -lh $file 2>/dev/null | awk '{print `$5}' && rm -rf front"
    $workingSize = ssh "$ServerUser@$WorkingServer" $workingCmd 2>&1

    # Extract from failed server
    $failedCmd = "cd /tmp && jar -xf $OpenSilexPath/bin/1.4.9-rdg/modules/opensilex-front.jar $file 2>/dev/null && ls -lh $file 2>/dev/null | awk '{print `$5}' && rm -rf front"
    $failedSize = ssh "$ServerUser@$FailedServer" $failedCmd 2>&1

    Write-Host "  Working: $workingSize"
    Write-Host "  Failed:  $failedSize"

    if ($workingSize -ne $failedSize) {
        Write-Host "  ⚠️  SIZE MISMATCH!" -ForegroundColor Red
    }
}

# Check all /css/ and /js/ files
Write-Host "`n=== All CSS/JS files in JARs ===`n" -ForegroundColor Cyan

Write-Host "WORKING server:" -ForegroundColor Green
$workingCssJs = ssh "$ServerUser@$WorkingServer" "jar -tf $OpenSilexPath/bin/1.4.9-rdg/modules/opensilex-front.jar | grep -E 'front/(css|js)/'"
Write-Host $workingCssJs

Write-Host "`nFAILED server:" -ForegroundColor Yellow
$failedCssJs = ssh "$ServerUser@$FailedServer" "jar -tf $OpenSilexPath/bin/1.4.9-rdg/modules/opensilex-front.jar | grep -E 'front/(css|js)/'"
Write-Host $failedCssJs

Write-Host "`n=== Diagnosis Complete ===`n" -ForegroundColor Cyan
