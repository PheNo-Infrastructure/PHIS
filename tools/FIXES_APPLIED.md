# OpenSILEX VM Installation Fixes

## Issues Fixed

Based on the SSH investigation of VM `98.71.237.204:8666`, the following critical issues were identified and fixed:

### 1. **Port Mapping Configuration Issues**

**Problem:**
- MongoDB running in Docker on internal port `27017` → mapped to host port `8668`
- RDF4J running in Docker on internal port `8080` → mapped to host port `8667`
- OpenSILEX installer expects databases on default ports (`27017`, `8080`)
- Runtime OpenSILEX correctly configured for mapped ports (`8668`, `8667`)

**Fix Applied:**
- Updated `template-vm.json` to open correct ports (`8668` for MongoDB, `8667` for RDF4J)
- Added automatic port forwarding during installation using `socat`
- Created persistent port forwards: `27017 → 8668` and `8080 → 8667`

### 2. **Incomplete System Installation**

**Problem:**
- OpenSILEX was running but never properly initialized
- `./opensilex.sh system install` was never successfully completed
- No admin user existed in the system
- Databases were empty (no OpenSILEX data structures)

**Fix Applied:**
- Added proper port forwarding before system installation
- Implemented timeout-protected system installation with error handling
- Added automatic admin user creation: `admin@opensilex.org` / `admin`
- Added post-installation validation and testing

### 3. **Database Connection Issues**

**Problem:**
- MongoDB: Config showed `port: 8668` but installer tried `localhost:27017`
- RDF4J: Config showed correct port but installer failed due to conflicts

**Fix Applied:**
- Created `/tmp/setup-port-forwards.sh` script that:
  - Kills existing conflicting port forwards
  - Creates clean `socat` tunnels with proper error handling
  - Tests connections before proceeding
  - Provides detailed logging

### 4. **Configuration File Problems**

**Problem:**
- Multiple RDF4J configurations in YAML file
- Some pointing to `8667`, others to `8080`
- Storage paths not properly configured

**Fix Applied:**
- Complete rewrite of `opensilex.yml` configuration with:
  - Consistent port mapping throughout
  - Proper storage directory configuration
  - Complete BRAPI, SPARQL, and security configurations
  - Proper database connection strings

## Files Modified

### 1. `template-vm.json`
- **Before:** Opened ports `28081` and `8080`
- **After:** Opens ports `8668` (MongoDB) and `8667` (RDF4J)
- **Impact:** Allows external access to database services

### 2. `opensilex-github.ps1` → `opensilex-github-fixed.ps1`
- **Complete rewrite** with the following improvements:

#### Installation Script Fixes:
- Added `socat` to dependency installation for port forwarding
- Created proper port forwarding setup during installation
- Added timeout protection for long-running operations
- Implemented comprehensive error handling and logging

#### Database Initialization Fixes:
```bash
# CRITICAL FIX: Create persistent port forwards for database initialization
nohup socat TCP-LISTEN:27017,reuseaddr,fork TCP:localhost:8668 > /tmp/socat-mongo.log 2>&1 &
nohup socat TCP-LISTEN:8080,reuseaddr,fork TCP:localhost:8667 > /tmp/socat-rdf4j.log 2>&1 &

# CRITICAL FIX: Proper system installation with working port forwards
timeout 300 ./opensilex.sh system install
```

#### Configuration Fixes:
- Complete `opensilex.yml` rewrite with correct ports
- Proper BRAPI and SPARQL endpoint configuration
- Correct MongoDB and RDF4J connection strings
- Enhanced security and ontology settings

#### Admin User Creation:
```bash
timeout 60 ./opensilex.sh user add \
    --admin \
    --email="admin@opensilex.org" \
    --first-name="System" \
    --last-name="Administrator" \
    --password="admin"
```

#### Post-Installation Validation:
- Tests authentication endpoint
- Validates API functionality
- Checks database connectivity
- Provides clear success/failure status

## Expected Results

After deploying with the fixed scripts:

### ✅ **Working System**
- **OpenSILEX**: Fully initialized and accessible at `http://VM_IP:8666/`
- **Admin Login**: `admin@opensilex.org` / `admin`
- **MongoDB**: Properly configured with replica set "opensilex"
- **RDF4J**: Accessible with OpenSILEX repository initialized
- **APIs**: All REST endpoints functional
- **URIs**: Variables, experiments, and scientific objects discoverable

### ✅ **Proper Service Management**
- **Systemd Services**: Auto-start on boot
- **Docker Services**: Databases start automatically
- **Port Mapping**: All services accessible on correct ports
- **Logging**: Comprehensive logs available via `journalctl`

### ✅ **Client Compatibility**
- **Python Client**: Can authenticate and discover URIs
- **URI Discovery**: `find_real_uris.py` will find populated data
- **Data Import**: Ready for scientific data management

## Usage Instructions

### 1. Deploy New VM
```powershell
.\opensilex-github-fixed.ps1 -Command FullInstall
```

### 2. Check Status
```powershell
.\opensilex-github-fixed.ps1 -Command Status
```

### 3. Access OpenSILEX
- **URL**: `http://YOUR_VM_IP:8666/`
- **Admin**: `admin@opensilex.org` / `admin`

### 4. Test with Python Client
```python
from opensilex_client import connect
client = connect(host="http://YOUR_VM_IP:8666")
# Should now successfully authenticate and discover resources
```

## Technical Details

### Port Mapping Strategy
```
Docker Internal → Host Port → External Access
MongoDB:  27017 → 8668     → VM_IP:8668
RDF4J:    8080  → 8667     → VM_IP:8667
OpenSILEX: 8666 → 8666     → VM_IP:8666
```

### Installation Flow
1. **Deploy VM** with correct security group rules
2. **Install Dependencies** including `socat` for port forwarding
3. **Clone & Build** OpenSILEX from GitHub
4. **Start Databases** via Docker Compose
5. **Create Port Forwards** for installation compatibility
6. **Initialize System** with proper database connections
7. **Create Admin User** with known credentials
8. **Validate Installation** with API tests
9. **Configure Services** for automatic startup

This comprehensive fix ensures a fully functional OpenSILEX installation that addresses all the URI configuration issues identified in the original VM.