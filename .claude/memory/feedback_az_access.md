---
name: feedback-az-access
description: Claude has direct access to the az CLI and should use it rather than just instructing the user
metadata: 
  node_type: memory
  type: feedback
  originSessionId: a837a362-3564-4ee4-a5f2-e8d0eb086bb8
---

Claude has access to `az` (Azure CLI) commands via the Bash tool and should run them directly when needed (checking subscriptions, reading resource state, setting Key Vault secrets, etc.) rather than just telling the user to run them.

**Why:** User explicitly confirmed this — don't ask "can you run this?" when working with Azure resources.

**How to apply:** When Azure CLI commands are needed (az account show, az keyvault secret set, az aks get-credentials, etc.), run them directly with the Bash tool. Same applies to `terraform`, `kubectl`, and `flux` if they are in PATH.
