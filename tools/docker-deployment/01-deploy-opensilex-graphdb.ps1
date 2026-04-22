#!/usr/bin/env pwsh
<#
.SYNOPSIS
    One-Click OpenSILEX Deployment with GraphDB (Production-Ready Stack)

.DESCRIPTION
    Deploys OpenSILEX using GraphDB as the triplestore (replaces RDF4J).
    Stack: OpenSILEX + GraphDB + MongoDB + HAProxy + Mongo Express

    Why GraphDB instead of RDF4J?
    - RDF4J has parser bugs on datasets >700K triples that break device creation
    - GraphDB is more stable and handles large datasets without issues
    - Both JSON format and HTTP timeout patches failed on production with RDF4J

    Steps performed:
    1. Validates prerequisites (SSH key, connectivity, Docker on server)
    2. Clones official opensilex-docker-compose repository
    3. Configures environment (version, prefix, public URL)
    4. Replaces RDF4J with GraphDB in docker-compose.yml
    5. Builds Docker images with UID/GID 1001
    6. Starts GraphDB and MongoDB
    7. Creates GraphDB repository and loads ontologies
    8. Starts OpenSILEX and creates admin user
    9. Verifies deployment

    For source patches (GroupDAO fix, OpenID auto-group assignment), run:
        .\04-apply-patches.ps1 -Rebuild -ApiKeysFile ..\config\api-keys-test.conf

.PARAMETER TargetIP
    The IP address of the target server

.PARAMETER AdminUsername
    SSH username for the target server (default: azureuser)

.PARAMETER PrivateKeyPath
    Path to SSH private key (default: ~/.ssh/id_ed25519)

.PARAMETER AdminEmail
    OpenSILEX admin email (default: admin@opensilex.org)

.PARAMETER AdminPassword
    OpenSILEX admin password (default: admin)

.PARAMETER OpenSilexVersion
    OpenSILEX release version (default: 1.4.7)

.PARAMETER ProjectPrefix
    Docker stack prefix used for container naming (default: sandbox)

.PARAMETER ApiKeysFile
    Path to API keys config file containing FEIDE_CLIENT_ID, FEIDE_CLIENT_SECRET,
    and optionally AGROPORTAL_API_KEY. See tools/config/api-keys.conf.template.
    If provided and contains Feide credentials, OpenID Connect login is enabled.

.EXAMPLE
    .\01-deploy-opensilex-graphdb.ps1 -TargetIP 20.61.108.197

.EXAMPLE
    .\01-deploy-opensilex-graphdb.ps1 -TargetIP 20.61.108.197 -ApiKeysFile ..\config\api-keys-test.conf

.EXAMPLE
    .\01-deploy-opensilex-graphdb.ps1 -TargetIP 10.0.0.5 -OpenSilexVersion 1.4.7 -ProjectPrefix production
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$TargetIP,

    [Parameter(Mandatory=$false)]
    [string]$AdminUsername = "azureuser",

    [Parameter(Mandatory=$false)]
    [string]$PrivateKeyPath = "~/.ssh/id_ed25519",

    [Parameter(Mandatory=$false)]
    [string]$AdminEmail = "admin@opensilex.org",

    [Parameter(Mandatory=$false)]
    [string]$AdminPassword = "admin",

    [Parameter(Mandatory=$false)]
    [string]$OpenSilexVersion = "1.4.7",

    [Parameter(Mandatory=$false)]
    [string]$ProjectPrefix = "sandbox",

    [Parameter(Mandatory=$false)]
    [string]$HaproxyPort = 80,

    [Parameter(Mandatory=$false)]
    [string]$ApiKeysFile = "",

    [Parameter(Mandatory=$false)]
    [string]$BaseURI = ""
)

$ErrorActionPreference = "Stop"

# Script directory (where this script and patches/ live)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Default base URI to IP-based URL if not specified
if (-not $BaseURI) { $BaseURI = "http://$TargetIP/" }

# Derived settings
$DeployDir = "opensilex-docker-compose"
$RepoURL = "https://github.com/OpenSILEX/opensilex-docker-compose.git"
$GraphDBPort = 7200
$MongoExpressPort = 28889

# ─────────────────────────────────────────────────────────────────────────────
# Load API keys from config file (if provided)
# ─────────────────────────────────────────────────────────────────────────────

$FeideEnabled = $false
$FeideClientID = ""
$FeideClientSecret = ""

if ($ApiKeysFile) {
    if ($ApiKeysFile -match '^~') {
        $ApiKeysFile = $ApiKeysFile -replace '^~', $env:USERPROFILE
    }
    # Resolve relative paths from script directory
    if (-not [System.IO.Path]::IsPathRooted($ApiKeysFile)) {
        $ApiKeysFile = Join-Path $ScriptDir $ApiKeysFile
    }
    $ApiKeysFile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ApiKeysFile)

    if (Test-Path $ApiKeysFile) {
        # Parse key=value lines from the config file
        Get-Content $ApiKeysFile | ForEach-Object {
            if ($_ -match '^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$' -and $_ -notmatch '^\s*#') {
                $key = $Matches[1]
                $val = $Matches[2]
                switch ($key) {
                    "FEIDE_CLIENT_ID"     { $FeideClientID = $val }
                    "FEIDE_CLIENT_SECRET" { $FeideClientSecret = $val }
                }
            }
        }

        if ($FeideClientID -and $FeideClientSecret) {
            $FeideEnabled = $true
        }
    } else {
        Write-Host "[WARN] API keys file not found: $ApiKeysFile" -ForegroundColor Yellow
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# Output helpers
# ─────────────────────────────────────────────────────────────────────────────

function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK]   $Message" -ForegroundColor Green
}

function Write-Err {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Write-Step {
    param([string]$Step, [string]$Title)
    Write-Host ""
    Write-Host ("=" * 65) -ForegroundColor Cyan
    Write-Host " STEP $Step : $Title" -ForegroundColor Cyan
    Write-Host ("=" * 65) -ForegroundColor Cyan
}

# ─────────────────────────────────────────────────────────────────────────────
# SSH helper -- runs a command on the remote server
# ─────────────────────────────────────────────────────────────────────────────

function Invoke-ServerCommand {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Command,

        [Parameter(Mandatory=$false)]
        [string]$Description = "",

        [Parameter(Mandatory=$false)]
        [switch]$NoFail,

        [Parameter(Mandatory=$false)]
        [switch]$Quiet
    )

    if ($Description) {
        Write-Status $Description
    }

    $output = & ssh -i $PrivateKeyPath -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=60 "${AdminUsername}@${TargetIP}" $Command 2>&1
    $exitCode = $LASTEXITCODE

    if ($output -and -not $Quiet) {
        Write-Host $output
    }

    if ($exitCode -ne 0 -and -not $NoFail) {
        Write-Err "Command failed (exit $exitCode): $Command"
        exit 1
    }

    return $output
}

# ─────────────────────────────────────────────────────────────────────────────
# Banner
# ─────────────────────────────────────────────────────────────────────────────

Write-Host @"

         .+.
        +++++``.
      ;+;  ++.++``.
     ++     '+,  ++``.
   '+.        ++  ``+++       ___                    ___  ___  _     ___ __  __
  ++           +++``  ++     / _ \  _ __  ___  _ _  / __||_ _|| |   | __|\ \/ /
``++   ,;++++++++++++++++   | (_) || '_ \/ -_)| ' \ \__ \ | | | |__ | _|  >  <
++++++:``        ++   .++    \___/ | .__/\___||_||_||___/|___||____||___|/_/\_\
 .++    ``'+++   ++  ++``           |_|
   ++.      '+++'+.++
     ++:+++.``   .++          GRAPHDB DEPLOYMENT (Production-Ready)
      ``````````````
                              Stable triplestore for large datasets

"@ -ForegroundColor Cyan

Write-Status "Target:     $TargetIP"
Write-Status "Version:    OpenSILEX $OpenSilexVersion"
Write-Status "Triplestore: GraphDB 10.6.4 (replaces RDF4J)"
Write-Status "Prefix:     $ProjectPrefix"
if ($FeideEnabled) {
    Write-Status "Feide:      Enabled (OpenID Connect)"
} else {
    Write-Status "Feide:      Disabled"
}
Write-Host ""
Write-Host "  Why GraphDB? RDF4J has parser bugs on datasets >700K that prevent" -ForegroundColor Gray
Write-Host "               device creation. GraphDB is more stable." -ForegroundColor Gray
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: Prerequisites
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "1/9" "Prerequisites"

# Expand ~ in key path
if ($PrivateKeyPath -match '^~') {
    $PrivateKeyPath = $PrivateKeyPath -replace '^~', $env:USERPROFILE
}
$PrivateKeyPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($PrivateKeyPath)

# Check SSH key
if (-not (Test-Path $PrivateKeyPath)) {
    Write-Err "SSH private key not found: $PrivateKeyPath"
    exit 1
}
Write-Success "SSH key found: $PrivateKeyPath"

# Test SSH connectivity
$sshTest = Invoke-ServerCommand -Command "echo SSH_OK" -Description "Testing SSH connectivity..." -Quiet
if ($sshTest -notmatch "SSH_OK") {
    Write-Err "Cannot connect to $TargetIP via SSH"
    exit 1
}
Write-Success "SSH connection to $TargetIP successful"

# Check Docker
$dockerCheck = Invoke-ServerCommand -Command "docker --version 2>/dev/null && sudo docker compose version 2>/dev/null" -Description "Checking Docker installation..." -NoFail -Quiet
if ($LASTEXITCODE -ne 0 -or $dockerCheck -notmatch "Docker") {
    Write-Err "Docker or Docker Compose not found on server"
    Write-Err "Install Docker first: https://docs.docker.com/engine/install/debian/"
    exit 1
}
Write-Success "Docker is installed"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: Clone official repository
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "2/9" "Clone official opensilex-docker-compose repository"

$repoExists = Invoke-ServerCommand -Command "test -d ~/$DeployDir/.git && echo EXISTS || echo MISSING" -NoFail -Quiet
if ($repoExists -match "EXISTS") {
    Write-Status "Repository already exists, pulling latest..."
    Invoke-ServerCommand -Command "cd ~/$DeployDir && git pull" -Description "Updating repository..."
} else {
    Invoke-ServerCommand -Command "cd ~ && git clone $RepoURL $DeployDir" -Description "Cloning $RepoURL ..."
}
Write-Success "Repository ready at ~/$DeployDir"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: Apply fixes and configure
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "3/9" "Apply fixes and configure environment"

# Fix 1: Directory permissions -- the container's opensilex user needs to
# write generated config files (envsubst output) into the mounted config dir.
Invoke-ServerCommand -Command "chmod 777 ~/$DeployDir/config/ && sudo mkdir -p ~/$DeployDir/logs/opensilex && sudo chmod 777 ~/$DeployDir/logs/opensilex" -Description "Fixing directory permissions..."
Write-Success "Directory permissions set"

# Fix 2: Configure opensilex.env with user-provided values
Write-Status "Configuring opensilex.env..."

$envConfig = "cd ~/$DeployDir && sed -i 's|^OPENSILEX_RELEASE_TAG=.*|OPENSILEX_RELEASE_TAG=$OpenSilexVersion|' opensilex.env && sed -i 's|^PROJECT_PREFIX=.*|PROJECT_PREFIX=$ProjectPrefix|' opensilex.env && sed -i 's|^OPENSILEX_PUBLIC_URL=.*|OPENSILEX_PUBLIC_URL=http://${TargetIP}/|' opensilex.env && sed -i 's|^HAPROXY_EXPOSED_PORT=.*|HAPROXY_EXPOSED_PORT=$HaproxyPort|' opensilex.env && sed -i '/^HAPROXY_DOCKER_NAME=/d' opensilex.env && sed -i '/^OPENSILEX_DOCKER_NAME=/a HAPROXY_DOCKER_NAME=\`$PROJECT_PREFIX-opensilex-docker-haproxy' opensilex.env"

Invoke-ServerCommand -Command $envConfig
Write-Success "Environment configured (version=$OpenSilexVersion, prefix=$ProjectPrefix, haproxy_port=$HaproxyPort)"

# Add GraphDB environment variables
Write-Status "Adding GraphDB configuration..."
$graphdbEnvCmd = "cd ~/$DeployDir && echo '' >> opensilex.env && echo '# GraphDB configuration (replaces RDF4J)' >> opensilex.env && echo 'GRAPHDB_DOCKER_NAME=${ProjectPrefix}-opensilex-docker-graphdb' >> opensilex.env && echo 'GRAPHDB_EXPOSED_PORT=$GraphDBPort' >> opensilex.env"
Invoke-ServerCommand -Command $graphdbEnvCmd -Quiet
Write-Success "GraphDB environment variables added"

# Feide/OpenID Connect authentication (optional)
if ($FeideEnabled) {
    Write-Status "Configuring Feide/OpenID Connect authentication..."

    # Add Feide env vars to opensilex.env
    $feideEnvCmd = "cd ~/$DeployDir && echo '' >> opensilex.env && echo '# Feide/Dataporten OpenID Connect' >> opensilex.env && echo 'FEIDE_CLIENT_ID=$FeideClientID' >> opensilex.env && echo 'FEIDE_CLIENT_SECRET=$FeideClientSecret' >> opensilex.env"
    Invoke-ServerCommand -Command $feideEnvCmd -Quiet

    # Append Feide YAML config to opensilex-custom-config.yml (gets merged via envsubst)
    $feideConfigFile = Join-Path $ScriptDir "patches\feide-openid-config.yml"
    if (Test-Path $feideConfigFile) {
        # SCP the feide config, then append it to the custom config
        & scp -i $PrivateKeyPath -o StrictHostKeyChecking=no $feideConfigFile "${AdminUsername}@${TargetIP}:~/${DeployDir}/config/feide-openid-config.yml" 2>&1 | Out-Null
        Invoke-ServerCommand -Command "cd ~/$DeployDir/config && cat feide-openid-config.yml >> opensilex-custom-config.yml && rm feide-openid-config.yml" -Quiet
        Write-Success "Feide authentication configured"
    } else {
        Write-Err "Feide config patch not found: $feideConfigFile"
        exit 1
    }
} else {
    Write-Status "Feide authentication: skipped (no credentials provided)"
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: Replace RDF4J with GraphDB in docker-compose.yml
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "4/9" "Replace RDF4J with GraphDB in docker-compose.yml"

Invoke-ServerCommand -Command @'
cd ~/opensilex-docker-compose

# Create GraphDB service replacement
cat > graphdb-service.yml << 'GRAPHDB_EOF'
  graphdb:
    image: ontotext/graphdb:10.6.4
    container_name: $GRAPHDB_DOCKER_NAME
    environment:
      GDB_JAVA_OPTS: >-
        -Xmx4g -Xms2g
        -Dgraphdb.home=/opt/graphdb/home
        -Dgraphdb.workbench.cors.enable=true
        -Dgraphdb.workbench.cors.origin=*
    volumes:
      - persist_graphdb_data:/opt/graphdb/home
      - persist_graphdb_work:/opt/graphdb/work
      - persist_graphdb_logs:/opt/graphdb/logs
    ports:
      - "$GRAPHDB_EXPOSED_PORT:7200"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:7200/rest/repositories"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 60s
    restart: unless-stopped
GRAPHDB_EOF

# Remove rdf4j service block and replace with graphdb
awk '
  /^  rdf4j:/ {
    in_rdf4j=1
    system("cat graphdb-service.yml")
    next
  }
  in_rdf4j && /^  [a-z]/ { in_rdf4j=0 }
  !in_rdf4j { print }
' docker-compose.yml > docker-compose.yml.new

mv docker-compose.yml.new docker-compose.yml
rm graphdb-service.yml

# Replace all rdf4j references with graphdb
sed -i 's/- rdf4j/- graphdb/g' docker-compose.yml              # YAML list dependencies
sed -i 's/      rdf4j:/      graphdb:/g' docker-compose.yml    # depends_on entries (indented)
sed -i 's/rdf4j:8080/graphdb:7200/g' docker-compose.yml        # Host:port references
sed -i 's/persist_rdf4j/persist_graphdb/g' docker-compose.yml  # Volume names

# Add missing graphdb work volume in volumes section (RDF4J only had data + logs, GraphDB needs work too)
# Must check for volume declaration format (^  persist_graphdb_work:) not service mount (      - persist_graphdb_work:...)
if ! grep -q '^  persist_graphdb_work:' docker-compose.yml; then
    sed -i '/^  persist_graphdb_logs:/a\  persist_graphdb_work:' docker-compose.yml
fi

# Remove rdf4j backend from haproxy.cfg - GraphDB is accessed directly by OpenSILEX, not via HAProxy
sed -i '/acl is_rdf4jserver/d' haproxy.cfg
sed -i '/use_backend rdf4jserver/d' haproxy.cfg
sed -i '/^backend rdf4jserver/,/^$/d' haproxy.cfg

echo "docker-compose.yml and haproxy.cfg updated for GraphDB"
'@ -Description "Replacing RDF4J with GraphDB..."

Write-Success "docker-compose.yml and haproxy.cfg updated for GraphDB"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: Update OpenSILEX config for GraphDB
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "5/9" "Update OpenSILEX config for GraphDB"

Invoke-ServerCommand -Command @"
cd ~/opensilex-docker-compose/config

# Override the SPARQL config to point to GraphDB instead of RDF4J
# The correct path is ontologies.sparql.config (matches opensilex-template-custom.yml)
# Must include BOTH serverURI and repository - YAML map replacement wipes the entire config block
# so without repository here, OpenSILEX falls back to JAR default "opensilex" instead of "opensilex-docker-db"
cat >> opensilex-custom-config.yml << 'GRAPHDB_CONFIG'

# GraphDB SPARQL endpoint and resource base URI
ontologies:
  baseURI: "$BaseURI"
  sparql:
    config:
      serverURI: http://sandbox-opensilex-docker-graphdb:7200
      repository: opensilex-docker-db
GRAPHDB_CONFIG

echo "GraphDB config added to opensilex-custom-config.yml"
"@ -Description "Configuring OpenSILEX to use GraphDB (baseURI: $BaseURI)..."

Write-Success "Config updated to use GraphDB"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6: Build Docker images
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "6/9" "Build Docker images (vanilla with pre-built ZIP)"
Write-Status "Building OpenSILEX, GraphDB, and HAProxy images..."
Write-Status "(First build takes 2-3 min; downloads official pre-built release ZIP)"

# Run Docker build in foreground with streaming output
# SSH keep-alive settings prevent timeout during the 2-3 minute build
Write-Status "Running Docker build (streaming output)..."
Invoke-ServerCommand -Command "cd ~/$DeployDir && BUILDKIT_PROGRESS=plain sudo docker compose --progress=plain --env-file opensilex.env build --build-arg UID=1001 --build-arg GID=1001" -Description "Building images..."

if ($LASTEXITCODE -ne 0) {
    Write-Err "Docker image build failed"
    exit 1
}
Write-Success "All images built successfully"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 7: Start GraphDB and MongoDB, create repository
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "7/9" "Start GraphDB and MongoDB"

# Stop any existing stack first
Invoke-ServerCommand -Command "cd ~/$DeployDir && sudo docker compose --env-file opensilex.env down 2>/dev/null" -Description "Stopping any existing stack..." -NoFail

# Remove the first_install flag so system install runs fresh
Invoke-ServerCommand -Command "cd ~/$DeployDir && sudo docker volume rm ${ProjectPrefix}-stack_persist_opensilex 2>/dev/null" -NoFail

# Start GraphDB and MongoDB
Invoke-ServerCommand -Command "cd ~/$DeployDir && sudo docker compose --env-file opensilex.env up -d graphdb mongo" -Description "Starting GraphDB and MongoDB..."

Write-Status "Waiting for GraphDB to be ready (60 seconds)..."
Start-Sleep -Seconds 60

# Create GraphDB repository
Write-Status "Creating OpenSILEX repository in GraphDB..."

$repoConfigTTL = @'
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix rep: <http://www.openrdf.org/config/repository#> .
@prefix sr: <http://www.openrdf.org/config/repository/sail#> .
@prefix sail: <http://www.openrdf.org/config/sail#> .

[] a rep:Repository ;
   rep:repositoryID "opensilex-docker-db" ;
   rdfs:label "OpenSILEX Repository" ;
   rep:repositoryImpl [
      rep:repositoryType "graphdb:SailRepository" ;
      sr:sailImpl [
         sail:sailType "graphdb:Sail" ;
         <http://www.ontotext.com/config/graphdb#ruleset> "empty" ;
         <http://www.ontotext.com/config/graphdb#storage-folder> "opensilex-docker-db" ;
         <http://www.ontotext.com/config/graphdb#entity-index-size> "10000000" ;
         <http://www.ontotext.com/config/graphdb#entity-id-size> "32" ;
         <http://www.ontotext.com/config/graphdb#enable-literal-index> "true" ;
         <http://www.ontotext.com/config/graphdb#check-for-inconsistencies> "false" ;
         <http://www.ontotext.com/config/graphdb#disable-sameAs> "true"
      ]
   ] .
'@

$tempRepoConfig = New-TemporaryFile
$repoConfigTTL | Out-File -FilePath $tempRepoConfig -Encoding UTF8 -NoNewline
& scp -i $PrivateKeyPath -o StrictHostKeyChecking=no $tempRepoConfig "${AdminUsername}@${TargetIP}:~/repo-config.ttl" 2>&1 | Out-Null
Remove-Item $tempRepoConfig

$repoCreate = Invoke-ServerCommand -Command @'
# Create repository via host-exposed port (avoids docker compose env file dependency)
# File was SCP'd to ~/repo-config.ttl
HTTP_STATUS=$(curl -s -o /tmp/repo-create-response.txt -w "%{http_code}" \
    -X POST \
    -H "Content-Type: multipart/form-data" \
    -F "config=@$HOME/repo-config.ttl" \
    http://localhost:7200/rest/repositories)

echo "HTTP status: $HTTP_STATUS"
cat /tmp/repo-create-response.txt
echo ""
echo "Repository creation completed"
'@ -NoFail

if ($repoCreate -match "HTTP status: 201" -or $repoCreate -match "already exists") {
    Write-Success "GraphDB repository created"
} elseif ($repoCreate -match "HTTP status: 409") {
    Write-Success "GraphDB repository already exists"
} else {
    Write-Err "GraphDB repository creation failed - OpenSILEX will not start without it"
    Write-Host $repoCreate -ForegroundColor Gray
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 8: Start full stack and load ontologies
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "8/9" "Start OpenSILEX and load ontologies"

# Start the full stack
Invoke-ServerCommand -Command "cd ~/$DeployDir && sudo docker compose --env-file opensilex.env up -d" -Description "Starting all services..."

# Wait for OpenSILEX to become ready
Write-Status "Waiting for OpenSILEX to start (this takes 1-3 minutes)..."

$maxAttempts = 36  # 36 * 10s = 6 minutes max
$attempt = 0
$ready = $false

while ($attempt -lt $maxAttempts -and -not $ready) {
    Start-Sleep -Seconds 10
    $attempt++

    $healthCheck = & ssh -i $PrivateKeyPath -o StrictHostKeyChecking=no "${AdminUsername}@${TargetIP}" "curl -s -o /dev/null -w '%{http_code}' http://localhost:${HaproxyPort}/${ProjectPrefix}/app/ 2>/dev/null" 2>&1

    if ($healthCheck -match "200") {
        $ready = $true
    } else {
        $elapsed = $attempt * 10
        Write-Host "  Waiting... (${elapsed}s elapsed, status: $healthCheck)" -ForegroundColor Gray
    }
}

if (-not $ready) {
    Write-Err "OpenSILEX did not start within timeout"
    Write-Status "Check logs: ssh $AdminUsername@$TargetIP 'cd ~/$DeployDir && sudo docker compose --env-file opensilex.env logs opensilex'"
    exit 1
}

Write-Success "OpenSILEX is running and serving requests"

# Load ontologies into GraphDB (critical step)
Write-Status "Loading ontologies into GraphDB (may take 2-3 minutes)..."

$ontologyLoad = Invoke-ServerCommand -Command @'
cd ~/opensilex-docker-compose

# Try up to 5 times with increasing delays
for i in 1 2 3 4 5; do
    echo "Attempt $i: Loading ontologies..."
    if sudo docker compose --env-file opensilex.env exec -T opensilex ./bin/opensilex.sh sparql reset-ontologies 2>&1; then
        echo "SUCCESS: Ontologies loaded"
        exit 0
    else
        echo "Failed attempt $i"
        if [ $i -lt 5 ]; then
            echo "Waiting 20 seconds before retry..."
            sleep 20
        fi
    fi
done

echo "WARNING: Ontology loading may have failed"
echo "Check manually: sudo docker compose logs opensilex | tail -50"
exit 1
'@ -NoFail

if ($ontologyLoad -match "SUCCESS") {
    Write-Success "Ontologies loaded successfully"
} else {
    Write-Status "Ontology loading may need manual intervention"
    Write-Host "  Run manually if needed:" -ForegroundColor Yellow
    Write-Host "  ssh $AdminUsername@$TargetIP 'cd ~/$DeployDir && sudo docker compose --env-file opensilex.env exec opensilex ./bin/opensilex.sh sparql reset-ontologies'" -ForegroundColor Gray
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 9: Create admin user and verify
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "9/9" "Create admin user and verify deployment"

$userAddCmd = "cd ~/$DeployDir && sudo docker compose --env-file opensilex.env exec opensilex ./bin/opensilex.sh user add --admin --email=$AdminEmail --password=$AdminPassword --lang=en --CONFIG_FILE=/home/opensilex/config/opensilex.yml 2>&1"

$userResult = Invoke-ServerCommand -Command $userAddCmd -Description "Creating admin user ($AdminEmail)..." -NoFail

if ($userResult -match "User created") {
    Write-Success "Admin user created: $AdminEmail"
} elseif ($userResult -match "already exists") {
    Write-Success "Admin user already exists: $AdminEmail"
} else {
    Write-Host $userResult
    Write-Status "User creation returned unexpected output (may still be OK)"
}

# Test authentication
Write-Status "Testing authentication..."
$authResult = & ssh -i $PrivateKeyPath -o StrictHostKeyChecking=no "${AdminUsername}@${TargetIP}" "curl -s http://localhost:${HaproxyPort}/${ProjectPrefix}/rest/security/authenticate -X POST -H 'Content-Type: application/json' -d '{`"identifier`":`"$AdminEmail`",`"password`":`"$AdminPassword`"}' 2>&1"

if ($authResult -match '"token"') {
    Write-Success "Authentication verified -- JWT token received"
} else {
    Write-Err "Authentication test failed"
    Write-Host $authResult
}

# Show container status
Write-Status "Container status:"
Invoke-ServerCommand -Command "cd ~/$DeployDir && sudo docker compose --env-file opensilex.env ps" -NoFail

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host ("=" * 65) -ForegroundColor Green
Write-Host "  DEPLOYMENT COMPLETE" -ForegroundColor Green
Write-Host ("=" * 65) -ForegroundColor Green
Write-Host ""
Write-Status "Access Information:"
Write-Host ("-" * 65) -ForegroundColor Gray
if ($HaproxyPort -eq 80) {
    Write-Success "OpenSILEX Web UI:    http://${TargetIP}/${ProjectPrefix}/app/"
    Write-Success "OpenSILEX API Docs:  http://${TargetIP}/${ProjectPrefix}/api-docs"
} else {
    Write-Success "OpenSILEX Web UI:    http://${TargetIP}:${HaproxyPort}/${ProjectPrefix}/app/"
    Write-Success "OpenSILEX API Docs:  http://${TargetIP}:${HaproxyPort}/${ProjectPrefix}/api-docs"
}
Write-Success "GraphDB Workbench:   http://${TargetIP}:${GraphDBPort}/"
Write-Success "MongoDB Express:     http://${TargetIP}:${MongoExpressPort}/"
Write-Success "Admin Email:         $AdminEmail"
Write-Success "Admin Password:      $AdminPassword"
Write-Success "Triplestore:         GraphDB 10.6.4 (stable for large datasets)"
if ($FeideEnabled) {
    Write-Success "Feide Login:         Enabled (https://auth.dataporten.no)"
    Write-Success "Auto-Groups:         New users -> Users group (read-only)"
}
Write-Host ("-" * 65) -ForegroundColor Gray
Write-Host ""
Write-Status "Useful Commands:"
Write-Host "  View logs:     ssh $AdminUsername@$TargetIP 'cd ~/$DeployDir && sudo docker compose --env-file opensilex.env logs -f opensilex'" -ForegroundColor Gray
Write-Host "  Stop stack:    ssh $AdminUsername@$TargetIP 'cd ~/$DeployDir && sudo docker compose --env-file opensilex.env down'" -ForegroundColor Gray
Write-Host "  Start stack:   ssh $AdminUsername@$TargetIP 'cd ~/$DeployDir && sudo docker compose --env-file opensilex.env up -d'" -ForegroundColor Gray
Write-Host "  Restart:       ssh $AdminUsername@$TargetIP 'cd ~/$DeployDir && sudo docker compose --env-file opensilex.env restart opensilex'" -ForegroundColor Gray
Write-Host ""
Write-Host "Optional: Add source patches and theme:" -ForegroundColor Cyan
Write-Host "  cd tools/docker-deployment" -ForegroundColor Gray
Write-Host "  .\02-configure-feide.ps1 -TargetIP $TargetIP  # Feide/OpenID authentication" -ForegroundColor Gray
Write-Host "  .\03-apply-patches.ps1 -Rebuild              # GroupDAO fix + auto-group assignment" -ForegroundColor Gray
Write-Host "  .\04-apply-theme.ps1 -TargetIP $TargetIP     # PheNo branding" -ForegroundColor Gray
Write-Host ""
