/**
 * Unified E2E Test Environment & System Fixture
 */

import { MockMcpSessionManager, type MockTransport } from '../mocks/mock-mcp-server.ts';
import { MockExtensionNativeHost } from '../mocks/mock-extension.ts';
import { MockDOMEngine } from '../mocks/mock-dom-engine.ts';
import { MockBatchPipeline } from '../mocks/mock-batch-pipeline.ts';
import { MockCdpSession } from '../mocks/mock-cdp.ts';
import { createEcommerceDOM, createAdminPortalDOM, create1500NodeFeedDOM } from './dom-samples.ts';

export interface StandardToolDefinition {
  name: string;
  description: string;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  handler: (args: any, sessionId?: string) => Promise<any>;
}

export class E2ETestEnvironment {
  public sessionManager = new MockMcpSessionManager();
  public extensionHost = new MockExtensionNativeHost();
  public domEngine = new MockDOMEngine();
  public batchPipeline = new MockBatchPipeline(this.domEngine);
  public cdpSession = new MockCdpSession();
  public tools = new Map<string, StandardToolDefinition>();

  constructor() {
    this.registerStandardTools();
    this.domEngine.pruneAndIndex(createEcommerceDOM());
  }

  private registerStandardTools() {
    // Read DOM Tool
    this.tools.set('chrome_read_dom', {
      name: 'chrome_read_dom',
      description: 'Extract and prune interactive DOM tree with compact 1-based index assignment',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler: async (args: { viewportThreshold?: number; domType?: string }) => {
        let dom = createEcommerceDOM();
        if (args.domType === 'admin') dom = createAdminPortalDOM();
        if (args.domType === 'feed') dom = create1500NodeFeedDOM();
        return this.domEngine.pruneAndIndex(dom, args.viewportThreshold || 1000);
      },
    });

    // Interact Index Tool (Click & Coordinate Visual Fallback)
    this.tools.set('chrome_interact_index', {
      name: 'chrome_interact_index',
      description: 'Click an element using its numeric index or visual coordinates',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      handler: async (args: { index?: number; coordinate?: { x: number; y: number }; action?: string }) => {
        if (args.coordinate && !args.index) {
          return {
            success: true,
            action: args.action || 'click',
            mode: 'visual_coordinate',
            coordinates: args.coordinate,
          };
        }
        return this.domEngine.interactIndex(args.index!);
      },
    });

    // Fill Index Tool
    this.tools.set('chrome_fill_index', {
      name: 'chrome_fill_index',
      description: 'Fill text into an element using its numeric index',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      handler: async (args: { index: number; text: string }) => {
        return this.domEngine.fillIndex(args.index, args.text);
      },
    });

    // Batch Actions Tool
    this.tools.set('chrome_batch_actions', {
      name: 'chrome_batch_actions',
      description: 'Execute a sequential pipeline of browser actions with page-drift guards',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      handler: async (args: { actions: any[]; simulateNavigationAtStep?: number }) => {
        return this.batchPipeline.executeBatch(args.actions, {
          simulateNavigationAtStep: args.simulateNavigationAtStep,
        });
      },
    });

    // File Upload Tool (Static selector & Dynamic clickTargetIndex intercept)
    this.tools.set('chrome_upload_file', {
      name: 'chrome_upload_file',
      description: 'Attach local file to file input using CDP DOM.setFileInputFiles or intercept dialog',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      handler: async (args: { filePath?: string; nodeId?: number; clickTargetIndex?: number }) => {
        if (args.clickTargetIndex) {
          return {
            success: true,
            mode: 'file_chooser_dialog_intercept',
            clickTargetIndex: args.clickTargetIndex,
            backendNodeId: 456,
            files: args.filePath ? [args.filePath] : ['mock-file.png'],
          };
        }
        const nodeId = args.nodeId || 101;
        return this.cdpSession.setFileInputFiles(nodeId, [args.filePath || 'mock-file.png']);
      },
    });

    // Get Markdown Tool
    this.tools.set('chrome_get_markdown', {
      name: 'chrome_get_markdown',
      description: 'Extract structured hierarchical markdown from active tab DOM',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler: async (args: { domType?: string }) => {
        let dom = createEcommerceDOM();
        if (args.domType === 'admin') dom = createAdminPortalDOM();
        if (args.domType === 'feed') dom = create1500NodeFeedDOM();
        return { markdown: this.domEngine.extractMarkdown(dom) };
      },
    });
  }

  /**
   * Helper to create an active client session with tools registered
   */
  async createClientSession(transportId = 'client-1', customSessionId?: string) {
    const transport: MockTransport = {
      id: transportId,
      type: 'sse',
      send: async () => {},
      close: async () => {},
    };

    const session = await this.sessionManager.createSession(transport, customSessionId);
    for (const [name, tool] of this.tools.entries()) {
      session.server.tools.set(name, tool);
    }
    return session;
  }

  cleanup() {
    this.extensionHost.cleanup();
  }
}
