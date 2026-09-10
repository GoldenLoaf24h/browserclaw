/**
 * Mock Chrome DevTools Protocol (CDP) Session Harness
 * Validates DOM.setFileInputFiles, file:// path normalization, and input events
 */

import { EventEmitter } from 'node:events';

export interface CdpFileInputTarget {
  nodeId: number;
  backendNodeId: number;
  selector?: string;
  isHidden: boolean;
  files: string[];
  eventsDispatched: string[];
}

export class MockCdpSession extends EventEmitter {
  private targets = new Map<number, CdpFileInputTarget>();
  private nextNodeId = 100;

  registerFileInput(params: { selector?: string; isHidden?: boolean; initialFiles?: string[] }): number {
    const nodeId = ++this.nextNodeId;
    this.targets.set(nodeId, {
      nodeId,
      backendNodeId: nodeId + 1000,
      selector: params.selector,
      isHidden: params.isHidden ?? false,
      files: params.initialFiles ?? [],
      eventsDispatched: [],
    });
    return nodeId;
  }

  getFileInput(nodeId: number): CdpFileInputTarget | undefined {
    return this.targets.get(nodeId);
  }

  /**
   * Normalizes file paths for Windows and file:// protocol
   */
  normalizeFilePath(filePath: string): { normalizedPath: string; isFileProtocol: boolean } {
    let normalized = filePath.trim();
    let isFileProtocol = false;

    if (normalized.startsWith('file://')) {
      isFileProtocol = true;
      // Strip file:/// or file:// and normalize backslashes/slashes
      normalized = normalized.replace(/^file:\/\/\/?/, '');
      if (/^[a-zA-Z]:/.test(normalized)) {
        normalized = normalized.replace(/\//g, '\\');
      }
    }

    return { normalizedPath: normalized, isFileProtocol };
  }

  /**
   * CDP Command: DOM.setFileInputFiles
   */
  async setFileInputFiles(nodeId: number, files: string[]): Promise<{ success: boolean; error?: string }> {
    const target = this.targets.get(nodeId);
    if (!target) {
      return { success: false, error: `Node with id ${nodeId} not found` };
    }

    if (files.length === 0) {
      return { success: false, error: 'Files array cannot be empty' };
    }

    // Validate path existence / sanity
    for (const f of files) {
      const { normalizedPath } = this.normalizeFilePath(f);
      if (normalizedPath.includes('non_existent_dir_12345')) {
        return { success: false, error: `File not found: ${normalizedPath}` };
      }
    }

    target.files = [...files];
    // In Chromium, setFileInputFiles automatically dispatches 'input' and 'change' events
    target.eventsDispatched.push('input');
    target.eventsDispatched.push('change');
    this.emit('fileInputChanged', { nodeId, files, events: target.eventsDispatched });

    return { success: true };
  }
}
