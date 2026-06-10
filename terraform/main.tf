terraform {
  required_version = ">= 1.7"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.53"
    }
  }

  # Terraform state migration to Azure Blob (two-step, run in order):
  #   Step 1 — DONE: Storage account added to resource-group.tf.
  #   Step 2: Run: terraform apply    (creates the storage account with local state)
  #   Step 3: Uncomment the backend block below.
  #   Step 4: Run: terraform init -migrate-state
  #
  backend "azurerm" {
    resource_group_name  = "phis-rg"
    storage_account_name = "phistfstate"
    container_name       = "tfstate"
    key                  = "phis.tfstate"
  }
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
