# PHIS Architecture Diagram — DagFlo Prompt

Use this prompt in DagFlo to regenerate the architecture diagram after infrastructure changes.

---

Create an architecture diagram for the PHIS research platform running on Kubernetes (AKS, Azure West Europe).

**Layout:** Left-to-right flow in 5 columns.

---

**Column 1 — External sources (outside cluster boundary)**
- GitHub / k8s branch (dark/black node)
- Azure Key Vault / credentials (blue node)
- Internet / phis.pheno.no (blue node)
- cert-manager / Let's Encrypt (blue node)
- PhisWebPortal / Azure Container Apps (purple node) — outside the cluster boundary

**Column 2 — Cluster infra (inside dashed AKS cluster boundary)**
- Flux / GitOps controller (blue)
- ESO / External Secrets Operator (blue)
- Ingress NGINX / HTTPS + TLS (blue)
- Prometheus + Grafana / metrics (blue, same font size as other nodes)

**Column 3 — Central API (inside cluster boundary)**
- OpenSILEX / research data API (green, visually prominent — all data flows through here)

**Column 4 — Datastores (inside cluster boundary)**
- MongoDB / StatefulSet + PVC (Retain) (dark blue)
- GraphDB / Deployment + PVC (Retain) (dark blue)

**Column 5 — Data protection (inside cluster boundary)**
- Kyverno / PVC delete guard (blue)
- Backup CronJobs / nightly snapshots (blue)

---

**Edges:**
- GitHub → Flux: `sync`
- Azure Key Vault → ESO: `pull secrets`
- Internet → Ingress NGINX: `HTTPS`
- cert-manager → Ingress NGINX: `TLS cert`
- Flux → OpenSILEX: `deploy`
- Flux → MongoDB: `deploy`
- Flux → GraphDB: `deploy`
- ESO → OpenSILEX: `inject secrets`
- ESO → MongoDB: `inject secrets`
- Ingress NGINX → OpenSILEX: `route`
- OpenSILEX → MongoDB: `queries`
- OpenSILEX → GraphDB: `queries`
- Prometheus → OpenSILEX: `scrape`
- Prometheus → GraphDB: `scrape`
- MongoDB → Kyverno: `protected by`
- GraphDB → Kyverno: `protected by`
- MongoDB → Backup CronJobs: `backed up by`
- GraphDB → Backup CronJobs: `backed up by`
- PhisWebPortal → OpenSILEX: `REST API`

---

**Style notes:**
- Draw a single dashed border around columns 2–5 labeled "AKS cluster" — no sub-zones inside
- PhisWebPortal is outside the cluster boundary (Azure Container App, not in AKS)
- Fan Flux's deploy arrows from a single exit point to reduce parallel line clutter
- Fan ESO's inject arrows similarly
- All node title fonts at the same size
- OpenSILEX should be visually central (green, larger box or brighter color)
- Kyverno and Backup CronJobs arrows point rightward (col 4 → col 5) so the auto-layout anchors them in column 5
