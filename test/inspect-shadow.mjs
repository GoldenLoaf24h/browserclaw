import { callTool } from './mcp-runner.mjs';

async function main() {
  const tabId = 1581256628;
  await callTool('chrome_javascript', {
    tabId,
    code: `window.location.hash = '#/protocol/shadow'; return 'ok';`,
  });
  await new Promise(r => setTimeout(r, 1000));
  const dom = await callTool('chrome_read_dom', { tabId });
  console.log('Interactive elements count:', dom.interactiveCount);
  for (const el of dom.indexedElements) {
    console.log(` - [${el.index}] <${el.tagName}> id="${el.attributes?.id || ''}" text=${JSON.stringify(el.text)}`);
  }
}

main().catch(console.error);
