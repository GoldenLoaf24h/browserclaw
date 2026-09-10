import { callTool } from './mcp-runner.mjs';

async function testP05() {
  const tabsRes = await callTool('get_windows_and_tabs');
  const tab = tabsRes.windows[0].tabs.find(t => t.url.includes('4173'));
  const tabId = tab.tabId;

  // Navigate to protocol/scroll and reload
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      window.location.hash = '#/protocol/scroll';
      window.location.reload();
      return 'reloaded';
    })();`,
  });
  await new Promise(r => setTimeout(r, 1200));

  // Get session info
  const sessionInfo = await callTool('chrome_javascript', {
    tabId,
    code: `return JSON.stringify(JSON.parse(localStorage.getItem('nexus-lab-v1') || '{}').session);`,
  });
  const session = JSON.parse(sessionInfo.result || '{}');
  const carIndex = session.clickToken.charCodeAt(1) % 12;
  console.log('Session info for Scroll. carIndex:', carIndex);

  // 1. Nested overflow target
  console.log('\n--- 1. Nested overflow ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const btn = document.getElementById('nested-deep-btn');
      btn.scrollIntoView({ block: 'center' });
      btn.click();
      return 'clicked nested';
    })();`,
  });

  // 2. Carousel
  console.log('\n--- 2. Carousel ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const card = document.getElementById('card-${carIndex}');
      card.scrollIntoView({ inline: 'center' });
      card.click();
      return 'clicked card ${carIndex}';
    })();`,
  });

  // 3. Infinite list: scroll until #048 appears, then click
  console.log('\n--- 3. Infinite list ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const list = document.getElementById('infinite-list');
      // Scroll to bottom multiple times to load up to 60
      for (let i = 0; i < 6; i++) {
        list.scrollTop = list.scrollHeight;
        list.dispatchEvent(new Event('scroll'));
      }
      return 'scrolled infinite list';
    })();`,
  });
  await new Promise(r => setTimeout(r, 300));
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const row = Array.from(document.querySelectorAll('#infinite-list button')).find(b => b.textContent.includes('#048'));
      if (row) {
        row.click();
        return 'clicked #048';
      }
      return '#048 not found';
    })();`,
  });

  // 4. Occlude scroll
  console.log('\n--- 4. Sticky occlude ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const btn = document.getElementById('occluded-btn');
      btn.scrollIntoView({ block: 'center' });
      btn.click();
      return 'clicked occluded';
    })();`,
  });

  // 5. Lazy dwell
  console.log('\n--- 5. Lazy dwell ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const sentinel = document.getElementById('lazy-sentinel');
      sentinel.scrollIntoView({ block: 'center' });
      return 'scrolled sentinel';
    })();`,
  });
  console.log('Waiting 1.8s for lazy button to materialize...');
  await new Promise(r => setTimeout(r, 1800));
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const btn = document.getElementById('lazy-btn');
      if (btn) {
        btn.click();
        return 'clicked lazy btn';
      }
      return 'lazy btn not found';
    })();`,
  });

  // 6. Snap panel 4
  console.log('\n--- 6. Scroll snap ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const row = document.getElementById('snap-row');
      const btn = document.getElementById('snap-confirm');
      btn.scrollIntoView({ inline: 'center' });
      btn.click();
      return 'clicked snap confirm';
    })();`,
  });

  await new Promise(r => setTimeout(r, 300));

  // Check assertions
  const checkRes = await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const checks = Array.from(document.querySelectorAll('aside li')).map(li => ({
        text: li.textContent,
        passed: li.textContent.includes('▣')
      }));
      return JSON.stringify(checks);
    })();`,
  });
  const checks = JSON.parse(checkRes.result);
  console.log('\nProtocol 5 assertions:');
  console.table(checks);

  const allPassed = checks.every(c => c.passed);
  console.log('All 6 passed?', allPassed);

  if (allPassed) {
    const finalDom = await callTool('chrome_read_dom', { tabId });
    const commitBtn = finalDom.indexedElements.find(e => e.attributes?.id === 'protocol-commit');
    if (commitBtn) {
      await callTool('chrome_interact_index', { tabId, index: commitBtn.index, action: 'click' });
      console.log('Committed protocol 5!');
    }
  }
}

testP05().catch(console.error);
