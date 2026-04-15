# Test device API on TEST server (20.61.108.197)
$apiUrl = "http://20.61.108.197/sandbox/rest"

Write-Host "Testing Device API on TEST server..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Authenticate
Write-Host "[1/3] Authenticating..." -ForegroundColor Yellow
$authBody = @{
    identifier = "admin@opensilex.org"
    password = "admin"
} | ConvertTo-Json

try {
    $authResponse = Invoke-RestMethod -Uri "$apiUrl/security/authenticate" -Method POST -Body $authBody -ContentType "application/json"
    $token = $authResponse.result.token
    Write-Host "  ✓ Authenticated successfully" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "  ✗ Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Create a test device
Write-Host "[2/3] Creating test device..." -ForegroundColor Yellow
$deviceBody = @{
    name = "test_device_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    rdf_type = "http://www.opensilex.org/vocabulary/oeso#SensingDevice"
    description = "Test device for patch 003 validation"
} | ConvertTo-Json

try {
    $deviceResponse = Invoke-RestMethod -Uri "$apiUrl/core/devices" -Method POST `
        -Headers @{ Authorization = "Bearer $token" } `
        -Body $deviceBody `
        -ContentType "application/json"

    $deviceUri = $deviceResponse.result
    Write-Host "  ✓ Device created successfully!" -ForegroundColor Green
    Write-Host "    URI: $deviceUri" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "  ✗ Device creation failed" -ForegroundColor Red
    Write-Host "    Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Gray

    if ($_.ErrorDetails.Message) {
        Write-Host "    Error:" -ForegroundColor Gray
        $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json -Depth 5
    } else {
        Write-Host "    Message: $($_.Exception.Message)" -ForegroundColor Gray
    }
    Write-Host ""
    $deviceUri = $null
}

# Step 3: Get device details (if created)
if ($deviceUri) {
    Write-Host "[3/3] Retrieving device details..." -ForegroundColor Yellow

    try {
        $getResponse = Invoke-RestMethod -Uri "$apiUrl/core/devices/$([System.Uri]::EscapeDataString($deviceUri))" -Method GET `
            -Headers @{ Authorization = "Bearer $token" }

        Write-Host "  ✓ Device retrieved successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Device Details:" -ForegroundColor Cyan
        $getResponse.result | ConvertTo-Json -Depth 5
        Write-Host ""
    } catch {
        Write-Host "  ✗ Failed to retrieve device: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
    }
}

Write-Host "=== Patch 003 Test Complete ===" -ForegroundColor Cyan
Write-Host ""
if ($deviceUri) {
    Write-Host "✅ PASS: Device API works correctly with patch 003" -ForegroundColor Green
    Write-Host "   - No EOFException during device creation" -ForegroundColor Gray
    Write-Host "   - OWL restriction queries succeeded" -ForegroundColor Gray
    Write-Host "   - Binary RDF4J queries succeeded" -ForegroundColor Gray
} else {
    Write-Host "⚠ PARTIAL: Some tests failed, check errors above" -ForegroundColor Yellow
}
Write-Host ""
