#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Create Azure VM for OpenSILEX Docker deployment
.DESCRIPTION
    Creates a Debian 12 VM on Azure using ARM template with SSH key authentication
.PARAMETER VMName
    Name of the VM (default: PHIS-TEST-DOCKER)
.PARAMETER ResourceGroupName
    Azure resource group name (default: PHIS-TEST-DOCKER)
.PARAMETER Location
    Azure region (default: westeurope)
.PARAMETER AdminUsername
    SSH username (default: azureuser)
.PARAMETER SSHKeyPath
    Path to SSH public key (default: ~/.ssh/id_ed25519.pub)
.EXAMPLE
    .\create-azure-vm.ps1
    .\create-azure-vm.ps1 -VMName "my-opensilex-vm" -Location "northeurope"
#>

param(
    [string]$VMName = "PHIS-TEST-DOCKER",
    [string]$ResourceGroupName = "PHIS-TEST-DOCKER",
    [string]$Location = "westeurope",
    [string]$AdminUsername = "azureuser",
    [string]$SSHKeyPath = "~/.ssh/id_ed25519.pub"
)

Write-Host "=== Azure VM Creation for OpenSILEX Docker ===" -ForegroundColor Cyan
Write-Host ""

# Resolve paths
if ($SSHKeyPath -match '^~') {
    $SSHKeyPath = $SSHKeyPath -replace '^~', $env:USERPROFILE
}
$SSHKeyPath = Resolve-Path $SSHKeyPath -ErrorAction Stop

$TemplatePath = Join-Path $PSScriptRoot "tools\template-vm.json"
if (-not (Test-Path $TemplatePath)) {
    Write-Host "[FAIL] ARM template not found: $TemplatePath" -ForegroundColor Red
    exit 1
}

# Check prerequisites
Write-Host "[1/4] Checking prerequisites..." -ForegroundColor Yellow

if (-not (Get-Module -ListAvailable -Name Az)) {
    Write-Host "  [FAIL] Azure PowerShell module not found" -ForegroundColor Red
    Write-Host "  Install with: Install-Module -Name Az -Repository PSGallery -Force" -ForegroundColor Gray
    exit 1
}

try {
    $context = Get-AzContext
    if (-not $context) {
        Write-Host "  [FAIL] Not logged into Azure" -ForegroundColor Red
        Write-Host "  Run: Connect-AzAccount" -ForegroundColor Gray
        exit 1
    }
    Write-Host "  Azure context: $($context.Account.Id)" -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] Not logged into Azure" -ForegroundColor Red
    Write-Host "  Run: Connect-AzAccount" -ForegroundColor Gray
    exit 1
}

Write-Host ""

# Check if VM already exists
Write-Host "[2/4] Checking for existing VM..." -ForegroundColor Yellow

$existingVM = Get-AzVM -ResourceGroupName $ResourceGroupName -Name $VMName -ErrorAction SilentlyContinue
if ($existingVM) {
    Write-Host "  VM '$VMName' already exists" -ForegroundColor Yellow

    $vmStatus = Get-AzVM -ResourceGroupName $ResourceGroupName -Name $VMName -Status -ErrorAction SilentlyContinue
    $powerState = ($vmStatus.Statuses | Where-Object {$_.Code -like "PowerState/*"}).DisplayStatus

    if ($powerState -ne "VM running") {
        Write-Host "  Starting existing VM..." -ForegroundColor Gray
        Start-AzVM -ResourceGroupName $ResourceGroupName -Name $VMName | Out-Null
        Start-Sleep -Seconds 10
    }

    $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip" -ErrorAction SilentlyContinue
    if ($publicIP) {
        $VMIPAddress = $publicIP.IpAddress
        Write-Host "  VM is running at: $VMIPAddress" -ForegroundColor Green
        Write-Host ""
        Write-Host "=== VM Ready ===" -ForegroundColor Cyan
        Write-Host "IP Address: $VMIPAddress" -ForegroundColor Green
        Write-Host "SSH Command: ssh $AdminUsername@$VMIPAddress" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Next step: Install Docker and deploy OpenSILEX" -ForegroundColor Cyan
        Write-Host "  cd tools/docker-deployment" -ForegroundColor Gray
        Write-Host "  .\00-install-docker.ps1 -TargetIP $VMIPAddress" -ForegroundColor Gray
        Write-Host "  .\01-deploy-opensilex.ps1 -TargetIP $VMIPAddress" -ForegroundColor Gray
        exit 0
    }
}

Write-Host ""

# Create resource group
Write-Host "[3/4] Creating resource group..." -ForegroundColor Yellow

$rg = Get-AzResourceGroup -Name $ResourceGroupName -ErrorAction SilentlyContinue
if (-not $rg) {
    New-AzResourceGroup -Name $ResourceGroupName -Location $Location | Out-Null
    Write-Host "  Created resource group: $ResourceGroupName" -ForegroundColor Green
} else {
    Write-Host "  Using existing resource group: $ResourceGroupName" -ForegroundColor Green
}

Write-Host ""

# Deploy VM using ARM template
Write-Host "[4/4] Deploying VM from ARM template (2-3 minutes)..." -ForegroundColor Yellow

$sshPublicKey = (Get-Content $SSHKeyPath -Raw).Trim()

$templateParameters = @{
    vmName = $VMName
    adminUsername = $AdminUsername
    sshPublicKey = $sshPublicKey
}

try {
    $deployment = New-AzResourceGroupDeployment `
        -ResourceGroupName $ResourceGroupName `
        -TemplateFile $TemplatePath `
        -TemplateParameterObject $templateParameters `
        -ErrorAction Stop

    Write-Host "  VM created successfully" -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] VM deployment failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Get VM IP and test SSH
Write-Host "Waiting for VM to be ready..." -ForegroundColor Yellow

Start-Sleep -Seconds 20

$publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name "$VMName-ip"
$VMIPAddress = $publicIP.IpAddress

Write-Host "  VM IP Address: $VMIPAddress" -ForegroundColor Green

# Test SSH connectivity
$maxAttempts = 12
$attempt = 0
$sshReady = $false

while (-not $sshReady -and $attempt -lt $maxAttempts) {
    $attempt++
    Write-Host "  Testing SSH connectivity (attempt $attempt/$maxAttempts)..." -ForegroundColor Gray

    $testResult = ssh -i ($SSHKeyPath -replace '\.pub$', '') -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$AdminUsername@$VMIPAddress" "echo connected" 2>$null

    if ($testResult -eq "connected") {
        $sshReady = $true
        Write-Host "  SSH is ready" -ForegroundColor Green
    } else {
        Start-Sleep -Seconds 5
    }
}

if (-not $sshReady) {
    Write-Host "  [WARNING] SSH not responding yet, but VM is created" -ForegroundColor Yellow
    Write-Host "  Try connecting in a minute: ssh $AdminUsername@$VMIPAddress" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== VM Created Successfully ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "VM Details:" -ForegroundColor White
Write-Host "  Name: $VMName" -ForegroundColor Gray
Write-Host "  IP Address: $VMIPAddress" -ForegroundColor Gray
Write-Host "  SSH Command: ssh $AdminUsername@$VMIPAddress" -ForegroundColor Gray
Write-Host "  Resource Group: $ResourceGroupName" -ForegroundColor Gray
Write-Host "  Location: $Location" -ForegroundColor Gray
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Install Docker:" -ForegroundColor White
Write-Host "     cd tools/docker-deployment" -ForegroundColor Gray
Write-Host "     .\00-install-docker.ps1 -TargetIP $VMIPAddress" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Deploy OpenSILEX:" -ForegroundColor White
Write-Host "     .\01-deploy-opensilex.ps1 -TargetIP $VMIPAddress -ApiKeysFile ..\config\test-api-keys.conf" -ForegroundColor Gray
Write-Host ""
