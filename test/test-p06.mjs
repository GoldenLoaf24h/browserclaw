import { callTool } from './mcp-runner.mjs';

async function testP06() {
  const tabsRes = await callTool('get_windows_and_tabs');
  const tab = tabsRes.windows[0].tabs.find(t => t.url.includes('4173'));
  const tabId = tab.tabId;

  // Navigate to protocol/keyboard and reload
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      window.location.hash = '#/protocol/keyboard';
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
  console.log('Session info for Keyboard:', {
    id: session.id,
    operator: session.operator,
    chinesePhrase: session.chinesePhrase,
  });

  // 1. Escape: press Escape on window
  console.log('\n--- 1. Escape ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return 'dispatched escape';
    })();`,
  });

  // 2. Palette: Ctrl+K then unlock-core + Enter
  console.log('\n--- 2. Palette ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      // 1. Open palette via Ctrl+K
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      return 'dispatched ctrl+k';
    })();`,
  });
  await new Promise(r => setTimeout(r, 200));
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const input = document.getElementById('command-input');
      if (!input) return 'command input not found';
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, 'unlock-core');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return 'submitted unlock-core';
    })();`,
  });

  // 3. Arrows: focus arrow-list, ArrowDown to operator, Enter
  console.log('\n--- 3. Arrows ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const list = document.getElementById('arrow-list');
      list.focus();
      const names = ["VOSS", "QUINE", "HADLEY", "SOREN", "NADIR", "PAVEL"];
      const targetIdx = names.indexOf('${session.operator}');
      for (let i = 0; i < targetIdx; i++) {
        list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      }
      return 'arrowed ' + targetIdx + ' times';
    })();`,
  });

  await new Promise(r => setTimeout(r, 200));

  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const list = document.getElementById('arrow-list');
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return 'pressed enter on arrow-list';
    })();`,
  });

  // 4. Paste: copy source to paste-only
  console.log('\n--- 4. Paste ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const pasteInput = document.getElementById('paste-only');
      const dt = new DataTransfer();
      dt.setData('text/plain', '${session.id}');
      const pasteEvt = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true
      });
      pasteInput.dispatchEvent(pasteEvt);
      return 'pasted';
    })();`,
  });

  // 5. Type-only: Chinese phrase
  console.log('\n--- 5. Type only ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const typeInput = document.getElementById('type-only');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(typeInput, '${session.chinesePhrase}');
      typeInput.dispatchEvent(new Event('input', { bubbles: true }));
      typeInput.dispatchEvent(new Event('change', { bubbles: true }));
      return 'typed chinese';
    })();`,
  });

  // 6. Enter confirm
  console.log('\n--- 6. Enter confirm ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('open-confirm').click();
      return 'opened confirm';
    })();`,
  });
  await new Promise(r => setTimeout(r, 200));
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const confirmDiv = document.getElementById('enter-confirm');
      confirmDiv.focus();
      confirmDiv.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return 'pressed enter on confirm';
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
  console.log('\nProtocol 6 assertions:');
  console.table(checks);

  const allPassed = checks.every(c => c.passed);
  console.log('All 6 passed?', allPassed);

  if (allPassed) {
    const finalDom = await callTool('chrome_read_dom', { tabId });
    const commitBtn = finalDom.indexedElements.find(e => e.attributes?.id === 'protocol-commit');
    if (commitBtn) {
      await callTool('chrome_interact_index', { tabId, index: commitBtn.index, action: 'click' });
      console.log('Committed protocol 6!');
    }
  }
}

testP06().catch(console.error);
