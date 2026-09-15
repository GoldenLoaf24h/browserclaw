/**
 * BrowserClaw Agent Tab Group Lifecycle Manager
 *
 * Implements 1:1 parity with industrial-grade Chrome Tab Grouping:
 * 1. Automatic grouping: places Agent tabs into a dedicated colored tab group.
 * 2. Adaptive naming: default title is "Agent", customizable by the agent to reflect the current task.
 * 3. Zero-orphan cleanup: strictly guarantees that when tabs are closed or tasks complete,
 *    the tab group is completely removed and never left as a ghost/empty group.
 */

export type TabGroupColor =
  'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';

export interface EnsureAgentGroupOptions {
  title?: string;
  color?: TabGroupColor;
  windowId?: number;
}

export class TabGroupManager {
  private static instance: TabGroupManager | null = null;
  public static readonly DEFAULT_TITLE = 'Agent';
  public static readonly DEFAULT_COLOR: TabGroupColor = 'blue';

  private managedGroupIds: Set<number> = new Set<number>();
  private listenersRegistered = false;
  private static readonly STORAGE_KEY = 'tab_group_manager_managed_groups';

  public static getInstance(): TabGroupManager {
    if (!TabGroupManager.instance) {
      TabGroupManager.instance = new TabGroupManager();
    }
    return TabGroupManager.instance;
  }

  constructor() {
    this.registerEventListeners();
    void this.loadFromStorage();
  }

  private async loadFromStorage(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session?.get) {
        const data = await chrome.storage.session.get(TabGroupManager.STORAGE_KEY);
        if (data && Array.isArray(data[TabGroupManager.STORAGE_KEY])) {
          for (const gid of data[TabGroupManager.STORAGE_KEY]) {
            if (typeof gid === 'number') {
              this.managedGroupIds.add(gid);
            }
          }
        }
      }
    } catch {}
  }

  private async saveToStorage(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session?.set) {
        await chrome.storage.session.set({
          [TabGroupManager.STORAGE_KEY]: Array.from(this.managedGroupIds),
        });
      }
    } catch {}
  }

  public registerEventListeners(): void {
    if (this.listenersRegistered) return;
    this.listenersRegistered = true;

    // Listen to tab removal to aggressively clean up empty or orphan groups
    if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
      chrome.tabs.onRemoved.addListener((_tabId, _removeInfo) => {
        // Debounce slightly to allow Chrome to update tab group states
        setTimeout(() => {
          this.cleanupEmptyOrOrphanGroups().catch(() => {});
        }, 80);
      });
    }

    // Listen to group removal
    if (typeof chrome !== 'undefined' && chrome.tabGroups?.onRemoved) {
      chrome.tabGroups.onRemoved.addListener((group) => {
        if (group && typeof group.id === 'number') {
          this.managedGroupIds.delete(group.id);
          void this.saveToStorage();
        }
      });
    }
  }

  /**
   * Ensure a tab is added to the active Agent tab group in its window.
   * If an active managed group already exists in the target window, reuse it;
   * otherwise, create a new managed group with the specified title and color.
   */
  public async ensureAgentTabGroup(
    tabId: number,
    options: EnsureAgentGroupOptions = {},
  ): Promise<number | null> {
    if (typeof chrome === 'undefined' || !chrome.tabs?.group || !chrome.tabGroups) {
      return null;
    }

    try {
      const tab = await chrome.tabs.get(tabId);
      const targetWindowId = options.windowId ?? tab.windowId;
      const title = options.title?.trim() || TabGroupManager.DEFAULT_TITLE;
      const color = options.color || TabGroupManager.DEFAULT_COLOR;

      // Find if there is an existing valid managed group in this window
      let targetGroupId: number | null = null;
      for (const gid of Array.from(this.managedGroupIds)) {
        try {
          const group = await chrome.tabGroups.get(gid);
          if (group.windowId === targetWindowId) {
            targetGroupId = gid;
            break;
          }
        } catch {
          this.managedGroupIds.delete(gid);
        }
      }

      if (targetGroupId !== null) {
        // Add tab to the existing group
        await chrome.tabs.group({
          tabIds: [tabId],
          groupId: targetGroupId,
        });

        // Update title and/or color if caller provided specific custom title/color
        const updateProps: { title?: string; color?: chrome.tabGroups.UpdateProperties['color'] } =
          {};
        if (options.title && options.title.trim()) {
          updateProps.title = options.title.trim();
        }
        if (options.color) {
          updateProps.color = options.color;
        }
        if (Object.keys(updateProps).length > 0) {
          await chrome.tabGroups.update(targetGroupId, updateProps).catch(() => {});
        }
        return targetGroupId;
      }

      // Create a brand-new group for this window
      const newGroupId = await chrome.tabs.group({
        tabIds: [tabId],
        createProperties:
          typeof targetWindowId === 'number' ? { windowId: targetWindowId } : undefined,
      });

      this.managedGroupIds.add(newGroupId);
      void this.saveToStorage();

      await chrome.tabGroups.update(newGroupId, {
        title,
        color,
        collapsed: false,
      });

      return newGroupId;
    } catch (error) {
      console.warn('[TabGroupManager] ensureAgentTabGroup error:', error);
      return null;
    }
  }

  /**
   * Actively scans all managed groups and removes any group that has 0 tabs,
   * completely eliminating orphan tab group clutter.
   */
  public async cleanupEmptyOrOrphanGroups(): Promise<number> {
    if (typeof chrome === 'undefined' || !chrome.tabGroups) {
      return 0;
    }

    let removedCount = 0;
    const groupIds = Array.from(this.managedGroupIds);

    for (const gid of groupIds) {
      try {
        const tabs = await chrome.tabs.query({ groupId: gid });
        if (!tabs || tabs.length === 0) {
          this.managedGroupIds.delete(gid);
          const tg = chrome.tabGroups as any;
          if (typeof tg.remove === 'function') {
            await tg.remove(gid).catch(() => {});
          }
          removedCount++;
        }
      } catch {
        // Group no longer exists
        this.managedGroupIds.delete(gid);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      void this.saveToStorage();
    }

    return removedCount;
  }

  /**
   * Closes all tabs in a managed group and removes the group completely.
   */
  public async closeManagedGroup(groupId: number): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.tabs) return false;
    try {
      const tabs = await chrome.tabs.query({ groupId });
      const tabIds = tabs.map((t) => t.id).filter((id): id is number => typeof id === 'number');
      if (tabIds.length > 0) {
        await chrome.tabs.remove(tabIds);
      }
      this.managedGroupIds.delete(groupId);
      await this.cleanupEmptyOrOrphanGroups();
      return true;
    } catch (error) {
      console.warn('[TabGroupManager] closeManagedGroup error:', error);
      return false;
    }
  }

  /**
   * Close all tabs across all Agent-managed tab groups.
   */
  public async closeAllManagedGroups(): Promise<number> {
    if (typeof chrome === 'undefined' || !chrome.tabs) return 0;
    let count = 0;
    for (const gid of Array.from(this.managedGroupIds)) {
      const ok = await this.closeManagedGroup(gid);
      if (ok) count++;
    }
    return count;
  }

  /**
   * Helper to query current managed group IDs
   */
  public getManagedGroupIds(): number[] {
    return Array.from(this.managedGroupIds);
  }

  /**
   * Reset for testing environments
   */
  public resetForTest(): void {
    this.managedGroupIds.clear();
  }
}

export const tabGroupManager = TabGroupManager.getInstance();
