import { callTool } from './mcp-runner.mjs';

async function testP10() {
  const tabsRes = await callTool('get_windows_and_tabs');
  const tab = tabsRes.windows[0].tabs.find(t => t.url.includes('4173'));
  const tabId = tab.tabId;

  // Navigate to protocol/state/1 and reload
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      localStorage.removeItem('nexus-wiz-v1');
      window.location.hash = '#/protocol/state/1';
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
  console.log('Session info for State:', session.operator, session.csrf);

  // Step 1: fill operator, click next
  console.log('\n--- Step 1: Operator ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const input = document.getElementById('wiz-op');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, '${session.operator}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('wiz-next-1').click();
      return 'submitted step 1';
    })();`,
  });

  await new Promise(r => setTimeout(r, 300));

  // Step 2: fill csrf, click next
  console.log('\n--- Step 2: CSRF ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const input = document.getElementById('wiz-csrf');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, '${session.csrf}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('wiz-next-2').click();
      return 'submitted step 2';
    })();`,
  });

  await new Promise(r => setTimeout(r, 300));

  // Step 3: Arm reload and reload FIRST
  console.log('\n--- Step 3: Arm reload and reload ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('arm-reload').click();
      window.location.reload();
      return 'armed and reloaded';
    })();`,
  });

  await new Promise(r => setTimeout(r, 1200));

  console.log('\n--- Step 3: Click Resume ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const btn = document.getElementById('resume-wiz');
      if (btn) {
        btn.click();
        return 'clicked resume';
      }
      return 'resume btn not found';
    })();`,
  });

  await new Promise(r => setTimeout(r, 300));

  // Now history back to step 2
  console.log('\n--- Step 3: History Back to 2 ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      window.history.back();
      return 'navigated back';
    })();`,
  });

  await new Promise(r => setTimeout(r, 500));

  // Ensure persist is triggered on step 2 if needed
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const input = document.getElementById('wiz-csrf');
      if (input) {
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return 'step 2 check';
    })();`,
  });

  await new Promise(r => setTimeout(r, 200));

  // Now history forward to step 3
  console.log('\n--- Step 3: History Forward to 3 ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      window.history.forward();
      return 'navigated forward';
    })();`,
  });

  await new Promise(r => setTimeout(r, 500));

  // Click arm-reload on step 3 to trigger save() -> pass("persist")
  console.log('\n--- Step 3: Trigger save via arm-reload ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('arm-reload').click();
      return 'triggered save';
    })();`,
  });

  await new Promise(r => setTimeout(r, 200));

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
  console.log('\nProtocol 10 assertions:');
  console.table(checks);

  const allPassed = checks.every(c => c.passed);
  console.log('All 5 passed?', allPassed);

  if (allPassed) {
    const finalDom = await callTool('chrome_read_dom', { tabId });
    const commitBtn = finalDom.indexedElements.find(e => e.attributes?.id === 'protocol-commit');
    if (commitBtn) {
      await callTool('chrome_interact_index', { tabId, index: commitBtn.index, action: 'click' });
      console.log('Committed protocol 10!');
    }
  }
}

testP10().catch(console.error);
