# PHIS Test Environment Manager
# Run with no arguments for interactive mode: .\scripts\test-env.ps1

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$SecretsFile = Join-Path $env:USERPROFILE '.phis-test-secrets.json'
$BaseDir     = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\k8s\test'))
$Utf8NoBom   = [Text.UTF8Encoding]::new($false)

function Die([string]$Msg) { Write-Error $Msg; exit 1 }

function Write-File([string]$Path, [string]$Content) {
    [IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
}

# ── credential generation ─────────────────────────────────────────────────────

function New-RandomHex {
    $b = [byte[]]::new(16)
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    return ($b | ForEach-Object { $_.ToString('x2') }) -join ''
}

function New-Keyfile {
    $b = [byte[]]::new(756)
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    return [Convert]::ToBase64String($b) -replace '\s', ''
}

# ── manifest rendering ────────────────────────────────────────────────────────

function Build-Files([string]$TmpDir, [string]$Ns, [string]$LbIp, [bool]$IncludeInitJob) {
    $secretFiles = 'mongodb-credentials.yaml', 'graphdb-credentials.yaml',
                   'opensilex-credentials.yaml', 'feide-credentials.yaml', 'ghcr-pull-secret.yaml'

    $sources = @(Get-ChildItem "$BaseDir\*.yaml") +
               @(Get-Item "$BaseDir\opensilex.yml" -ErrorAction SilentlyContinue)

    foreach ($src in ($sources | Where-Object { $_ })) {
        $fname = $src.Name

        if ($secretFiles -contains $fname)                                   { continue }
        if ($fname -eq 'opensilex-init-job.yaml' -and -not $IncludeInitJob) { continue }

        $content = (Get-Content $src.FullName -Raw).Replace('__NS__', $Ns).Replace('__LB_IP__', $LbIp)

        if ($fname -eq 'kustomization.yaml' -and -not $IncludeInitJob) {
            $content = ($content -split "`r?`n" |
                Where-Object { $_ -notmatch 'opensilex-init-job\.yaml' }) -join "`n"
        }

        Write-File (Join-Path $TmpDir $fname) $content
    }

    # Pull shared files from production so test always tracks production changes
    # (image tags, resource limits, GraphDB version, nginx config, etc.)
    $prodBase = [IO.Path]::GetFullPath((Join-Path $BaseDir '..'))
    $shared = [ordered]@{
        'mongodb-service.yaml'      = 'mongodb\service.yaml'
        'graphdb-service.yaml'      = 'graphdb\service.yaml'
        'graphdb-nginx-config.yaml' = 'graphdb\nginx-config.yaml'
        'graphdb-deployment.yaml'   = 'graphdb\deployment.yaml'
        'graphdb-init-job.yaml'     = 'graphdb-init\job.yaml'
        'opensilex-deployment.yaml' = 'opensilex\deployment.yaml'
    }
    foreach ($entry in $shared.GetEnumerator()) {
        Write-File (Join-Path $TmpDir $entry.Key) (Get-Content (Join-Path $prodBase $entry.Value) -Raw)
    }
}

function Write-Secrets(
    [string]$TmpDir, [string]$Ns,
    [string]$MongoRoot, [string]$MongoApp, [string]$MongoKeyfile,
    [string]$GraphDbPass, [string]$AdminPass,
    [string]$FeideId, [string]$FeideSecret, [string]$GhcrB64
) {
    Write-File "$TmpDir\mongodb-credentials.yaml" @"
apiVersion: v1
kind: Secret
metadata:
  name: mongodb-credentials
  namespace: $Ns
type: Opaque
stringData:
  root-password: "$MongoRoot"
  opensilex-password: "$MongoApp"
  keyfile: "$MongoKeyfile"
"@
    Write-File "$TmpDir\graphdb-credentials.yaml" @"
apiVersion: v1
kind: Secret
metadata:
  name: graphdb-credentials
  namespace: $Ns
type: Opaque
stringData:
  admin-password: "$GraphDbPass"
"@
    Write-File "$TmpDir\opensilex-credentials.yaml" @"
apiVersion: v1
kind: Secret
metadata:
  name: opensilex-credentials
  namespace: $Ns
type: Opaque
stringData:
  admin-password: "$AdminPass"
  smtp-username: ""
  smtp-password: ""
"@
    Write-File "$TmpDir\feide-credentials.yaml" @"
apiVersion: v1
kind: Secret
metadata:
  name: feide-credentials
  namespace: $Ns
type: Opaque
stringData:
  client-id: "$FeideId"
  client-secret: "$FeideSecret"
"@
    Write-File "$TmpDir\ghcr-pull-secret.yaml" @"
apiVersion: v1
kind: Secret
metadata:
  name: ghcr-pull-secret
  namespace: $Ns
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: $GhcrB64
"@
}

# ── commands ──────────────────────────────────────────────────────────────────

function Invoke-Creds {
    Write-Host ""
    Write-Host "Generating GHCR credentials from gh CLI..."

    $username = gh api user --jq '.login' 2>$null
    if (-not $username) { Die "gh CLI not authenticated. Run: gh auth login" }

    $token = gh auth token 2>$null
    if (-not $token) { Die "Could not retrieve gh token. Run: gh auth login" }

    $auth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${username}:${token}"))
    $dockerConfig = [ordered]@{
        auths = [ordered]@{
            'ghcr.io' = [ordered]@{
                username = $username
                password = $token
                auth     = $auth
            }
        }
    } | ConvertTo-Json -Compress -Depth 5
    $ghcrB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($dockerConfig))

    @{ GhcrB64 = $ghcrB64 } | ConvertTo-Json | Set-Content $SecretsFile
    Write-Host "Saved GHCR credentials for $username."
}

function Invoke-Up {
    if (-not (Test-Path $SecretsFile)) {
        Write-Host "GHCR credentials not configured yet."
        Invoke-Creds
    }
    $shared = Get-Content $SecretsFile | ConvertFrom-Json
    if (-not $shared.GhcrB64) {
        Write-Host "GHCR credentials incomplete."
        Invoke-Creds
        $shared = Get-Content $SecretsFile | ConvertFrom-Json
    }

    Write-Host ""
    $name = Read-Host "Environment name (e.g. myfeature)"
    if (-not $name) { Die "Name is required." }
    $ns = "phis-$name"

    $feideId = Read-Host "Feide client ID"
    if (-not $feideId) { Die "Feide client ID is required." }

    $sec = Read-Host "Feide client secret" -AsSecureString
    $feideSecret = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    if (-not $feideSecret) { Die "Feide client secret is required." }

    $mongoRoot    = New-RandomHex
    $mongoApp     = New-RandomHex
    $mongoKeyfile = New-Keyfile
    $graphDbPass  = New-RandomHex
    $adminPass    = New-RandomHex

    $tmpDir = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
    New-Item -ItemType Directory -Path $tmpDir | Out-Null

    try {
        Write-Host ""
        Write-Host "Deploying $ns (pass 1/2)..."
        Build-Files  $tmpDir $ns 'pending' $false
        Write-Secrets $tmpDir $ns $mongoRoot $mongoApp $mongoKeyfile `
                      $graphDbPass $adminPass $feideId $feideSecret $shared.GhcrB64
        kubectl apply -k ($tmpDir -replace '\\', '/')

        Write-Host -NoNewline "Waiting for LoadBalancer IP"
        $lbIp = $null
        while (-not $lbIp) {
            $lbIp = kubectl get svc opensilex -n $ns `
                    -o "jsonpath={.status.loadBalancer.ingress[0].ip}" 2>$null
            if (-not $lbIp) { Write-Host -NoNewline '.'; Start-Sleep 5 }
        }
        Write-Host " $lbIp"

        Write-Host "Applying config with IP $lbIp (pass 2/2)..."
        Build-Files  $tmpDir $ns $lbIp $true
        Write-Secrets $tmpDir $ns $mongoRoot $mongoApp $mongoKeyfile `
                      $graphDbPass $adminPass $feideId $feideSecret $shared.GhcrB64
        kubectl apply -k ($tmpDir -replace '\\', '/')

        # Verify no __LB_IP__ placeholders remain in any ConfigMap (catches stale CMs
        # that got applied outside this script and would silently break Feide login).
        $stale = kubectl get configmap -n $ns -o yaml 2>$null | Select-String '__LB_IP__'
        if ($stale) {
            Write-Warning ""
            Write-Warning "WARNING: __LB_IP__ placeholder found in cluster ConfigMaps after deploy."
            Write-Warning "Feide redirect URI will be broken. Stale ConfigMap detected:"
            $stale | ForEach-Object { Write-Warning "  $_" }
            Write-Warning "Re-run this script or manually patch the ConfigMap with: $lbIp"
        }

    } finally {
        Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
    }

    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════════════╗"
    Write-Host ("║  Environment:    {0,-45}║" -f $name)
    Write-Host ("║  Namespace:      {0,-45}║" -f $ns)
    Write-Host ("║  URL:            {0,-45}║" -f "http://$lbIp/")
    Write-Host ("║  Admin email:    {0,-45}║" -f "admin@opensilex.org")
    Write-Host ("║  Admin password: {0,-45}║" -f $adminPass)
    Write-Host "║                                                              ║"
    Write-Host "║  Register this redirect URI in your Feide test app:         ║"
    Write-Host ("║    {0,-59}║" -f "http://$lbIp/app/openid")
    Write-Host "╚══════════════════════════════════════════════════════════════╝"
}

function Invoke-Down {
    Write-Host ""
    Invoke-List
    Write-Host ""
    $name = Read-Host "Environment name to tear down"
    if (-not $name) { Die "Name is required." }

    $confirm = Read-Host "Delete phis-$name and all its data? (y/N)"
    if ($confirm -ne 'y') { Write-Host "Cancelled."; return }

    kubectl delete namespace "phis-$name" --ignore-not-found
    Write-Host "Namespace phis-$name deleted."
}

function Invoke-List {
    $lines = kubectl get ns -o name 2>$null | Where-Object { $_ -match '^namespace/phis-' }
    if (-not $lines) { Write-Host "No test environments running."; return }
    Write-Host ""
    Write-Host ("{0,-30}  {1}" -f "Namespace", "URL")
    Write-Host ("{0,-30}  {1}" -f "─────────────────────────────", "───────────────────────")
    foreach ($line in $lines) {
        $ns = $line -replace '^namespace/', ''
        $ip = kubectl get svc opensilex -n $ns `
              -o "jsonpath={.status.loadBalancer.ingress[0].ip}" 2>$null
        if (-not $ip) { $ip = 'pending' }
        Write-Host ("{0,-30}  http://{1}/" -f $ns, $ip)
    }
}

# ── interactive menu ──────────────────────────────────────────────────────────

while ($true) {
    Write-Host ""
    Write-Host "  PHIS Test Environment Manager"
    Write-Host "  ────────────────────────────────────"
    Write-Host "  1. Spin up environment"
    Write-Host "  2. Tear down environment"
    Write-Host "  3. List environments"
    Write-Host "  4. Configure GHCR credentials"
    Write-Host "  q. Quit"
    Write-Host ""
    $choice = Read-Host "  Select"

    switch ($choice.ToLower()) {
        '1' { Invoke-Up }
        '2' { Invoke-Down }
        '3' { Invoke-List }
        '4' { Invoke-Creds }
        'q' { exit 0 }
        default { Write-Host "  Invalid choice." }
    }
}
