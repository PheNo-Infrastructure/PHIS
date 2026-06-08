#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Provision the PHIS AKS cluster and bootstrap the full stack.

.DESCRIPTION
    Runs terraform apply, fills secrets in Azure Key Vault, bootstraps
    FluxCD, and creates the ghcr-pull-secret. Run this after a fresh
    cluster creation or after az aks delete.

    Prerequisites (must be in PATH):
      az       - Azure CLI (az login before running)
      terraform
      flux     - FluxCD CLI (https://fluxcd.io/flux/installation/)
      kubectl

.PARAMETER SkipTerraform
    Skip terraform init + apply. Use if Terraform already ran successfully
    and you only need to redo the bootstrap steps.

.PARAMETER SkipFluxBootstrap
    Skip flux bootstrap. Use if Flux is already installed and you only
    need to recreate the ConfigMap or pull secret.

.PARAMETER GitHubOwner
    GitHub owner (user or org) for the PHIS repository.

.PARAMETER GitHubRepo
    GitHub repository name.

.PARAMETER GitBranch
    Branch FluxCD watches for manifests.

.EXAMPLE
    .\04-bootstrap.ps1
    .\04-bootstrap.ps1 -SkipTerraform
    .\04-bootstrap.ps1 -GitHubOwner myorg -GitHubRepo PHIS
#>

param(
    [switch]$SkipTerraform,
    [switch]$SkipFluxBootstrap,
    [string]$GitHubOwner  = "lversen",
    [string]$GitHubRepo   = "PHIS",
    [string]$GitBranch    = "k8s"
)

$ErrorActionPreference = "Stop"
$RootDir = Resolve-Path "$PSScriptRoot\..\.."

function Step($n, $msg) { Write-Host "`n[$n/8] $msg" -ForegroundColor Blue }
function Ok($msg)        { Write-Host "  $msg" -ForegroundColor Green }
function Warn($msg)      { Write-Host "  WARNING: $msg" -ForegroundColor Yellow }

# ── [1/8] Prerequisites ───────────────────────────────────────────────────────

Step 1 "Checking prerequisites..."
foreach ($tool in @("az", "terraform", "flux", "kubectl")) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Host "  '$tool' not found in PATH. Install it and re-run." -ForegroundColor Red
        exit 1
    }
    Ok "$tool found"
}

# ── [2/8] Azure login check ───────────────────────────────────────────────────

Step 2 "Checking Azure login..."
$account = az account show 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Not logged in. Running az login..." -ForegroundColor Yellow
    az login
}
$sub = (az account show --query "name" -o tsv)
Ok "Subscription: $sub"

# ── [3/8] Terraform ───────────────────────────────────────────────────────────

if (-not $SkipTerraform) {
    Step 3 "Running terraform init + apply (~10 minutes)..."
    Push-Location "$RootDir\terraform"
    try {
        terraform init
        if ($LASTEXITCODE -ne 0) { Write-Host "terraform init failed." -ForegroundColor Red; exit 1 }

        terraform apply -auto-approve
        if ($LASTEXITCODE -ne 0) {
            Warn "terraform apply failed. If the error mentions 403 on Key Vault secrets,"
            Warn "Azure RBAC propagation is slow — wait 60 seconds and re-run with -SkipTerraform."
            exit 1
        }
        Ok "Terraform apply complete."
    }
    finally { Pop-Location }
} else {
    Step 3 "Skipping Terraform (SkipTerraform flag set)."
}

# ── [4/8] Read terraform outputs ─────────────────────────────────────────────

Step 4 "Reading terraform outputs..."
Push-Location "$RootDir\terraform"
try {
    $kvUri    = terraform output -raw key_vault_uri
    $clientId = terraform output -raw eso_identity_client_id
    $kvName   = $kvUri -replace "https://", "" -replace "\.vault\.azure\.net/", ""

    terraform output -raw kube_config | Set-Content -Path "$HOME\.kube\config" -Encoding utf8
    Ok "kubeconfig written to $HOME\.kube\config"
    Ok "Key Vault URI: $kvUri"
    Ok "ESO identity client ID: $clientId"
}
finally { Pop-Location }

# ── [5/8] Fill secrets in Key Vault ──────────────────────────────────────────

Step 5 "Setting secrets in Key Vault '$kvName'..."

function SetSecret($name, $value) {
    az keyvault secret set --vault-name $kvName --name $name --value $value | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Failed to set secret '$name'." -ForegroundColor Red
        exit 1
    }
    Ok "  Set $name"
}

# Generate random passwords (openssl may not be available on Windows;
# use PowerShell's cryptographic RNG as a fallback).
function RandHex($bytes) {
    $b = [byte[]]::new($bytes)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($b)
    return ($b | ForEach-Object { $_.ToString("x2") }) -join ""
}

function RandBase64($bytes) {
    $b = [byte[]]::new($bytes)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($b)
    return [Convert]::ToBase64String($b)
}

Write-Host ""
Write-Host "  Generating and setting passwords/keyfile..." -ForegroundColor Gray
SetSecret "graphdb-admin-password"      (RandHex 20)
SetSecret "mongodb-root-password"       (RandHex 20)
SetSecret "mongodb-opensilex-password"  (RandHex 20)
# MongoDB keyfile: 756 random bytes, base64-encoded, no newlines (replica set auth)
SetSecret "mongodb-keyfile"             (RandBase64 756)

Write-Host ""
Write-Host "  You need to enter the following secrets manually." -ForegroundColor Yellow
Write-Host "  Find them in https://dashboard.dataporten.no (Feide)"
Write-Host "  and https://github.com/settings/tokens (GitHub PAT, scope: read:packages)"
Write-Host ""

$feideClientId     = Read-Host "  Feide client-id"
$feideClientSecret = Read-Host "  Feide client-secret"
$ghcrUser          = Read-Host "  GitHub username"
$ghcrPat           = Read-Host "  GitHub PAT (read:packages)"

SetSecret "feide-client-id"     $feideClientId
SetSecret "feide-client-secret" $feideClientSecret

$ghcrJson = "{`"auths`":{`"ghcr.io`":{`"username`":`"$ghcrUser`",`"password`":`"$ghcrPat`"}}}"
SetSecret "ghcr-pull-secret-json" $ghcrJson

Ok "All secrets set in Key Vault."

# ── [6/8] Create phis-tf-outputs ConfigMap ────────────────────────────────────

Step 6 "Creating phis-tf-outputs ConfigMap in flux-system..."
# This ConfigMap bridges Terraform outputs → Flux variable substitution.
# It is NOT in git — it must be recreated each time the cluster is bootstrapped.
kubectl create namespace flux-system --dry-run=client -o yaml | kubectl apply -f - | Out-Null
kubectl create configmap phis-tf-outputs `
    --namespace flux-system `
    --from-literal="ESO_IDENTITY_CLIENT_ID=$clientId" `
    --from-literal="KEY_VAULT_URI=$kvUri" `
    --dry-run=client -o yaml | kubectl apply -f -
Ok "ConfigMap applied."

# ── [7/8] Flux bootstrap ──────────────────────────────────────────────────────

if (-not $SkipFluxBootstrap) {
    Step 7 "Bootstrapping FluxCD..."
    Write-Host ""
    Write-Host "  flux bootstrap will print a deploy key." -ForegroundColor Yellow
    Write-Host "  Add it to: https://github.com/$GitHubOwner/$GitHubRepo/settings/keys" -ForegroundColor Yellow
    Write-Host "  (Read access is sufficient — Flux only pulls from git)"
    Write-Host ""

    flux bootstrap github `
        --owner=$GitHubOwner `
        --repository=$GitHubRepo `
        --branch=$GitBranch `
        --path="clusters/phis-cluster" `
        --personal

    if ($LASTEXITCODE -ne 0) {
        Write-Host "  flux bootstrap failed." -ForegroundColor Red
        exit 1
    }
    Ok "Flux bootstrapped."
} else {
    Step 7 "Skipping flux bootstrap (SkipFluxBootstrap flag set)."
}

# ── [8/8] Create ghcr-pull-secret ────────────────────────────────────────────

Step 8 "Creating ghcr-pull-secret in phis namespace..."
# ESO does not manage this secret because docker-registry type secrets have a
# specific JSON format that is cleaner to create directly.
kubectl create namespace phis --dry-run=client -o yaml | kubectl apply -f - | Out-Null
kubectl create secret docker-registry ghcr-pull-secret `
    --namespace phis `
    --docker-server=ghcr.io `
    --docker-username=$ghcrUser `
    --docker-password=$ghcrPat `
    --dry-run=client -o yaml | kubectl apply -f -
Ok "ghcr-pull-secret created in phis namespace."

# ── Done ─────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Bootstrap complete." -ForegroundColor Green
Write-Host ""
Write-Host "Flux will now reconcile the stack. Watch progress:" -ForegroundColor Cyan
Write-Host "  flux get kustomizations --all-namespaces --watch"
Write-Host "  kubectl get pods -n external-secrets -w"
Write-Host "  kubectl get externalsecrets -n phis -w"
Write-Host "  kubectl get pods -n phis -w"
Write-Host ""
Write-Host "Stop the cluster when not in use:" -ForegroundColor Yellow
Write-Host "  .\03-stop-cluster.ps1"
