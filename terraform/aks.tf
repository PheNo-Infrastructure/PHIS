resource "azurerm_kubernetes_cluster" "phis" {
  name                = var.cluster_name
  location            = azurerm_resource_group.phis.location
  resource_group_name = azurerm_resource_group.phis.name
  dns_prefix          = var.cluster_name

  # Workload Identity lets pods authenticate to Azure AD using a projected
  # service account token — no stored credentials anywhere in the cluster.
  # OIDC issuer must be enabled first; it's the token signer the federated
  # credential in identity.tf trusts.
  oidc_issuer_enabled       = true
  workload_identity_enabled = true

  default_node_pool {
    name                = "default"
    node_count          = var.node_count
    vm_size             = var.node_vm_size
    os_disk_size_gb     = var.node_os_disk_size_gb
  }

  # SystemAssigned: the cluster control-plane gets an identity automatically.
  # This is separate from the ESO managed identity in identity.tf.
  identity {
    type = "SystemAssigned"
  }

  role_based_access_control_enabled = true
}
