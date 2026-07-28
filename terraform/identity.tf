# User-assigned managed identity that ESO impersonates to read Key Vault secrets.
# This is scoped to Key Vault only — not the cluster control-plane identity.
# Managed identity for GitHub Actions to authenticate to AKS without a
# static KUBECONFIG secret. The federated credential trusts tokens issued
# by GitHub's OIDC provider for the k8s branch of this repo.
resource "azurerm_user_assigned_identity" "gha" {
  name                = "phis-gha-identity"
  location            = azurerm_resource_group.phis.location
  resource_group_name = azurerm_resource_group.phis.name
}

resource "azurerm_federated_identity_credential" "gha" {
  name                = "phis-gha-federated"
  resource_group_name = azurerm_resource_group.phis.name
  parent_id           = azurerm_user_assigned_identity.gha.id

  audience = ["api://AzureADTokenExchange"]
  issuer   = "https://token.actions.githubusercontent.com"
  # Covers push to k8s branch and workflow_dispatch triggered on k8s branch.
  subject = "repo:lversen/PHIS:ref:refs/heads/k8s"
}

# Grants the GHA identity access to retrieve admin kubeconfig for the cluster.
# Scoped to the AKS resource only — no other Azure resources are accessible.
resource "azurerm_role_assignment" "gha_aks_admin" {
  scope                = azurerm_kubernetes_cluster.phis.id
  role_definition_name = "Azure Kubernetes Service Cluster Admin Role"
  principal_id         = azurerm_user_assigned_identity.gha.principal_id
}

# ── ESO identity ──────────────────────────────────────────────────────────────

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
