/**
 * dsh-rea-toggle — host half.
 *
 * Why this plugin exists: an MCP server cannot unregister itself. REA ships
 * `rea mcp add` (write a config line) and nothing else — no remove, no disable,
 * no tool filter — and `@deepseek-ai/dsh-mcp-client` has no tool-inclusion
 * field either. So the only place a REA on/off switch can live is the host's
 * own loader patch. This plugin owns exactly that one flag.
 *
 * It touches one key: `disabled` on the row whose `id` matches `targetId`
 * (default `rea-mcp`) inside `<DSH_HOME>/profiles/<profile>/cordis.patch.yml`.
 * No other line, file, or plugin setting is read for writing.
 *
 * Surface: two same-origin endpoints for the client switch.
 *   GET  /rea-toggle/status  -> { ok, enabled, disabled, path, rowLine }
 *   POST /rea-toggle/set     -> { ok, enabled, disabled, path }  body { enabled: boolean }
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const name = 'dsh-rea-toggle';
export const inject = ['webServer'];

const DEFAULTS = {
  /** Row id in cordis.patch.yml whose `disabled` flag this plugin flips. */
  targetId: 'rea-mcp',
  /** Endpoint prefix. Change it if it collides with something else. */
  routePrefix: '/rea-toggle',
};

function dshHome() {
  const fromEnv = process.env.DSH_HOME;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  return path.join(os.homedir(), '.dsh');
}

function profileName() {
  const fromEnv = process.env.DSH_PROFILE;
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : 'desktop';
}

function patchFile() {
  return path.join(dshHome(), 'profiles', profileName(), 'cordis.patch.yml');
}

function readLines(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/);
}

/**
 * Find the target row and its `disabled` line, if any.
 * A row is a denser-indented block that starts at `- id: <target>` and ends at
 * the next `- id:` at the same or shallower indent.
 */
function locateRow(lines, targetId) {
  const escaped = targetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rowRe = new RegExp('^(\\s*)-\\s*id:\\s*' + escaped + '\\s*$');
  let idx = -1;
  let indent = '';
  for (let i = 0; i < lines.length; i += 1) {
    const m = rowRe.exec(lines[i]);
    if (m) { idx = i; indent = m[1]; break; }
  }
  if (idx < 0) return { idx: -1, dis: -1, indent: '' };

  let dis = -1;
  for (let j = idx + 1; j < lines.length; j += 1) {
    const line = lines[j];
    if (/^\s*-\s*id:/.test(line)) break;
    if (/^\s*(?:-\s*)?disabled:\s*(?:true|false)\s*$/.test(line)) { dis = j; break; }
  }
  return { idx, dis, indent };
}

function status(targetId) {
  const file = patchFile();
  if (!fs.existsSync(file)) {
    return { ok: false, error: 'cordis.patch.yml not found', path: file };
  }
  let lines;
  try {
    lines = readLines(file);
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), path: file };
  }
  const { idx, dis } = locateRow(lines, targetId);
  if (idx < 0) {
    return { ok: false, error: `row "${targetId}" not found`, path: file };
  }
  const disabled = dis >= 0 && /true/.test(lines[dis]);
  return { ok: true, path: file, rowLine: idx + 1, disabled, enabled: !disabled };
}

function setEnabled(targetId, enabled) {
  const file = patchFile();
  if (!fs.existsSync(file)) {
    return { ok: false, error: 'cordis.patch.yml not found', path: file };
  }
  const lines = readLines(file);
  const { idx, dis, indent } = locateRow(lines, targetId);
  if (idx < 0) {
    return { ok: false, error: `row "${targetId}" not found`, path: file };
  }

  const want = enabled ? 'false' : 'true';
  if (dis >= 0) {
    const lead = /^(\s*(?:-\s*)?)/.exec(lines[dis])[1];
    lines[dis] = `${lead}disabled: ${want}`;
  } else {
    // Insert directly under the row id, matching the row's own indentation.
    const childIndent = `${indent}  `;
    lines.splice(idx + 1, 0, `${childIndent}disabled: ${want}`);
  }

  try {
    fs.writeFileSync(file, lines.join('\n'), 'utf8');
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), path: file };
  }

  const after = status(targetId);
  return {
    ok: after.ok === true,
    path: file,
    enabled: after.enabled === true,
    disabled: after.disabled === true,
    restartRequired: true,
  };
}

function sendJson(response, code, body) {
  response.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function noContent(response) {
  response.writeHead(204, { 'cache-control': 'no-store' });
  response.end();
}

/** Reject cross-origin writes: the switch only answers the page that served it. */
function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === (request.headers.host || '');
  } catch {
    return false;
  }
}

async function readBody(request, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > limit) throw new Error('request body too large');
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

export function apply(ctx, config) {
  const cfg = { ...DEFAULTS, ...(config || {}) };
  const targetId = String(cfg.targetId || DEFAULTS.targetId);
  const prefix = String(cfg.routePrefix || DEFAULTS.routePrefix).replace(/\/+$/, '');

  ctx.inject(['webServer'], (host) => {
    host.effect(() => {
      const disposers = [];

      disposers.push(host.webServer.register({
        kind: 'exact',
        path: `${prefix}/status`,
        handler: async (request, response) => {
          if (request.method === 'OPTIONS') return noContent(response);
          if (request.method !== 'GET') return sendJson(response, 405, { ok: false, error: 'GET only' });
          if (!sameOrigin(request)) return sendJson(response, 403, { ok: false, error: 'cross-origin blocked' });
          try {
            return sendJson(response, 200, status(targetId));
          } catch (e) {
            return sendJson(response, 500, { ok: false, error: String((e && e.message) || e) });
          }
        },
      }, 'rea-toggle-status'));

      disposers.push(host.webServer.register({
        kind: 'exact',
        path: `${prefix}/set`,
        handler: async (request, response) => {
          if (request.method === 'OPTIONS') return noContent(response);
          if (request.method !== 'POST') return sendJson(response, 405, { ok: false, error: 'POST only' });
          if (!sameOrigin(request)) return sendJson(response, 403, { ok: false, error: 'cross-origin blocked' });
          try {
            const body = await readBody(request);
            if (typeof body.enabled !== 'boolean') {
              return sendJson(response, 400, { ok: false, error: 'enabled (boolean) required' });
            }
            return sendJson(response, 200, setEnabled(targetId, body.enabled));
          } catch (e) {
            return sendJson(response, 500, { ok: false, error: String((e && e.message) || e) });
          }
        },
      }, 'rea-toggle-set'));

      return () => {
        for (const dispose of disposers.reverse()) {
          try { if (typeof dispose === 'function') dispose(); } catch { /* ignore */ }
        }
      };
    });
  });
}
