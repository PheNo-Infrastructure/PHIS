# Test device API manually
$apiUrl = "https://phis.pheno.no/sandbox/rest"

# Step 1: Authenticate
$authBody = @{
    identifier = "admin@opensilex.org"
    password = "admin"
} | ConvertTo-Json

$authResponse = Invoke-RestMethod -Uri "$apiUrl/security/authenticate" -Method POST -Body $authBody -ContentType "application/json"
$token = $authResponse.result.token

Write-Host "Authenticated successfully, token: $($token.Substring(0,20))..."

# Step 2: Try to create a device
$deviceBody = @{
    name = "test_device_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    rdf_type = "http://www.opensilex.org/vocabulary/oeso#SensingDevice"
    description = "Test sensor device"
} | ConvertTo-Json

Write-Host "`nAttempting to create device..."
Write-Host "Request body: $deviceBody"

try {
    $deviceResponse = Invoke-RestMethod -Uri "$apiUrl/core/devices" -Method POST `
        -Headers @{ Authorization = "Bearer $token" } `
        -Body $deviceBody `
        -ContentType "application/json"

    Write-Host "`nSuccess! Device created: $($deviceResponse.result)"
} catch {
    Write-Host "`nError creating device:"
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)"
    Write-Host "Error Message: $($_.Exception.Message)"

    # Try to get response body
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $responseBody = $reader.ReadToEnd()
    Write-Host "Response Body:"
    $responseBody | ConvertFrom-Json | ConvertTo-Json -Depth 10
}
