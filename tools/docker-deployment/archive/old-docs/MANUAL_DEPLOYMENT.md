# OpenSILEX Vanilla Deployment Guide

**Goal**: Deploy vanilla OpenSILEX 1.4.7 without patches to establish baseline understanding.

**Server**: 20.61.108.197 (fresh install)
**Version**: OpenSILEX 1.4.7 (official release, no modifications)
**Approach**: Manual deployment to identify and document all required steps

---

## Prerequisites (Local Machine)

### 1. Verify SSH Access

```powershell
# Test SSH connectivity
ssh -i ~/.ssh/id_ed25519 azureuser@20.61.108.197 "echo 'SSH OK'"
```

**Expected**: `SSH OK`
**If fails**:
- Check SSH key exists at `C:\Users\siv017\.ssh\id_ed25519`
- If you recreated the server, the host key changed - see Step 1a

### 1a. Fix SSH Host Key (Only if Server Recreated)

If you get "Host key verification failed" or "REMOTE HOST IDENTIFICATION HAS CHANGED":

```powershell
# Remove old host key from known_hosts
ssh-keygen -R 20.61.108.197

# Try SSH again
ssh -i ~/.ssh/id_ed25519 azureuser@20.61.108.197
```

**Expected**: Prompt to accept new host key, then successful login
**Why this happens**: New server has different SSH host keys than the old server at the same IP

---

## Server Setup

### 2. SSH to Server

```powershell
ssh -i ~/.ssh/id_ed25519 azureuser@20.61.108.197
```

### 3. Install Docker (if needed)

```bash
# Check if Docker is installed
docker --version

# If not installed, install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker azureuser

# Log out and back in for group to take effect
exit
```

**Expected**: `Docker version 27.x` or similar
**If fails**: Installation errors - check logs

### 4. Verify Docker Works

```bash
# SSH back in
ssh -i ~/.ssh/id_ed25519 azureuser@20.61.108.197

# Test Docker
docker ps
```

**Expected**: Empty list or running containers (no permission errors)
**If fails**: `permission denied` - need to log out/in after usermod

---

## Clone Official Repository

### 5. Clone opensilex-docker-compose

```bash
# Clone from official INRAE forge (tag 1.4.7)
cd ~
git clone --branch 1.4.7 https://forge.inrae.fr/OpenSILEX/opensilex-docker-compose.git
cd opensilex-docker-compose

# Verify clone
ls -la
```

**Expected**: See `docker-compose.yml`, `bin/`, `config/`, `opensilex.env`, etc.
**If fails**: Git not installed or repo doesn't exist

**Note**: We use docker-compose tag `1.4.7` because:
- Official docs reference 1.4.9, but that tag doesn't exist in the docker-compose repo
- The docker-compose version is independent of OpenSILEX version
- The `opensilex.env` file included with tag 1.4.7 already sets `OPENSILEX_RELEASE_TAG=1.4.7`
- Tag 1.4.7 is the latest stable release tested with the official deployment repo

---

## Fix Dockerfile for UID/GID Conflicts

### 6. Modify opensilex-build-step.docker

The base Tomcat image has a `ubuntu` user at UID/GID 1000, which conflicts with the default build args. Fix the Dockerfile to handle this gracefully:

```bash
# Open the Dockerfile
nano opensilex-build-step.docker
```

Find these lines (around line 10-11):

```dockerfile
RUN groupadd --gid $GID $USERNAME \
    && useradd --uid $UID --gid $GID -m $USERNAME \
```

Replace with:

```dockerfile
RUN getent group $USERNAME || groupadd --gid $GID $USERNAME \
    && getent passwd $USERNAME || useradd --uid $UID --gid $GID -m $USERNAME \
```

**Why**: `getent` checks if user/group already exists before creating them. This prevents build failures when UID/GID 1000 is already taken by the ubuntu user.

**Expected**: File saved successfully
**Save**: `Ctrl+O`, `Enter`, `Ctrl+X`

---

## Configure Environment and Permissions

### 7. Optional: Rename opensilex.env to .env

The repo includes `opensilex.env` with all required settings. You can optionally rename it to `.env` so you don't need to specify `--env-file` on every docker-compose command:

```bash
# Optional: rename for convenience
mv opensilex.env .env

# Verify contents
cat .env
```

**Expected**: File shows `OPENSILEX_RELEASE_TAG=1.4.7` and other config
**If skipped**: You'll need to use `docker compose --env-file opensilex.env` for all commands

### 8. Fix Directory Permissions BEFORE Build

OpenSILEX container needs to write to `config/` and `logs/` during startup. Fix permissions now to avoid runtime errors:

```bash
# OpenSILEX container (UID 1001) needs write access
chmod 777 config/
sudo chmod 777 logs/opensilex/

# Verify permissions
ls -ld config/ logs/opensilex/
```

**Expected**: `drwxrwxrwx` for both directories
**Why this is needed**:
- Container runs as UID 1001 (opensilex user inside container)
- Directories are owned by UID 1000 (azureuser on host)
- Without 777, container can't write config or logs
- `sudo` needed for logs/ because it's created by Docker Compose with root ownership

**When to do this**: BEFORE `docker compose up` (can be done before or after build)

---

## Build and Deploy

### 9. Build All Services with UID/GID 1001

Build all images using UID/GID 1001 to avoid conflict with ubuntu user (UID 1000) in base Tomcat image:

```bash
# Build all images with UID/GID 1001
docker compose --env-file opensilex.env build --build-arg UID=1001 --build-arg GID=1001
```

**Expected**: Build succeeds, downloads OpenSILEX 1.4.7 release ZIP, builds all services
**If fails**:
- **GID already exists**: Dockerfile wasn't modified in Step 6 - add getent checks
- **Download errors**: Network issue or wrong version tag
- **Permission errors**: Docker daemon issues

**Build time**: 2-3 minutes (downloads pre-built release ZIP, builds RDF4J and HAProxy)

### 10. Start OpenSILEX Stack

```bash
# Start the OpenSILEX stack
docker compose --env-file opensilex.env up start_opensilex_stack -d

# Check container status
docker compose ps
```

**Expected**: All containers running (State: Up)
**If fails**: Check logs with `docker compose logs <service>`

### 11. Check OpenSILEX Logs

```bash
# Follow OpenSILEX logs
docker compose logs -f opensilex
```

**Expected**: See "OpenSILEX started" or similar (wait up to 2 minutes)
**If fails**:
- **Permission denied on config file**: Didn't chmod 777 in Step 8
- **MongoDB connection errors**: MongoDB not ready yet (wait longer)
- **RDF4J connection errors**: RDF4J not ready yet (wait longer)
- **Config errors**: opensilex.yml syntax issue

**Ctrl+C to stop following logs**

---

## Verify Deployment

### 12. Test Web UI Access

**On local machine**:

```powershell
# Test if OpenSILEX is responding
curl http://20.61.108.197/sandbox/app/
```

**Expected**: HTML response with "OpenSILEX" in it
**If fails**:
- **Connection refused**: HAProxy not running or wrong port
- **502 Bad Gateway**: HAProxy running but OpenSILEX not responding
- **404 Not Found**: Wrong URL prefix

### 13. Test API Health

```bash
# On server
curl -I http://localhost:8080/sandbox/rest/
```

**Expected**: `HTTP/1.1 200 OK` or redirect
**If fails**: OpenSILEX API not running

---

## Create Admin User

### 14. Create Admin User

```bash
# Get into OpenSILEX container
docker compose exec opensilex bash

# Create admin user
cd /home/opensilex/bin
./opensilex.sh user add --admin \
  --email admin@example.com \
  --firstName Admin \
  --lastName User \
  --password admin123 \
  --lang en

# Exit container
exit
```

**Expected**: "User created successfully"
**If fails**: Database connection issues

### 15. Test Login

```bash
# Login and get token
TOKEN=$(curl -s -X POST "http://localhost:8080/sandbox/rest/security/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"admin@example.com","password":"admin123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# Verify token was received
echo $TOKEN
```

**Expected**: Long JWT token string
**If fails**:
- **Empty token**: Login failed - check credentials
- **401 Unauthorized**: Wrong email/password

---

## Success Criteria

- [ ] All containers running (`docker compose ps`)
- [ ] Web UI accessible at http://20.61.108.197/sandbox/app/
- [ ] Admin user created successfully
- [ ] Admin can login and receive JWT token
- [ ] OpenSILEX logs show no errors

---

## Known Issues & Solutions

### Issue: SSH Host Key Changed

**Symptom**: `REMOTE HOST IDENTIFICATION HAS CHANGED` when connecting via SSH

**Root cause**: Server was recreated at the same IP address with new SSH host keys

**Solution**: Remove old host key with `ssh-keygen -R 20.61.108.197`

### Issue: groupadd/useradd fails with "already exists"

**Symptom**: Build fails with `groupadd: GID '1000' already exists` or `useradd: user 'opensilex' already exists`

**Root cause**: Base Tomcat image has ubuntu user at UID/GID 1000, conflicting with default build args

**Solutions**:
1. **Modify Dockerfile** (recommended): Add `getent` checks before creating user/group (Step 6)
2. **Use different UID/GID**: Build with `--build-arg UID=1001 --build-arg GID=1001` (Step 9)

### Issue: Permission denied on config file

**Symptom**: Container crashes with `bash: /home/opensilex/config/opensilex-template-custom.yml: Permission denied`

**Root cause**: Container runs as UID 1001, but config/ directory is owned by UID 1000 (host azureuser)

**Solution**: `chmod 777 config/` and `sudo chmod 777 logs/opensilex/` BEFORE `docker compose up` (Step 8)

**Why this is needed**: Even with UID/GID 1001 build args, there's a UID mismatch between host and container, plus OpenSILEX has an upstream bug requiring world-writable config directory

### Issue: Do I need to specify env file every time?

**Symptom**: Wondering if `--env-file opensilex.env` is required on every docker-compose command

**Root cause**: Docker Compose auto-loads `.env` (dot-prefix) but NOT `opensilex.env` (no dot)

**Solution**: Rename `opensilex.env` to `.env` for convenience (Step 7), or always use `--env-file opensilex.env`

---

## Next Steps

Once vanilla deployment succeeds:
1. Test all OpenSILEX features to verify baseline functionality
2. Document any additional issues discovered
3. Apply patches for known bugs (GroupDAO NullPointerException, OpenID auto-group assignment)
4. Redeploy with patches and verify fixes work
5. Automate the process in PowerShell script (`deploy-opensilex-docker.ps1`)

---

## Actual Steps Performed (Successful Deployment)

User successfully deployed vanilla OpenSILEX 1.4.7 with these steps:

1. Created new server at 20.61.108.197
2. Fixed SSH host key issue with `ssh-keygen -R 20.61.108.197`
3. Installed Docker on server
4. Cloned opensilex-docker-compose at tag 1.4.7
5. Modified `opensilex-build-step.docker` to add `getent` checks
6. Fixed permissions with `chmod 777 config/` and `sudo chmod 777 logs/opensilex/`
7. Built all images: `docker compose --env-file opensilex.env build --build-arg UID=1001 --build-arg GID=1001`
8. Started stack: `docker compose --env-file opensilex.env up start_opensilex_stack -d`
9. Created admin user via CLI

**Result**: All containers running, web UI accessible, admin user created successfully
