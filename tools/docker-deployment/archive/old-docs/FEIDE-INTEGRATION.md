# Feide OpenID Connect Integration - Manual Steps

## Prerequisites

1. Feide credentials from https://dashboard.dataporten.no/
2. Registered redirect URI in Feide dashboard

## Step 1: Update opensilex.env

SSH to server and edit the env file:

```bash
ssh -i ~/.ssh/id_ed25519 azureuser@20.61.108.197
cd ~/opensilex-docker-compose
nano opensilex.env
```

**Add these lines at the end:**

```bash
# Feide/Dataporten OpenID Connect
FEIDE_CLIENT_ID=58c19493-d945-48d2-b8c4-f1baf7b00aee
FEIDE_CLIENT_SECRET=04fbe911-e106-4307-8253-24b15c4cc020
```

**Update the public URL** (change from localhost to server IP):

```bash
# Before:
OPENSILEX_PUBLIC_URL=http://localhost:28081/

# After:
OPENSILEX_PUBLIC_URL=http://20.61.108.197:28081/
```

Save and exit (`Ctrl+X`, `Y`, `Enter`)

## Step 2: Append Feide Config to Custom Config

Still on the server:

```bash
cd ~/opensilex-docker-compose/config
cat >> opensilex-custom-config.yml << 'EOF'

# Feide/Dataporten OpenID Connect authentication
security:
  openID:
    enable: true
    scopes: ["openid", "userid", "profile", "email", "userinfo-name", "userinfo-mail"]
    userIdClaim: "sub"
    userNameClaim: "name"
    userEmailClaim: "https://n.feide.no/claims/eduPersonPrincipalName"
    userFirstNameClaim: "given_name"
    userLastNameClaim: "family_name"
    providerURI: "https://auth.dataporten.no"
    redirectURI: "${OPENSILEX_PUBLIC_URL}${OPENSILEX_PATH_PREFIX}/app/openid"
    clientID: "${FEIDE_CLIENT_ID}"
    clientSecret: "${FEIDE_CLIENT_SECRET}"
    connectionTitle:
      en: "Login with Feide"
      no: "Logg inn med Feide"
EOF
```

## Step 3: Verify Feide Dashboard Configuration

**CRITICAL**: The redirect URI in Feide dashboard MUST match:

```
http://20.61.108.197:28081/sandbox/app/openid
```

(Or use your domain name if you have one configured)

Log in to https://dashboard.dataporten.no/ and verify:
- Client ID: `58c19493-d945-48d2-b8c4-f1baf7b00aee`
- Redirect URI: `http://20.61.108.197:28081/sandbox/app/openid`
- Scopes enabled: `openid`, `userid`, `profile`, `email`, `userinfo-name`, `userinfo-mail`

## Step 4: Restart OpenSILEX Container

This regenerates the config with envsubst:

```bash
cd ~/opensilex-docker-compose
docker compose --env-file opensilex.env restart opensilex
```

Wait 2-3 minutes for OpenSILEX to fully initialize.

## Step 5: Verify Integration

1. Open browser to: http://20.61.108.197:28081/sandbox/app/

2. You should see **two login options**:
   - Standard login (username/password)
   - **"Login with Feide"** button

3. Click "Login with Feide" and test authentication

## Testing the Auto-Group Assignment Patch

1. Log in with a **NEW** Feide account (never logged in before)
2. Check if you have immediate access (no blank page)
3. Verify the user appears in the "Users" group with "Default User" profile

Expected behavior:
- **Without patch**: Blank page on first login, no credentials
- **With patch**: Immediate access to OpenSILEX dashboard

## Troubleshooting

### Login button doesn't appear
- Check logs: `docker logs opensilex-docker-opensilexapp | tail -50`
- Verify config generated correctly: `cat ~/opensilex-docker-compose/config/opensilex.yml | grep -A 15 'openID:'`

### Feide redirect fails
- Verify redirect URI matches in both:
  - OpenSILEX config (from envsubst)
  - Feide dashboard settings
- Check OPENSILEX_PUBLIC_URL is set to server IP, not localhost

### User gets blank page after Feide login
- This means the auto-group assignment patch ISN'T working
- Check if user was added to any group: OpenSILEX UI → Security → Groups → Users

### Container won't start
- Check for YAML syntax errors: `cd ~/opensilex-docker-compose/config && yamllint opensilex-custom-config.yml`
- View startup logs: `docker compose --env-file opensilex.env logs opensilex`
