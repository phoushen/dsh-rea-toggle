# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-10-27

### Added

- Web GUI switch (`REA ON` / `REA OFF` / `REA ?`) in the `conversation.composer.dock` slot.
- Host half with two same-origin endpoints:
  - `GET  /rea-toggle/status` — reads the flag without modifying anything
  - `POST /rea-toggle/set` — flips `disabled` on the target row
- `config.targetId` (default `rea-mcp`) so any MCP client row can be the target.
- `config.routePrefix` (default `/rea-toggle`) for multi-server setups.
- Cross-origin write rejection: `POST` with a mismatched `Origin`/`Host` returns 403.
- 64 KiB request-body cap.
- Inline error state: the chip turns red with the actual failure message on hover.

### Notes

- The flag is written immediately; the registered tool set changes on the next
  harness start. This is a property of how MCP tools are registered, not a
  limitation of the switch.
- Only `disabled` on the target row is written. No other line in
  `cordis.patch.yml` is touched, and nothing outside that file is written at all.

### Verified against

| Component | Version |
|---|---|
| DeepSeek Harness | 0.2.1-rc.3 (desktop, Windows x64) |
| `rea-agents` | 6.8.0 |
| `@deepseek-ai/dsh-mcp-client` | 0.2.1-rc.3 |
| Node.js | 24.16.0 |

Measured REA tool surface at `rea-agents@6.8.0`: 229 tools, 139,502 characters of
`name` + `description`, ≈ 40,000 tokens by a `chars ÷ 3.5` estimate.

[1.0.0]: https://github.com/phoushen/dsh-rea-toggle/releases/tag/v1.0.0
