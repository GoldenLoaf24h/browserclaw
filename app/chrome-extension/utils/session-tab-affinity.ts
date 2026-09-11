/**
 * Session Tab Affinity Manager
 * Binds client MCP sessions to dedicated Chrome tabs to prevent concurrent agents
 * from hijacking each other's active tabs when tabId is omitted.
 */
const STORAGE_KEY = 'session_tab_affinity_map';

export class SessionTabAffinityManager {
  private affinityMap = new Map<string, number>();

  constructor() {
    this.initListeners();
    void this.loadFromStorage();
  }

  private async loadFromStorage(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session?.get) {
        const data = await chrome.storage.session.get(STORAGE_KEY);
        if (data && data[STORAGE_KEY] && typeof data[STORAGE_KEY] === 'object') {
          for (const [k, v] of Object.entries(data[STORAGE_KEY])) {
            if (typeof v === 'number' && !this.affinityMap.has(k)) {
              this.affinityMap.set(k, v);
            }
          }
        }
      }
    } catch {
      // Ignored in non-extension environments (unit tests)
    }
  }

  private async saveToStorage(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session?.set) {
        const obj: Record<string, number> = {};
        for (const [k, v] of this.affinityMap.entries()) {
          obj[k] = v;
        }
        await chrome.storage.session.set({ [STORAGE_KEY]: obj });
      }
    } catch {
      // Ignored in non-extension environments
    }
  }

  private initListeners() {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
        chrome.tabs.onRemoved.addListener((removedTabId: number) => {
          let modified = false;
          for (const [sessionId, boundTabId] of this.affinityMap.entries()) {
            if (boundTabId === removedTabId) {
              this.affinityMap.delete(sessionId);
              modified = true;
            }
          }
          if (modified) {
            void this.saveToStorage();
          }
        });
      }
    } catch {
      // Ignored in non-extension environments (unit tests)
    }
  }

  public setAffinity(sessionId: string, tabId: number): void {
    if (!sessionId || typeof tabId !== 'number') return;
    this.affinityMap.set(sessionId, tabId);
    void this.saveToStorage();
  }

  public getAffinity(sessionId: string): number | undefined {
    if (!sessionId) return undefined;
    return this.affinityMap.get(sessionId);
  }

  /**
   * Synchronous binding existence check for pre-resolution warning logic.
   * resolveAffinityTab's active-tab fallback BINDS the fallback tab as a side
   * effect, so a post-resolution binding check cannot distinguish "agent
   * bound earlier" from "fallback just bound it" — the warning would never
   * fire. Callers must snapshot BEFORE resolveAffinityTab.
   */
  public hasBinding(sessionId?: string): boolean {
    if (!sessionId) return false;
    return this.affinityMap.has(sessionId);
  }

  public removeAffinity(sessionId: string): void {
    if (!sessionId) return;
    this.affinityMap.delete(sessionId);
    void this.saveToStorage();
  }

  public clearAll(): void {
    this.affinityMap.clear();
    void this.saveToStorage();
  }

  public getMapSize(): number {
    return this.affinityMap.size;
  }

  /**
   * Resolve an existing Chrome tab bound to sessionId.
   * If the tab was closed or does not exist, deletes the affinity mapping and returns null.
   */
  public async resolveSessionTab(sessionId?: string): Promise<chrome.tabs.Tab | null> {
    if (!sessionId) return null;
    if (!this.affinityMap.has(sessionId)) {
      await this.loadFromStorage();
    }
    const tabId = this.affinityMap.get(sessionId);
    if (typeof tabId !== 'number') return null;

    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab && tab.id) {
        return tab;
      }
      this.affinityMap.delete(sessionId);
      void this.saveToStorage();
    } catch {
      this.affinityMap.delete(sessionId);
      void this.saveToStorage();
    }
    return null;
  }
}

export const sessionTabAffinity = new SessionTabAffinityManager();
