---
name: feedback-python-not-available
description: "No working local Python with opensilexClientToolsPython — don't try to run python/pip commands to inspect packages"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 75317ed9-0bab-44c9-90b6-0c3a4fc122ef
---

Never try to run `python`, `python3`, or `pip` locally to inspect `opensilexClientToolsPython` or any PhisWebPortal dependency. No local Python installation has the portal's packages. The package runs inside Docker only.

**Why:** Claude tries this about once per session and it always fails — multiple Python executables exist on the machine but none have the portal dependencies installed.

**How to apply:** To inspect a DTO or API signature, read the source directly: check `_test_dto_signatures.py` in PhisWebPortal (already has constructor examples for all DTOs), search GitHub for the opensilexClientToolsPython source, or grep the pip cache for `.py` files. Never shell out to python/pip.
