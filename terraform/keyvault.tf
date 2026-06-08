resource "azurerm_key_vault" "phis" {
  name                = var.key_vault_name
  location            = azurerm_resource_group.phis.location
  resource_group_name = azurerm_resource_group.phis.name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"

  # RBAC model instead of legacy access policies.
  # Role assignments are done below — easier to audit and more granular.
  enable_rbac_authorization = true

  network_acls {
    bypass         = "AzureServices"
    default_action = "Allow"
  }
}

# ESO identity: read-only access (list + get secrets, no write/delete).
resource "azurerm_role_assignment" "eso_kv_reader" {
  scope                = azurerm_key_vault.phis.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.eso.principal_id
}

# Terraform caller (your machine): write access so secrets.tf can create
# the placeholder secrets. Safe to keep — this identity is just your az CLI login.
resource "azurerm_role_assignment" "tf_kv_officer" {
  scope                = azurerm_key_vault.phis.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}
