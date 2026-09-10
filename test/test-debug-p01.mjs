import { callTool } from './mcp-runner.mjs';

async function main() {
  const tabsRes = await callTool('get_windows_and_tabs');
  const tab = tabsRes.windows[0].tabs.find(t => t.url.includes('4173'));
  const tabId = tab.tabId;

  await callTool('chrome_javascript', {
    tabId,
    code: `window.location.hash = '#/protocol/click'; window.location.reload(); return 'ok';`,
  });
  await new Promise(r => setTimeout(r, 1200));

  // Check flee
  console.log('--- Testing Flee ---');
  let dom = await callTool('chrome_read_dom', { tabId });
  let fleeEl = dom.indexedElements.find(e => e.attributes?.id === 'fleeing-target');
  console.log('fleeEl:', fleeEl?.index, fleeEl?.rect);

  const fleeRes = await callTool('chrome_interact_index', { tabId, index: fleeEl.index, action: 'click' });
  console.log('flee click result:', fleeRes);

  let checkFlee = await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const li = Array.from(document.querySelectorAll('aside li')).find(l => l.textContent.includes('逃逸'));
      return li ? li.textContent : 'not found';
    })()`
  });
  console.log('flee check status:', checkFlee.result);

  // Check hover
  console.log('\n--- Testing Hover ---');
  dom = await callTool('chrome_read_dom', { tabId });
  const sysEl = dom.indexedElements.find(e => e.text?.includes('SYSTEM'));
  console.log('sysEl:', sysEl?.index, sysEl?.rect);
  await callTool('chrome_interact_index', { tabId, index: sysEl.index, action: 'hover' });
  await new Promise(r => setTimeout(r, 300));

  dom = await callTool('chrome_read_dom', { tabId });
  console.log('Indexed elements after sysEl hover:');
  for (const e of dom.indexedElements) {
    if (e.index >= 20 && e.index <= 35) {
      console.log(' - [' + e.index + '] <' + e.tagName + '> ' + JSON.stringify(e.text) + ' ' + JSON.stringify(e.attributes));
    }
  }
  const deltaEl = dom.indexedElements.find(e => e.text?.includes('DELTA'));
  console.log('deltaEl:', deltaEl?.index, deltaEl?.rect);
  await callTool('chrome_interact_index', { tabId, index: deltaEl.index, action: 'hover' });
  await new Promise(r => setTimeout(r, 300));

  dom = await callTool('chrome_read_dom', { tabId });
  const relEl = dom.indexedElements.find(e => e.attributes?.id === 'hover-release');
  console.log('relEl:', relEl?.index, relEl?.rect);
  const relRes = await callTool('chrome_interact_index', { tabId, index: relEl.index, action: 'click' });
  console.log('relRes:', relRes);

  let checkHover = await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const li = Array.from(document.querySelectorAll('aside li')).find(l => l.textContent.includes('悬停'));
      return li ? li.textContent : 'not found';
    })()`
  });
  console.log('hover check status:', checkHover.result);
}

main().catch(console.error);
