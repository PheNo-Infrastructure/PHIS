resource "azurerm_resource_group" "phis" {
  name     = var.resource_group_name
  location = var.location
}

# Single storage account for all external state: Terraform state, OpenSILEX
# file storage (via blobfuse2 PVC), and nightly database backups.
# Billed per GiB stored — starts at €0.
resource "azurerm_storage_account" "main" {
  name                     = var.storage_account_name
  resource_group_name      = azurerm_resource_group.phis.name
  location                 = azurerm_resource_group.phis.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
}

resource "azurerm_storage_container" "tfstate" {
  name                  = "tfstate"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

resource "azurerm_storage_container" "mongodb_backups" {
  name                  = "mongodb-backups"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

resource "azurerm_storage_container" "graphdb_backups" {
  name                  = "graphdb-backups"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

# AKS kubelet identity needs Storage Blob Data Contributor to:
# 1. Dynamically provision blob containers for blobfuse2 PVCs.
# 2. Read/write blobs in the statically-provisioned backup containers.
resource "azurerm_role_assignment" "kubelet_blob_access" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_kubernetes_cluster.phis.kubelet_identity[0].object_id
}
