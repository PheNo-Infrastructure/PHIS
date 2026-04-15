# Check RDF4J status on production server
$server = "172.211.86.191"
$container = "sandbox-opensilex-docker-rdf4j"

Write-Host "Checking RDF4J container status..." -ForegroundColor Cyan

# Check if container is running
ssh -i ~/.ssh/id_ed25519 azureuser@$server "docker ps --filter name=$container --format '{{.Names}} {{.Status}}'"

Write-Host "`nChecking RDF4J health..." -ForegroundColor Cyan

# Try to access RDF4J web interface
try {
    $response = Invoke-WebRequest -Uri "http://$server/rdf4j-workbench/" -Method GET -TimeoutSec 5
    Write-Host "RDF4J Web Interface: Accessible (HTTP $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "RDF4J Web Interface: NOT accessible" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)"
}

# Check RDF4J server endpoint
try {
    $response = Invoke-WebRequest -Uri "http://$server/rdf4j-server/" -Method GET -TimeoutSec 5
    Write-Host "RDF4J Server: Accessible (HTTP $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "RDF4J Server: NOT accessible" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)"
}

Write-Host "`nChecking RDF4J container logs for errors..." -ForegroundColor Cyan
ssh -i ~/.ssh/id_ed25519 azureuser@$server "docker logs --tail 50 $container 2>&1" | Select-String -Pattern "error|exception|EOF" -CaseSensitive:$false | Select-Object -First 10
