import { callTool } from './mcp-runner.mjs';

async function main() {
  const tabsRes = await callTool('get_windows_and_tabs');
  const tab = tabsRes.windows[0].tabs.find(t => t.url.includes('4173'));
  const tabId = tab.tabId;

  console.log('Reading DOM on #/protocol/shadow...');
  const dom = await callTool('chrome_read_dom', { tabId });

  const targets = [
    'open-shadow-btn',
    'closed-shadow-btn',
    'nested-closed-btn',
    'slotted-btn',
    'probe',
    'deep',
    'shadow-in-iframe'
  ];

  for (const id of targets) {
    const el = dom.indexedElements.find(e => e.attributes?.id === id);
    if (!el) {
      console.error(`Target ${id} NOT found in DOM tree!`);
      continue;
    }
    console.log(`Clicking [${el.index}] id="${id}" text="${el.text}"...`);
    const res = await callTool('chrome_interact_index', { tabId, index: el.index, action: 'click' });
    console.log(` -> Result:`, res.success, res.action, res.coordinates);
    await new Promise(r => setTimeout(r, 200));
  }

  // Commit
  const domAfter = await callTool('chrome_read_dom', { tabId });
  const commitBtn = domAfter.indexedElements.find(e => e.attributes?.id === 'protocol-commit');
  if (commitBtn) {
    console.log(`Clicking commit [${commitBtn.index}]...`);
    await callTool('chrome_interact_index', { tabId, index: commitBtn.index, action: 'click' });
  }

  await new Promise(r => setTimeout(r, 500));

  const checkRes = await callTool('chrome_javascript', {
    tabId,
    code: `return JSON.stringify(JSON.parse(localStorage.getItem('nexus-lab-v1') || '{}').runs?.shadow || {});`,
  });
  console.log('Run status for shadow:', checkRes.result);
}

main().catch(console.error);
