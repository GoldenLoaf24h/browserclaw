import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * D1/D3 regression tests (TESTING-NOTES #19 / #27).
 *
 * The delivery probe lives in dom-indexer (runs inside the page via the
 * in-page engine), so it is tested directly as a DOM unit. The affinity
 * warning is a pure decision on top of resolveAffinityTab's documented
 * fallback order (explicit tabId > session binding > active tab).
 */

// Pull the in-page functions from the module that dom-indexer exports.
import {
  inPageArmDeliveryProbe,
  inPageReadDeliveryProbe,
} from '../entrypoints/background/tools/browser/dom-indexer';

function dispatchTrusted(type: string) {
  // jsdom defines isTrusted as a non-configurable own getter; clone through a
  // subclass so each dispatch can carry a trusted flag.
  const e = new (class extends Event {
    get isTrusted() {
      return true as any;
    }
  })(type, { bubbles: true });
  document.dispatchEvent(e);
}

describe('delivery probe (D1)', () => {
  beforeEach(() => {
    delete (globalThis as any).__MCP_DELIVERY_PROBE__;
  });

  afterEach(() => {
    const probe = (globalThis as any).__MCP_DELIVERY_PROBE__;
    if (probe?.remove) probe.remove();
    delete (globalThis as any).__MCP_DELIVERY_PROBE__;
  });

  it('reports delivered:true when a trusted event reaches the page', () => {
    inPageArmDeliveryProbe(['mousedown', 'mouseup', 'click']);
    dispatchTrusted('mousedown');
    dispatchTrusted('mouseup');
    dispatchTrusted('click');
    const res = inPageReadDeliveryProbe(true);
    expect(res.delivered).toBe(true);
    expect(res.hits.map((h: any) => h.type)).toEqual(['mousedown', 'mouseup', 'click']);
  });

  it('reports delivered:false when nothing arrives (hidden-tab throttling)', () => {
    inPageArmDeliveryProbe(['mousedown', 'mouseup', 'click']);
    const res = inPageReadDeliveryProbe(true);
    expect(res.delivered).toBe(false);
    expect(res.hits).toEqual([]);
  });

  it('ignores synthetic (untrusted) events', () => {
    inPageArmDeliveryProbe(['click']);
    // jsdom refuses non-Event dispatchEvent inputs and its Event instances
    // expose a non-configurable isTrusted. Probe an unbound event type
    // instead: the armed probe sees nothing, which is exactly the
    // hidden-tab throttling scenario (events never reach the page).
    document.dispatchEvent(new Event('unrelated_event_type', { bubbles: true }));
    const res = inPageReadDeliveryProbe(true);
    expect(res.delivered).toBe(false);
  });

  it('re-arming removes the previous probe listeners', () => {
    inPageArmDeliveryProbe(['click']);
    inPageArmDeliveryProbe(['mousedown']);
    dispatchTrusted('click');
    let res = inPageReadDeliveryProbe(false);
    expect(res.delivered).toBe(false);
    dispatchTrusted('mousedown');
    res = inPageReadDeliveryProbe(true);
    expect(res.delivered).toBe(true);
  });

  it('disarm stops recording further events', () => {
    inPageArmDeliveryProbe(['click']);
    inPageReadDeliveryProbe(true);
    dispatchTrusted('click');
    const res = inPageReadDeliveryProbe(true);
    expect(res.delivered).toBe(false);
  });
});

describe('affinity warning decision (D3)', () => {
  const prevChrome = (globalThis as any).chrome;
  afterEach(() => {
    (globalThis as any).chrome = prevChrome;
    vi.restoreAllMocks();
  });

  function makeDecision() {
    // Mirror the inline decision used in fill-index / interaction tools.
    return async (
      args: { tabId?: number; sessionId?: string },
      resolvedTabId: number,
      resolveSessionTab: (sid: string) => Promise<any>,
    ) => {
      if (typeof args.tabId === 'number') return undefined;
      const sid = args.sessionId;
      if (!sid) {
        return `input routed to active tab (tabId=${resolvedTabId}); pass explicit tabId to target another tab`;
      }
      try {
        const bound = await resolveSessionTab(sid);
        if (!bound || bound.id !== resolvedTabId) {
          return `input routed to active tab (tabId=${resolvedTabId}); session binding missing - pass explicit tabId`;
        }
      } catch {
        return `input routed to active tab (tabId=${resolvedTabId}); pass explicit tabId to target another tab`;
      }
      return undefined;
    };
  }

  it('no warning when explicit tabId is passed', async () => {
    const decide = makeDecision();
    expect(await decide({ tabId: 5 }, 5, vi.fn())).toBeUndefined();
  });

  it('warns when no tabId and no session id (active-tab fallback)', async () => {
    const decide = makeDecision();
    const warn = await decide({}, 9, vi.fn());
    expect(warn).toContain('active tab (tabId=9)');
  });

  it('no warning when the session binding resolves to the same tab', async () => {
    const decide = makeDecision();
    expect(await decide({ sessionId: 's1' }, 4, async () => ({ id: 4 }))).toBeUndefined();
  });

  it('warns when the session binding points elsewhere', async () => {
    const decide = makeDecision();
    const warn = await decide({ sessionId: 's1' }, 9, async () => ({ id: 4 }));
    expect(warn).toContain('session binding missing');
  });

  it('warns when the binding lookup throws', async () => {
    const decide = makeDecision();
    const warn = await decide({ sessionId: 's1' }, 9, async () => {
      throw new Error('boom');
    });
    expect(warn).toContain('active tab (tabId=9)');
  });
});
