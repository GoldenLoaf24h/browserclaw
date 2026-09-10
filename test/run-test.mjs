import { callTool } from './mcp-runner.mjs';

async function main() {
  const tabsRes = await callTool('get_windows_and_tabs');
  const win = tabsRes.windows[0];
  const tab = win.tabs.find(t => t.url.includes('4173'));
  if (!tab) throw new Error('Test tab not found');
  const tabId = tab.tabId;

  // Navigate to protocol/shadow
  await callTool('chrome_navigate', {
    tabId,
    url: 'http://127.0.0.1:4173/#/protocol/shadow',
  });

  await new Promise(r => setTimeout(r, 600));

  const dom = await callTool('chrome_read_dom', { tabId });
  console.log('Total indexed elements on protocol/shadow:', dom.indexedElements?.length);
  for (const el of (dom.indexedElements || [])) {
    console.log(`[${el.index}] <${el.tagName}> id="${el.attributes?.id || ''}" text="${el.text?.replace(/\n/g, ' ')}" frameId=${el.attributes?.frameId || ''}`);
  }
}

main().catch(console.error);
