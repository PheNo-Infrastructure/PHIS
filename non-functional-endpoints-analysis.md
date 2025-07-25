# OpenSILEX Non-Functional Endpoints Analysis

**Date**: 2025-07-25  
**OpenSILEX Version**: BUILD-SNAPSHOT  
**VM IP**: 98.71.237.204  
**Total Non-Functional Endpoints**: 17

---

## 🌱 PHIS Module Endpoints (Not Found)

### 1. PHIS Infrastructure
- **Endpoint**: `/rest/phis/infrastructure`
- **Method**: GET
- **Error**: `CLIENT_ERROR - Not Found`
- **Purpose**: Plant phenotyping infrastructure management
- **Investigation Notes**: 
  - PHIS module is loaded (confirmed in system info)
  - Web endpoints not registered
  - May require specific PHIS configuration in `opensilex.yml`

### 2. PHIS Images
- **Endpoint**: `/rest/phis/images`
- **Method**: GET
- **Error**: `CLIENT_ERROR - Not Found`
- **Purpose**: Plant imaging data management
- **Investigation Notes**:
  - Image handling for phenotyping
  - Requires file storage configuration
  - Check if GridFS/MongoDB image storage is properly configured

### 3. PHIS Annotations
- **Endpoint**: `/rest/phis/annotations`
- **Method**: GET
- **Error**: `CLIENT_ERROR - Not Found`
- **Purpose**: Plant phenotype annotations
- **Investigation Notes**:
  - Different from core annotations endpoint (which works)
  - PHIS-specific annotation features
  - May need PHIS-specific database initialization

### 4. PHIS Radiometric Data
- **Endpoint**: `/rest/phis/radiometric_targets`
- **Method**: GET
- **Error**: `CLIENT_ERROR - Not Found`
- **Purpose**: Radiometric sensor data management
- **Investigation Notes**:
  - Specialized sensor data handling
  - Requires sensor device configuration
  - Part of advanced phenotyping features

---

## 📊 BRAPI Module Endpoints (Not Found)

### 5. BRAPI v1 Server Info
- **Endpoint**: `/rest/brapi/v1/serverinfo`
- **Method**: GET
- **Error**: `CLIENT_ERROR - Not Found`
- **Purpose**: BRAPI v1 server metadata
- **Investigation Notes**:
  - BRAPI module loaded but endpoints not web-accessible
  - Configuration added to `opensilex.yml` but not taking effect
  - May need service restart or module re-registration

### 6. BRAPI v2 Server Info
- **Endpoint**: `/rest/brapi/v2/serverinfo`
- **Method**: GET
- **Error**: `CLIENT_ERROR - Not Found`
- **Purpose**: BRAPI v2 server metadata
- **Investigation Notes**:
  - Standard BRAPI endpoint - should be available
  - Check if BRAPI module properly initialized
  - Verify BRAPI configuration syntax in YAML

### 7. BRAPI v2 Calls
- **Endpoint**: `/rest/brapi/v2/calls`
- **Method**: GET
- **Error**: `CLIENT_ERROR - Not Found`
- **Purpose**: List available BRAPI API calls
- **Investigation Notes**:
  - Core BRAPI functionality
  - Would list all available BRAPI endpoints
  - Needed for BRAPI client discovery

### 8. BRAPI v2 Studies
- **Endpoint**: `/rest/brapi/v2/studies`
- **Method**: GET
- **Error**: `CLIENT_ERROR - Not Found`
- **Purpose**: BRAPI studies management
- **Investigation Notes**:
  - Maps to OpenSILEX experiments
  - Should expose experiments via BRAPI standard
  - Critical for BRAPI interoperability

---

## 🔗 Specialized Module Endpoints (Not Found)

### 9. File System
- **Endpoint**: `/rest/fs/files`
- **Method**: GET
- **Error**: `CLIENT_ERROR - Not Found`
- **Purpose**: File system management
- **Investigation Notes**:
  - FileStorageModule is loaded
  - Web API endpoints may not be exposed
  - File operations might be internal-only

### 10. NoSQL Collections
- **Endpoint**: `/rest/nosql/collections`
- **Method**: GET
- **Error**: `CLIENT_ERROR - Not Found`
- **Purpose**: MongoDB collection management
- **Investigation Notes**:
  - NoSQLModule is loaded
  - Direct MongoDB access via internal APIs
  - Web endpoints may not be implemented

### 11. Server Status
- **Endpoint**: `/rest/server/status`
- **Method**: GET
- **Error**: `CLIENT_ERROR - Not Found`
- **Purpose**: Server health monitoring
- **Investigation Notes**:
  - ServerModule is loaded
  - Basic server info available at `/rest/core/system/info`
  - Detailed status endpoint not implemented

### 12. GraphQL
- **Endpoint**: `/rest/graphql`
- **Method**: GET/POST
- **Error**: `CLIENT_ERROR - Not Found`
- **Purpose**: GraphQL query interface
- **Investigation Notes**:
  - GraphQLModule is loaded
  - GraphQL endpoint not web-accessible
  - May require specific GraphQL configuration

---

## 🧬 Extended Core Endpoints (Not Found)

### 13. Core Ontologies
- **Endpoint**: `/rest/core/ontologies`
- **Method**: GET
- **Error**: `CLIENT_ERROR - Not Found`
- **Purpose**: Ontology management
- **Investigation Notes**:
  - Ontology data accessible via SPARQL (3,348 triples found)
  - Web API for ontology management not implemented
  - Use SPARQL queries for ontology access instead

### 14. Core RDF Types
- **Endpoint**: `/rest/core/rdf_types`
- **Method**: GET
- **Error**: `CLIENT_ERROR - Not Found`
- **Purpose**: RDF type/class management
- **Investigation Notes**:
  - RDF types available via SPARQL
  - Web API wrapper not implemented
  - Query RDF4J directly for type information

### 15. Core Areas
- **Endpoint**: `/rest/core/areas`
- **Method**: GET
- **Error**: `CLIENT_ERROR - Not Found`
- **Purpose**: Geographical area management
- **Investigation Notes**:
  - Geographic features for experiments
  - May be part of facility management
  - Could be covered by facilities endpoint

### 16. Core Positions
- **Endpoint**: `/rest/core/positions`
- **Method**: GET
- **Error**: `CLIENT_ERROR - Not Found`
- **Purpose**: Object position tracking
- **Investigation Notes**:
  - Spatial positioning of scientific objects
  - Part of phenotyping workflow
  - May require specific positioning module

### 17. Core Move Events
- **Endpoint**: `/rest/core/move_events`
- **Method**: GET
- **Error**: `CLIENT_ERROR - Not Found`
- **Purpose**: Object movement tracking
- **Investigation Notes**:
  - Track scientific object relocations
  - Part of experimental workflow
  - May be implemented as general events

---

## 🔍 Investigation Priorities

### High Priority (Core Functionality)
1. **BRAPI Module Configuration** - Should work, likely configuration issue
2. **PHIS Module Activation** - Plant-specific features, may need init
3. **Ontologies Access** - Alternative via SPARQL works

### Medium Priority (Advanced Features)
4. **GraphQL Endpoint** - Alternative query interface
5. **File System API** - File management features
6. **Extended Core Endpoints** - Area/position management

### Low Priority (Internal APIs)
7. **NoSQL Direct Access** - Internal data management
8. **Server Status Details** - Monitoring features

---

## 🛠️ Suggested Investigation Steps

### 1. BRAPI Module Fix
```bash
# Check BRAPI configuration
cat ~/opensilex/opensilex-dev-tools/src/main/resources/config/opensilex.yml | grep -A 10 brapi

# Restart OpenSILEX to reload config
sudo systemctl restart opensilex-server.service

# Check BRAPI module logs
grep -i brapi ~/opensilex/opensilex-release/target/opensilex/opensilex.log
```

### 2. PHIS Module Investigation
```bash
# Check if PHIS module has separate configuration
find ~/opensilex -name "*phis*" -type f | grep -E "\.(yml|yaml|properties)$"

# Check PHIS module in classpath
ls ~/opensilex/opensilex-release/target/opensilex/modules/ | grep phis
```

### 3. Module Web Registration Check
```bash
# Check which REST endpoints are actually registered
grep -r "@Path\|@GET\|@POST" ~/opensilex/opensilex-*/src/main/java/ | grep -E "(brapi|phis|graphql)"
```

### 4. Alternative Access Methods
```bash
# SPARQL queries for ontology data
curl -X POST -H "Content-Type: application/sparql-query" \
  -d "SELECT DISTINCT ?class WHERE { ?class a owl:Class } LIMIT 10" \
  "http://98.71.237.204:8667/rdf4j-server/repositories/opensilex"

# Direct RDF4J access for all data
curl "http://98.71.237.204:8667/rdf4j-workbench/"
```

---

## 📋 Module Status Summary

| Module | Loaded | Web Endpoints | Status |
|--------|--------|---------------|---------|
| CoreModule | ✅ | ✅ (11/15) | Mostly Working |
| SecurityModule | ✅ | ✅ (3/3) | Fully Working |
| BrapiModule | ✅ | ❌ (0/4) | Not Accessible |
| PhisWsModule | ✅ | ❌ (0/4) | Not Accessible |
| GraphQLModule | ✅ | ❌ (0/1) | Not Accessible |
| SPARQLModule | ✅ | ✅ (Direct) | Working |
| FileStorageModule | ✅ | ❌ (0/1) | Internal Only |
| NoSQLModule | ✅ | ❌ (0/1) | Internal Only |

---

## 🎯 Expected Outcomes

After investigation and fixes, you should achieve:
- **BRAPI endpoints**: 4 additional working endpoints
- **PHIS endpoints**: 4 additional working endpoints  
- **GraphQL**: 1 additional query interface
- **Total functional**: 32/41 endpoints (78% → 95%)

The remaining 9 endpoints may be internal APIs not meant for external access.

---

**Contact**: Run `~/opensilex/verify-endpoints.sh` after any changes to re-test all endpoints.