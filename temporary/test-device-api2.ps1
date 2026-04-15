# Test device API manually using Invoke-WebRequest for better error handling
$apiUrl = "https://phis.pheno.no/sandbox/rest"

# Step 1: Authenticate
$authBody = @{
    identifier = "admin@opensilex.org"
    password = "admin"
} | ConvertTo-Json

$authResponse = Invoke-RestMethod -Uri "$apiUrl/security/authenticate" -Method POST -Body $authBody -ContentType "application/json"
$token = $authResponse.result.token

Write-Host "Authenticated successfully"

# Step 2: Try to create a device
$deviceBody = @{
    name = "test_device_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    rdf_type = "http://www.opensilex.org/vocabulary/oeso#SensingDevice"
    description = "Test sensor device"
} | ConvertTo-Json

Write-Host "`nAttempting to create device with data:"
Write-Host $deviceBody

try {
    $response = Invoke-WebRequest -Uri "$apiUrl/core/devices" -Method POST `
        -Headers @{
            Authorization = "Bearer $token"
            "Content-Type" = "application/json"
        } `
        -Body $deviceBody

    Write-Host "`nSuccess! Status: $($response.StatusCode)"
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
} catch {
    Write-Host "`nError Status: $($_.Exception.Response.StatusCode)"
    Write-Host "Response Body:"
    $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json -Depth 10
}
