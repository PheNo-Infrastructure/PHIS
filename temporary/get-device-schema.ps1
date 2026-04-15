$response = Invoke-RestMethod -Uri 'https://phis.pheno.no/sandbox/rest/swagger.json'
$deviceDTO = $response.definitions.DeviceCreationDTO
$deviceDTO | ConvertTo-Json -Depth 10
