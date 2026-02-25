#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Clean rebuild of OpenSILEX with patches
.DESCRIPTION
    Removes existing containers, images, and build cache, then rebuilds from scratch
#>

param(
    [string]$Server = "20.61.108.197",
    [string]$User = "azureuser",
    [string]$SSHKey = "~/.ssh/id_ed25519",
    [string]$ApiKeysFile = "..\config\test-api-keys.conf"
)

$SSHKey = Resolve-Path $SSHKey -ErrorAction Stop

Write-Host "=== Clean Rebuild OpenSILEX ===" -ForegroundColor Cyan
Write-Host "Server: $Server" -ForegroundColor Gray
Write-Host ""

# Step 1: Stop and remove containers
Write-Host "[1/4] Stopping and removing OpenSILEX container..." -ForegroundColor Yellow

$CleanCmd = @'
cd ~/opensilex-docker-compose
docker compose --env-file opensilex.env down opensilex
docker compose --env-file opensilex.env rm -f opensilex
'@

ssh -i $SSHKey "$User@$Server" $CleanCmd

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Container removed" -ForegroundColor Green
} else {
    Write-Host "  WARNING: Failed to remove container" -ForegroundColor Yellow
}
Write-Host ""

# Step 2: Remove OpenSILEX images
Write-Host "[2/4] Removing OpenSILEX Docker images..." -ForegroundColor Yellow

$RemoveImagesCmd = @'
docker images | grep opensilex | awk '{print $3}' | xargs -r docker rmi -f
'@

ssh -i $SSHKey "$User@$Server" $RemoveImagesCmd 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Images removed" -ForegroundColor Green
} else {
    Write-Host "  WARNING: No images to remove or removal failed" -ForegroundColor Yellow
}
Write-Host ""

# Step 3: Prune Docker build cache
Write-Host "[3/4] Pruning Docker build cache..." -ForegroundColor Yellow

ssh -i $SSHKey "$User@$Server" "docker builder prune -af" 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Build cache cleared" -ForegroundColor Green
} else {
    Write-Host "  WARNING: Failed to clear build cache" -ForegroundColor Yellow
}
Write-Host ""

# Step 4: Run apply-patches with rebuild
Write-Host "[4/4] Running apply-patches.ps1 with clean rebuild..." -ForegroundColor Yellow
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ApplyPatchesScript = Join-Path $ScriptDir "apply-patches.ps1"

& $ApplyPatchesScript -Server $Server -User $User -SSHKey $SSHKey -Rebuild -ApiKeysFile $ApiKeysFile

Write-Host ""
Write-Host "=== Clean Rebuild Complete ===" -ForegroundColor Cyan
