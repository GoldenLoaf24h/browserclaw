import { callTool } from './mcp-runner.mjs';

async function testP08() {
  const tabsRes = await callTool('get_windows_and_tabs');
  const tab = tabsRes.windows[0].tabs.find(t => t.url.includes('4173'));
  const tabId = tab.tabId;

  // Navigate to protocol/modal and reload
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      window.location.hash = '#/protocol/modal';
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
  const need = `SEAL-${session.id.slice(3)}`;
  console.log('Session info for Modal. Phrase need:', need);

  // 1. Cookie wall: Accept Necessary Only
  console.log('\n--- 1. Cookie wall ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const btn = document.getElementById('accept-necessary');
      if (btn) {
        btn.click();
        return 'clicked accept-necessary';
      }
      return 'accept-necessary not found';
    })();`,
  });

  await new Promise(r => setTimeout(r, 200));

  // 2. Portal stack: L1 -> L2 -> L3 -> close
  console.log('\n--- 2. Portal stack ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('open-stack').click();
      return 'opened L1';
    })();`,
  });
  await new Promise(r => setTimeout(r, 150));
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('to-l2').click();
      return 'opened L2';
    })();`,
  });
  await new Promise(r => setTimeout(r, 150));
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('to-l3').click();
      return 'opened L3';
    })();`,
  });
  await new Promise(r => setTimeout(r, 150));
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('close-stack').click();
      return 'closed stack';
    })();`,
  });

  await new Promise(r => setTimeout(r, 200));

  // 3. Focus trap
  console.log('\n--- 3. Focus trap ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('open-trap').click();
      return 'opened trap';
    })();`,
  });
  await new Promise(r => setTimeout(r, 150));
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('trap-submit').click();
      return 'submitted trap';
    })();`,
  });

  await new Promise(r => setTimeout(r, 200));

  // 4 & 5. Phrase dialog
  console.log('\n--- 4 & 5. Phrase dialog ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('open-phrase').click();
      return 'opened phrase';
    })();`,
  });
  await new Promise(r => setTimeout(r, 150));
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const input = document.getElementById('phrase-input');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, '${need}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('phrase-ok').click();
      return 'submitted phrase ${need}';
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
  console.log('\nProtocol 8 assertions:');
  console.table(checks);

  const allPassed = checks.every(c => c.passed);
  console.log('All 5 passed?', allPassed);

  if (allPassed) {
    const finalDom = await callTool('chrome_read_dom', { tabId });
    const commitBtn = finalDom.indexedElements.find(e => e.attributes?.id === 'protocol-commit');
    if (commitBtn) {
      await callTool('chrome_interact_index', { tabId, index: commitBtn.index, action: 'click' });
      console.log('Committed protocol 8!');
    }
  }
}

testP08().catch(console.error);
