#!/usr/bin/env pwsh
# Send researcher invites via the OpenSILEX invite API.
# Usage: .\scripts\send-invite.ps1

$OPENSILEX_URL = "https://phis.pheno.no"
$ADMIN_EMAIL   = "admin@opensilex.org"
$KV_NAME       = "phis-kv"
$KV_SECRET     = "opensilex-admin-password"

Write-Host "Fetching admin password from Key Vault '$KV_NAME'..."
$password = (az keyvault secret show --vault-name $KV_NAME --name $KV_SECRET --query value -o tsv 2>&1)
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to fetch secret. Are you logged in? Try: az login"
    exit 1
}

Write-Host "Authenticating as $ADMIN_EMAIL..."
$authBody = @{ identifier = $ADMIN_EMAIL; password = $password } | ConvertTo-Json
$authResp  = Invoke-RestMethod -Uri "$OPENSILEX_URL/rest/security/authenticate" `
    -Method POST -ContentType "application/json" -Body $authBody
$token = $authResp.result.token
if (-not $token) {
    Write-Error "Authentication failed. Check the admin password in Key Vault."
    exit 1
}
Write-Host "Authenticated.`n"

while ($true) {
    $email = Read-Host "Email to invite (blank to quit)"
    if ([string]::IsNullOrWhiteSpace($email)) { break }

    try {
        $body = @{ email = $email } | ConvertTo-Json
        $resp = Invoke-RestMethod -Uri "$OPENSILEX_URL/rest/security/invite" `
            -Method POST -ContentType "application/json" `
            -Headers @{ Authorization = "Bearer $token" } -Body $body
        Write-Host "  Invite sent to $email"
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        Write-Warning "  Failed ($status): $($_.ErrorDetails.Message)"
    }
}

Write-Host "`nDone."
