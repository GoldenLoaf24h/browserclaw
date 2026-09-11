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

  public static getInstance(): TabFaviconManager {
    if (!TabFaviconManager.instance) {
      TabFaviconManager.instance = new TabFaviconManager();
    }
    return TabFaviconManager.instance;
  }

  constructor() {
    this.registerEventListeners();
  }

  public registerEventListeners(): void {
    if (this.listenersRegistered) return;
    this.listenersRegistered = true;

    if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
      chrome.tabs.onRemoved.addListener((tabId) => {
        this.originalFavicons.delete(tabId);
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
    if (typeof chrome === 'undefined' || !chrome.scripting?.executeScript) {
      this.originalFavicons.delete(tabId);
      return false;
    }

    const origUrl = this.originalFavicons.get(tabId);
    this.originalFavicons.delete(tabId);

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

  public resetForTest(): void {
    this.originalFavicons.clear();
  }
}

export const tabFaviconManager = TabFaviconManager.getInstance();
