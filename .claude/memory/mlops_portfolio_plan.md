# MLOps Portfolio Plan

## Goal
Add an MLOps layer on top of the existing PHIS infrastructure as a portfolio project.
Demonstrates the intersection of ML/stats background + Kubernetes/cloud infrastructure skills.

## Context
- User background: applied mathematics & physics, specialization in ML and statistics
- Current WP: data management (PHIS platform)
- There is a separate ML WP — coordinate with them before building to avoid duplication
- Cost concern resolved: marginal cost is near zero (existing cluster + blob storage)

## What to Build

### 1. MLflow (experiment tracking)
- Deploy as a small K8s Deployment in the `phis` namespace (or its own namespace)
- ~128Mi RAM, minimal CPU — fits on existing D4s_v3 without issue
- Artifact storage → existing `phistfstate` blob storage account (new container)
- Credentials via the existing Key Vault → ESO → K8s Secret pattern

### 2. Argo Workflows (pipeline orchestration)
- Install via HelmRelease (same Flux pattern as cert-manager, ESO etc.)
- Pipeline steps: fetch data from OpenSILEX API → preprocess → train → evaluate → register model
- Training jobs are short-lived pods — compute cost only while running

### 3. Inference API
- Trained model packaged as a container (same pattern as custom OpenSILEX image)
- Deployed as a K8s Deployment with a Service
- Exposed internally or via Ingress depending on use case

## Use Case
Plant phenotyping data from OpenSILEX — likely tabular (sensor readings, measurements).
Candidate models: random forests, gradient boosting, linear models.
Trains in seconds on CPU — no GPU needed.

## CV Story
"Designed and deployed an end-to-end MLOps pipeline on AKS — data ingestion from
OpenSILEX, model training with Argo Workflows, experiment tracking with MLflow,
inference API served as a Kubernetes Deployment via GitOps (Flux)."

## Next Steps
1. Check with the ML WP to avoid duplicating their infrastructure
2. Start with MLflow — smallest change, immediately useful for tracking experiments
3. Add Argo Workflows once MLflow is stable
4. Build a simple inference service for one concrete use case
