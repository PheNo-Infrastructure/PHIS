GAP ANALYSIS: Current State vs One-Click Docker Install
✅ What You Already Have
1. Azure VM Provisioning (opensilex-github.ps1)
✅ Full Azure VM creation/management via PowerShell
✅ SSH key generation and management
✅ Interactive menu UI
✅ Commands: FullInstall, Deploy, Install, Status, Connect, etc.
2. Docker Deployment (deploy-opensilex-docker.ps1)
✅ Copy files to remote server
✅ Run installation script
✅ Verify deployment
✅ Pretty output with colors
3. Source Patching (opensilex-installer.sh)
✅ GroupDAO NullPointerException fix
✅ AccountDAO auto-group assignment (Feide)
✅ Build from source with patches
4. Feide/OIDC Integration (opensilex-github.ps1:14-30)
✅ Configuration system for Feide credentials
✅ API key management
✅ Environment variable support
❌ What's Missing for One-Click Docker Install
Component	Current State	Docker Needs	Gap
VM Creation	✅ opensilex-github.ps1	✅ Reuse existing	✅ DONE
Docker Build	✅ Dockerfile with patches	✅ Works	✅ DONE
Feide in Docker	✅ Bash script has it	❌ Docker doesn't	❌ MISSING
Config Templates	✅ Bash has opensilex.yml templates	❌ Docker uses defaults	❌ MISSING
Agroportal API	✅ Bash script configures it	❌ Docker doesn't	❌ MISSING
HTTPS/SSL	✅ migrate-to-https.sh exists	❌ Not in Docker	❌ MISSING
Branding	✅ deploy-pheno-branding.ps1	❌ Not in Docker	❌ MISSING
Integration	❌ Separate systems	❌ Not unified	❌ MISSING
ROADMAP: One-Click Docker Install Plan
Phase 1: Merge Configurations (1-2 days)
Goal: Get Docker deployment to feature parity with bash installer
tools/docker-deployment/
├── Dockerfile                      # ✅ Already has patches
├── docker-compose.yml              # ✅ Exists
├── config/
│   ├── opensilex-template.yml     # ❌ ADD: Copy from bash installer
│   ├── feide-config.template      # ❌ ADD: Feide OIDC settings
│   └── branding/                  # ❌ ADD: PHIS branding assets
├── patches/                        # ✅ You just created this
│   ├── 001-groupdao-fix.patch     # ✅ Done
│   ├── 002-accountdao-autogroups.patch  # ❌ ADD: From bash installer
│   └── README.md                   # ✅ Done
└── deploy-opensilex-docker.ps1     # ✅ Exists, needs enhancement
Tasks:
✅ Extract 002-accountdao-autogroups.patch from opensilex-installer.sh:90-100
✅ Copy opensilex.yml template from bash installer to Docker config
✅ Add environment variable substitution for Feide credentials
✅ Update Dockerfile to copy config templates
Phase 2: Enhance deploy-opensilex-docker.ps1 (1 day)
Goal: Match opensilex-github.ps1 feature set Add Parameters:
param(
    [string]$TargetIP,                    # ✅ Already has
    [string]$AdminUsername,               # ✅ Already has
    [string]$AdminEmail,                  # ✅ Already has
    [string]$AdminPassword,               # ✅ Already has
    
    # NEW PARAMETERS
    [string]$AgroportalApiKey,           # ❌ ADD
    [string]$FeideClientId,              # ❌ ADD
    [string]$FeideClientSecret,          # ❌ ADD
    [string]$DomainName,                 # ❌ ADD (for HTTPS)
    [switch]$EnableHTTPS,                # ❌ ADD
    [switch]$EnableBranding              # ❌ ADD (PHIS theme)
)
Add Configuration Logic:
# Read API keys from config file (like bash installer does)
if (Test-Path "tools/config/api-keys.conf") {
    $apiKeys = Get-Content "tools/config/api-keys.conf" | ConvertFrom-StringData
    $AgroportalApiKey = $apiKeys.AGROPORTAL_API_KEY
    $FeideClientId = $apiKeys.FEIDE_CLIENT_ID
    $FeideClientSecret = $apiKeys.FEIDE_CLIENT_SECRET
}

# Generate docker-compose.yml with env vars
$envVars = @{
    AGROPORTAL_API_KEY = $AgroportalApiKey
    FEIDE_CLIENT_ID = $FeideClientId
    FEIDE_CLIENT_SECRET = $FeideClientSecret
    ADMIN_EMAIL = $AdminEmail
    ADMIN_PASSWORD = $AdminPassword
}
Phase 3: Unify with Azure VM Creation (1-2 days)
Goal: Single command creates VM + deploys Docker Option A: Extend opensilex-github.ps1
# Add new command: "DockerDeploy"
.\opensilex-github.ps1 -Command DockerDeploy -VMName "PHIS-PROD"
Option B: New unified script
# tools/deploy-phis-oneclick.ps1
.\deploy-phis-oneclick.ps1 `
    -VMName "PHIS-PROD" `
    -Location "westeurope" `
    -FeideClientId "xxx" `
    -FeideClientSecret "yyy" `
    -EnableHTTPS
This would:
Call Azure VM creation (from opensilex-github.ps1)
Wait for VM to be ready
Call Docker deployment (deploy-opensilex-docker.ps1)
Configure Feide, HTTPS, branding
Create admin user
Open firewall ports
Phase 4: Docker Compose Enhancements (1 day)
Add services for production:
services:
  opensilex:
    build: .
    environment:
      - AGROPORTAL_API_KEY=${AGROPORTAL_API_KEY}
      - FEIDE_CLIENT_ID=${FEIDE_CLIENT_ID}
      - FEIDE_CLIENT_SECRET=${FEIDE_CLIENT_SECRET}
    volumes:
      - ./config/opensilex.yml:/app/config/opensilex.yml
      - opensilex-data:/app/data
  
  # ADD: Nginx reverse proxy for HTTPS
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/ssl:/etc/nginx/ssl
    depends_on:
      - opensilex
  
  # ADD: Let's Encrypt for SSL certificates
  certbot:
    image: certbot/certbot
    volumes:
      - ./nginx/ssl:/etc/letsencrypt
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"
FINAL ARCHITECTURE
┌─────────────────────────────────────────────────────────────┐
│  Local Machine (Windows/PowerShell)                         │
│                                                              │
│  .\deploy-phis-oneclick.ps1 -VMName "PHIS" -EnableHTTPS    │
│         │                                                    │
│         ├─► 1. Create Azure VM (via Az PowerShell)         │
│         ├─► 2. Generate/Upload SSH keys                     │
│         ├─► 3. Copy Docker files to VM                      │
│         ├─► 4. Run install-opensilex-docker.sh             │
│         └─► 5. Configure Feide/HTTPS/Branding              │
└─────────────────────────────────────────────────────────────┘
                         │
                         │ SSH + SCP
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Azure VM (Debian 11)                                        │
│                                                              │
│  /opt/opensilex-docker/                                     │
│  ├── docker-compose.yml                                     │
│  ├── Dockerfile (with patches)                              │
│  ├── config/                                                │
│  │   ├── opensilex.yml (Feide configured)                   │
│  │   └── branding/ (PHIS theme)                             │
│  └── patches/                                               │
│      ├── 001-groupdao-fix.patch                             │
│      └── 002-accountdao-autogroups.patch                    │
│                                                              │
│  Running: docker compose up -d                               │
│  ├── opensilex (patched build)                              │
│  ├── graphdb (RDF store)                                    │
│  ├── mongodb (document store)                               │
│  └── nginx (HTTPS reverse proxy)                            │
└─────────────────────────────────────────────────────────────┘
SUMMARY: How Far Are We?
Feature	Bash Installer	Docker (Current)	Docker (After Plan)
Azure VM Creation	✅	❌	✅
Feide Integration	✅	❌	✅
Agroportal API	✅	❌	✅
Source Patching	✅	✅	✅
HTTPS/SSL	✅	❌	✅
PHIS Branding	✅	❌	✅
One-Click Install	✅	❌	✅
Build Time	~20min	~20min	~20min
Portability	❌ (Linux only)	✅ (Anywhere)	✅
Reproducibility	⚠️ (Scripts)	✅ (Docker)	✅
Estimate: 4-6 days of work to achieve full feature parity and one-click install. Want me to start with Phase 1 (extracting configs and patches)?