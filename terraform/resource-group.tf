resource "azurerm_resource_group" "phis" {
  name     = var.resource_group_name
  location = var.location

  lifecycle {
    prevent_destroy = true
  }
}

# Single storage account for all external state: Terraform state, OpenSILEX
# file storage (via blobfuse2 PVC), and nightly database backups.
# Billed per GiB stored — starts at €0.
resource "azurerm_storage_account" "main" {
  name                = var.storage_account_name
  resource_group_name = azurerm_resource_group.phis.name
  location            = azurerm_resource_group.phis.location
  account_tier        = "Standard"
  # GRS: second copy in the paired region (northeurope). Protects against loss
  # of the westeurope storage cluster; versioning + soft delete protect against
  # overwrite/delete.
  account_replication_type        = "GRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false

  blob_properties {
    versioning_enabled = true
    delete_retention_policy {
      days = 30
    }
    container_delete_retention_policy {
      days = 30
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Backups were never pruned. Delete dump blobs after 90 days, and old versions
# of any blob (tfstate, uploaded files) after 90 days. Current versions of
# tfstate and uploaded files are never touched (prefix_match is backups only).
resource "azurerm_storage_management_policy" "main" {
  storage_account_id = azurerm_storage_account.main.id

  rule {
    name    = "prune-backups"
    enabled = true
    filters {
      blob_types   = ["blockBlob"]
      prefix_match = ["mongodb-backups/", "graphdb-backups/"]
    }
    actions {
      base_blob {
        delete_after_days_since_modification_greater_than = 90
      }
    }
  }

  rule {
    name    = "prune-old-versions"
    enabled = true
    filters {
      blob_types = ["blockBlob"]
    }
    actions {
      version {
        delete_after_days_since_creation = 90
      }
    }
  }
}

resource "azurerm_storage_container" "tfstate" {
  name                  = "tfstate"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_container" "mongodb_backups" {
  name                  = "mongodb-backups"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_container" "graphdb_backups" {
  name                  = "graphdb-backups"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"

  lifecycle {
    prevent_destroy = true
  }
}

# AKS kubelet identity (node pool) needs Storage Blob Data Contributor for
# blobfuse2 node-level mount operations (read/write blobs at runtime).
resource "azurerm_role_assignment" "kubelet_blob_access" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_kubernetes_cluster.phis.kubelet_identity[0].object_id
}

# The blob CSI node plugin (runs on each node as the kubelet identity) calls
# listKeys during MountDevice/NodeStageVolume for static PV fuse2 mounts.
resource "azurerm_role_assignment" "kubelet_storage_key_operator" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage Account Key Operator Service Role"
  principal_id         = azurerm_kubernetes_cluster.phis.kubelet_identity[0].object_id
}

# AKS cluster identity (control plane) needs Storage Blob Data Contributor so
# the blob CSI controller pod can dynamically provision new blob containers
# when a PVC with storageClass blob.csi.azure.com is created.
resource "azurerm_role_assignment" "cluster_blob_access" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_kubernetes_cluster.phis.identity[0].principal_id
}

# The blob CSI controller calls listKeys during dynamic PVC provisioning to
# obtain the storage account key used for blobfuse2 mounts.
resource "azurerm_role_assignment" "cluster_storage_key_operator" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage Account Key Operator Service Role"
  principal_id         = azurerm_kubernetes_cluster.phis.identity[0].principal_id
}
