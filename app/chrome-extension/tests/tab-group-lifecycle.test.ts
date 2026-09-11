import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TabGroupManager } from '../entrypoints/background/tools/browser/tab-group-manager';

describe('TabGroupManager (Industrial Grouping & Zero-Orphan Cleanup)', () => {
  let manager: TabGroupManager;
  let mockTabs: any[];
  let mockGroups: Map<number, any>;
  let nextGroupId = 100;

  beforeEach(() => {
    nextGroupId = 100;
    mockTabs = [
      { id: 1, windowId: 10, groupId: -1 },
      { id: 2, windowId: 10, groupId: -1 },
      { id: 3, windowId: 20, groupId: -1 },
    ];
    mockGroups = new Map();

    (globalThis as any).chrome = {
      tabs: {
        get: vi.fn(async (id: number) => {
          const t = mockTabs.find((x) => x.id === id);
          if (!t) throw new Error(`Tab ${id} not found`);
          return { ...t };
        }),
        group: vi.fn(async (opts: { tabIds: number[]; groupId?: number; createProperties?: any }) => {
          if (opts.groupId) {
            for (const tid of opts.tabIds) {
              const tab = mockTabs.find((x) => x.id === tid);
              if (tab) tab.groupId = opts.groupId;
            }
            return opts.groupId;
          }
          const gid = nextGroupId++;
          mockGroups.set(gid, {
            id: gid,
            windowId: opts.createProperties?.windowId ?? 10,
            title: '',
            color: 'grey',
          });
          for (const tid of opts.tabIds) {
            const tab = mockTabs.find((x) => x.id === tid);
            if (tab) tab.groupId = gid;
          }
          return gid;
        }),
        query: vi.fn(async (queryInfo: { groupId?: number }) => {
          if (typeof queryInfo.groupId === 'number') {
            return mockTabs.filter((t) => t.groupId === queryInfo.groupId);
          }
          return mockTabs;
        }),
        remove: vi.fn(async (ids: number | number[]) => {
          const arr = Array.isArray(ids) ? ids : [ids];
          mockTabs = mockTabs.filter((t) => !arr.includes(t.id));
        }),
        onRemoved: { addListener: vi.fn() },
      },
      tabGroups: {
        get: vi.fn(async (gid: number) => {
          const g = mockGroups.get(gid);
          if (!g) throw new Error(`Group ${gid} not found`);
          return { ...g };
        }),
        update: vi.fn(async (gid: number, props: any) => {
          const g = mockGroups.get(gid);
          if (g) Object.assign(g, props);
          return g;
        }),
        remove: vi.fn(async (gid: number) => {
          mockGroups.delete(gid);
        }),
        onRemoved: { addListener: vi.fn() },
      },
    };

    manager = new TabGroupManager();
  });

  it('creates a new group with default title "Agent" and blue color', async () => {
    const gid = await manager.ensureAgentTabGroup(1);
    expect(gid).toBeDefined();
    const group = mockGroups.get(gid!);
    expect(group).toBeDefined();
    expect(group.title).toBe('Agent');
    expect(group.color).toBe('blue');
    expect(manager.getManagedGroupIds()).toContain(gid);
  });

  it('allows agent to specify custom task title and custom color', async () => {
    const gid = await manager.ensureAgentTabGroup(1, {
      title: '财务报表核对任务',
      color: 'green',
    });
    expect(gid).toBeDefined();
    const group = mockGroups.get(gid!);
    expect(group.title).toBe('财务报表核对任务');
    expect(group.color).toBe('green');
  });

  it('reuses existing managed group in the same window for subsequent tabs', async () => {
    const gid1 = await manager.ensureAgentTabGroup(1, { title: 'Agent' });
    const gid2 = await manager.ensureAgentTabGroup(2);
    expect(gid1).toBe(gid2);
    expect(mockTabs.find((t) => t.id === 1)?.groupId).toBe(gid1);
    expect(mockTabs.find((t) => t.id === 2)?.groupId).toBe(gid1);
  });

  it('strictly cleans up empty or orphan groups when all member tabs are removed (zero residue)', async () => {
    const gid = await manager.ensureAgentTabGroup(1);
    expect(manager.getManagedGroupIds()).toContain(gid);

    // Tab 1 is closed
    mockTabs = mockTabs.filter((t) => t.id !== 1);

    // Run cleanup
    const removedCount = await manager.cleanupEmptyOrOrphanGroups();
    expect(removedCount).toBe(1);
    expect(manager.getManagedGroupIds()).not.toContain(gid);
    expect(mockGroups.has(gid!)).toBe(false);
  });

  it('closes all member tabs and deletes group via closeManagedGroup', async () => {
    const gid = await manager.ensureAgentTabGroup(1);
    await manager.ensureAgentTabGroup(2);

    expect(mockTabs.filter((t) => t.groupId === gid).length).toBe(2);

    const success = await manager.closeManagedGroup(gid!);
    expect(success).toBe(true);
    expect(mockTabs.filter((t) => t.groupId === gid).length).toBe(0);
    expect(manager.getManagedGroupIds()).not.toContain(gid);
  });
});
