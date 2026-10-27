# Why this plugin exists

A short, checkable record of the reasoning, so nobody has to trust the README.

## 1. The cost is real and unavoidable

Every MCP tool a server lists becomes part of the request. DeepSeek Harness turns
each one into a model-facing tool named `mcp__<serverName>__<rawName>` and sends
its definition along on every turn.

REA lists 229 tools at `rea-agents@6.8.0`. Reproduce:

```powershell
cd "$env:USERPROFILE\.dsh\plugins\rea-agents"
@'
import { spawn } from 'node:child_process';
const c = spawn(process.execPath, ['scripts/rea.mjs', 'mcp'], { stdio: ['pipe','pipe','inherit'] });
let buf = '', id = 0;
const send = (m, p) => { const i = ++id; c.stdin.write(JSON.stringify({jsonrpc:'2.0',id:i,method:m,params:p})+'\n');
  return new Promise(r => c.on('data', function on(d){ buf += d; let k;
    while((k = buf.indexOf('\n')) >= 0){ const l = buf.slice(0,k).trim(); buf = buf.slice(k+1);
      if(!l) continue; try { const j = JSON.parse(l); if (j.id === i) { c.off('data', on); r(j.result); } } catch {} } })); };
await send('initialize', { protocolVersion:'2024-11-05', capabilities:{}, clientInfo:{name:'m',version:'1'} });
c.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
const r = await send('tools/list', {});
let chars = 0; for (const t of r.tools) chars += t.name.length + (t.description||'').length;
console.log('tools:', r.tools.length, 'chars:', chars, '~tokens:', Math.round(chars/3.5));
c.kill(); process.exit(0);
'@ | node --input-type=module
```

Measured output on this machine:

```
tools: 229 chars: 139502 ~tokens: 39858
```

## 2. REA cannot switch itself off

```console
$ rea mcp --help
Commands:
  add     Register as MCP server
  doctor  Validate MCP server startup and tool listing
```

`add` writes a line into a client's config. There is no `remove`, no `disable`,
no per-tool include list. REA's README does not mention disabling, toggling or
token budgets at all.

This is not laziness — an MCP server has no protocol operation for
"unregister me". Tools are created in response to the host's `tools/list`. The
host owns the lifecycle.

## 3. The host has no filter either

`@deepseek-ai/dsh-mcp-client@0.2.1-rc.3` config schema, verbatim from
`node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js`:

```js
transport, serverName, command, args, env, cwd,
toolCallTimeoutMs, failOnStartupError, maxInstructionBytes, reconnect
```

No `includeTools`, no `excludeTools`, no `toolFilter`. So "keep the 20 tools I
actually use" is not expressible at the adapter layer.

## 4. Therefore the only lever is the loader row

DeepSeek Harness composes its plugin tree from patches; a row can carry
`disabled: true` and simply not start. That is the single mechanism that makes
229 tools disappear from the prompt.

One key. One row. That is the entire plugin.

## 5. Why a GUI switch and not a CLI

Because the moment you want it is the moment you are *not* in a terminal — you
notice the cost while chatting about something unrelated, and stopping to edit
YAML and restart is exactly the friction that makes people leave a heavy plugin
on forever. One click, done.

## Scope discipline

The plugin deliberately does **not**:

- parse or import REA's code
- detect REA's version
- manage the REA install
- act as a tool filter (it cannot; see §3)
- count tokens at runtime

It reads one file, writes one key, and exposes two endpoints on loopback.
Anything more would be a different, larger, more fragile project.
