export interface CachedSnapshot {
  snapshotId: string;
  tabId: number;
  url: string;
  timestamp: number;
  elementCount: number;
  valid: boolean;
  invalidationReason?: string;
}

export class SnapshotCacheManager {
  private cache = new Map<number, CachedSnapshot>();

  constructor() {
    this.setupListeners();
  }

  private setupListeners(): void {
    if (typeof chrome === 'undefined') return;

    try {
      if (chrome.tabs?.onRemoved?.addListener) {
        chrome.tabs.onRemoved.addListener((tabId: number) => {
          this.cache.delete(tabId);
        });
      }

      if (chrome.tabs?.onUpdated?.addListener) {
        chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: { url?: string; status?: string }) => {
          if (changeInfo.url || changeInfo.status === 'loading') {
            this.invalidate(tabId, `Tab navigation or reload detected (${changeInfo.url || 'loading'})`);
          }
        });
      }

      if (chrome.webNavigation?.onBeforeNavigate?.addListener) {
        chrome.webNavigation.onBeforeNavigate.addListener((details: { tabId: number; frameId: number }) => {
          if (details.frameId === 0) {
            this.invalidate(details.tabId, 'Main frame navigation initiated');
          }
        });
      }
    } catch {
      // Ignore in non-extension environments (e.g. unit tests)
    }
  }

  public setSnapshot(tabId: number, data: { url: string; elementCount: number }): CachedSnapshot {
    const snapshot: CachedSnapshot = {
      snapshotId: `snap-${tabId}-${Date.now()}`,
      tabId,
      url: data.url,
      timestamp: Date.now(),
      elementCount: data.elementCount,
      valid: true,
    };
    this.cache.set(tabId, snapshot);
    return snapshot;
  }

  public getSnapshot(tabId: number): CachedSnapshot | undefined {
    return this.cache.get(tabId);
  }

  public isSnapshotValid(tabId: number): boolean {
    const s = this.cache.get(tabId);
    return s !== undefined && s.valid === true;
  }

  public invalidate(tabId: number, reason = 'DOM or URL mutated'): void {
    const s = this.cache.get(tabId);
    if (s) {
      s.valid = false;
      s.invalidationReason = reason;
    }
  }

  public getInvalidationMessage(tabId: number): string {
    const s = this.cache.get(tabId);
    const reason = s?.invalidationReason ? ` (${s.invalidationReason})` : '';
    return `Snapshot refs invalidated: DOM or URL changed since last chrome_read_dom${reason}. ACTION REQUIRED: Please call 'chrome_read_dom' to refresh the index tree before re-attempting interaction.`;
  }

  public clear(tabId?: number): void {
    if (typeof tabId === 'number') {
      this.cache.delete(tabId);
    } else {
      this.cache.clear();
    }
  }
}

export const snapshotCacheManager = new SnapshotCacheManager();
