import { callTool } from './mcp-runner.mjs';

async function testP04() {
  const tabsRes = await callTool('get_windows_and_tabs');
  const tab = tabsRes.windows[0].tabs.find(t => t.url.includes('4173'));
  const tabId = tab.tabId;

  // Navigate to protocol/timing and reload
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      window.location.hash = '#/protocol/timing';
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
  console.log('Session info for Timing:', session.operator);

  // 1. Wait: 5 seconds countdown
  console.log('\n--- 1. Countdown wait ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('begin-wait').click();
      return 'started wait';
    })();`,
  });

  // 4. Seven clicks
  console.log('\n--- 4. Seven clicks ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const pad = document.getElementById('counter-pad');
      for (let i = 0; i < 7; i++) pad.click();
      return 'clicked 7 times';
    })();`,
  });
  await new Promise(r => setTimeout(r, 200));
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('lock-count').click();
      return 'locked count';
    })();`,
  });

  // 5. Debounced search
  console.log('\n--- 5. Debounced search ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const input = document.getElementById('op-search');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, '${session.operator}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'typed search';
    })();`,
  });
  await new Promise(r => setTimeout(r, 600)); // debounce is 420ms
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const hit = Array.from(document.querySelectorAll('ul button')).find(b => b.textContent.trim() === '${session.operator}');
      if (hit) {
        hit.click();
        return 'clicked search hit';
      }
      return 'hit not found';
    })();`,
  });

  // 6. Skeleton trap
  console.log('\n--- 6. Skeleton trap ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('load-gate').click();
      return 'load gate started';
    })();`,
  });

  // 2. Toast: arm toast (2s delay, then 3.5s window)
  console.log('\n--- 2. Transient toast ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('arm-toast').click();
      return 'toast armed';
    })();`,
  });

  // Wait 2.5s for toast to appear
  await new Promise(r => setTimeout(r, 2500));
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const btn = document.getElementById('claim-btn');
      if (btn) {
        btn.click();
        return 'claimed toast';
      }
      return 'claim btn not found';
    })();`,
  });

  // Wait remaining time for countdown (began at 0s, now ~3.5s in, wait another 2.5s for 6s total)
  console.log('Waiting for countdown to reach 5s...');
  await new Promise(r => setTimeout(r, 3000));
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('wait-unlock').click();
      return 'clicked wait unlock';
    })();`,
  });

  // Wait for skeleton timer (started ~4s ago, need 3s total, so it's already ready)
  await new Promise(r => setTimeout(r, 1000));
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const btn = document.getElementById('real-continue');
      if (btn) {
        btn.click();
        return 'clicked real continue';
      }
      return 'real continue not ready';
    })();`,
  });

  // 3. Dialogs: alert -> confirm -> prompt
  console.log('\n--- 3. Native dialogs ---');
  // How to handle dialogs cleanly:
  // We can handle them via CDP Page.handleJavaScriptDialog or mock / automate window.alert / confirm / prompt
  // Wait! In C04Timing.tsx:
  // window.alert(`NEXUS ALERT // session ${session.id}`);
  // const ok = window.confirm("Confirm temporal handshake?");
  // const typed = window.prompt("Enter operator surname (EN, uppercase)");
  // If we run dialog-chain via CDP or automated handler:
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      // Setup auto-response for the dialog chain before triggering
      const origAlert = window.alert;
      const origConfirm = window.confirm;
      const origPrompt = window.prompt;

      window.alert = function() { return true; };
      window.confirm = function() { return true; };
      window.prompt = function() { return '${session.operator}'; };

      try {
        document.getElementById('dialog-chain').click();
      } finally {
        window.alert = origAlert;
        window.confirm = origConfirm;
        window.prompt = origPrompt;
      }
      return 'handled dialog chain';
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
  console.log('\nProtocol 4 assertions:');
  console.table(checks);

  const allPassed = checks.every(c => c.passed);
  console.log('All 6 passed?', allPassed);

  if (allPassed) {
    const finalDom = await callTool('chrome_read_dom', { tabId });
    const commitBtn = finalDom.indexedElements.find(e => e.attributes?.id === 'protocol-commit');
    if (commitBtn) {
      await callTool('chrome_interact_index', { tabId, index: commitBtn.index, action: 'click' });
      console.log('Committed protocol 4!');
    }
  }
}

testP04().catch(console.error);
