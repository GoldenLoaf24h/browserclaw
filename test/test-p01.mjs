import { callTool } from './mcp-runner.mjs';

async function testP01() {
  const tabsRes = await callTool('get_windows_and_tabs');
  const win = tabsRes.windows[0];
  const tab = win.tabs.find(t => t.url.includes('4173'));
  if (!tab) throw new Error('Test tab not found');
  const tabId = tab.tabId;

  // Navigate to protocol/click
  await callTool('chrome_javascript', {
    tabId,
    code: `window.location.hash = '#/protocol/click';`,
  });
  await new Promise(r => setTimeout(r, 600));

  // Get session info
  const sessionInfo = await callTool('chrome_javascript', {
    tabId,
    code: `return JSON.stringify(JSON.parse(localStorage.getItem('nexus-lab-v1') || '{}').session);`,
  });
  const session = JSON.parse(sessionInfo.result || '{}');
  console.log('Session info:', {
    id: session.id,
    operator: session.operator,
    clickToken: session.clickToken,
    clickSequence: session.clickSequence,
  });

  // 1. Read DOM
  let dom = await callTool('chrome_read_dom', { tabId });

  // Test 1: flee button
  console.log('\n--- Testing flee ---');
  const fleeEl = dom.indexedElements.find(e => e.attributes?.id === 'fleeing-target');
  console.log('flee element:', fleeEl);
  if (fleeEl) {
    const res = await callTool('chrome_interact_index', { tabId, index: fleeEl.index, action: 'click' });
    console.log('flee click result:', res);
  }

  // Check flags
  let runStatus = await callTool('chrome_javascript', {
    tabId,
    code: `return JSON.stringify(JSON.parse(localStorage.getItem('nexus-lab-v1') || '{}').runs?.click || {});`,
  });
  console.log('Run status after flee:', runStatus.result);

  // Test 2: token
  console.log('\n--- Testing token ---');
  // Look at authorize buttons
  const authIdxs = await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'AUTHORIZE');
      return JSON.stringify(btns.map(b => ({ k: b.getAttribute('data-k'), answer: b.getAttribute('data-answer') })));
    })();`,
  });
  console.log('AUTHORIZE buttons in page:', authIdxs.result);

  // Test 3: hover
  console.log('\n--- Testing hover ---');
  dom = await callTool('chrome_read_dom', { tabId });
  const sysEl = dom.indexedElements.find(e => e.text?.includes('SYSTEM'));
  console.log('SYSTEM element:', sysEl);
  if (sysEl) {
    await callTool('chrome_interact_index', { tabId, index: sysEl.index, action: 'hover' });
    await new Promise(r => setTimeout(r, 200));
    // Check if DELTA is visible
    const deltaRes = await callTool('chrome_javascript', {
      tabId,
      code: `return (() => {
        const delta = Array.from(document.querySelectorAll('div')).find(d => d.textContent.trim() === 'DELTA ▸');
        if (!delta) return 'delta not found';
        const rect = delta.getBoundingClientRect();
        return JSON.stringify({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, visible: window.getComputedStyle(delta.parentElement.parentElement).visibility });
      })();`,
    });
    console.log('DELTA status after hover SYSTEM:', deltaRes.result);
  }

  // Test 4: dblclick
  console.log('\n--- Testing dblclick ---');
  const dblEl = dom.indexedElements.find(e => e.attributes?.id === 'double-cell');
  if (dblEl) {
    await callTool('chrome_interact_index', { tabId, index: dblEl.index, action: 'double_click' });
  }

  // Test 5: right-click
  console.log('\n--- Testing right click ctx ---');
  const ctxCoords = await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const el = document.getElementById('ctx-panel');
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    })();`,
  });
  const cp = JSON.parse(ctxCoords.result);
  await callTool('chrome_interact_index', { tabId, coordinate: cp, action: 'right_click' });
  await new Promise(r => setTimeout(r, 200));

  // Now find extract-key
  dom = await callTool('chrome_read_dom', { tabId });
  const extEl = dom.indexedElements.find(e => e.text?.includes('Extract Key') || e.attributes?.id === 'extract-key');
  console.log('extract-key element:', extEl);
  if (extEl) {
    await callTool('chrome_interact_index', { tabId, index: extEl.index, action: 'click' });
  }

  // Test 6: micro target
  console.log('\n--- Testing micro ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `(() => {
      const el = document.getElementById('micro-scroll');
      const target = document.getElementById('micro-target');
      target.scrollIntoView({ block: 'center' });
    })()`,
  });
  dom = await callTool('chrome_read_dom', { tabId });
  const microEl = dom.indexedElements.find(e => e.attributes?.id === 'micro-target');
  console.log('micro target element:', microEl);
  if (microEl) {
    await callTool('chrome_interact_index', { tabId, index: microEl.index, action: 'click' });
  }

  // Test 7: dyn
  console.log('\n--- Testing dyn ---');
  const dynEl = dom.indexedElements.find(e => e.text?.includes('STABLE TEXT, UNSTABLE ID'));
  console.log('dyn element:', dynEl);
  if (dynEl) {
    await callTool('chrome_interact_index', { tabId, index: dynEl.index, action: 'click' });
  }

  // Test 8: seq
  console.log('\n--- Testing seq ---');
  for (const sym of session.clickSequence) {
    dom = await callTool('chrome_read_dom', { tabId });
    const pad = dom.indexedElements.find(e => e.text === sym);
    console.log(`Clicking pad ${sym}:`, pad?.index);
    if (pad) {
      await callTool('chrome_interact_index', { tabId, index: pad.index, action: 'click' });
    }
  }

  // Check flags before commit
  const checkRes = await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const r = JSON.parse(localStorage.getItem('nexus-lab-v1') || '{}');
      const checks = Array.from(document.querySelectorAll('aside li')).map(li => ({
        text: li.textContent,
        passed: li.textContent.includes('▣')
      }));
      return JSON.stringify(checks);
    })();`,
  });
  console.log('\nAssertions state:', JSON.parse(checkRes.result));

  // Click commit
  dom = await callTool('chrome_read_dom', { tabId });
  const commitBtn = dom.indexedElements.find(e => e.attributes?.id === 'protocol-commit');
  if (commitBtn) {
    await callTool('chrome_interact_index', { tabId, index: commitBtn.index, action: 'click' });
  }
}

testP01().catch(console.error);
