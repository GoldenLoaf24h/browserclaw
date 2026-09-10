import { callTool } from './mcp-runner.mjs';

export async function testP02() {
  const tabsRes = await callTool('get_windows_and_tabs');
  const tab = tabsRes.windows[0].tabs.find(t => t.url.includes('4173'));
  const tabId = tab.tabId;

  await callTool('chrome_javascript', {
    tabId,
    code: `window.location.hash = '#/protocol/shadow'; return 'ok';`,
  });
  await new Promise(r => setTimeout(r, 800));

  console.log('\n=== Protocol 2: SHADOW REALM ===');
  const dom = await callTool('chrome_read_dom', { tabId });

  const targets = [
    { id: 'open-shadow-btn', name: 'Open shadow root' },
    { id: 'closed-shadow-btn', name: 'Closed shadow root' },
    { id: 'nested-closed-btn', name: 'Nested closed shadow root' },
    { id: 'slotted-btn', name: 'Slotted light DOM control' },
    { id: 'probe', name: 'Iframe L1 probe' },
    { id: 'deep', name: 'Nested iframe deep button' },
    { id: 'shadow-in-iframe', name: 'Closed shadow in iframe' },
  ];

  for (const target of targets) {
    const el = dom.indexedElements.find(e => e.attributes?.id === target.id);
    if (!el) {
      throw new Error(`Target element ${target.id} (${target.name}) not found in chrome_read_dom indexedElements!`);
    }
    console.log(`[P02] Clicking index [${el.index}] for ${target.name} (id="${target.id}")...`);
    const res = await callTool('chrome_interact_index', { tabId, index: el.index, action: 'click' });
    if (!res.success) {
      throw new Error(`Failed to click ${target.name} at index [${el.index}]: ${JSON.stringify(res)}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // Validate & commit
  const domAfter = await callTool('chrome_read_dom', { tabId });
  const commitBtn = domAfter.indexedElements.find(e => e.attributes?.id === 'protocol-commit');
  if (commitBtn) {
    console.log(`[P02] Committing protocol...`);
    await callTool('chrome_interact_index', { tabId, index: commitBtn.index, action: 'click' });
  }

  await new Promise(r => setTimeout(r, 400));

  const checkRes = await callTool('chrome_javascript', {
    tabId,
    code: `return JSON.stringify(JSON.parse(localStorage.getItem('nexus-lab-v1') || '{}').runs?.shadow || {});`,
  });
  const run = JSON.parse(checkRes.result || '{}');
  console.log(`[P02] Result: passed=${run.passed}, checks=${run.checks?.filter(c => c.passed).length}/${run.checks?.length}`);
  if (!run.passed) {
    throw new Error(`P02 failed to pass all checks: ${JSON.stringify(run.checks)}`);
  }
}

if (process.argv[1]?.endsWith('test-p02.mjs')) {
  testP02().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
