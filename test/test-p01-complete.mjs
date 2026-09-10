import { callTool } from './mcp-runner.mjs';

export async function testP01() {
  const tabsRes = await callTool('get_windows_and_tabs');
  const win = tabsRes.windows[0];
  const tab = win.tabs.find(t => t.url.includes('4173'));
  if (!tab) throw new Error('Test tab not found');
  const tabId = tab.tabId;

  // Navigate to protocol/click and reload to reset state
  await callTool('chrome_javascript', {
    tabId,
    code: `window.location.hash = '#/protocol/click'; window.location.reload(); return 'ok';`,
  });
  await new Promise(r => setTimeout(r, 1200));

  // Get session info
  const sessionInfo = await callTool('chrome_javascript', {
    tabId,
    code: `return JSON.stringify(JSON.parse(localStorage.getItem('nexus-lab-v1') || '{}').session);`,
  });
  const session = JSON.parse(sessionInfo.result || '{}');
  console.log('\n=== Protocol 1: CLICK VECTOR ===');
  console.log('Session info:', { id: session.id, token: session.clickToken, seq: session.clickSequence });

  // 1. Flee target: hit fleeing-target using pure DOM index click
  console.log('\n--- 1. Flee target ---');
  let dom = await callTool('chrome_read_dom', { tabId });
  const fleeEl = dom.indexedElements.find(e => e.attributes?.id === 'fleeing-target');
  if (!fleeEl) throw new Error('fleeing-target not found in DOM');
  console.log(`Clicking flee target [${fleeEl.index}]...`);
  await callTool('chrome_interact_index', { tabId, index: fleeEl.index, action: 'click' });
  await new Promise(r => setTimeout(r, 200));

  // 2. Token target: click the authorize button whose data-k === session.clickToken
  console.log('\n--- 2. Token target ---');
  dom = await callTool('chrome_read_dom', { tabId });
  const tokenBtn = dom.indexedElements.find(e => e.tagName === 'button' && e.attributes?.['data-k'] === session.clickToken);
  if (!tokenBtn) throw new Error(`Authorize button with data-k="${session.clickToken}" not found in DOM!`);
  console.log(`Clicking token button [${tokenBtn.index}] (data-k="${tokenBtn.attributes['data-k']}")...`);
  await callTool('chrome_interact_index', { tabId, index: tokenBtn.index, action: 'click' });
  await new Promise(r => setTimeout(r, 200));

  // 3. Hover stack: SYSTEM -> DELTA -> RELEASE using sequential index hovers
  console.log('\n--- 3. Hover stack ---');
  dom = await callTool('chrome_read_dom', { tabId });
  const sysEl = dom.indexedElements.find(e => e.text?.includes('SYSTEM'));
  if (!sysEl) throw new Error('SYSTEM button not found');
  console.log(`Hovering SYSTEM [${sysEl.index}]...`);
  await callTool('chrome_interact_index', { tabId, index: sysEl.index, action: 'hover' });
  await new Promise(r => setTimeout(r, 300));

  dom = await callTool('chrome_read_dom', { tabId });
  const deltaEl = dom.indexedElements.find(e => e.text?.trim() === 'DELTA ▸') || dom.indexedElements.find(e => e.text?.includes('DELTA'));
  if (!deltaEl) throw new Error('DELTA element not found after hover');
  console.log(`Hovering DELTA [${deltaEl.index}]...`);
  await callTool('chrome_interact_index', { tabId, index: deltaEl.index, action: 'hover' });
  await new Promise(r => setTimeout(r, 300));

  dom = await callTool('chrome_read_dom', { tabId });
  const relEl = dom.indexedElements.find(e => e.attributes?.id === 'hover-release') || dom.indexedElements.find(e => e.text?.trim() === 'RELEASE');
  if (!relEl) throw new Error('RELEASE button not found after DELTA hover');
  console.log(`Clicking RELEASE [${relEl.index}]...`);
  await callTool('chrome_interact_index', { tabId, index: relEl.index, action: 'click' });
  await new Promise(r => setTimeout(r, 200));

  // 4. Double click
  console.log('\n--- 4. Double click ---');
  dom = await callTool('chrome_read_dom', { tabId });
  const dblEl = dom.indexedElements.find(e => e.attributes?.id === 'double-cell');
  if (!dblEl) throw new Error('double-cell not found');
  console.log(`Double clicking [${dblEl.index}]...`);
  await callTool('chrome_interact_index', { tabId, index: dblEl.index, action: 'double_click' });
  await new Promise(r => setTimeout(r, 200));

  // 5. Right click: context menu
  console.log('\n--- 5. Right click ---');
  dom = await callTool('chrome_read_dom', { tabId });
  const ctxPanel = dom.indexedElements.find(e => e.attributes?.id === 'ctx-panel');
  if (!ctxPanel) throw new Error('ctx-panel not found');
  console.log(`Right clicking ctx-panel [${ctxPanel.index}]...`);
  await callTool('chrome_interact_index', { tabId, index: ctxPanel.index, action: 'right_click' });
  await new Promise(r => setTimeout(r, 300));

  dom = await callTool('chrome_read_dom', { tabId });
  const extractKey = dom.indexedElements.find(e => e.attributes?.id === 'extract-key');
  if (!extractKey) throw new Error('extract-key button not found');
  console.log(`Clicking Extract Key [${extractKey.index}]...`);
  await callTool('chrome_interact_index', { tabId, index: extractKey.index, action: 'click' });
  await new Promise(r => setTimeout(r, 200));

  // 6. Micro target (8px button under sticky header)
  console.log('\n--- 6. Micro target ---');
  dom = await callTool('chrome_read_dom', { tabId });
  const microEl = dom.indexedElements.find(e => e.attributes?.id === 'micro-target');
  if (!microEl) throw new Error('micro-target not found');
  console.log(`Clicking micro-target [${microEl.index}]...`);
  await callTool('chrome_interact_index', { tabId, index: microEl.index, action: 'click' });
  await new Promise(r => setTimeout(r, 200));

  // 7. Dynamic button (id changes periodically)
  console.log('\n--- 7. Dynamic button ---');
  dom = await callTool('chrome_read_dom', { tabId });
  const dynEl = dom.indexedElements.find(e => e.text?.includes('STABLE TEXT'));
  if (!dynEl) throw new Error('Dynamic button not found');
  console.log(`Clicking dynamic button [${dynEl.index}]...`);
  await callTool('chrome_interact_index', { tabId, index: dynEl.index, action: 'click' });
  await new Promise(r => setTimeout(r, 200));

  // 8. Sequence pads (Greek letters)
  console.log('\n--- 8. Sequence pads ---');
  for (const ch of session.clickSequence) {
    dom = await callTool('chrome_read_dom', { tabId });
    const pad = dom.indexedElements.find(e => e.text?.trim() === ch);
    if (!pad) throw new Error(`Sequence pad "${ch}" not found`);
    console.log(`Clicking pad "${ch}" [${pad.index}]...`);
    await callTool('chrome_interact_index', { tabId, index: pad.index, action: 'click' });
    await new Promise(r => setTimeout(r, 150));
  }

  // Commit protocol
  console.log('\n--- Committing Protocol 1 ---');
  dom = await callTool('chrome_read_dom', { tabId });
  const commitBtn = dom.indexedElements.find(e => e.attributes?.id === 'protocol-commit');
  if (commitBtn) {
    await callTool('chrome_interact_index', { tabId, index: commitBtn.index, action: 'click' });
  }
  await new Promise(r => setTimeout(r, 500));

  const checkRes = await callTool('chrome_javascript', {
    tabId,
    code: `return JSON.stringify(JSON.parse(localStorage.getItem('nexus-lab-v1') || '{}').runs?.click || {});`,
  });
  const run = JSON.parse(checkRes.result || '{}');
  console.log(`[P01] Result: passed=${run.passed}, checks=${run.checks?.filter(c => c.passed).length}/${run.checks?.length}`);
  if (!run.passed) {
    throw new Error(`P01 failed to pass all checks: ${JSON.stringify(run.checks)}`);
  }
}

if (process.argv[1]?.endsWith('test-p01-complete.mjs') || process.argv[1]?.endsWith('test-p01.mjs')) {
  testP01().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
