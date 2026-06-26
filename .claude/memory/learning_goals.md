# Learning Goals & Career Context

## Background
- Education: applied mathematics and physics, specialization in ML and statistics
- Current role: data management work package on PHIS
- Career goal: become more attractive on the job market, particularly at the ML/infrastructure intersection

## Technologies Being Learned (via this repo)

### Terraform
- Currently understands what the existing code does and why
- Next step: make a small change independently (e.g. add a blob container), read the plan output, apply it
- Threshold to claim on CV: can write a new resource from docs, understand plan output, debug state drift

### Kubernetes
- Currently understands the resource types (Deployment, StatefulSet, Service, PVC, Ingress, etc.)
- Next step: use kubectl to diagnose real pod issues, write manifests for a new simple app from scratch
- Threshold to claim on CV: can diagnose a broken pod without guidance, know when to use Deployment vs StatefulSet

### Flux
- Currently understands the GitOps loop (push → Flux applies)
- Next step: add a new HelmRelease or Kustomization independently
- Threshold to claim on CV: can add/modify Flux resources and understand reconciliation

### Estimated timeline
A few focused hours per week → all three claimable in ~2-3 months.
Terraform probably claimable soonest (within weeks if actively making changes).

## MLOps Portfolio Plan
See [mlops_portfolio_plan.md](mlops_portfolio_plan.md)

Core stack: Argo Workflows + MLflow + inference API on existing AKS cluster.
Near-zero marginal cost — uses existing cluster and blob storage.
Coordinate with the ML work package first to avoid duplicating their infrastructure.

Target CV story: "End-to-end MLOps pipeline on AKS — data from OpenSILEX,
training via Argo Workflows, experiment tracking with MLflow,
inference API deployed via GitOps."

## Notes for Claude
- When the user makes changes to k8s/, terraform/, or CI — point out what they did right
  and what the real-world consequences would be. Reinforce learning, don't just fix things.
- Suggest hands-on exercises when relevant (e.g. "try adding this resource yourself").
- The web portal (separate repo: phiswebportal) is downstream — useful context but
  not the core of the MLOps story.
