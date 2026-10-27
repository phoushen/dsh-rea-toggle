# Install, step by step

Two paths. Pick one. Both assume REA already works in your DeepSeek Harness.

## 0. Confirm the precondition

Your profile patch must already contain a row that launches REA, and it must have
an `id` you can point at:

```yaml
# <DSH_HOME>/profiles/<profile>/cordis.patch.yml
- insert:
    - id: rea-mcp                 # ← remember this id
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: rea
        transport: stdio
        command: node
        args: [ "…\\rea-agents\\scripts\\rea.mjs", "mcp" ]
```

If you have no such row, install REA first; this plugin has nothing to switch.

Where is `<DSH_HOME>`? In order: `$env:DSH_HOME`, then `%USERPROFILE%\.dsh`,
then the `.dsh` beside your harness install.

## Path A — `dsh plugin add`

```powershell
dsh plugin --profile "$env:DSH_PROFILE" add github:phoushen/dsh-rea-toggle
```

Then fully quit and restart the harness (tray icon included — closing the window
is not enough).

## Path B — manual copy

```powershell
$HOME_DSH = if ($env:DSH_HOME) { $env:DSH_HOME } else { "$env:USERPROFILE\.dsh" }
$PROFILE  = if ($env:DSH_PROFILE) { $env:DSH_PROFILE } else { "desktop" }

# 1. source of truth
Copy-Item .\dsh-rea-toggle "$HOME_DSH\plugins\dsh-rea-toggle" -Recurse -Force

# 2. what the loader actually resolves
Copy-Item .\dsh-rea-toggle "$HOME_DSH\profiles\$PROFILE\node_modules\dsh-rea-toggle" -Recurse -Force
```

Edit `…\profiles\$PROFILE\package.json` — **both** places, and keep the JSON valid:

```jsonc
{
  "name": "dsh-profile-desktop",
  "private": true,
  "dependencies": {
    // …existing entries stay…
    "dsh-rea-toggle": "file:../../plugins/dsh-rea-toggle"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        // …existing entries stay…
        "dsh-rea-toggle"
      ]
    }
  }
}
```

`dependencies` alone is not enough — the package is installed but never loaded.
`bundles` alone is not enough — the package cannot be resolved.

Restart completely.

## 3. Confirm the host half answered

```powershell
$port = 50627   # your harness Web port, from the runtime context
Invoke-RestMethod "http://127.0.0.1:$port/rea-toggle/status"
```

Expected:

```json
{ "ok": true, "path": "…\\cordis.patch.yml", "rowLine": 75,
  "disabled": false, "enabled": true }
```

Anything else and the plugin is not loaded:

| Response | Meaning |
|---|---|
| connection refused | wrong port, or harness not running |
| 404 | host half not loaded → check `bundles` + full restart |
| `{"ok":false,"error":"row \"rea-mcp\" not found"}` | loaded, but `targetId` does not match your row → see below |
| `{"ok":false,"error":"cordis.patch.yml not found"}` | `DSH_HOME` / `DSH_PROFILE` point somewhere unexpected |

## 4. Confirm the client half appears

Look left of the message composer for `REA ON`. If it is missing while `/status`
works, the client bundle was not scanned at boot — quit fully, start again.

## 5. Point it at your own row id

If your REA row is not `rea-mcp`, edit this plugin's row:

```yaml
- insert:
    - id: dsh-rea-toggle
      name: dsh-rea-toggle
      config:
        targetId: my-rea-row
        routePrefix: /rea-toggle
```

## Uninstall

```powershell
$HOME_DSH = if ($env:DSH_HOME) { $env:DSH_HOME } else { "$env:USERPROFILE\.dsh" }
Remove-Item "$HOME_DSH\plugins\dsh-rea-toggle" -Recurse -Force
Remove-Item "$HOME_DSH\profiles\desktop\node_modules\dsh-rea-toggle" -Recurse -Force
```

Then remove `"dsh-rea-toggle"` from `dependencies` and `bundles`, and delete the
`- insert:` block for it. Restart.

Uninstalling leaves the `disabled` flag exactly as you last set it — if you want
REA back on, set it to `false` first or delete the `disabled:` line.
