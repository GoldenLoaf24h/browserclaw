import { BaseWatchdog } from './base-watchdog';
import { cdpSessionManager, type CdpEventObserver } from '@/utils/cdp-session-manager';

export interface TabCrashEvent {
  tabId: number;
  reason: 'target_crashed' | 'navigation_error' | 'tab_removed';
  url?: string;
  errorDetails?: string;
  timestamp: number;
}

/**
 * Crash Watchdog
 * Decoupled observer for tab renderer crashes, navigation failures, and abnormal terminations.
 * Emits 'tab-crashed', 'navigation-error', 'tab-closed'.
 */
export class CrashWatchdog extends BaseWatchdog {
  public readonly name = 'crash';
  public readonly listensTo = [
    'Inspector.targetCrashed',
    'webNavigation.onErrorOccurred',
    'tabs.onRemoved',
  ];
  private cdpObserver: CdpEventObserver | null = null;
  private onNavErrorListener: ((details: any) => void) | null = null;
  private onTabRemovedListener: ((tabId: number) => void) | null = null;
  private crashedTabs = new Map<number, TabCrashEvent>();

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // 1. CDP Inspector.targetCrashed observer
    this.cdpObserver = (tabId: number, method: string, params: any) => {
      if (method === 'Inspector.targetCrashed') {
        const ev: TabCrashEvent = {
          tabId,
          reason: 'target_crashed',
          errorDetails: params?.errorDetails || 'Renderer process crashed',
          timestamp: Date.now(),
        };
        this.crashedTabs.set(tabId, ev);
        this.emit('tab-crashed', ev);
      }
    };
    cdpSessionManager.addCdpEventObserver(this.cdpObserver);

    // 2. Web Navigation onErrorOccurred
    if (typeof chrome !== 'undefined' && chrome.webNavigation?.onErrorOccurred) {
      this.onNavErrorListener = (details: any) => {
        if (details.frameId === 0) {
          const ev: TabCrashEvent = {
            tabId: details.tabId,
            reason: 'navigation_error',
            url: details.url,
            errorDetails: details.error,
            timestamp: Date.now(),
          };
          this.emit('navigation-error', ev);
        }
      };
      try {
        chrome.webNavigation.onErrorOccurred.addListener(this.onNavErrorListener);
      } catch {}
    }

    // 3. Tab removed tracking
    if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
      this.onTabRemovedListener = (tabId: number) => {
        this.crashedTabs.delete(tabId);
        this.emit('tab-closed', { tabId, timestamp: Date.now() });
      };
      try {
        chrome.tabs.onRemoved.addListener(this.onTabRemovedListener);
      } catch {}
    }
  }

  public stop(): void {
    if (!this.isRunning) return;
    if (this.cdpObserver) {
      cdpSessionManager.removeCdpEventObserver(this.cdpObserver);
      this.cdpObserver = null;
    }
    if (typeof chrome !== 'undefined') {
      if (this.onNavErrorListener && chrome.webNavigation?.onErrorOccurred) {
        try {
          chrome.webNavigation.onErrorOccurred.removeListener(this.onNavErrorListener);
        } catch {}
        this.onNavErrorListener = null;
      }
      if (this.onTabRemovedListener && chrome.tabs?.onRemoved) {
        try {
          chrome.tabs.onRemoved.removeListener(this.onTabRemovedListener);
        } catch {}
        this.onTabRemovedListener = null;
      }
    }
    this.crashedTabs.clear();
    this.isRunning = false;
  }

  public isTabCrashed(tabId: number): boolean {
    return this.crashedTabs.has(tabId);
  }

  public getCrashedTabs(): TabCrashEvent[] {
    return Array.from(this.crashedTabs.values());
  }
}

export const crashWatchdog = new CrashWatchdog();
