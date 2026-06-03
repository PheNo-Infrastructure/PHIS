#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start the PHIS AKS cluster and reconnect kubectl.
#>

param(
    [string]$ResourceGroup = "phis-rg",
    [string]$ClusterName   = "phis-cluster"
)

$ErrorActionPreference = "Stop"

Write-Host "Starting cluster '$ClusterName'..." -ForegroundColor Blue
az aks start --resource-group $ResourceGroup --name $ClusterName

Write-Host "Reconnecting kubectl..." -ForegroundColor Blue
az aks get-credentials --resource-group $ResourceGroup --name $ClusterName --overwrite-existing

Write-Host ""
kubectl get nodes
Write-Host ""
Write-Host "Cluster is running. Pods will restart automatically." -ForegroundColor Green
Write-Host "  Watch pods: kubectl get pods -n phis -w"
