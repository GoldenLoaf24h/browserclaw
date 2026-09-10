import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { E2ETestEnvironment } from '../fixtures/mock-server.ts';
import {
  createEcommerceDOM,
  createAdminPortalDOM,
  create1500NodeFeedDOM,
  countTotalNodes,
} from '../fixtures/dom-samples.ts';
import { validateDOMCompression } from '../fixtures/oracle-evaluators.ts';

describe('Tier 4: Real-World Application Workflows', () => {
  it('S01: Multi-Step E-Commerce Checkout End-to-End Workflow', async () => {
    const env = new E2ETestEnvironment();
    const session = await env.createClientSession('agent-shopper', 'session-shopper');

    // 1. Load catalog & prune DOM
    const catalogDOM = createEcommerceDOM();
    const totalNodes = countTotalNodes(catalogDOM);
    const prunedCatalog = env.domEngine.pruneAndIndex(catalogDOM);

    assert.ok(totalNodes > 1000);
    assert.ok(prunedCatalog.compressionRatio >= 0.85);

    // 2. Locate and click "Add to Cart"
    const addToCartElem = prunedCatalog.indexedElements.find((el) => el.text === 'Add to Cart');
    assert.ok(addToCartElem, 'Should find Add to Cart button');
    const clickRes = await session.server.callTool('chrome_interact_index', {
      index: addToCartElem.index,
    });
    assert.strictEqual(clickRes.success, true);

    // 3. Checkout wizard page DOM
    const checkoutDOM = {
      tagName: 'body',
      attributes: {},
      rect: { x: 0, y: 0, width: 1280, height: 800 },
      isVisible: true,
      isInteractive: false,
      children: [
        { tagName: 'h1', text: 'Checkout Wizard', attributes: {}, rect: { x: 20, y: 20, width: 300, height: 40 }, isVisible: true, isInteractive: false, children: [] },
        { tagName: 'input', attributes: { id: 'cust-name', placeholder: 'Full Name' }, rect: { x: 20, y: 80, width: 250, height: 35 }, isVisible: true, isInteractive: true, children: [] },
        { tagName: 'input', attributes: { id: 'cust-address', placeholder: 'Shipping Address' }, rect: { x: 20, y: 130, width: 250, height: 35 }, isVisible: true, isInteractive: true, children: [] },
        { tagName: 'input', attributes: { id: 'cust-card', placeholder: 'Credit Card' }, rect: { x: 20, y: 180, width: 250, height: 35 }, isVisible: true, isInteractive: true, children: [] },
        { tagName: 'button', text: 'Place Order', attributes: { id: 'btn-place-order' }, rect: { x: 20, y: 230, width: 150, height: 40 }, isVisible: true, isInteractive: true, children: [] },
      ],
    };

    env.domEngine.pruneAndIndex(checkoutDOM as any);

    // 4. Batch action pipeline
    const batchRes = await session.server.callTool('chrome_batch_actions', {
      actions: [
        { type: 'fill', index: 1, text: 'Jane Doe' },
        { type: 'fill', index: 2, text: '742 Evergreen Terrace' },
        { type: 'fill', index: 3, text: '4111-2222-3333-4444' },
        { type: 'click', index: 4 },
      ],
    });

    assert.strictEqual(batchRes.success, true);
    assert.strictEqual(batchRes.completedActions, 4);

    // 5. Order confirmation markdown
    const confirmationDOM = {
      tagName: 'body',
      attributes: {},
      rect: { x: 0, y: 0, width: 1280, height: 600 },
      isVisible: true,
      isInteractive: false,
      children: [
        { tagName: 'h1', text: 'Order Confirmation', attributes: {}, rect: { x: 20, y: 20, width: 300, height: 40 }, isVisible: true, isInteractive: false, children: [] },
        { tagName: 'p', text: 'Status: Success. Thank you for your purchase!', attributes: {}, rect: { x: 20, y: 80, width: 400, height: 25 }, isVisible: true, isInteractive: false, children: [] },
      ],
    };

    const markdown = env.domEngine.extractMarkdown(confirmationDOM as any);
    assert.ok(markdown.includes('# Order Confirmation'));
    assert.ok(markdown.includes('Status: Success'));

    await env.sessionManager.closeSession('session-shopper');
  });

  it('S02: Admin Dashboard File Attachment & Submission Workflow', async () => {
    const env = new E2ETestEnvironment();
    const session = await env.createClientSession('admin-agent', 'session-admin');

    // 1. Admin login screen
    const loginDOM = {
      tagName: 'body',
      attributes: {},
      rect: { x: 0, y: 0, width: 800, height: 600 },
      isVisible: true,
      isInteractive: false,
      children: [
        { tagName: 'input', attributes: { id: 'admin-user', placeholder: 'Username' }, rect: { x: 100, y: 100, width: 200, height: 35 }, isVisible: true, isInteractive: true, children: [] },
        { tagName: 'input', attributes: { id: 'admin-pass', type: 'password' }, rect: { x: 100, y: 150, width: 200, height: 35 }, isVisible: true, isInteractive: true, children: [] },
        { tagName: 'button', text: 'Sign In', attributes: { id: 'btn-login' }, rect: { x: 100, y: 200, width: 100, height: 35 }, isVisible: true, isInteractive: true, children: [] },
      ],
    };

    env.domEngine.pruneAndIndex(loginDOM as any);

    // 2. Fill credentials & login
    const fillUser = await session.server.callTool('chrome_fill_index', { index: 1, text: 'admin' });
    const fillPass = await session.server.callTool('chrome_fill_index', { index: 2, text: 'secret123' });
    const clickLogin = await session.server.callTool('chrome_interact_index', { index: 3 });

    assert.strictEqual(fillUser.success, true);
    assert.strictEqual(fillPass.success, true);
    assert.strictEqual(clickLogin.success, true);

    // 3. Document management tab
    const adminDOM = createAdminPortalDOM();
    const prunedAdmin = env.domEngine.pruneAndIndex(adminDOM);
    assert.ok(prunedAdmin.interactiveCount > 0);

    // 4. File input registration & upload
    const fileTarget = prunedAdmin.indexedElements.find(
      (el) => el.tagName === 'input' && el.attributes.type === 'file'
    );
    assert.ok(fileTarget);

    const nodeId = env.cdpSession.registerFileInput({
      selector: fileTarget.attributes.id ? `#${fileTarget.attributes.id}` : undefined,
      isHidden: true,
    });

    const uploadRes = await session.server.callTool('chrome_upload_file', {
      nodeId,
      filePath: 'C:\\enterprise\\Q4_Financial_Audit.pdf',
    });
    assert.strictEqual(uploadRes.success, true);

    const targetInput = env.cdpSession.getFileInput(nodeId);
    assert.deepStrictEqual(targetInput?.files, ['C:\\enterprise\\Q4_Financial_Audit.pdf']);
    assert.ok(targetInput?.eventsDispatched.includes('change'));

    await env.sessionManager.closeSession('session-admin');
  });

  it('S03: Multi-Agent Parallel Research Workflow (Claude Code & Hermes)', async () => {
    const env = new E2ETestEnvironment();
    const claudeSession = await env.createClientSession('claude-agent', 'session-claude');
    const hermesSession = await env.createClientSession('hermes-agent', 'session-hermes');

    // Tab 1: Documentation Tab (Claude)
    const docDOM = {
      tagName: 'body',
      attributes: {},
      rect: { x: 0, y: 0, width: 1280, height: 1000 },
      isVisible: true,
      isInteractive: false,
      children: [
        { tagName: 'h1', text: 'React Documentation', attributes: {}, rect: { x: 20, y: 20, width: 300, height: 40 }, isVisible: true, isInteractive: false, children: [] },
        { tagName: 'input', attributes: { id: 'doc-search' }, rect: { x: 20, y: 70, width: 250, height: 35 }, isVisible: true, isInteractive: true, children: [] },
      ],
    };

    // Tab 2: GitHub Repository Tab (Hermes)
    const githubDOM = {
      tagName: 'body',
      attributes: {},
      rect: { x: 0, y: 0, width: 1280, height: 1000 },
      isVisible: true,
      isInteractive: false,
      children: [
        { tagName: 'h1', text: 'GitHub Repository Issues', attributes: {}, rect: { x: 20, y: 20, width: 350, height: 40 }, isVisible: true, isInteractive: false, children: [] },
        { tagName: 'input', attributes: { id: 'issue-filter' }, rect: { x: 20, y: 70, width: 300, height: 35 }, isVisible: true, isInteractive: true, children: [] },
      ],
    };

    // Both execute concurrent actions
    env.domEngine.pruneAndIndex(docDOM as any);
    const claudeFill = claudeSession.server.callTool('chrome_fill_index', {
      index: 1,
      text: 'useEffect dependency array',
    });

    env.domEngine.pruneAndIndex(githubDOM as any);
    const hermesFill = hermesSession.server.callTool('chrome_fill_index', {
      index: 1,
      text: 'is:issue is:open label:bug',
    });

    const [claudeRes, hermesRes] = await Promise.all([claudeFill, hermesFill]);

    assert.strictEqual(claudeRes.success, true);
    assert.strictEqual(claudeRes.filledText, 'useEffect dependency array');
    assert.strictEqual(hermesRes.success, true);
    assert.strictEqual(hermesRes.filledText, 'is:issue is:open label:bug');

    assert.strictEqual(env.sessionManager.getActiveSessionCount(), 2);
  });

  it('S04: Flaky Network & Extension Recovery during Form Wizard', async () => {
    const env = new E2ETestEnvironment();
    await env.extensionHost.initiateHandshake();
    const session = await env.createClientSession('resilient-agent', 'session-wizard');

    // 1. Initial Step
    const wizardStep1DOM = {
      tagName: 'body',
      attributes: {},
      rect: { x: 0, y: 0, width: 800, height: 600 },
      isVisible: true,
      isInteractive: false,
      children: [
        { tagName: 'input', attributes: { id: 'email' }, rect: { x: 20, y: 20, width: 200, height: 35 }, isVisible: true, isInteractive: true, children: [] },
      ],
    };
    env.domEngine.pruneAndIndex(wizardStep1DOM as any);
    const res1 = await session.server.callTool('chrome_fill_index', { index: 1, text: 'agent@example.com' });
    assert.strictEqual(res1.success, true);

    // 2. Simulate native port crash & disconnect
    env.extensionHost.simulatePortDisconnect();
    assert.strictEqual(env.extensionHost.state, 'RECONNECTING');

    // 3. Queue message during recovery
    const queueAction = env.extensionHost.sendMessage({ action: 'heartbeat_verify' });
    assert.strictEqual(queueAction.queued, true);

    // 4. Wait for self-healing (<3000ms SLA, resolves in 250ms mock)
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.strictEqual(env.extensionHost.state, 'CONNECTED');

    // 5. Subsequent steps execute normally
    const res2 = await session.server.callTool('chrome_fill_index', { index: 1, text: 'resumed@example.com' });
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.filledText, 'resumed@example.com');
    env.cleanup();
  });

  it('S05: Dynamic SPA Feed with Occlusion & Visual Bounding Boxes', async () => {
    const env = new E2ETestEnvironment();
    const session = await env.createClientSession('spa-agent', 'session-feed');

    // 1. 1,500+ node feed
    const feedDOM = create1500NodeFeedDOM();
    const totalNodes = countTotalNodes(feedDOM);
    assert.ok(totalNodes >= 1000);

    // 2. 6-stage pruning with occlusion filtering
    const pruned = env.domEngine.pruneAndIndex(feedDOM, 1000);
    const compression = validateDOMCompression(totalNodes, pruned.elementCount);
    assert.strictEqual(compression.passesCriterion, true);

    // 3. Visual bounding boxes calculated
    const boundingBoxes = env.domEngine.getVisualBoundingBoxes();
    assert.strictEqual(boundingBoxes.length, pruned.interactiveCount);

    for (const box of boundingBoxes) {
      assert.ok(['inside', 'above'].includes(box.badgePlacement));
    }

    // 4. Batch action execution
    const batchRes = await session.server.callTool('chrome_batch_actions', {
      actions: [
        { type: 'click', index: 1 },
        { type: 'wait', durationMs: 10 },
        { type: 'click', index: 2 },
      ],
    });

    assert.strictEqual(batchRes.success, true);
    assert.strictEqual(batchRes.completedActions, 3);
  });
});
