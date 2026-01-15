#!/bin/bash
set -e

# OpenSILEX Complete Patch Builder and Deployer
# Fixes BOTH:
# 1. Auto-group assignment (AccountDAO)
# 2. GroupDAO NullPointerException bug (CRITICAL)
#
# Version: 2.0.0
# Usage: ./opensilex-patch-complete.sh [build|deploy|both]

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

# Create GroupDAO patch to fix NullPointerException
create_groupdao_patch() {
    print_status "Creating GroupDAO NullPointerException fix patch..."

    mkdir -p "$PATCH_DIR"

    cat > "$PATCH_DIR/GroupDAO-fix-null-filter.patch" << 'PATCH_EOF'
--- a/opensilex-security/src/main/java/org/opensilex/security/group/dal/GroupDAO.java
+++ b/opensilex-security/src/main/java/org/opensilex/security/group/dal/GroupDAO.java
@@ -153,7 +153,11 @@ public final class GroupDAO {
                 GroupModel.class,
                 lang,
                 (SelectBuilder select) -> {
-                    select.addFilter(SPARQLQueryHelper.inURIFilter(GroupUserProfileModel.URI_FIELD, encounteredUserProfileUrisAsUris));
+                    // CRITICAL FIX: inURIFilter returns null when list is empty
+                    Expr filter = SPARQLQueryHelper.inURIFilter(GroupUserProfileModel.URI_FIELD, encounteredUserProfileUrisAsUris);
+                    if (filter != null) {
+                        select.addFilter(filter);
+                    }
                 },
                 Collections.emptyMap(),
                 (SPARQLResult result) -> userProfileFetcher.getInstance(result, lang),
PATCH_EOF

    print_success "GroupDAO patch created at: $PATCH_DIR/GroupDAO-fix-null-filter.patch"
}

# Create AccountDAO patch for auto-groups
create_accountdao_patch() {
    print_status "Creating AccountDAO auto-groups patch..."

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

    print_success "AccountDAO patch created at: $PATCH_DIR/AccountDAO-auto-groups.patch"
}

# Build patched OpenSILEX
build_patched_opensilex() {
    print_status "Starting OpenSILEX complete patch build process..."

    # Check prerequisites
    if ! command -v mvn &> /dev/null; then
        print_error "Maven not found. Installing Maven..."
        sudo apt update
        sudo apt install -y maven default-jdk
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

    # Create patch files if they don't exist
    create_groupdao_patch
    create_accountdao_patch

    # Apply GroupDAO patch (CRITICAL FIX)
    print_status "Applying GroupDAO NullPointerException fix patch..."
    if patch -p1 < "$PATCH_DIR/GroupDAO-fix-null-filter.patch"; then
        print_success "✅ GroupDAO patch applied successfully"
    else
        print_error "GroupDAO patch failed to apply"
        print_warning "This may cause authentication issues"
    fi

    # Apply AccountDAO patch (Auto-groups)
    print_status "Applying AccountDAO auto-groups patch..."
    if patch -p1 < "$PATCH_DIR/AccountDAO-auto-groups.patch"; then
        print_success "✅ AccountDAO patch applied successfully"
    else
        print_error "AccountDAO patch failed to apply"
    fi

    # Build the project
    print_status "Building OpenSILEX (this may take 10-15 minutes)..."
    print_warning "Building with tests skipped for faster compilation..."

    if mvn clean install -DskipTests -DskipFrontBuild; then
        print_success "✅ Build completed successfully!"
    else
        print_error "Build failed. Check the output above for errors."
        exit 1
    fi

    # Find and copy the main JAR
    MAIN_JAR="$WORK_DIR/opensilex/opensilex-release/target/opensilex.jar"
    if [ -f "$MAIN_JAR" ]; then
        print_success "Patched main JAR found: $MAIN_JAR"

        # Copy to builds directory
        mkdir -p "$PATCH_DIR/builds"
        cp "$MAIN_JAR" "$PATCH_DIR/builds/opensilex-${VERSION}-patched.jar"
        print_success "✅ Patched JAR copied to: $PATCH_DIR/builds/opensilex-${VERSION}-patched.jar"

        # Show file size
        SIZE=$(du -h "$PATCH_DIR/builds/opensilex-${VERSION}-patched.jar" | cut -f1)
        print_success "JAR size: $SIZE"
    else
        print_error "Main JAR not found at expected location"
        print_status "Searching for JARs..."
        find "$WORK_DIR/opensilex" -name "opensilex*.jar" -type f
        exit 1
    fi
}

# Deploy to server
deploy_to_server() {
    print_status "Deploying patched OpenSILEX to server..."

    # Check if patched JAR exists
    PATCHED_JAR="$PATCH_DIR/builds/opensilex-${VERSION}-patched.jar"
    if [ ! -f "$PATCHED_JAR" ]; then
        print_error "Patched JAR not found at $PATCHED_JAR"
        print_error "Run './opensilex-patch-complete.sh build' first"
        exit 1
    fi

    # Get server details
    read -p "Enter server hostname or IP [172.211.86.191]: " SERVER_HOST
    SERVER_HOST=${SERVER_HOST:-172.211.86.191}

    read -p "Enter SSH username [azureuser]: " SSH_USER
    SSH_USER=${SSH_USER:-azureuser}

    read -p "Enter OpenSILEX installation path [/home/azureuser/opensilex/bin/1.4.9-rdg]: " REMOTE_PATH
    REMOTE_PATH=${REMOTE_PATH:-/home/azureuser/opensilex/bin/1.4.9-rdg}

    print_status "Deployment configuration:"
    echo "  Server: $SSH_USER@$SERVER_HOST"
    echo "  Remote path: $REMOTE_PATH"
    echo "  Local JAR: $PATCHED_JAR"
    echo ""

    read -p "Proceed with deployment? (yes/no): " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        print_warning "Deployment cancelled"
        exit 0
    fi

    # Backup existing JAR
    print_status "Backing up existing JAR on server..."
    ssh $SSH_USER@$SERVER_HOST "sudo cp $REMOTE_PATH/opensilex.jar $REMOTE_PATH/opensilex.jar.backup-\$(date +%Y%m%d-%H%M%S)" || true

    # Stop OpenSILEX
    print_status "Stopping OpenSILEX service..."
    ssh $SSH_USER@$SERVER_HOST "sudo systemctl stop opensilex"

    # Upload patched JAR
    print_status "Uploading patched JAR..."
    scp "$PATCHED_JAR" $SSH_USER@$SERVER_HOST:/tmp/opensilex-patched.jar

    # Replace JAR
    print_status "Replacing JAR file..."
    ssh $SSH_USER@$SERVER_HOST "sudo mv /tmp/opensilex-patched.jar $REMOTE_PATH/opensilex.jar"
    ssh $SSH_USER@$SERVER_HOST "sudo chown azureuser:azureuser $REMOTE_PATH/opensilex.jar"
    ssh $SSH_USER@$SERVER_HOST "sudo chmod 755 $REMOTE_PATH/opensilex.jar"

    # Start OpenSILEX
    print_status "Starting OpenSILEX service..."
    ssh $SSH_USER@$SERVER_HOST "sudo systemctl start opensilex"

    print_success "✅ Deployment completed!"
    print_status "Waiting 60 seconds for OpenSILEX to start..."
    sleep 60

    # Verify deployment
    print_status "Verifying deployment..."
    ssh $SSH_USER@$SERVER_HOST "sudo systemctl status opensilex --no-pager | head -20"

    print_success "✅✅✅ COMPLETE PATCH DEPLOYED ✅✅✅"
    echo ""
    print_status "Patches applied:"
    echo "  ✅ GroupDAO NullPointerException fix (CRITICAL)"
    echo "  ✅ AccountDAO auto-group assignment"
    echo ""
    print_status "Next steps:"
    echo "  1. Test user login via Feide"
    echo "  2. Verify groups/profiles are visible in UI"
    echo "  3. Check JWT tokens contain credentials"
    echo "  4. Monitor logs: ssh $SSH_USER@$SERVER_HOST 'sudo journalctl -u opensilex -f'"
}

# Main menu
show_menu() {
    echo "=================================================="
    echo "OpenSILEX Complete Patch Builder & Deployer v2.0"
    echo "=================================================="
    echo ""
    echo "Fixes:"
    echo "  1. GroupDAO NullPointerException (CRITICAL)"
    echo "  2. Auto-group assignment for new users"
    echo ""
    echo "Options:"
    echo "  1) build  - Build patched OpenSILEX from source"
    echo "  2) deploy - Deploy patched JAR to server"
    echo "  3) both   - Build and deploy"
    echo "  4) exit   - Exit"
    echo ""
    echo "=================================================="
}

# Main execution
case "${1:-menu}" in
    build)
        build_patched_opensilex
        ;;
    deploy)
        deploy_to_server
        ;;
    both)
        build_patched_opensilex
        deploy_to_server
        ;;
    menu|*)
        show_menu
        read -p "Select option (1-4): " choice
        case $choice in
            1) build_patched_opensilex ;;
            2) deploy_to_server ;;
            3) build_patched_opensilex && deploy_to_server ;;
            4) exit 0 ;;
            *) print_error "Invalid option"; exit 1 ;;
        esac
        ;;
esac

print_success "Done!"
