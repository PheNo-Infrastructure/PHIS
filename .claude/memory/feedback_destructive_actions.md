---
name: feedback-destructive-actions
description: "Never execute destructive Azure/infrastructure actions (VM deletion, RG deletion) without explicit confirmation beyond \"proceed\""
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4ae002f9-23e1-439e-b698-cd78bf928e71
---

Do not delete Azure resource groups, VMs, or other infrastructure resources based on "proceed" alone — even when a deletion plan was just discussed and the user confirmed the resources are empty.

**Why:** "Proceed" in context of a prompt-improvement or planning session means "continue the task at hand" (finish the prompt, continue the analysis), not "execute the infrastructure actions described." Deletion of RGs is irreversible and warrants an explicit "yes, delete them" or equivalent.

**How to apply:** Before running `az group delete`, `az vm delete`, or any destructive az CLI command, state exactly what will be deleted and ask for explicit confirmation, regardless of prior discussion context.
