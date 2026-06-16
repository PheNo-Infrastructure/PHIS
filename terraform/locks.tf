resource "azurerm_management_lock" "graphdb_data_disk" {
  name       = "graphdb-data-nodelete"
  scope      = "/subscriptions/${var.subscription_id}/resourceGroups/${azurerm_kubernetes_cluster.phis.node_resource_group}/providers/Microsoft.Compute/disks/pvc-590f53ce-4dc2-4ddf-8797-1d40e6cf599b"
  lock_level = "CanNotDelete"
  notes      = "GraphDB primary data disk. Remove only with explicit research data deletion approval."
}

resource "azurerm_management_lock" "mongodb_data_disk" {
  name       = "mongodb-data-nodelete"
  scope      = "/subscriptions/${var.subscription_id}/resourceGroups/${azurerm_kubernetes_cluster.phis.node_resource_group}/providers/Microsoft.Compute/disks/pvc-c92b863c-9317-4b84-ab1c-e72655de40de"
  lock_level = "CanNotDelete"
  notes      = "MongoDB primary data disk. Remove only with explicit research data deletion approval."
}

resource "azurerm_management_lock" "mongodb_config_disk" {
  name       = "mongodb-config-nodelete"
  scope      = "/subscriptions/${var.subscription_id}/resourceGroups/${azurerm_kubernetes_cluster.phis.node_resource_group}/providers/Microsoft.Compute/disks/pvc-11812d21-47ea-4513-96bd-c9117e1afd7f"
  lock_level = "CanNotDelete"
  notes      = "MongoDB replica-set config disk. Remove only with explicit approval."
}

resource "azurerm_management_lock" "storage_account" {
  name       = "phistfstate-nodelete"
  scope      = azurerm_storage_account.main.id
  lock_level = "CanNotDelete"
  notes      = "Holds OpenSILEX data, MongoDB/GraphDB backups, and Terraform state blobs."
}
