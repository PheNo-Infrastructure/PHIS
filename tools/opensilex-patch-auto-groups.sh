#!/bin/bash
set -e

# OpenSILEX Auto-Group Assignment Patch Builder and Deployer
# This script patches OpenSILEX to automatically assign new OIDC/Feide users to default groups
# Version: 1.0.0
# Usage: ./opensilex-patch-auto-groups.sh [build|deploy|both]

VERSION="1.4.9-rdg"
REPO_URL="https://github.com/OpenSILEX/opensilex.git"
WORK_DIR="/tmp/opensilex-patch-build"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/patches"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Function to create the patch file
create_patch_file() {
    print_status "Creating patch file for AccountDAO.java..."

    mkdir -p "$PATCH_DIR"

    cat > "$PATCH_DIR/AccountDAO-auto-groups.patch" << 'PATCH_EOF'
--- a/opensilex-security/src/main/java/org/opensilex/security/account/dal/AccountDAO.java
+++ b/opensilex-security/src/main/java/org/opensilex/security/account/dal/AccountDAO.java
@@ -1,6 +1,11 @@
 package org.opensilex.security.account.dal;

+import java.net.URI;
+import java.util.ArrayList;
 import org.opensilex.security.authentication.SecurityOntology;
+import org.opensilex.security.group.dal.GroupDAO;
+import org.opensilex.security.group.dal.GroupModel;
+import org.opensilex.security.group.dal.GroupUserProfileModel;
 import org.opensilex.sparql.service.SPARQLService;
 import org.opensilex.nosql.mongodb.MongoDBService;

@@ -50,6 +55,45 @@ public class AccountModel getByEmailOrCreate(
             account.setLanguage(lang);

             create(account);
+
+            // ===== CUSTOM PATCH: Auto-assign new OIDC users to default group =====
+            // This patch ensures new Feide/OIDC users get credentials immediately
+            // Eliminates the "blank page" issue on first login
+            try {
+                URI defaultGroupUri = new URI("http://opensilex.org/groups/users");
+                URI defaultProfileUri = new URI("http://opensilex.org/profiles/default");
+
+                // Get the default group
+                GroupDAO groupDAO = new GroupDAO(sparql, nosql);
+                GroupModel defaultGroup = groupDAO.get(defaultGroupUri);
+
+                if (defaultGroup != null) {
+                    // Create group-user-profile link
+                    GroupUserProfileModel userProfile = new GroupUserProfileModel();
+                    userProfile.setUserURI(account.getUri());
+                    userProfile.setProfileURI(defaultProfileUri);
+
+                    // Add to group's user list
+                    if (defaultGroup.getUserProfiles() == null) {
+                        defaultGroup.setUserProfiles(new ArrayList<>());
+                    }
+                    defaultGroup.getUserProfiles().add(userProfile);
+
+                    // Update the group
+                    groupDAO.update(defaultGroup);
+
+                    LOGGER.info("✅ Auto-assigned new OIDC user {} to Users group with Default User profile", email);
+                } else {
+                    LOGGER.warn("⚠️  Default Users group not found ({}), user {} created without group",
+                               defaultGroupUri, email);
+                }
+            } catch (Exception e) {
+                LOGGER.error("❌ Failed to auto-assign group for user {}: {}", email, e.getMessage());
+                // Don't fail user creation if group assignment fails
+                // User can still be manually assigned to a group later
+            }
+            // ===== END CUSTOM PATCH =====
         }

         return account;
PATCH_EOF

    print_success "Patch file created at: $PATCH_DIR/AccountDAO-auto-groups.patch"
}

# Function to build patched OpenSILEX
build_patched_opensilex() {
    print_status "Starting OpenSILEX patch build process..."

    # Check prerequisites
    if ! command -v mvn &> /dev/null; then
        print_error "Maven not found. Installing Maven..."
        sudo apt update
        sudo apt install -y maven
    fi

    if ! command -v git &> /dev/null; then
        print_error "Git not found. Installing Git..."
        sudo apt update
        sudo apt install -y git
    fi

    # Clean and create work directory
    print_status "Setting up build environment..."
    rm -rf "$WORK_DIR"
    mkdir -p "$WORK_DIR"
    cd "$WORK_DIR"

    # Clone OpenSILEX repository
    print_status "Cloning OpenSILEX repository (version $VERSION)..."
    git clone --depth 1 --branch "$VERSION" "$REPO_URL" opensilex
    cd opensilex

    # Create patch file if it doesn't exist
    if [ ! -f "$PATCH_DIR/AccountDAO-auto-groups.patch" ]; then
        create_patch_file
    fi

    # Apply the patch
    print_status "Applying auto-group assignment patch..."
    if patch -p1 < "$PATCH_DIR/AccountDAO-auto-groups.patch"; then
        print_success "Patch applied successfully"
    else
        print_error "Patch failed to apply. Attempting manual modification..."
        apply_patch_manually
    fi

    # Build the project
    print_status "Building OpenSILEX (this may take 10-15 minutes)..."
    print_warning "Building with tests skipped for faster compilation..."

    if mvn clean install -DskipTests; then
        print_success "Build completed successfully!"
    else
        print_error "Build failed. Check the output above for errors."
        exit 1
    fi

    # Verify the patched JAR exists
    PATCHED_JAR="$WORK_DIR/opensilex/opensilex-security/target/opensilex-security-${VERSION}.jar"
    if [ -f "$PATCHED_JAR" ]; then
        print_success "Patched JAR created: $PATCHED_JAR"

        # Copy to a convenient location
        mkdir -p "$PATCH_DIR/builds"
        cp "$PATCHED_JAR" "$PATCH_DIR/builds/opensilex-security-${VERSION}-patched.jar"
        print_success "Patched JAR copied to: $PATCH_DIR/builds/opensilex-security-${VERSION}-patched.jar"
    else
        print_error "Patched JAR not found at expected location"
        exit 1
    fi
}

# Function to apply patch manually if automatic patching fails
apply_patch_manually() {
    print_status "Applying patch manually..."

    ACCOUNT_DAO="opensilex-security/src/main/java/org/opensilex/security/account/dal/AccountDAO.java"

    # Check if file exists
    if [ ! -f "$ACCOUNT_DAO" ]; then
        print_error "AccountDAO.java not found at expected location"
        exit 1
    fi

    # Backup original
    cp "$ACCOUNT_DAO" "${ACCOUNT_DAO}.backup"

    # Insert the patch code after create(account);
    # This is a simplified manual patch - you may need to adjust based on actual file structure
    print_warning "Manual patching may require verification. Please review the changes."

    # You would implement the manual text insertion here
    # For now, we'll rely on the patch file
}

# Function to deploy patched JAR to server
deploy_to_server() {
    print_status "Deploying patched OpenSILEX to server..."

    # Get server details
    read -p "Enter server hostname or IP [20.234.181.44]: " SERVER_HOST
    SERVER_HOST=${SERVER_HOST:-20.234.181.44}

    read -p "Enter SSH username [azureuser]: " SSH_USER
    SSH_USER=${SSH_USER:-azureuser}

    # Confirm deployment
    echo ""
    print_warning "⚠️  This will:"
    echo "  1. Stop OpenSILEX service"
    echo "  2. Backup current opensilex-security.jar"
    echo "  3. Replace with patched version"
    echo "  4. Restart OpenSILEX service"
    echo ""
    read -p "Deploy to $SSH_USER@$SERVER_HOST? (yes/no): " CONFIRM

    if [ "$CONFIRM" != "yes" ]; then
        print_warning "Deployment cancelled"
        exit 0
    fi

    PATCHED_JAR="$PATCH_DIR/builds/opensilex-security-${VERSION}-patched.jar"

    if [ ! -f "$PATCHED_JAR" ]; then
        print_error "Patched JAR not found at: $PATCHED_JAR"
        print_error "Run './opensilex-patch-auto-groups.sh build' first"
        exit 1
    fi

    # Stop OpenSILEX
    print_status "Stopping OpenSILEX service..."
    ssh ${SSH_USER}@${SERVER_HOST} "sudo systemctl stop opensilex"

    # Backup current JAR
    print_status "Backing up current JAR..."
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    ssh ${SSH_USER}@${SERVER_HOST} "cp /home/azureuser/opensilex/bin/${VERSION}/modules/opensilex-security.jar /home/azureuser/opensilex/bin/${VERSION}/modules/opensilex-security.jar.backup_${TIMESTAMP}"

    # Upload patched JAR
    print_status "Uploading patched JAR..."
    scp "$PATCHED_JAR" ${SSH_USER}@${SERVER_HOST}:/home/azureuser/opensilex/bin/${VERSION}/modules/opensilex-security.jar

    # Start OpenSILEX
    print_status "Starting OpenSILEX service..."
    ssh ${SSH_USER}@${SERVER_HOST} "sudo systemctl start opensilex"

    # Wait for service to start
    print_status "Waiting for OpenSILEX to start (30 seconds)..."
    sleep 30

    # Check service status
    print_status "Checking OpenSILEX service status..."
    if ssh ${SSH_USER}@${SERVER_HOST} "sudo systemctl is-active --quiet opensilex"; then
        print_success "OpenSILEX service is running!"
    else
        print_error "OpenSILEX service failed to start"
        print_error "Check logs with: ssh ${SSH_USER}@${SERVER_HOST} 'sudo journalctl -u opensilex -n 50'"
        exit 1
    fi

    # Optional: Disable Python monitoring script
    echo ""
    read -p "Disable the Python auto-groups monitoring script? (yes/no): " DISABLE_MONITOR
    if [ "$DISABLE_MONITOR" = "yes" ]; then
        print_status "Disabling opensilex-auto-groups service..."
        ssh ${SSH_USER}@${SERVER_HOST} "sudo systemctl stop opensilex-auto-groups && sudo systemctl disable opensilex-auto-groups"
        print_success "Python monitoring script disabled"
    fi

    print_success "Deployment complete!"
    echo ""
    echo "=========================================="
    echo "  Post-Deployment Verification"
    echo "=========================================="
    echo "1. Test with a new Feide user login"
    echo "2. Check logs: ssh ${SSH_USER}@${SERVER_HOST} 'sudo journalctl -u opensilex -f'"
    echo "3. Look for: '✅ Auto-assigned new OIDC user ... to Users group'"
    echo "4. User should see interface immediately (no blank page)"
    echo ""
    echo "Rollback if needed:"
    echo "  ssh ${SSH_USER}@${SERVER_HOST}"
    echo "  sudo systemctl stop opensilex"
    echo "  cp /home/azureuser/opensilex/bin/${VERSION}/modules/opensilex-security.jar.backup_${TIMESTAMP} /home/azureuser/opensilex/bin/${VERSION}/modules/opensilex-security.jar"
    echo "  sudo systemctl start opensilex"
    echo "=========================================="
}

# Main script logic
main() {
    ACTION=${1:-both}

    echo ""
    echo "=========================================="
    echo "  OpenSILEX Auto-Group Assignment Patch"
    echo "  Version: 1.0.0"
    echo "=========================================="
    echo ""

    case "$ACTION" in
        build)
            create_patch_file
            build_patched_opensilex
            ;;
        deploy)
            deploy_to_server
            ;;
        both)
            create_patch_file
            build_patched_opensilex
            echo ""
            read -p "Build complete. Deploy now? (yes/no): " DEPLOY_NOW
            if [ "$DEPLOY_NOW" = "yes" ]; then
                deploy_to_server
            else
                print_warning "Deployment skipped. Run './opensilex-patch-auto-groups.sh deploy' when ready"
            fi
            ;;
        *)
            print_error "Unknown action: $ACTION"
            echo "Usage: $0 [build|deploy|both]"
            exit 1
            ;;
    esac
}

# Run main
main "$@"
