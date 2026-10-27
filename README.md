# dsh-rea-toggle

**A GUI switch for the REA MCP server in DeepSeek Harness.** Turn its ~229 `mcp__rea__*` tools on when you are reverse-engineering, and off when you are not — without editing YAML, and without paying their context cost in every unrelated conversation.

<p align="center">
  <img src="icon.svg" width="72" alt="">
</p>

```
● REA ON     ← 229 tools registered, schemas ride along on every request
● REA OFF    ← nothing registered, unrelated chats pay nothing
```

---

## The problem

[REA](https://github.com/morluto/rea) registers **229 tools** on the host (`mcp__rea__*`). Tool definitions are part of every request's system prompt, whether or not you call one.

Measured on `rea-agents@6.8.0`, using the server's own `tools/list` response:

| Measurement | Value |
|---|---|
| tools returned by `tools/list` | 229 |
| total characters of tool `name` + `description` | 139,502 |
| rough token estimate (`chars ÷ 3.5`) | **≈ 40,000 tokens** |

That is the *descriptions alone* — the full JSON Schemas add more, partly reduced by REA's own `REA_MCP_INPUT_SCHEMA_PROFILE=compact`. Your tokenizer, host version and schema profile will change the number; the order of magnitude will not.

For a reverse-engineering session, 40k tokens of tool surface is a bargain. For "help me write a video script", it is dead weight you cannot switch off.

## Why REA does not ship this switch itself

Verified against `rea-agents@6.8.0`:

```console
$ rea mcp --help
rea mcp — Register as MCP server

Usage: rea mcp <command>

Commands:
  add     Register as MCP server
  doctor  Validate MCP server startup and tool listing
```

`add` and `doctor`. **No `remove`, no `disable`, no enable, no tool filter.** `rea mcp add --agent <claude-code|cursor|…>` only *writes* a config line into a client; nothing in REA can unregister its tools at runtime.

That is structural, not an oversight: **an MCP server cannot unregister itself.** The tools exist because the host launched the server and asked for `tools/list`. Only the host can decide not to.

And on the host side, `@deepseek-ai/dsh-mcp-client`'s config surface has no inclusion filter either:

```
transport · serverName · command · args · env · cwd
toolCallTimeoutMs · failOnStartupError · maxInstructionBytes · reconnect
```

So the switch has to live in the loader patch — the one place that can say "do not start this row". That is exactly the one flag this plugin owns.

## What it does

It flips **one key** — `disabled` — on **one row** of your profile patch:

```yaml
# <DSH_HOME>/profiles/<profile>/cordis.patch.yml
- insert:
    - id: rea-mcp
      disabled: true          # ← this, and nothing else
      name: "@deepseek-ai/dsh-mcp-client"
      config: { … }
```

- Reads nothing for writing except that file.
- Writes nothing except that flag.
- Never touches `~/.dsh/plugins/rea-agents`, never uninstalls REA, never patches a binary.
- Reversible by clicking again.

## Install

### Requirements

| Component | Version used for testing |
|---|---|
| DeepSeek Harness | 0.2.1-rc.3 (desktop) |
| REA (`rea-agents`) | 6.8.0 |
| Node.js | ≥ 20 |
| An `mcp-client` row that launches REA | e.g. `id: rea-mcp` |

You need REA already working in DSH. This plugin does not install REA.

### Option A — from GitHub

```powershell
dsh plugin --profile "$env:DSH_PROFILE" add github:YOUR-GITHUB/dsh-rea-toggle
```

If your build has no `dsh` on PATH, use Option B.

### Option B — manual

```powershell
$home_ = "$env:USERPROFILE\.dsh"
Copy-Item .\dsh-rea-toggle "$home_\plugins\dsh-rea-toggle" -Recurse
Copy-Item .\dsh-rea-toggle "$home_\profiles\desktop\node_modules\dsh-rea-toggle" -Recurse
```

Then add it to the profile manifest — both places:

```jsonc
// <DSH_HOME>/profiles/desktop/package.json
{
  "dependencies": { "dsh-rea-toggle": "file:../../plugins/dsh-rea-toggle" },
  "dsh": { "profile": { "bundles": [ "...", "dsh-rea-toggle" ] } }
}
```

Restart DeepSeek Harness **completely** (tray included).

### Verify

The chip appears to the left of the message composer. Click it. Or hit the endpoints directly:

```powershell
Invoke-RestMethod http://127.0.0.1:<WEB_PORT>/rea-toggle/status
# {"ok":true,"path":"…\\cordis.patch.yml","rowLine":75,"disabled":false,"enabled":true}
```

## Usage

| Action | How |
|---|---|
| Turn off | click the chip, or `POST /rea-toggle/set {"enabled":false}` |
| Turn on | click the chip, or `POST /rea-toggle/set {"enabled":true}` |
| Read state | hover the chip, or `GET /rea-toggle/status` |

**The flag is written immediately; the tool set changes on the next harness start.** Restarting is what makes the ~40k tokens actually go away.

### Without the GUI

Any of these work too:

```powershell
# 1. endpoint
Invoke-RestMethod http://127.0.0.1:<PORT>/rea-toggle/set -Method POST `
  -ContentType 'application/json' -Body '{"enabled":false}'

# 2. edit the patch yourself — same one key
#    - id: rea-mcp
#      disabled: true
```

## Configuration

Optional, on this plugin's own row:

```yaml
- insert:
    - id: dsh-rea-toggle
      name: dsh-rea-toggle
      config:
        targetId: rea-mcp        # row id whose `disabled` flag is flipped
        routePrefix: /rea-toggle # endpoint prefix
```

Set `targetId` if your REA row is not called `rea-mcp`. Multi-server setups: one plugin row per target, each with a distinct `routePrefix`.

## What this plugin is not

- Not a REA wrapper, fork, or patch. It never reads REA's code or version.
- Not a tool filter. `dsh-mcp-client` has no inclusion field, so "keep only these 20 tools" is not possible here — it is all 229 or none.
- Not an installer. It will not fetch REA, Ghidra, JDK, adb or JADX.
- Not a security bypass. It toggles a YAML key you already own.
- Not a token counter. The ≈40k figure is an estimate from REA's own `tools/list`; measure your own if it matters.

## Security

The two endpoints accept `GET /status` and `POST /set` only, on the harness's own loopback web port, and reject a `POST` whose `Origin` host does not match the request `Host`. Body is capped at 64 KiB. Nothing is exposed to the network.

The plugin writes to exactly one path — `<DSH_HOME>/profiles/<profile>/cordis.patch.yml` — and only to the `disabled` line inside the target row.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| No chip in the composer | client half not scanned at boot | fully quit the harness (tray too), start again |
| Chip shows `REA ?` | endpoint unreachable or row missing | hover for the message; check `/rea-toggle/status` |
| `row "rea-mcp" not found` | your REA row has another id | set `config.targetId` |
| Toggled OFF, tools still there | tool registration happens at boot | restart the harness |
| Changing `disabled` does nothing | no `mcp-client` row launches REA on this profile | this switch is not the problem; check your REA install |

## License

MIT — see [LICENSE](LICENSE).

REA itself is MIT and lives at <https://github.com/morluto/rea>. DeepSeek Harness is a separate product; this plugin is unofficial and not affiliated with either project.
