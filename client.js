window.__ModuleLoader__.load({
  id: 'dsh-rea-toggle',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useState } = React;

    const PREFIX = '/rea-toggle';

    /**
     * One chip, two states, one request.
     * States: loading (render nothing) | ready | error.
     * The chip inherits the host theme via color-mix-free solid tokens so it
     * stays legible on both light and dark surfaces.
     */
    function ReaToggleChip() {
      const [phase, setPhase] = useState('loading');
      const [enabled, setEnabled] = useState(null);
      const [error, setError] = useState(null);
      const [busy, setBusy] = useState(false);

      const load = useCallback(async () => {
        try {
          const res = await fetch(`${PREFIX}/status`, { headers: { accept: 'application/json' } });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || body.ok === false) {
            setError(body.error || `HTTP ${res.status}`);
            setPhase('error');
            return;
          }
          setEnabled(body.enabled === true);
          setError(null);
          setPhase('ready');
        } catch (e) {
          setError(String((e && e.message) || e));
          setPhase('error');
        }
      }, []);

      useEffect(() => { load(); }, [load]);

      const toggle = useCallback(async () => {
        if (busy || phase !== 'ready') return;
        setBusy(true);
        const next = !enabled;
        try {
          const res = await fetch(`${PREFIX}/set`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ enabled: next }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || body.ok === false) {
            setError(body.error || `HTTP ${res.status}`);
            setPhase('error');
          } else {
            setEnabled(body.enabled === true);
            setError(null);
            setPhase('ready');
          }
        } catch (e) {
          setError(String((e && e.message) || e));
          setPhase('error');
        } finally {
          setBusy(false);
        }
      }, [busy, enabled, phase]);

      if (phase === 'loading') return null;

      const failed = phase === 'error';
      const on = enabled === true;
      const label = failed ? 'REA ?' : on ? 'REA ON' : 'REA OFF';
      const color = failed ? '#c0392b' : on ? '#1f7a4d' : '#6b7280';
      const tip = failed
        ? `dsh-rea-toggle: ${error}`
        : on
          ? 'REA MCP is ON — every mcp__rea__* tool schema rides along on each request. Click to turn it off (takes effect on the next harness start).'
          : 'REA MCP is OFF — no mcp__rea__* tools are registered. Click to turn it on (takes effect on the next harness start).';

      return h('button', {
        type: 'button',
        onClick: toggle,
        disabled: busy || failed,
        title: tip,
        'aria-label': `REA MCP ${failed ? 'unknown' : on ? 'on' : 'off'}`,
        'aria-pressed': on,
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 26,
          padding: '0 10px',
          marginRight: 6,
          borderRadius: 13,
          border: `1px solid ${color}`,
          background: on ? 'rgba(31, 122, 77, 0.14)' : 'transparent',
          color,
          font: '600 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
          letterSpacing: 0.3,
          cursor: busy ? 'progress' : 'pointer',
          opacity: busy ? 0.55 : 1,
          transition: 'opacity 120ms ease, border-color 120ms ease, color 120ms ease',
        },
      },
        h('span', {
          'aria-hidden': true,
          style: { width: 6, height: 6, borderRadius: '50%', background: color, flex: '0 0 auto' },
        }),
        label,
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register({
            name: 'conversation.composer.dock',
            id: 'dsh-rea-toggle',
            order: 90,
          }, ReaToggleChip));
      },
    };
  },
});
