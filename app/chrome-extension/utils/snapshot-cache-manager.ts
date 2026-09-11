export interface ElementFingerprint {
  tagName: string;
  text?: string;
  role?: string;
  isInteractive: boolean;
  value?: string;
}

export interface CachedSnapshot {
  snapshotId: string;
  tabId: number;
  url: string;
  timestamp: number;
  elementCount: number;
  revision: number;
  valid: boolean;
  invalidationReason?: string;
  fingerprints?: Map<number, ElementFingerprint>;
}

export interface DomDiffResult {
  isDelta: boolean;
  unchanged: boolean;
  revision: number;
  added: any[];
  modified: any[];
  removed: number[];
  totalCurrent: number;
}

export class SnapshotCacheManager {
  private cache = new Map<number, CachedSnapshot>();
  private tabRevisions = new Map<number, number>();

  constructor() {
    this.setupListeners();
  }

  private setupListeners(): void {
    if (typeof chrome === 'undefined') return;

    try {
      if (chrome.tabs?.onRemoved?.addListener) {
        chrome.tabs.onRemoved.addListener((tabId: number) => {
          this.cache.delete(tabId);
          this.tabRevisions.delete(tabId);
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

  public setSnapshot(
    tabId: number,
    data: { url: string; elementCount: number; elements?: any[] },
  ): CachedSnapshot {
    const currentRev = (this.tabRevisions.get(tabId) ?? 0) + 1;
    this.tabRevisions.set(tabId, currentRev);

    const fingerprints = new Map<number, ElementFingerprint>();
    if (Array.isArray(data.elements)) {
      for (const el of data.elements) {
        if (typeof el.index === 'number') {
          fingerprints.set(el.index, {
            tagName: el.tagName || '',
            text: el.text || '',
            role: el.role || '',
            isInteractive: Boolean(el.isInteractive),
            value: el.value || '',
          });
        }
      }
    }

    const snapshot: CachedSnapshot = {
      snapshotId: `snap-${tabId}-${Date.now()}`,
      tabId,
      url: data.url,
      timestamp: Date.now(),
      elementCount: data.elementCount,
      revision: currentRev,
      valid: true,
      fingerprints,
    };
    this.cache.set(tabId, snapshot);
    return snapshot;
  }

  public diffWithPrevious(tabId: number, currentElements: any[]): DomDiffResult {
    const prev = this.cache.get(tabId);
    const currentRev = (this.tabRevisions.get(tabId) ?? 0) + 1;

    if (!prev || !prev.valid || !prev.fingerprints || prev.fingerprints.size === 0) {
      // First snapshot on this page or invalidated, no prior baseline to diff
      return {
        isDelta: false,
        unchanged: false,
        revision: currentRev,
        added: currentElements,
        modified: [],
        removed: [],
        totalCurrent: currentElements.length,
      };
    }

    const oldMap = prev.fingerprints;
    const currentIndices = new Set<number>();
    const added: any[] = [];
    const modified: any[] = [];

    for (const el of currentElements) {
      const idx = el.index;
      currentIndices.add(idx);
      const old = oldMap.get(idx);

      if (!old) {
        added.push(el);
      } else {
        const textChanged = (el.text || '') !== (old.text || '');
        const roleChanged = (el.role || '') !== (old.role || '');
        const interactiveChanged = Boolean(el.isInteractive) !== old.isInteractive;
        const valChanged = (el.value || '') !== (old.value || '');

        if (textChanged || roleChanged || interactiveChanged || valChanged) {
          modified.push({
            ...el,
            diffHints: {
              oldText: textChanged ? old.text : undefined,
              oldValue: valChanged ? old.value : undefined,
            },
          });
        }
      }
    }

    const removed: number[] = [];
    for (const oldIdx of Array.from(oldMap.keys())) {
      if (!currentIndices.has(oldIdx)) {
        removed.push(oldIdx);
      }
    }

    const unchanged = added.length === 0 && modified.length === 0 && removed.length === 0;

    return {
      isDelta: true,
      unchanged,
      revision: currentRev,
      added,
      modified,
      removed,
      totalCurrent: currentElements.length,
    };
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
      this.tabRevisions.delete(tabId);
    } else {
      this.cache.clear();
      this.tabRevisions.clear();
    }
  }
}

export const snapshotCacheManager = new SnapshotCacheManager();
