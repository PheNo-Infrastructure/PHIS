# User-assigned managed identity that ESO impersonates to read Key Vault secrets.
# This is scoped to Key Vault only — not the cluster control-plane identity.
resource "azurerm_user_assigned_identity" "eso" {
  name                = var.eso_identity_name
  location            = azurerm_resource_group.phis.location
  resource_group_name = azurerm_resource_group.phis.name
}

# Federated credential: the trust bridge between Kubernetes and Azure AD.
#
# It says: "When a pod running under the K8s ServiceAccount
# '<eso_namespace>/<eso_service_account_name>' presents a token signed by
# this cluster's OIDC issuer, allow it to act as the managed identity above."
#
# Flow: ESO pod → projected SA token → Azure AD token exchange →
#       managed identity token → Key Vault read permission
resource "azurerm_federated_identity_credential" "eso" {
  name                = "phis-eso-federated"
  resource_group_name = azurerm_resource_group.phis.name
  parent_id           = azurerm_user_assigned_identity.eso.id

  audience = ["api://AzureADTokenExchange"]
  issuer   = azurerm_kubernetes_cluster.phis.oidc_issuer_url
  subject  = "system:serviceaccount:${var.eso_namespace}:${var.eso_service_account_name}"
}
