/**
 * BrowserClaw Tab Favicon State Manager
 *
 * Implements 1:1 parity with OpenAI/ChatGPT extension tab state signaling:
 * - When an Agent starts automating a tab, replace its Favicon with a glowing blue dot.
 * - Caches the original favicon URL before replacement.
 * - When automation ends or tab is released/closed, restores the original favicon cleanly.
 */

export const AGENT_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#339cff" stop-opacity="1"/>
      <stop offset="60%" stop-color="#339cff" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#0066ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="16" cy="16" r="14" fill="url(#halo)"/>
  <circle cx="16" cy="16" r="8" fill="#339cff"/>
  <circle cx="16" cy="16" r="4" fill="#ffffff"/>
</svg>`;

export const AGENT_FAVICON_DATA_URL =
  'data:image/svg+xml;utf8,' + encodeURIComponent(AGENT_FAVICON_SVG);

export class TabFaviconManager {
  private static instance: TabFaviconManager | null = null;
  // Map of tabId -> original favicon URL (or null if the page had no favicon)
  private originalFavicons: Map<number, string | null> = new Map();
  private listenersRegistered = false;
  private static readonly STORAGE_KEY = 'tab_favicon_manager_original_favicons';

  public static getInstance(): TabFaviconManager {
    if (!TabFaviconManager.instance) {
      TabFaviconManager.instance = new TabFaviconManager();
    }
    return TabFaviconManager.instance;
  }

  private idleTimers: Map<number, any> = new Map();

  constructor() {
    this.registerEventListeners();
    void this.loadFromStorage();
  }

  private async loadFromStorage(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session?.get) {
        const data = await chrome.storage.session.get(TabFaviconManager.STORAGE_KEY);
        if (
          data &&
          data[TabFaviconManager.STORAGE_KEY] &&
          typeof data[TabFaviconManager.STORAGE_KEY] === 'object'
        ) {
          for (const [tidStr, val] of Object.entries(data[TabFaviconManager.STORAGE_KEY])) {
            const tid = parseInt(tidStr, 10);
            if (!isNaN(tid) && !this.originalFavicons.has(tid)) {
              this.originalFavicons.set(tid, (val as string | null) ?? null);
            }
          }
        }
      }
    } catch {}
  }

  private async saveToStorage(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session?.set) {
        const obj: Record<string, string | null> = {};
        for (const [tid, val] of this.originalFavicons.entries()) {
          obj[String(tid)] = val;
        }
        await chrome.storage.session.set({ [TabFaviconManager.STORAGE_KEY]: obj });
      }
    } catch {}
  }

  public registerEventListeners(): void {
    if (this.listenersRegistered) return;
    this.listenersRegistered = true;

    if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
      chrome.tabs.onRemoved.addListener((tabId) => {
        this.originalFavicons.delete(tabId);
        void this.saveToStorage();
      });
    }
  }

  /**
   * Replaces the tab favicon with the glowing agent indicator
   */
  public async setAgentFavicon(tabId: number): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.scripting?.executeScript) {
      return false;
    }

    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
        return false;
      }

      // If already recorded, do not overwrite original favicon
      if (!this.originalFavicons.has(tabId)) {
        this.originalFavicons.set(tabId, tab.favIconUrl ?? null);
        void this.saveToStorage();
      }

      const agentDataUrl = AGENT_FAVICON_DATA_URL;

      await chrome.scripting.executeScript({
        target: { tabId },
        func: (dataUrl: string) => {
          try {
            let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
            if (!link) {
              link = document.createElement('link');
              link.rel = 'icon';
              link.setAttribute('data-browserclaw-injected', 'true');
              document.head.appendChild(link);
            }
            link.href = dataUrl;
          } catch {}
        },
        args: [agentDataUrl],
      });

      return true;
    } catch (error) {
      // Script injection might fail on restricted or unloading tabs; fail silently
      return false;
    }
  }

  /**
   * Restores the tab's original favicon
   */
  public async restoreFavicon(tabId: number): Promise<boolean> {
    const timer = this.idleTimers.get(tabId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(tabId);
    }
    if (typeof chrome === 'undefined' || !chrome.scripting?.executeScript) {
      this.originalFavicons.delete(tabId);
      return false;
    }

    const origUrl = this.originalFavicons.get(tabId);
    this.originalFavicons.delete(tabId);
    void this.saveToStorage();

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (originalHref: string | null) => {
          try {
            const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
            if (link) {
              if (link.getAttribute('data-browserclaw-injected') === 'true' && !originalHref) {
                link.remove();
              } else if (originalHref) {
                link.href = originalHref;
              }
            }
          } catch {}
        },
        args: [origUrl ?? null],
      });
      return true;
    } catch {
      return false;
    }
  }

  public getOriginalFavicon(tabId: number): string | null | undefined {
    return this.originalFavicons.get(tabId);
  }

  /**
   * Marks a tab active under Agent automation:
   * Replaces favicon with the glowing agent indicator and resets the idle auto-restore timer.
   */
  public markTabActive(tabId: number, idleRestoreMs = 8000): void {
    if (typeof tabId !== 'number' || tabId <= 0) return;
    void this.setAgentFavicon(tabId);
    const existing = this.idleTimers.get(tabId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.idleTimers.delete(tabId);
      void this.restoreFavicon(tabId);
    }, idleRestoreMs);
    this.idleTimers.set(tabId, timer);
  }

  public resetForTest(): void {
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();
    this.originalFavicons.clear();
  }
}

export const tabFaviconManager = TabFaviconManager.getInstance();
