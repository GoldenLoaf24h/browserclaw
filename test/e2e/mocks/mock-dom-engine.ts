/**
 * Mock browser-use DOM Engine & Indexer
 * Implements 6-stage pruning, viewport visibility, occlusion checking,
 * compact 1-based index assignment, and structured markdown extraction.
 */

import { type MockDOMNode, countTotalNodes } from '../fixtures/dom-samples.ts';

export interface IndexedElement {
  index: number;
  tagName: string;
  role?: string;
  text?: string;
  attributes: Record<string, string>;
  rect: { x: number; y: number; width: number; height: number };
  isVisible: boolean;
  isInteractive: boolean;
  backendNodeId?: number;
  isOccluded?: boolean;
  occludedBy?: string;
  safeClickPoint?: { x: number; y: number };
}

export interface PrunedDOMTreeResult {
  treeString: string;
  elementCount: number;
  interactiveCount: number;
  compressionRatio: number;
  indexMap: Record<number, { selector?: string; backendNodeId?: number; tagName: string }>;
  indexedElements: IndexedElement[];
}

export class MockDOMEngine {
  private currentIndexMap = new Map<number, IndexedElement>();

  /**
   * 6-Stage DOM Pruning & Visibility Filtering Engine
   */
  pruneAndIndex(root: MockDOMNode, viewportThreshold = 1000): PrunedDOMTreeResult {
    const totalOriginalNodes = countTotalNodes(root);
    const indexedElements: IndexedElement[] = [];
    const indexMap: Record<number, { selector?: string; backendNodeId?: number; tagName: string }> = {};
    let nextIndex = 1;
    let prunedElementCount = 0;

    const traverse = (node: MockDOMNode) => {
      // Stage 1 & 2: Drop non-content and non-rendered tags
      const droppedTags = new Set(['script', 'style', 'head', 'meta', 'link', 'title']);
      if (droppedTags.has(node.tagName.toLowerCase())) {
        return;
      }

      // Stage 3: Zero-dimension & visibility check
      const hasZeroDimensions = node.rect.width === 0 && node.rect.height === 0;
      if (!node.isVisible && hasZeroDimensions && !node.attributes.id?.includes('file-input')) {
        return;
      }

      // Stage 4: Viewport boundary check (1000px threshold)
      if (node.rect.y > viewportThreshold) {
        return;
      }

      // Stage 5: Occlusion check
      if (node.isOccluded) {
        return;
      }

      prunedElementCount++;

      // Stage 6: Compact 1-based indexing for interactive elements
      if (node.isInteractive) {
        const assignedIndex = nextIndex++;
        const indexedElem: IndexedElement = {
          index: assignedIndex,
          tagName: node.tagName,
          role: node.role,
          text: node.text,
          attributes: { ...node.attributes },
          rect: { ...node.rect },
          isVisible: node.isVisible,
          isInteractive: true,
          backendNodeId: assignedIndex + 1000,
        };

        indexedElements.push(indexedElem);
        indexMap[assignedIndex] = {
          selector: node.attributes.id ? `#${node.attributes.id}` : `${node.tagName}[index="${assignedIndex}"]`,
          backendNodeId: indexedElem.backendNodeId,
          tagName: node.tagName,
        };
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(root);

    this.currentIndexMap.clear();
    for (const el of indexedElements) {
      this.currentIndexMap.set(el.index, el);
    }

    const compressionRatio = Number(((totalOriginalNodes - prunedElementCount) / totalOriginalNodes).toFixed(4));

    // Construct formatted tree string
    const treeLines = indexedElements.map(
      (el) => `[${el.index}] <${el.tagName}${el.role ? ` role="${el.role}"` : ''}${el.attributes.id ? ` id="${el.attributes.id}"` : ''}> ${el.text ? `"${el.text}"` : ''}`
    );

    return {
      treeString: treeLines.join('\n'),
      elementCount: prunedElementCount,
      interactiveCount: indexedElements.length,
      compressionRatio,
      indexMap,
      indexedElements,
    };
  }

  /**
   * Interact by index (Click)
   */
  interactIndex(index: number): { success: boolean; element?: IndexedElement; error?: string } {
    if (index <= 0) {
      return { success: false, error: `Invalid index ${index}: Indices must be 1-based positive integers` };
    }
    const element = this.currentIndexMap.get(index);
    if (!element) {
      return { success: false, error: `Element with index ${index} not found. Available range: 1 to ${this.currentIndexMap.size}` };
    }
    return { success: true, element };
  }

  /**
   * Fill text by index
   */
  fillIndex(index: number, text: string): { success: boolean; element?: IndexedElement; filledText?: string; error?: string } {
    if (index <= 0) {
      return { success: false, error: `Invalid index ${index}: Indices must be 1-based positive integers` };
    }
    const element = this.currentIndexMap.get(index);
    if (!element) {
      return { success: false, error: `Element with index ${index} not found. Available range: 1 to ${this.currentIndexMap.size}` };
    }
    element.attributes.value = text;
    return { success: true, element, filledText: text };
  }

  /**
   * Structured Markdown Extraction
   */
  extractMarkdown(root: MockDOMNode): string {
    const lines: string[] = [];

    const traverse = (node: MockDOMNode) => {
      const droppedTags = new Set(['script', 'style', 'head', 'meta', 'link', 'title']);
      if (droppedTags.has(node.tagName.toLowerCase())) return;

      if (node.tagName === 'h1' && node.text) {
        lines.push(`# ${node.text}`);
      } else if (node.tagName === 'h2' && node.text) {
        lines.push(`## ${node.text}`);
      } else if (node.tagName === 'h3' && node.text) {
        lines.push(`### ${node.text}`);
      } else if (node.tagName === 'h4' && node.text) {
        lines.push(`#### ${node.text}`);
      } else if (node.tagName === 'p' && node.text && node.text.trim()) {
        lines.push(node.text.trim());
      } else if (node.tagName === 'a' && node.text) {
        lines.push(`[${node.text}](${node.attributes.href || '#'})`);
      } else if (node.tagName === 'button' && node.text) {
        lines.push(`[Button: ${node.text}]`);
      } else if (node.tagName === 'img' && node.attributes.src) {
        lines.push(`![${node.attributes.alt || ''}](${node.attributes.src})`);
      } else if (node.tagName === 'table') {
        const rows = node.children.filter((c) => c.tagName === 'tr');
        if (rows.length > 0) {
          for (let rIdx = 0; rIdx < rows.length; rIdx++) {
            const row = rows[rIdx];
            const cells = row.children.filter((c) => c.tagName === 'th' || c.tagName === 'td');
            lines.push('| ' + cells.map((c) => c.text || '').join(' | ') + ' |');
            if (rIdx === 0 && cells.every((c) => c.tagName === 'th')) {
              lines.push('| ' + cells.map(() => '---').join(' | ') + ' |');
            }
          }
        }
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(root);
    return lines.join('\n\n');
  }

  /**
   * Re-index frame elements with an offset (simulating inPageReindexFrame)
   */
  reindexFrame(offset: number): void {
    const entries = Array.from(this.currentIndexMap.entries()).sort((a, b) => a[0] - b[0]);
    this.currentIndexMap.clear();
    for (const [oldIdx, el] of entries) {
      const newIdx = oldIdx + offset;
      el.index = newIdx;
      this.currentIndexMap.set(newIdx, el);
    }
  }

  /**
   * Calculate visual bounding box badges for indexed elements
   */
  getVisualBoundingBoxes(): Array<{ index: number; badgePlacement: 'inside' | 'above'; rect: IndexedElement['rect'] }> {
    const boxes: Array<{ index: number; badgePlacement: 'inside' | 'above'; rect: IndexedElement['rect'] }> = [];
    for (const [index, el] of this.currentIndexMap.entries()) {
      // Small elements (<60x30) have badge placed above to avoid blocking content
      const isSmall = el.rect.width < 60 || el.rect.height < 30;
      boxes.push({
        index,
        badgePlacement: isSmall ? 'above' : 'inside',
        rect: { ...el.rect },
      });
    }
    return boxes;
  }
}
