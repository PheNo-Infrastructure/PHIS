terraform {
  required_version = ">= 1.7"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.110"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.53"
    }
  }

  # Local state for now. To migrate to Azure Blob later:
  #   1. Add a Storage Account to resource-group.tf
  #   2. Uncomment the backend block below
  #   3. Run: terraform init -migrate-state
  #
  # backend "azurerm" {
  #   resource_group_name  = "phis-rg"
  #   storage_account_name = "phistfstate"
  #   container_name       = "tfstate"
  #   key                  = "phis.tfstate"
  # }
}

provider "azurerm" {
  subscription_id = var.subscription_id

  features {
    key_vault {
      # Allows terraform destroy to fully remove the Key Vault in dev.
      # Remove this for production to enable soft-delete protection.
      purge_soft_delete_on_destroy = true
    }
  }
}

# Used to get the current caller's object_id (needed to assign KV write
# permissions to the machine running terraform apply).
data "azurerm_client_config" "current" {}
