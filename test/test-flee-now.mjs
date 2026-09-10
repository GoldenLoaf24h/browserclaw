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

  const dom = await callTool('chrome_read_dom', { tabId });
  const elAtPoint = await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const el = document.elementFromPoint(465, 278);
      return JSON.stringify({
        tag: el?.tagName,
        id: el?.id,
        className: el?.className,
        text: el?.textContent?.slice(0, 50)
      });
    })()`
  });
  console.log('Element at (465, 278):', elAtPoint.result);
  const fleeBtn = dom.indexedElements.find(e => e.attributes?.id === 'fleeing-target');

  const beforeRes = await callTool('chrome_javascript', {
    tabId,
    code: `const el = document.getElementById('fleeing-target'); const r = el.getBoundingClientRect(); return JSON.stringify({ left: r.left, top: r.top, style: el.getAttribute('style') });`
  });
  console.log('Before click:', beforeRes.result);

  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      window.__allEvents = [];
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
        window.addEventListener(evt, (e) => {
          window.__allEvents.push({
            type: evt,
            targetTag: e.target?.tagName,
            targetId: e.target?.id,
            targetClass: e.target?.className,
            clientX: e.clientX,
            clientY: e.clientY,
            pageX: e.pageX,
            pageY: e.pageY,
            isTrusted: e.isTrusted
          });
        }, true);
      });
      return 'global listeners added';
    })()`
  });

  const res = await callTool('chrome_interact_index', { tabId, index: fleeBtn.index, action: 'click' });
  console.log('Interact result:', res);

  const evtsRes = await callTool('chrome_javascript', {
    tabId,
    code: `return JSON.stringify(window.__allEvents || []);`
  });
  console.log('Fired events globally:', evtsRes.result);

  const afterRes = await callTool('chrome_javascript', {
    tabId,
    code: `const el = document.getElementById('fleeing-target'); const r = el.getBoundingClientRect(); return JSON.stringify({ left: r.left, top: r.top, style: el.getAttribute('style') });`
  });
  console.log('After click:', afterRes.result);

  await new Promise(r => setTimeout(r, 300));
  const checkRes = await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const checks = Array.from(document.querySelectorAll('aside li')).map(li => ({
        text: li.textContent,
        passed: li.textContent.includes('▣')
      }));
      return JSON.stringify(checks.find(c => c.text.includes('逃逸')));
    })();`,
  });
  console.log('Flee check status:', checkRes.result);
}

main().catch(console.error);
