# OpenSILEX GitHub Installation Scripts

This directory contains installation scripts for deploying OpenSILEX directly from the GitHub repository, as an alternative to the docker-compose approach.

## 🚀 Quick Start

### Prerequisites
- Debian 12 (or compatible Linux distribution)
- User with sudo privileges
- Internet connection

### Installation Steps

1. **Install Dependencies**
   ```bash
   chmod +x opensilex-dependencies.sh
   ./opensilex-dependencies.sh
   ```

2. **Source Environment Variables** (Important!)
   ```bash
   source ~/.bashrc
   # OR restart your terminal session
   ```

3. **Install OpenSILEX**
   ```bash
   chmod +x opensilex-installer.sh
   ./opensilex-installer.sh
   ```

4. **Manage OpenSILEX**
   ```bash
   chmod +x opensilex-manager.sh
   ./opensilex-manager.sh help
   ```

## 📋 What Gets Installed

### Dependencies
- **Java JDK 11** - Core runtime environment
- **Maven 3.9+** - Build tool for Java projects
- **Git 2.34.1+** - Version control
- **Docker 27.1.1+** - For database containers
- **Node.js 18** - For Vue.js frontend development

### OpenSILEX Components
- **OpenSILEX Core** - Cloned from GitHub repository
- **Database Stack** - MongoDB, PostgreSQL, and Redis in Docker containers
- **Vue.js Frontend** - Modern web interface
- **API Services** - RESTful API with Swagger documentation

## 🎯 Available Commands

### Management Script (`opensilex-manager.sh`)

| Command | Description | Example |
|---------|-------------|---------|
| `start-db` | Start only databases | `./opensilex-manager.sh start-db` |
| `stop-db` | Stop databases | `./opensilex-manager.sh stop-db` |
| `restart-db` | Restart databases | `./opensilex-manager.sh restart-db` |
| `status-db` | Check database status | `./opensilex-manager.sh status-db` |
| `start` | Start OpenSILEX (backend only) | `./opensilex-manager.sh start` |
| `start-full` | Start with Vue.js hot reload | `./opensilex-manager.sh start-full` |
| `status` | Check installation status | `./opensilex-manager.sh status` |
| `logs` | View database logs | `./opensilex-manager.sh logs` |
| `rebuild` | Rebuild from source | `./opensilex-manager.sh rebuild` |
| `update` | Update from GitHub | `./opensilex-manager.sh update` |
| `backup` | Backup configuration | `./opensilex-manager.sh backup` |
| `cleanup` | Clean temporary files | `./opensilex-manager.sh cleanup` |

### Direct Commands

```bash
# Start databases
cd ~/opensilex/opensilex-dev-tools/src/main/resources/docker
docker compose up -d

# Start OpenSILEX server (backend only)
cd ~/opensilex
./opensilex dev start --no-front-dev

# Start with frontend hot reload
cd ~/opensilex
./opensilex dev start
```

## 🌐 Accessing OpenSILEX

After successful installation:

- **Web Application**: http://localhost:8666/
- **API Documentation**: http://localhost:8666/api-docs
- **Default Credentials**: admin@opensilex.org / admin

⚠️ **Important**: Change the default password immediately after first login!

## 💡 Usage Examples

### Example 1: Complete Installation
```bash
# Install all dependencies
./opensilex-dependencies.sh

# Restart terminal or source bashrc
source ~/.bashrc

# Install OpenSILEX
./opensilex-installer.sh

# Start the application
./opensilex-manager.sh start-full
```

### Example 2: Daily Development Workflow
```bash
# Morning - Start databases and server
./opensilex-manager.sh start-full

# Check status
./opensilex-manager.sh status

# View logs if needed
./opensilex-manager.sh logs

# Evening - Stop databases to save resources
./opensilex-manager.sh stop-db
```

### Example 3: Update and Rebuild
```bash
# Update from GitHub and rebuild
./opensilex-manager.sh update

# Or manually
cd ~/opensilex
git pull origin master
./opensilex-manager.sh rebuild
```

## 🔍 Key Differences from Docker-Compose Version

| Aspect | Docker-Compose | GitHub Installation |
|--------|----------------|-------------------|
| **Installation** | Pre-built containers | Build from source |
| **Performance** | Container overhead | Native Java performance |
| **Development** | Limited customization | Full source access |
| **Updates** | Docker image updates | Git pull + rebuild |
| **Resource Usage** | Higher (containers) | Lower (native) |
| **Startup Time** | Faster (pre-built) | Slower (compilation) |

## 📂 Directory Structure

```
~/opensilex/                           # Main installation directory
├── opensilex                          # Command line tool
├── start-opensilex.sh                 # Backend-only startup script
├── start-opensilex-with-frontend.sh   # Full startup script  
├── stop-opensilex.sh                  # Stop script
├── opensilex-dev-tools/
│   └── src/main/resources/
│       ├── config/
│       │   └── opensilex.yml          # Main configuration file
│       └── docker/
│           └── docker-compose.yml     # Database containers
└── ...

~/opensilex-data/                      # Data storage directory
```

## 🔧 Configuration

### Main Configuration File
- **Location**: `~/opensilex/opensilex-dev-tools/src/main/resources/config/opensilex.yml`
- **Key Settings**:
  - `file-system.storageBasePath`: Data storage location
  - Database connection strings
  - Authentication settings

### Environment Variables
```bash
export JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
export MAVEN_HOME=/opt/maven
export PATH=$JAVA_HOME/bin:$MAVEN_HOME/bin:$PATH
```

## 🛠️ Troubleshooting

### Common Issues

**"Java version not found"**
```bash
# Check Java installation
java -version
# Should show OpenJDK 11+

# If not installed
./opensilex-dependencies.sh
source ~/.bashrc
```

**"Maven command not found"**
```bash
# Check Maven installation
mvn -version

# If not found, check PATH
echo $PATH | grep maven
```

**"Build fails with memory errors"**
```bash
# Increase Maven memory
export MAVEN_OPTS="-Xmx4096m"
./opensilex-manager.sh rebuild
```

**"Databases not starting"**
```bash
# Check Docker status
docker ps -a

# Restart Docker service
sudo systemctl restart docker

# Restart databases
./opensilex-manager.sh restart-db
```

**"Port 8666 already in use"**
```bash
# Find what's using the port
sudo netstat -tulpn | grep :8666

# Kill the process if needed
sudo kill -9 <PID>
```

### Logs and Diagnostics

```bash
# Check installation status
./opensilex-manager.sh status

# View database logs
./opensilex-manager.sh logs

# Check Java heap usage
jps -v

# Monitor system resources
htop
```

## 🛡️ Security Best Practices

1. **Change Default Passwords**
   - OpenSILEX admin password
   - Database passwords (if exposed)

2. **File Permissions**
   ```bash
   # Secure configuration files
   chmod 600 ~/opensilex/opensilex-dev-tools/src/main/resources/config/opensilex.yml
   
   # Secure data directory
   chmod 700 ~/opensilex-data
   ```

3. **Firewall Rules**
   ```bash
   # Only allow localhost access
   sudo ufw deny 8666
   sudo ufw allow from 127.0.0.1 to any port 8666
   ```

## 📊 Performance Tuning

### Java JVM Options
```bash
# For development
export JAVA_OPTS="-Xms1024m -Xmx4096m -XX:+UseG1GC"

# For production
export JAVA_OPTS="-Xms2048m -Xmx8192m -XX:+UseG1GC -XX:+UseStringDeduplication"
```

### Maven Build Optimization
```bash
# Parallel builds
export MAVEN_OPTS="-Xmx4096m -T 4"

# Skip tests during development
mvn install -DskipTests
```

## 🔄 Migration from Docker-Compose

If migrating from the docker-compose version:

1. **Backup your data**
   ```bash
   # From docker-compose version
   docker compose exec opensilexapp ./bin/opensilex.sh system export-data backup.zip
   ```

2. **Install GitHub version**
   ```bash
   ./opensilex-dependencies.sh
   source ~/.bashrc
   ./opensilex-installer.sh
   ```

3. **Import data** (if compatible)
   ```bash
   # Into GitHub version
   cd ~/opensilex
   ./opensilex system import-data backup.zip
   ```

## 📞 Support

### Self-Diagnosis
```bash
# Run comprehensive status check
./opensilex-manager.sh status

# Check all prerequisites
java -version && mvn -version && git --version && docker --version
```

### Getting Help
1. Check logs: `./opensilex-manager.sh logs`
2. Verify prerequisites are met
3. Ensure all environment variables are set
4. Check OpenSILEX documentation on GitHub

---

**Note**: This installation method provides direct access to OpenSILEX source code and is ideal for development and customization. For simpler deployment, consider the docker-compose approach.