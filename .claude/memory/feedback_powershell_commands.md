---
name: feedback-powershell-commands
description: "User's interactive terminal is PowerShell — always use PS syntax when giving manual commands, never bash"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 0881ac5e-5b43-4888-ad15-189978638d93
---

User's interactive terminal is PowerShell. When giving commands for the user to run manually, always use PowerShell syntax.

**Why:** Bash commands given to the user consistently fail in their PS terminal — `$(...)` subshells, `VAR=value cmd` env prefixes, `\` line continuations all throw errors.

**How to apply:**
- `$VAR = (& openssl rand -hex 20)` not `VAR=$(openssl rand -hex 20)`
- `$env:MSYS_NO_PATHCONV = "1"` on its own line before the kubectl command
- PowerShell here-strings or `;`-separated lines instead of bash `\` continuation
- Claude Code's own Bash tool can still use bash — this rule only applies to commands the user is asked to run themselves
