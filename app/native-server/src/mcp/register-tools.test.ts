import { describe, expect, it, beforeEach } from '@jest/globals';
import {
  AgentUpdateNotifier,
  formatAgentUpdateNotice,
  MemoryVersionCacheStorage,
} from 'chrome-mcp-shared';

describe('AgentUpdateNotifier - Strict Single-Turn Update Prompt Enforcement', () => {
  let notifier: AgentUpdateNotifier;
  let storage: MemoryVersionCacheStorage;

  beforeEach(() => {
    notifier = new AgentUpdateNotifier();
    storage = new MemoryVersionCacheStorage();
  });

  it('attaches update notice strictly on the first MCP call when an update exists', async () => {
    const now = Date.now();
    storage.set({
      latestVersion: '2.10.0',
      releaseUrl: 'https://github.com/GoldenLoaf24h/browserclaw/releases/tag/v2.10.0',
      lastChecked: now,
      expiresAt: now + 3600_000,
    });

    // 1st tool call: must receive notice
    const notice1 = await notifier.maybeGetFirstCallNotice({
      currentVersion: '2.9.3',
      storage,
    });

    expect(notice1).not.toBeNull();
    expect(notice1).toContain('System Notice: A new version of BrowserClaw is available');
    expect(notice1).toContain('v2.10.0');
    expect(notice1).toContain('https://github.com/GoldenLoaf24h/browserclaw/releases/tag/v2.10.0');

    // 2nd tool call: strictly forbidden from appearing again! Must return null!
    const notice2 = await notifier.maybeGetFirstCallNotice({
      currentVersion: '2.9.3',
      storage,
    });
    expect(notice2).toBeNull();

    // 3rd tool call: strictly null
    const notice3 = await notifier.maybeGetFirstCallNotice({
      currentVersion: '2.9.3',
      storage,
    });
    expect(notice3).toBeNull();
  });

  it('returns null and does not prompt if current version is up to date', async () => {
    const now = Date.now();
    storage.set({
      latestVersion: '2.9.3',
      releaseUrl: 'https://github.com/GoldenLoaf24h/browserclaw/releases/tag/v2.9.3',
      lastChecked: now,
      expiresAt: now + 3600_000,
    });

    // 1st call: up to date -> null
    const notice1 = await notifier.maybeGetFirstCallNotice({
      currentVersion: '2.9.3',
      storage,
    });
    expect(notice1).toBeNull();

    // 2nd call: still null
    const notice2 = await notifier.maybeGetFirstCallNotice({
      currentVersion: '2.9.3',
      storage,
    });
    expect(notice2).toBeNull();
  });

  it('guarantees zero false-positives when remote version check fails or is malformed', async () => {
    const now = Date.now();
    storage.set({
      latestVersion: 'not-a-valid-version',
      releaseUrl: 'https://github.com/GoldenLoaf24h/browserclaw/releases',
      lastChecked: now,
      expiresAt: now + 3600_000,
    });

    const notice = await notifier.maybeGetFirstCallNotice({
      currentVersion: '2.9.3',
      storage,
    });

    expect(notice).toBeNull();
  });

  it('formatAgentUpdateNotice formats a clean, informative system prompt', () => {
    const formatted = formatAgentUpdateNotice('2.11.0', 'https://github.com/GoldenLoaf24h/browserclaw/releases/latest');
    expect(formatted).toBe(
      '[System Notice: A new version of BrowserClaw is available (v2.11.0). It is recommended to update to the latest release for new features and improvements: https://github.com/GoldenLoaf24h/browserclaw/releases/latest]',
    );
  });
});
