#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Create a cost-optimized AKS cluster for PHIS (dev/learning).

.DESCRIPTION
    Single-node Standard_D4s_v3 (4 vCPU / 16 GB RAM).
    Stop the cluster when not in use to save ~65% -- see 03-stop-cluster.ps1.

    Estimated cost:
      Running:  ~$140/month pay-as-you-go
      Stopped:  ~$10/month (disks only)
      Typical (stop overnight/weekends): ~$40-60/month

.PARAMETER ResourceGroup
    Azure resource group name (created if it does not exist).

.PARAMETER ClusterName
    AKS cluster name.

.PARAMETER Location
    Azure region (default: norwayeast).

.EXAMPLE
    .\01-create-cluster.ps1
    .\01-create-cluster.ps1 -ResourceGroup my-rg -Location westeurope
#>

param(
    [string]$ResourceGroup = "phis-rg",
    [string]$ClusterName   = "phis-cluster",
    [string]$Location      = "norwayeast"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "PHIS AKS Cluster Setup (cost-optimized)" -ForegroundColor Cyan
Write-Host "  Resource group : $ResourceGroup"
Write-Host "  Cluster name   : $ClusterName"
Write-Host "  Location       : $Location"
Write-Host "  Node size      : Standard_D4s_v3 (4 vCPU / 16 GB) x1"
Write-Host ""

# ── Prerequisites ─────────────────────────────────────────────────────────────

Write-Host "[1/4] Checking Azure CLI login..." -ForegroundColor Blue
$account = az account show 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Not logged in. Running az login..." -ForegroundColor Yellow
    az login
}
$sub = (az account show --query "name" -o tsv)
Write-Host "  Subscription: $sub" -ForegroundColor Green

# ── Resource group ────────────────────────────────────────────────────────────

Write-Host "[2/4] Ensuring resource group '$ResourceGroup'..." -ForegroundColor Blue
$rgExists = az group exists --name $ResourceGroup
if ($rgExists -eq "false") {
    az group create --name $ResourceGroup --location $Location | Out-Null
    Write-Host "  Created." -ForegroundColor Green
} else {
    Write-Host "  Already exists." -ForegroundColor Green
}

# ── AKS cluster ───────────────────────────────────────────────────────────────

Write-Host "[3/4] Creating AKS cluster (this takes ~5 minutes)..." -ForegroundColor Blue

az aks create `
    --resource-group $ResourceGroup `
    --name $ClusterName `
    --location $Location `
    --node-count 1 `
    --node-vm-size Standard_D4s_v3 `
    --generate-ssh-keys `
    --enable-managed-identity `
    --node-osdisk-size 64

if ($LASTEXITCODE -ne 0) {
    Write-Host "Cluster creation failed." -ForegroundColor Red
    exit 1
}

Write-Host "  Cluster created." -ForegroundColor Green

# ── Connect kubectl ───────────────────────────────────────────────────────────

Write-Host "[4/4] Configuring kubectl..." -ForegroundColor Blue
az aks get-credentials --resource-group $ResourceGroup --name $ClusterName --overwrite-existing
kubectl get nodes

Write-Host ""
Write-Host "Cluster is ready." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  Deploy stack  : kubectl apply -k k8s/"
Write-Host "  Watch pods    : kubectl get pods -n phis -w"
Write-Host "  Stop cluster  : .\03-stop-cluster.ps1"
Write-Host ""
Write-Host "Stop the cluster when not using it to minimise costs." -ForegroundColor Yellow
