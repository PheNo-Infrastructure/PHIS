#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stop the PHIS AKS cluster to save costs.

.DESCRIPTION
    Deallocates the VM node -- you stop paying for compute.
    PVCs (your data) and all manifests are preserved.
    Resumes from the same state with 02-start-cluster.ps1.
#>

param(
    [string]$ResourceGroup = "phis-rg",
    [string]$ClusterName   = "phis-cluster"
)

$ErrorActionPreference = "Stop"

Write-Host "Stopping cluster '$ClusterName'..." -ForegroundColor Blue
Write-Host "(Data on persistent volumes is preserved)" -ForegroundColor Gray

az aks stop --resource-group $ResourceGroup --name $ClusterName

Write-Host ""
Write-Host "Cluster stopped. Compute billing paused." -ForegroundColor Green
Write-Host "  Restart with: .\02-start-cluster.ps1"
