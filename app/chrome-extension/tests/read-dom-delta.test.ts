import { describe, it, expect, beforeEach } from 'vitest';
import { SnapshotCacheManager } from '../utils/snapshot-cache-manager';

describe('SnapshotCacheManager (DOM Delta & Revision Diffing)', () => {
  let manager: SnapshotCacheManager;

  beforeEach(() => {
    manager = new SnapshotCacheManager();
  });

  it('reports isDelta false on initial capture when no baseline exists', () => {
    const elements = [
      { index: 1, tagName: 'button', text: 'Submit', isInteractive: true },
      { index: 2, tagName: 'input', text: '', isInteractive: true, value: 'test' },
    ];
    const diff = manager.diffWithPrevious(1, elements);
    expect(diff.isDelta).toBe(false);
    expect(diff.unchanged).toBe(false);
    expect(diff.added).toHaveLength(2);
  });

  it('correctly detects unchanged DOM on repeated capture and provides revision', () => {
    const elements = [
      { index: 1, tagName: 'button', text: 'Submit', isInteractive: true },
    ];
    manager.setSnapshot(1, { url: 'https://example.com', elementCount: 1, elements });
    const diff = manager.diffWithPrevious(1, elements);
    expect(diff.isDelta).toBe(true);
    expect(diff.unchanged).toBe(true);
    expect(diff.revision).toBe(2);
    expect(diff.added).toHaveLength(0);
    expect(diff.modified).toHaveLength(0);
  });

  it('accurately captures added, modified, and removed elements', () => {
    const baseline = [
      { index: 1, tagName: 'button', text: 'Submit', isInteractive: true },
      { index: 2, tagName: 'input', text: 'Old', isInteractive: true, value: 'foo' },
      { index: 3, tagName: 'a', text: 'Old Link', isInteractive: true },
    ];
    manager.setSnapshot(1, { url: 'https://example.com', elementCount: 3, elements: baseline });

    // Next snapshot: [1] unchanged, [2] modified text/val, [3] removed, [4] added
    const next = [
      { index: 1, tagName: 'button', text: 'Submit', isInteractive: true },
      { index: 2, tagName: 'input', text: 'New', isInteractive: true, value: 'bar' },
      { index: 4, tagName: 'div', text: 'Modal popup', isInteractive: true },
    ];

    const diff = manager.diffWithPrevious(1, next);
    expect(diff.isDelta).toBe(true);
    expect(diff.unchanged).toBe(false);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].index).toBe(4);
    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0].index).toBe(2);
    expect(diff.removed).toContain(3);
  });
});
