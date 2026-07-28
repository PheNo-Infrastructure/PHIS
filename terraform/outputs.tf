output "kube_config" {
  value       = azurerm_kubernetes_cluster.phis.kube_config_raw
  sensitive   = true
  description = "Run: terraform output -raw kube_config > $HOME/.kube/config"
}

output "key_vault_uri" {
  value       = azurerm_key_vault.phis.vault_uri
  description = "Used in ClusterSecretStore and phis-tf-outputs ConfigMap"
}

output "oidc_issuer_url" {
  value       = azurerm_kubernetes_cluster.phis.oidc_issuer_url
  description = "OIDC issuer URL — used in the federated credential (identity.tf)"
}

output "eso_identity_client_id" {
  value       = azurerm_user_assigned_identity.eso.client_id
  description = "Annotate the ESO ServiceAccount with this value (azure.workload.identity/client-id)"
}

output "eso_identity_tenant_id" {
  value       = data.azurerm_client_config.current.tenant_id
  description = "Azure tenant ID — same for all resources in this subscription"
}

output "gha_client_id" {
  value       = azurerm_user_assigned_identity.gha.client_id
  description = "Set as AZURE_CLIENT_ID secret in the GitHub repo"
}

output "gha_tenant_id" {
  value       = data.azurerm_client_config.current.tenant_id
  description = "Set as AZURE_TENANT_ID secret in the GitHub repo"
}

output "gha_subscription_id" {
  value       = var.subscription_id
  description = "Set as AZURE_SUBSCRIPTION_ID secret in the GitHub repo"
}

output "storage_account_name" {
  value       = azurerm_storage_account.main.name
  description = "Storage account for Terraform state, file storage, and backups"
}
