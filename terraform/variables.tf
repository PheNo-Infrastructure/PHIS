# ── Required — must be set in terraform.tfvars ────────────────────────────────

variable "subscription_id" {
  description = "Azure subscription ID (az account show --query id -o tsv)"
  type        = string
}

# ── Optional — defaults match current cluster spec ────────────────────────────

variable "resource_group_name" {
  description = "Resource group for all PHIS resources"
  type        = string
  default     = "phis-rg"
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "westeurope"
}

variable "cluster_name" {
  description = "AKS cluster name"
  type        = string
  default     = "phis-cluster"
}

variable "kubernetes_version" {
  description = "Kubernetes version for the AKS cluster"
  type        = string
  default     = "1.33"
}

variable "node_vm_size" {
  description = "VM SKU for the single AKS node"
  type        = string
  default     = "Standard_D4s_v3"
}

variable "node_count" {
  description = "Number of nodes in the default node pool"
  type        = number
  default     = 1
}

variable "node_os_disk_size_gb" {
  description = "OS disk size in GB"
  type        = number
  default     = 64
}

variable "key_vault_name" {
  description = "Key Vault name — must be globally unique (3-24 alphanumeric + hyphens)"
  type        = string
  default     = "phis-kv"
}

variable "eso_identity_name" {
  description = "Name of the managed identity ESO uses to access Key Vault"
  type        = string
  default     = "phis-eso-identity"
}

variable "eso_namespace" {
  description = "Kubernetes namespace where ESO is installed"
  type        = string
  default     = "external-secrets"
}

variable "eso_service_account_name" {
  description = "Name of the K8s ServiceAccount ESO uses (must match serviceaccount.yaml)"
  type        = string
  default     = "external-secrets"
}

variable "storage_account_name" {
  description = "Storage account for Terraform state, file storage, and backups (globally unique, 3-24 alphanumeric, no hyphens)"
  type        = string
  default     = "phistfstate"
}
