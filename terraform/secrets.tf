# Placeholder secrets — 04-bootstrap.ps1 overwrites these with real values
# before running flux bootstrap.
#
# IMPORTANT: lifecycle.ignore_changes = [value] on every resource below.
# This prevents `terraform apply` from resetting live secrets back to the
# placeholder after bootstrap has written the real values. Without this,
# any terraform apply would silently corrupt all credentials — surviving
# unnoticed until the next pod restart (e.g. AKS node image upgrade).
#
# If terraform apply fails with 403 on these resources, wait 60 seconds and
# re-run. Azure RBAC role assignments take 1-2 minutes to propagate.

locals {
  placeholder = "REPLACE_ME"
}

resource "azurerm_key_vault_secret" "graphdb_admin_password" {
  name         = "graphdb-admin-password"
  value        = local.placeholder
  key_vault_id = azurerm_key_vault.phis.id
  depends_on   = [azurerm_role_assignment.tf_kv_officer]
  # Generate: openssl rand -hex 20
  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "mongodb_root_password" {
  name         = "mongodb-root-password"
  value        = local.placeholder
  key_vault_id = azurerm_key_vault.phis.id
  depends_on   = [azurerm_role_assignment.tf_kv_officer]
  # Generate: openssl rand -hex 20
  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "mongodb_opensilex_password" {
  name         = "mongodb-opensilex-password"
  value        = local.placeholder
  key_vault_id = azurerm_key_vault.phis.id
  depends_on   = [azurerm_role_assignment.tf_kv_officer]
  # Generate: openssl rand -hex 20
  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "mongodb_keyfile" {
  name         = "mongodb-keyfile"
  value        = local.placeholder
  key_vault_id = azurerm_key_vault.phis.id
  depends_on   = [azurerm_role_assignment.tf_kv_officer]
  # Generate: openssl rand -base64 756 | tr -d '\n'
  # Must be a single-line base64 string — no newlines.
  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "feide_client_id" {
  name         = "feide-client-id"
  value        = local.placeholder
  key_vault_id = azurerm_key_vault.phis.id
  depends_on   = [azurerm_role_assignment.tf_kv_officer]
  # From: https://dashboard.dataporten.no → your application → Client ID
  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "feide_client_secret" {
  name         = "feide-client-secret"
  value        = local.placeholder
  key_vault_id = azurerm_key_vault.phis.id
  depends_on   = [azurerm_role_assignment.tf_kv_officer]
  # From: https://dashboard.dataporten.no → your application → Client Secret
  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "ghcr_pull_secret" {
  name         = "ghcr-pull-secret-json"
  value        = local.placeholder
  key_vault_id = azurerm_key_vault.phis.id
  depends_on   = [azurerm_role_assignment.tf_kv_officer]
  # Format (compact JSON, no newlines):
  # {"auths":{"ghcr.io":{"username":"<github-username>","password":"<PAT>"}}}
  # PAT needs: read:packages scope
  # Generate PAT: https://github.com/settings/tokens
  lifecycle {
    ignore_changes = [value]
  }
}
