---
name: Ansible deployment project
description: Ansible replaces PowerShell scripts for PHIS deployment on new VMs
type: project
originSessionId: 16be6677-67e5-4ef5-b81e-d5d6f591e0da
---
Ansible project lives at `ansible/` in the repo root on branch `ansible-deployment`.

**Why:** PowerShell SSH scripts hang on long Docker builds. Ansible is idempotent and retry-safe.

**Key design decisions:**
- Targets NEW Azure VMs (Debian 12) — existing servers (108.143.24.11, 172.211.86.191) are NOT touched
- Managed `docker-compose.yml.j2` template with GraphDB pre-substituted (not runtime awk/sed)
- Whole-file `opensilex.env.j2` template (no sed drift)
- `blockinfile` markers for idempotent YAML config appending
- No `community.docker` collection — uses raw `command: docker compose ...` to avoid extra deps
- `pipelining = True` in ansible.cfg (reduces SSH round-trips — root cause of hangs)

**Before using:**
1. Replace `PLACEHOLDER_*_IP` in `ansible/inventory/hosts.yml` and `group_vars/sandbox/main.yml`
2. Fill real Feide/admin credentials in vault files, then encrypt with `ansible-vault encrypt`
3. Create `ansible/.vault_pass` (gitignored)

**Run:**
```
ansible-playbook sandbox.yml
ansible-playbook production.yml
```

**Why:** Replacing PowerShell scripts that hang on long-running SSH ops (Docker builds, apt installs).
**How to apply:** Use this branch when provisioning new VMs; old VMs continue using PowerShell scripts until cutover.
