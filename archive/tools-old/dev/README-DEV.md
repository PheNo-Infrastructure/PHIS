# OpenSILEX Development Installation

This directory contains the development version installer for OpenSILEX, which builds from source code rather than using pre-built releases.

## Files

- `opensilex-github-dev.ps1` - Main PowerShell script for development installation
- `opensilex-setup-dev.sh` - Development environment setup (installs Maven, Node.js, etc.)
- `opensilex-installer-dev.sh` - Development installer that clones and builds from source
- `OpenSILEX-Installer-Dev.psm1` - PowerShell module for development installation logic

## Key Differences from Production

### Development Installation:
- **Source**: Downloads stable release (v1.4.9-rdg) + clones source code for development
- **Build**: Uses pre-built stable release for immediate use, source available for custom builds
- **Environment**: Sets `NODE_ENV=development`
- **Database**: Uses `opensilex_dev` database name
- **Configuration**: Enables debug logging and development-specific settings
- **Dependencies**: Installs Maven, Node.js, Git, and development tools

### Production Installation:
- **Source**: Downloads pre-built release ZIP from GitHub releases
- **Build**: No build required, uses pre-compiled JAR
- **Environment**: Sets `NODE_ENV=production`
- **Database**: Uses `opensilex` database name
- **Configuration**: Production logging and settings

## Usage

```powershell
# Development installation
.\opensilex-github-dev.ps1

# Full development installation with VM deployment
.\opensilex-github-dev.ps1 -Command FullInstall

# Install on existing VM
.\opensilex-github-dev.ps1 -Command Install -VMIPAddress "your-vm-ip"
```

## Development Workflow

After installation, the development environment provides:

1. **Source Code Location**: `/home/azureuser/opensilex/source/opensilex`
2. **Rebuild Command**: 
   ```bash
   cd /home/azureuser/opensilex/source/opensilex
   mvn clean install -DskipTests=true
   ```
3. **Start Development Server**: 
   ```bash
   cd /home/azureuser/opensilex
   ./start-dev.sh
   ```

## Configuration

The development installer creates:
- `config/opensilex.yml` - Main configuration with development settings
- `config/logback-dev.xml` - Debug logging configuration
- `start-dev.sh` - Convenient startup script

## Requirements

Same as production installer but additionally requires:
- Maven (for building from source)
- Node.js (for frontend development)
- Git (for cloning repository)

## Installation Time

Development installation takes significantly longer than production:
- Production: ~5-10 minutes
- Development: ~20-30 minutes (due to Maven build process)