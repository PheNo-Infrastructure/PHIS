# OpenSILEX Installation Guide

Complete Azure deployment and setup instructions for OpenSILEX scientific data management platform.

## Table of Contents
- [Overview](#overview)
- [Script Descriptions](#script-descriptions)
- [Prerequisites](#prerequisites)
- [Step 1: Deploy Azure VM](#step-1-deploy-azure-vm)
- [Step 2: Connect to VM](#step-2-connect-to-vm)
- [Step 3: Install Dependencies](#step-3-install-dependencies)
- [Step 4: Install OpenSILEX](#step-4-install-opensilex)
- [Step 5: Access OpenSILEX](#step-5-access-opensilex)
- [Management Commands](#management-commands)
- [Development Setup (Optional)](#development-setup-optional)
- [Troubleshooting](#troubleshooting)

## Overview

OpenSILEX is an open-source scientific platform for managing agricultural and plant science research data. This guide walks you through:
1. Creating an Azure VM using ARM templates
2. Installing all required dependencies (Java, Docker, MongoDB, RDF4J)
3. Setting up OpenSILEX with proper configuration
4. Managing the running application

## Script Descriptions

This installation process uses several automated scripts to simplify deployment:

### `vm-template.json` - Azure VM Template
- **Purpose**: Azure Resource Manager (ARM) template that creates the complete VM infrastructure
- **What it creates**: Virtual machine, network security group, virtual network, public IP, and network interface
- **Configuration**: Debian 12 VM with Standard_B2as_v2 size (2 vCPUs, 4GB RAM), SSH access
- **Security**: Uses SSH key authentication, trusted launch with secure boot, ports 22, 80, 8080, and 28081 open
- **Location**: Deployed in West Europe with availability zone support

### `setup-opensilex.sh` - System Dependencies and Application Installer
- **Purpose**: Comprehensive installer that prepares the system and installs OpenSILEX
- **Key installations**: Java JDK 17, Docker, Docker Compose, MongoDB, RDF4J, Nginx, OpenSILEX
- **Configurations**: Sets up Docker containers, configures systemd service, creates user directories
- **Security features**: Runs as non-root user, configures proper permissions, sets up reverse proxy
- **Java compatibility**: Includes Java 17 compatibility flags for legacy Tomcat components

### `run-opensilex.sh` - OpenSILEX Management Script
- **Purpose**: Complete management interface for OpenSILEX operations
- **Key functions**: Start/stop services, view logs, manage containers, run OpenSILEX commands
- **Service management**: Controls systemd service and Docker containers
- **Monitoring**: Provides status checks, log viewing, and diagnostic information
- **User management**: Includes commands for creating users and system initialization

## Prerequisites

Before starting, ensure you have:
- Azure subscription with appropriate permissions
- **Windows:** PowerShell with Azure PowerShell module (Az) OR Azure CLI
- **Linux:** Azure CLI OR PowerShell 7+ with Azure PowerShell module (Az)
- SSH key pair for secure VM access
- Basic knowledge of Linux command line

### Azure Management Setup

#### Windows Users (Recommended: PowerShell)

```powershell
# Install Azure PowerShell module (run as Administrator)
Install-Module -Name Az -Repository PSGallery -Force -AllowClobber

# Or update if already installed
Update-Module -Name Az
```

#### Linux Users (Recommended: Azure CLI)

```bash
# Install Azure CLI (Ubuntu/Debian)
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Or for other distributions, see: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli
```

#### Alternative: PowerShell on Linux

```bash
# Install PowerShell 7+ on Linux (Ubuntu/Debian)
wget -q https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/packages-microsoft-prod.deb
sudo dpkg -i packages-microsoft-prod.deb
sudo apt-get update
sudo apt-get install -y powershell

# Then install Azure module
pwsh -c "Install-Module -Name Az -Repository PSGallery -Force"
```

### Generate SSH Key (if needed)

If you don't have an SSH key pair:

#### Windows Users

```powershell
# Generate new SSH key pair (Windows 10/11 with OpenSSH)
ssh-keygen -t ed25519 -a 100

# Display public key (copy this for the template)
Get-Content ~/.ssh/id_ed25519.pub
```

#### Linux Users

```bash
# Generate new SSH key pair
ssh-keygen -t ed25519 -a 100 

# Display public key (copy this for the template)
cat ~/.ssh/id_ed25519.pub
```

## Step 1: Deploy Azure VM

### 1.1 Prepare the Template

1. Download or clone this repository to your local machine
2. Open `vm-template.json` in your preferred editor
3. Replace the SSH public key parameter:
   ```json
   "sshPublicKey": {
     "type": "string",
     "defaultValue": "ssh-ed25519 AAAAC3... your-email@example.com"
   }
   ```
   With your actual SSH public key.

### 1.2 Deploy Using PowerShell (Windows/Linux)

```powershell
# Install Azure PowerShell module if not already installed
Install-Module -Name Az -Repository PSGallery -Force

# Login to Azure
Connect-AzAccount

# Create resource group
New-AzResourceGroup -Name "RG-PHIS" -Location "West Europe"

# Deploy the template
New-AzResourceGroupDeployment `
  -ResourceGroupName "RG-PHIS" `
  -TemplateFile "vm-template.json" `
  -vmName "phis" `
  -adminUsername "azureuser" `
  -sshPublicKey "YOUR_SSH_PUBLIC_KEY"
```

### 1.3 Deploy Using Azure CLI (Linux/Windows)

```bash
# Login to Azure
az login

# Create resource group
az group create --name RG-PHIS --location westeurope

# Deploy the template
az deployment group create \
  --resource-group RG-PHIS \
  --template-file vm-template.json \
  --parameters vmName=phis adminUsername=azureuser sshPublicKey="YOUR_SSH_PUBLIC_KEY"
```

### 1.4 Deploy Using Azure Portal (Alternative)

1. Navigate to [Azure Portal](https://portal.azure.com)
2. Search for "Deploy a custom template"
3. Click "Build your own template in the editor"
4. Copy and paste the contents of `vm-template.json`
5. Update the SSH public key in the template
6. Click "Save" then "Review + create"
7. Fill in the parameters and deploy

### 1.5 Get VM Public IP

After deployment completes:

**Using PowerShell:**
```powershell
# Get the public IP address
(Get-AzPublicIpAddress -ResourceGroupName "RG-PHIS" -Name "phis-ip").IpAddress
```

**Using Azure CLI:**
```bash
# Get the public IP address
az vm show -d -g RG-PHIS -n phis --query publicIps -o tsv
```

Or check in the Azure Portal under the VM's overview page.

## Step 2: Connect to VM

Connect to your newly created Linux VM:

#### From Windows

```powershell
# Connect via SSH from PowerShell (Windows 10/11 has built-in SSH)
ssh -i ~/.ssh/id_ed25519 azureuser@YOUR_VM_PUBLIC_IP
```

#### From Linux

```bash
# Connect via SSH
ssh -i ~/.ssh/id_ed25519 azureuser@YOUR_VM_PUBLIC_IP
```

If connection fails, verify:
- VM is running
- Network Security Group allows SSH (port 22)  
- SSH key is correct (If using premade key, your identitiy type may be different)

## Step 3: Install Dependencies

### 3.1 Download the Setup Script

Once connected to the VM:

```bash
# Download the setup script
wget https://raw.githubusercontent.com/lversen/PHIS/without-docker-compose/setup-opensilex.sh


# Or copy from your local machine to the VM:
# From Windows PowerShell: scp setup-opensilex.sh azureuser@YOUR_VM_IP:~/
# From Linux: scp setup-opensilex.sh azureuser@YOUR_VM_IP:~/
```

### 3.2 Run the Installation

```bash
# Make script executable
chmod +x setup-opensilex.sh

# Run the installation script
./setup-opensilex.sh
```

This script will:
- Update system packages
- Install Java JDK 17 with compatibility flags
- Install Docker and Docker Compose
- Set up MongoDB and RDF4J containers
- Download and configure OpenSILEX
- Configure Nginx reverse proxy
- Create systemd service for OpenSILEX
- Set up user directories and permissions

### 3.3 Apply Group Changes

**Important:** After the setup script completes, you must log out and back in to apply Docker group changes:

```bash
# Logout from the VM
exit

# Reconnect from your local machine
ssh azureuser@YOUR_VM_PUBLIC_IP
```

### 3.4 Verify Installation

```bash
# Test Docker installation
docker run --rm hello-world

# Check Java version
java --version

# Verify OpenSILEX files
ls -la ~/opensilex/
```

## Step 4: Install OpenSILEX

### 4.1 Download the Management Script

```bash
# Download the management script
wget https://raw.githubusercontent.com/lversen/PHIS/without-docker-compose/run-opensilex.sh


# Make it executable
chmod +x run-opensilex.sh
```

### 4.2 Initialize OpenSILEX

```bash
# Initialize the system (first time setup)
./run-opensilex.sh init
```

The initialization will:
- Start MongoDB and RDF4J containers
- Install the OpenSILEX system
- Create database schemas
- Set up default admin user

### 4.3 Start the Service

```bash
# Start OpenSILEX service
./run-opensilex.sh start
```

### 4.4 Monitor Installation Progress

```bash
# Check service status
./run-opensilex.sh status

# View service logs
./run-opensilex.sh logs service
```

## Step 5: Access OpenSILEX

### 5.1 Application URLs

Once installation completes, access OpenSILEX at:

- **Main Application:** `http://YOUR_VM_IP/` (via Nginx reverse proxy)
- **Direct Access:** `http://YOUR_VM_IP:28081`
- **RDF4J Workbench:** `http://YOUR_VM_IP:8080/rdf4j-workbench`

### 5.2 Default Credentials

- **Username:** `admin@opensilex.org`
- **Password:** `admin`

**Security Note:** Change the default password immediately after first login.

### 5.3 Verify Installation

1. Open your web browser
2. Navigate to `http://YOUR_VM_IP/`
3. Log in with default credentials
4. Verify OpenSILEX interface loads correctly

### 5.4 Account Creation

After initial setup, you can create new user accounts via the command line.

**Create a new admin user:**

```bash
# Run the user creation command
./run-opensilex.sh cmd user add --admin

# You will be prompted to enter:
# - First Name
# - Last Name
# - Email Address (this will be the username)
# - Password
```

**Create a standard user:**

```bash
# Run the user creation command without the admin flag
./run-opensilex.sh cmd user add

# Follow the prompts as above
```

You can then log in with the new credentials at `http://YOUR_VM_IP/`.

## Management Commands

The `run-opensilex.sh` script provides comprehensive management capabilities:

### Service Management

```bash
# Start OpenSILEX service and containers
./run-opensilex.sh start

# Stop OpenSILEX service
./run-opensilex.sh stop

# Restart OpenSILEX service
./run-opensilex.sh restart

# Show detailed status information
./run-opensilex.sh status
```

### Container Management

```bash
# Start Docker containers only
./run-opensilex.sh containers start

# Stop Docker containers
./run-opensilex.sh containers stop

# Check container status
./run-opensilex.sh containers status
```

### Log Management

```bash
# View systemd service logs (real-time)
./run-opensilex.sh logs service

# View application logs
./run-opensilex.sh logs app

# View Docker container logs
./run-opensilex.sh logs docker
```

### OpenSILEX Commands

```bash
# List all users
./run-opensilex.sh cmd user list

# Add new admin user
./run-opensilex.sh cmd user add --admin

# Reset ontologies
./run-opensilex.sh cmd sparql reset-ontologies

# Show help for available commands
./run-opensilex.sh cmd help
```

## Development Setup (Optional)

For development work, you can set up a more flexible environment:

### Local Development with VS Code

1. Install VS Code with Remote-SSH extension
2. Connect to the VM via Remote-SSH
3. Open the OpenSILEX directory: `/home/azureuser/opensilex/`

### Manual Development Commands

```bash
# Navigate to OpenSILEX directory
cd ~/opensilex/bin

# Run OpenSILEX commands directly
./opensilex.sh help

# View configuration
cat ~/opensilex/config/opensilex.yml

# Monitor application logs
tail -f ~/opensilex/logs/*.log
```

## Troubleshooting

### Common Issues

#### 1. Cannot Connect to VM

**Check VM status with PowerShell:**
```powershell
# Check VM status
Get-AzVM -ResourceGroupName "RG-PHIS" -Name "phis" -Status

# Start VM if stopped
Start-AzVM -ResourceGroupName "RG-PHIS" -Name "phis"
```

**Check VM status with Azure CLI:**
```bash
# Check VM status
az vm get-instance-view --resource-group RG-PHIS --name phis --query instanceView.statuses

# Start VM if stopped
az vm start --resource-group RG-PHIS --name phis
```

#### 2. Docker Permission Issues

```bash
# Fix Docker socket permissions
sudo chmod 666 /var/run/docker.sock

# Verify user is in docker group
groups | grep docker

# If not in group, add user and restart session
sudo usermod -aG docker $(whoami)
exit
# Reconnect via SSH
```

#### 3. OpenSILEX Not Accessible

```bash
# Check all container status
./run-opensilex.sh status

# View OpenSILEX service logs
./run-opensilex.sh logs service

# Check if port is listening
sudo netstat -tlnp | grep 28081

# Restart everything
./run-opensilex.sh restart
```

**Verify Azure NSG allows required ports with PowerShell:**
```powershell
# Check Network Security Group rules
Get-AzNetworkSecurityGroup -ResourceGroupName "RG-PHIS" -Name "phis-nsg" | Get-AzNetworkSecurityRuleConfig
```

**Verify Azure NSG with Azure CLI:**
```bash
# Check NSG rules
az network nsg rule list --resource-group RG-PHIS --nsg-name phis-nsg --output table
```

#### 4. Service Startup Issues

```bash
# Check Java compatibility
java --version

# Verify configuration
./run-opensilex.sh cmd system check

# Clean restart
./run-opensilex.sh stop
docker system prune -f
./run-opensilex.sh start
```

#### 5. Database Connection Issues

```bash
# Check MongoDB container
docker logs mongo_opensilex

# Check RDF4J container
docker logs rdf4j_opensilex

# Restart database containers
./run-opensilex.sh containers stop
./run-opensilex.sh containers start
```

### System Information Commands

```bash
# Check system resources
df -h                    # Disk usage
free -h                  # Memory usage
htop                     # Process monitor

# Check Docker status
docker ps -a            # All containers
docker images           # Available images
docker system df        # Docker disk usage

# Check network
ss -tlnp | grep -E ':80|:8080|:28081'  # Listening ports
curl -I http://localhost:28081         # Test local connection
```

### Log Locations

- **OpenSILEX Service:** `sudo journalctl -u opensilex -f`
- **OpenSILEX Application:** `~/opensilex/logs/`
- **MongoDB:** `docker logs mongo_opensilex`
- **RDF4J:** `docker logs rdf4j_opensilex`
- **Nginx:** `/var/log/nginx/`

### Configuration Files

- **OpenSILEX Config:** `~/opensilex/config/opensilex.yml`
- **Systemd Service:** `/etc/systemd/system/opensilex.service`
- **Nginx Config:** `/etc/nginx/sites-enabled/default`

### Performance Tuning

For production environments:

```bash
# Increase Java heap size (edit systemd service)
sudo nano /etc/systemd/system/opensilex.service
# Add: -Xms2g -Xmx4g to ExecStart line

# Restart after changes
sudo systemctl daemon-reload
sudo systemctl restart opensilex
```

### Getting Help

If you encounter issues:

1. Check the troubleshooting section above
2. Review service and application logs
3. Verify all prerequisites are met
4. Ensure Azure resources are properly configured
5. Check OpenSILEX documentation at https://opensilex.org/

### Useful Maintenance Commands

```bash
# Complete system restart
./run-opensilex.sh stop
sudo reboot

# After reboot, start services
./run-opensilex.sh start

# Update system packages
sudo apt update && sudo apt upgrade -y

# Clean up Docker resources
docker system prune -f

# Backup configuration
tar -czf opensilex-backup-$(date +%Y%m%d).tar.gz ~/opensilex/config/ ~/opensilex/data/
```

## System Architecture

The OpenSILEX deployment includes:

- **OpenSILEX Application**: Java-based web application (port 28081)
- **MongoDB**: Document database for application data (port 27017)
- **RDF4J**: Triple store for semantic data (port 8080)
- **Nginx**: Reverse proxy for web access (port 80)
- **Systemd Service**: Manages OpenSILEX application lifecycle

## Security Considerations

- Change default OpenSILEX admin password immediately
- Consider restricting SSH access to specific IP ranges
- Regular system updates: `sudo apt update && sudo apt upgrade`
- Monitor logs for suspicious activity
- Use HTTPS in production (configure SSL certificates)
- Implement backup strategies for data and configuration

---

**Note:** This installation creates a development/testing environment. For production deployments, additional security hardening, SSL certificates, backup strategies, and monitoring should be implemented.