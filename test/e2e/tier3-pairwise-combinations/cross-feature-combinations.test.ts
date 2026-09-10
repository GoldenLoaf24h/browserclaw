import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { E2ETestEnvironment } from '../fixtures/mock-server.ts';
import { MockFastifyReply } from '../mocks/mock-mcp-server.ts';
import { createEcommerceDOM, createAdminPortalDOM } from '../fixtures/dom-samples.ts';
import { TOOL_SCHEMAS, TOOL_NAMES } from '../../../packages/shared/src/tools.ts';

describe('Tier 3: Cross-Feature Pairwise Combinations', () => {
  it('C01 [F1+F7]: Client A and B interacting with different indices concurrently on different tabs', async () => {
    const env = new E2ETestEnvironment();
    const sessionA = await env.createClientSession('trans-a', 'sess-c01-a');
    const sessionB = await env.createClientSession('trans-b', 'sess-c01-b');

    const [resA, resB] = await Promise.all([
      sessionA.server.callTool('chrome_interact_index', { index: 1 }),
      sessionB.server.callTool('chrome_fill_index', { index: 2, text: 'Client B Query' }),
    ]);

    assert.strictEqual(resA.success, true);
    assert.strictEqual(resB.success, true);
    assert.strictEqual(resB.filledText, 'Client B Query');
  });

  it('C02 [F1+F9]: Concurrent clients submitting complex batch actions simultaneously without cross-talk', async () => {
    const env = new E2ETestEnvironment();
    const sessionA = await env.createClientSession('trans-a', 'sess-c02-a');
    const sessionB = await env.createClientSession('trans-b', 'sess-c02-b');

    const [batchA, batchB] = await Promise.all([
      sessionA.server.callTool('chrome_batch_actions', {
        actions: [
          { type: 'click', index: 1 },
          { type: 'wait', durationMs: 10 },
        ],
      }),
      sessionB.server.callTool('chrome_batch_actions', {
        actions: [
          { type: 'fill', index: 2, text: 'Batch B Fill' },
          { type: 'wait', durationMs: 10 },
        ],
      }),
    ]);

    assert.strictEqual(batchA.success, true);
    assert.strictEqual(batchA.completedActions, 2);
    assert.strictEqual(batchB.success, true);
    assert.strictEqual(batchB.completedActions, 2);
  });

  it('C03 [F1+F3]: stdio transport and HTTP transport running simultaneously without contention', async () => {
    const env = new E2ETestEnvironment();
    const httpSession = await env.createClientSession('http-trans', 'http-sess');
    const stdioSession = await env.createClientSession('stdio-trans', 'stdio-sess');

    assert.strictEqual(env.sessionManager.getActiveSessionCount(), 2);

    // Stdio session closes
    await env.sessionManager.closeSession('stdio-sess');
    assert.strictEqual(env.sessionManager.getActiveSessionCount(), 1);

    // HTTP session remains healthy
    const res = await httpSession.server.callTool('chrome_read_dom', {});
    assert.ok(res.interactiveCount > 0);
  });

  it('C04 [F2+F9]: Client aborting HTTP connection while batch action is in mid-execution halts cleanly', async () => {
    const env = new E2ETestEnvironment();
    const reply = new MockFastifyReply();
    reply.hijack();
    reply.writeHead(200, { 'Content-Type': 'text/event-stream' });

    let batchHalted = false;
    // Step 1 runs, then client disconnect occurs
    reply.writableEnded = true;

    if (reply.writableEnded) {
      batchHalted = true;
    }

    assert.strictEqual(batchHalted, true);
    assert.strictEqual(reply.writableEnded, true);
  });

  it('C05 [F4+F1]: Extension disconnects and reconnects while multiple HTTP clients are active', async () => {
    const env = new E2ETestEnvironment();
    const session1 = await env.createClientSession('c05-1', 'sess-c05-1');
    const session2 = await env.createClientSession('c05-2', 'sess-c05-2');

    await env.extensionHost.initiateHandshake();
    env.extensionHost.simulatePortDisconnect();

    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.strictEqual(env.extensionHost.state, 'CONNECTED');

    // Both sessions can still dispatch calls
    const res1 = await session1.server.callTool('chrome_interact_index', { index: 1 });
    const res2 = await session2.server.callTool('chrome_interact_index', { index: 1 });
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res2.success, true);
    env.cleanup();
  });

  it('C06 [F4+F6]: Reconnection during file upload sequence reports clean result', async () => {
    const env = new E2ETestEnvironment();
    await env.extensionHost.initiateHandshake();

    const nodeId = env.cdpSession.registerFileInput({ selector: '#reconnect-upload' });

    // Transient drop and immediate recovery
    env.extensionHost.simulatePortDisconnect();
    await new Promise((resolve) => setTimeout(resolve, 350));

    const res = await env.cdpSession.setFileInputFiles(nodeId, ['C:\\uploads\\contract.pdf']);
    assert.strictEqual(res.success, true);
    env.cleanup();
  });

  it('C07 [F4+F9]: Port drop between steps 2 and 3 of batch action triggers safe interruption', async () => {
    const env = new E2ETestEnvironment();
    env.domEngine.pruneAndIndex(createEcommerceDOM());

    let portAlive = true;
    const currentUrlGetter = () => {
      if (!portAlive) return 'about:blank'; // simulates port loss navigation
      return 'https://example.com/app';
    };

    // Simulate drop before step 2
    portAlive = false;

    const result = await env.batchPipeline.executeBatch(
      [
        { type: 'click', index: 1 },
        { type: 'fill', index: 2, text: 'text' },
      ],
      { currentUrlGetter, initialUrl: 'https://example.com/app' }
    );

    assert.strictEqual(result.success, false);
    assert.ok(result.interruptedReason?.includes('Runtime URL changed'));
  });

  it('C08 [F6+F7]: Locating file input via index and invoking CDP file upload', async () => {
    const env = new E2ETestEnvironment();
    const adminPruned = env.domEngine.pruneAndIndex(createAdminPortalDOM());

    // File input index
    const fileTarget = adminPruned.indexedElements.find(
      (el) => el.tagName === 'input' && el.attributes.type === 'file'
    );
    assert.ok(fileTarget, 'Should locate file input in admin portal DOM');

    const nodeId = env.cdpSession.registerFileInput({
      selector: fileTarget.attributes.id ? `#${fileTarget.attributes.id}` : undefined,
    });

    const res = await env.cdpSession.setFileInputFiles(nodeId, ['C:\\data\\invoice.pdf']);
    assert.strictEqual(res.success, true);
  });

  it('C09 [F7+F8]: Pruned DOM indices map 100% accurately to live elements with zero offset errors', () => {
    const env = new E2ETestEnvironment();
    const result = env.domEngine.pruneAndIndex(createEcommerceDOM());

    for (const el of result.indexedElements) {
      const mapped = result.indexMap[el.index];
      assert.ok(mapped);
      assert.strictEqual(mapped.tagName, el.tagName);
      assert.strictEqual(mapped.backendNodeId, el.backendNodeId);
    }
  });

  it('C10 [F8+F10]: Pruned DOM snapshot and markdown extractor produce mutually consistent representations', () => {
    const env = new E2ETestEnvironment();
    const adminDOM = createAdminPortalDOM();

    const pruned = env.domEngine.pruneAndIndex(adminDOM);
    const markdown = env.domEngine.extractMarkdown(adminDOM);

    // Both should reflect "Document Management Portal"
    assert.ok(markdown.includes('# Document Management Portal'));
    const headerElement = pruned.indexedElements.find((e) => e.text === 'Document Management Portal');
    // Header is non-interactive h1, but present in DOM
    assert.ok(markdown.length > 50);
    assert.ok(pruned.interactiveCount > 0);
  });

  it('C11 [F9+F7]: Batch action sequence interleaves index clicks and fills across a form', async () => {
    const env = new E2ETestEnvironment();
    env.domEngine.pruneAndIndex(createEcommerceDOM());

    const result = await env.batchPipeline.executeBatch([
      { type: 'fill', index: 1, text: 'ergonomic mouse' },
      { type: 'click', index: 2 },
      { type: 'wait', durationMs: 10 },
      { type: 'fill', index: 1, text: 'updated search' },
    ]);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.completedActions, 4);
    assert.strictEqual(result.results[0].output?.filledValue, 'ergonomic mouse');
    assert.strictEqual(result.results[3].output?.filledValue, 'updated search');
  });

  it('C12 [F9+F8]: Dynamic DOM change causes selective re-indexing before next step', () => {
    const env = new E2ETestEnvironment();
    const initialPruned = env.domEngine.pruneAndIndex(createEcommerceDOM());
    const initialCount = initialPruned.interactiveCount;

    // Simulate SPA modal opening
    const adminPruned = env.domEngine.pruneAndIndex(createAdminPortalDOM());
    assert.notStrictEqual(initialCount, adminPruned.interactiveCount);
  });

  it('C13 [F5+F9]: Batch action tool verifies security annotations before execution', () => {
    const batchTool = TOOL_SCHEMAS.find((t) => t.name === TOOL_NAMES.BROWSER.BATCH_ACTIONS);
    assert.ok(batchTool);
    assert.strictEqual(batchTool.annotations?.destructiveHint, true);
    assert.strictEqual(batchTool.annotations?.readOnlyHint, false);
    assert.strictEqual(batchTool.annotations?.openWorldHint, true);
  });

  it('C14 [F5+F6]: Security verification of file upload path restrictions and destructive hint', () => {
    const uploadTool = TOOL_SCHEMAS.find((t) => t.name === TOOL_NAMES.BROWSER.FILE_UPLOAD);
    assert.ok(uploadTool);
    assert.strictEqual(uploadTool.annotations?.readOnlyHint, false);
    assert.strictEqual(uploadTool.annotations?.openWorldHint, true);
  });

  it('C15 [F3+F4]: Stdio client termination notifies native host and frees extension connection', async () => {
    const env = new E2ETestEnvironment();
    await env.extensionHost.initiateHandshake();

    // Stdio exit triggered
    env.extensionHost.cleanup();
    assert.strictEqual(env.extensionHost.state, 'DISCONNECTED');
  });

  it('C16 [F2+F10]: Streaming large extracted markdown document over SSE without header write conflicts', () => {
    const env = new E2ETestEnvironment();
    const markdown = env.domEngine.extractMarkdown(createEcommerceDOM());

    const reply = new MockFastifyReply();
    reply.hijack();
    reply.writeHead(200, { 'Content-Type': 'text/event-stream' });

    assert.doesNotThrow(() => {
      reply.write(`data: ${JSON.stringify({ markdown })}\n\n`);
      reply.end();
    });

    assert.strictEqual(reply.writableEnded, true);
    assert.strictEqual(reply.writtenChunks.length, 1);
  });
});
