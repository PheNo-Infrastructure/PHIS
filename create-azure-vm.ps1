#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Create Azure VM for OpenSILEX Docker deployment
.DESCRIPTION
    Creates a Debian 12 VM on Azure using ARM template with SSH key authentication.
    Supports environment-based configuration profiles for easy multi-environment management.
.PARAMETER Environment
    Environment profile to use (sandbox, test, production). Loads config from tools/config/vm-config-{environment}.json
.PARAMETER VMName
    Name of the VM (overrides config file if specified)
.PARAMETER ResourceGroupName
    Azure resource group name (overrides config file if specified)
.PARAMETER Location
    Azure region (overrides config file if specified)
.PARAMETER VMSize
    Azure VM size (overrides config file if specified)
.PARAMETER AdminUsername
    SSH username (default: azureuser)
.PARAMETER SSHKeyPath
    Path to SSH public key (default: ~/.ssh/id_ed25519.pub)
.PARAMETER UseExistingPublicIP
    Use existing public IP instead of creating new one
.PARAMETER ExistingPublicIPName
    Name of existing public IP to use (required if UseExistingPublicIP is true)
.EXAMPLE
    # Deploy using environment config
    .\create-azure-vm.ps1 -Environment test
    .\create-azure-vm.ps1 -Environment production

    # Deploy with manual parameters
    .\create-azure-vm.ps1 -VMName "my-vm" -ResourceGroupName "my-rg" -Location "northeurope"

    # Deploy with existing public IP
    .\create-azure-vm.ps1 -Environment test -UseExistingPublicIP -ExistingPublicIPName "my-ip"
#>

param(
    [string]$Environment = "",
    [string]$VMName = "",
    [string]$ResourceGroupName = "",
    [string]$Location = "westeurope",
    [string]$VMSize = "Standard_B4ms",
    [string]$AdminUsername = "azureuser",
    [string]$SSHKeyPath = "~/.ssh/id_ed25519.pub",
    [switch]$UseExistingPublicIP,
    [string]$ExistingPublicIPName = "",
    [string]$VnetAddressPrefix = "10.0.0.0/16",
    [string]$SubnetAddressPrefix = "10.0.0.0/24"
)

Write-Host "=== Azure VM Creation for OpenSILEX Docker ===" -ForegroundColor Cyan
Write-Host ""

# Load configuration from environment profile if specified
if ($Environment) {
    $ConfigPath = Join-Path $PSScriptRoot "tools\config\vm-config-$Environment.json"

    if (-not (Test-Path $ConfigPath)) {
        Write-Host "[FAIL] Config file not found: $ConfigPath" -ForegroundColor Red
        Write-Host "Available environments: sandbox, test, production" -ForegroundColor Gray
        exit 1
    }

    Write-Host "Loading configuration from: $ConfigPath" -ForegroundColor Cyan
    $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json

    # Override defaults with config values (can still be overridden by command-line parameters)
    if (-not $VMName) { $VMName = $config.vmName }
    if (-not $ResourceGroupName) { $ResourceGroupName = $config.resourceGroupName }
    $Location = if ($PSBoundParameters.ContainsKey('Location')) { $Location } else { $config.location }
    $VMSize = if ($PSBoundParameters.ContainsKey('VMSize')) { $VMSize } else { $config.vmSize }
    $AdminUsername = if ($PSBoundParameters.ContainsKey('AdminUsername')) { $AdminUsername } else { $config.adminUsername }

    if ($config.useExistingPublicIP) {
        $UseExistingPublicIP = $true
        $ExistingPublicIPName = $config.publicIPName
    }

    if ($config.networkConfig) {
        $VnetAddressPrefix = $config.networkConfig.vnetAddressPrefix
        $SubnetAddressPrefix = $config.networkConfig.subnetAddressPrefix
    }

    Write-Host "  Environment: $($config.environment)" -ForegroundColor Green
    Write-Host "  VM Name: $VMName" -ForegroundColor Gray
    Write-Host "  Resource Group: $ResourceGroupName" -ForegroundColor Gray
    Write-Host "  Location: $Location" -ForegroundColor Gray
    if ($config.staticIP) {
        Write-Host "  Static IP: $($config.staticIP)" -ForegroundColor Yellow
    }
    Write-Host ""
}

# Validate required parameters
if (-not $VMName -or -not $ResourceGroupName) {
    Write-Host "[FAIL] VMName and ResourceGroupName are required" -ForegroundColor Red
    Write-Host "Either specify -Environment (sandbox/test/production) or provide -VMName and -ResourceGroupName" -ForegroundColor Gray
    exit 1
}

if ($UseExistingPublicIP -and -not $ExistingPublicIPName) {
    Write-Host "[FAIL] ExistingPublicIPName is required when UseExistingPublicIP is true" -ForegroundColor Red
    exit 1
}

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

    # Use the correct public IP name (existing or newly created)
    $publicIPName = if ($UseExistingPublicIP) { $ExistingPublicIPName } else { "$VMName-ip" }
    $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name $publicIPName -ErrorAction SilentlyContinue
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
} else {
    # VM doesn't exist - clean up orphaned network resources before deploying
    Write-Host "  VM does not exist" -ForegroundColor Gray

    # Check for orphaned NIC (from manually deleted VM)
    $orphanedNIC = Get-AzNetworkInterface -ResourceGroupName $ResourceGroupName -Name "$VMName-nic" -ErrorAction SilentlyContinue
    if ($orphanedNIC) {
        Write-Host "  Cleaning up orphaned network interface..." -ForegroundColor Yellow
        Remove-AzNetworkInterface -ResourceGroupName $ResourceGroupName -Name "$VMName-nic" -Force | Out-Null
        Write-Host "    Removed: $VMName-nic" -ForegroundColor Gray
    }

    # Check for orphaned VNet (from manually deleted VM)
    $orphanedVNet = Get-AzVirtualNetwork -ResourceGroupName $ResourceGroupName -Name "$VMName-vnet" -ErrorAction SilentlyContinue
    if ($orphanedVNet) {
        Write-Host "  Cleaning up orphaned virtual network..." -ForegroundColor Yellow
        Remove-AzVirtualNetwork -ResourceGroupName $ResourceGroupName -Name "$VMName-vnet" -Force | Out-Null
        Write-Host "    Removed: $VMName-vnet" -ForegroundColor Gray
    }

    # Public IP and NSG are intentionally preserved for reuse
    if ($UseExistingPublicIP) {
        $publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name $ExistingPublicIPName -ErrorAction SilentlyContinue
        if ($publicIP) {
            Write-Host "  Public IP preserved: $ExistingPublicIPName ($($publicIP.IpAddress))" -ForegroundColor Green
        }
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
    location = $Location
    vmSize = $VMSize
    vnetAddressPrefix = $VnetAddressPrefix
    subnetAddressPrefix = $SubnetAddressPrefix
    useExistingPublicIP = $UseExistingPublicIP.IsPresent
    existingPublicIPName = $ExistingPublicIPName
}

Write-Host "Deployment parameters:" -ForegroundColor Cyan
Write-Host "  VM Name: $VMName" -ForegroundColor Gray
Write-Host "  VM Size: $VMSize" -ForegroundColor Gray
Write-Host "  Location: $Location" -ForegroundColor Gray
Write-Host "  Use Existing IP: $($UseExistingPublicIP.IsPresent)" -ForegroundColor Gray
if ($UseExistingPublicIP) {
    Write-Host "  Existing IP Name: $ExistingPublicIPName" -ForegroundColor Gray
}
Write-Host ""

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

# Use the correct public IP name (existing or newly created)
$publicIPName = if ($UseExistingPublicIP) { $ExistingPublicIPName } else { "$VMName-ip" }
$publicIP = Get-AzPublicIpAddress -ResourceGroupName $ResourceGroupName -Name $publicIPName
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
