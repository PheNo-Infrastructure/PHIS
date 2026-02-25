#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Install Docker and Docker Compose on Debian 11 server
.DESCRIPTION
    Automated Docker installation for OpenSILEX deployment prerequisites
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$TargetIP,

    [string]$User = "azureuser",
    [string]$SSHKey = "~/.ssh/id_ed25519"
)

$SSHKey = Resolve-Path $SSHKey -ErrorAction Stop

Write-Host "=== Install Docker on Debian 11 ===" -ForegroundColor Cyan
Write-Host "Target: $TargetIP" -ForegroundColor Gray
Write-Host "User: $User" -ForegroundColor Gray
Write-Host ""

# Step 1: Remove old Docker versions
Write-Host "[1/6] Removing old Docker versions..." -ForegroundColor Yellow

$RemoveOldCmd = @'
sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
'@

ssh -i $SSHKey "$User@$TargetIP" $RemoveOldCmd

Write-Host "  Done" -ForegroundColor Green
Write-Host ""

# Step 2: Update apt and install prerequisites
Write-Host "[2/6] Installing prerequisites..." -ForegroundColor Yellow

$InstallPrereqsCmd = @'
sudo apt-get update && \
sudo apt-get install -y ca-certificates curl gnupg
'@

ssh -i $SSHKey "$User@$TargetIP" $InstallPrereqsCmd

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] Failed to install prerequisites" -ForegroundColor Red
    exit 1
}

Write-Host "  Done" -ForegroundColor Green
Write-Host ""

# Step 3: Add Docker GPG key
Write-Host "[3/6] Adding Docker GPG key..." -ForegroundColor Yellow

$AddGPGKeyCmd = @'
sudo install -m 0755 -d /etc/apt/keyrings && \
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg && \
sudo chmod a+r /etc/apt/keyrings/docker.gpg
'@

ssh -i $SSHKey "$User@$TargetIP" $AddGPGKeyCmd

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] Failed to add Docker GPG key" -ForegroundColor Red
    exit 1
}

Write-Host "  Done" -ForegroundColor Green
Write-Host ""

# Step 4: Add Docker repository
Write-Host "[4/6] Adding Docker repository..." -ForegroundColor Yellow

$AddRepoCmd = @'
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null && \
sudo apt-get update
'@

ssh -i $SSHKey "$User@$TargetIP" $AddRepoCmd

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] Failed to add Docker repository" -ForegroundColor Red
    exit 1
}

Write-Host "  Done" -ForegroundColor Green
Write-Host ""

# Step 5: Install Docker Engine
Write-Host "[5/6] Installing Docker Engine..." -ForegroundColor Yellow

$InstallDockerCmd = @'
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
'@

ssh -i $SSHKey "$User@$TargetIP" $InstallDockerCmd

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] Failed to install Docker" -ForegroundColor Red
    exit 1
}

Write-Host "  Done" -ForegroundColor Green
Write-Host ""

# Step 6: Configure user permissions
Write-Host "[6/6] Configuring Docker permissions..." -ForegroundColor Yellow

$ConfigurePermsCmd = @'
sudo usermod -aG docker $USER && \
sudo systemctl enable docker && \
sudo systemctl start docker
'@

ssh -i $SSHKey "$User@$TargetIP" $ConfigurePermsCmd

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] Failed to configure Docker permissions" -ForegroundColor Red
    exit 1
}

Write-Host "  Done" -ForegroundColor Green
Write-Host ""

# Verify installation
Write-Host "Verifying Docker installation..." -ForegroundColor Yellow

$VerifyCmd = @'
sudo docker --version && sudo docker compose version
'@

$VerifyOutput = ssh -i $SSHKey "$User@$TargetIP" $VerifyCmd

if ($LASTEXITCODE -eq 0) {
    Write-Host "  Docker version:" -ForegroundColor Green
    Write-Host "    $($VerifyOutput -join "`n    ")" -ForegroundColor Gray
} else {
    Write-Host "  [FAIL] Docker verification failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Docker Installation Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "IMPORTANT: Log out and log back in for group membership to take effect," -ForegroundColor Yellow
Write-Host "           or run 'newgrp docker' before using Docker without sudo." -ForegroundColor Yellow
Write-Host ""
Write-Host "Next step: Run deploy-opensilex-docker.ps1 to install OpenSILEX" -ForegroundColor Cyan
