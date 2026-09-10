import { callTool } from './mcp-runner.mjs';

async function testP11() {
  const tabsRes = await callTool('get_windows_and_tabs');
  const tab = tabsRes.windows[0].tabs.find(t => t.url.includes('4173'));
  const tabId = tab.tabId;

  // Navigate to protocol/grid and reload
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      window.location.hash = '#/protocol/grid';
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
  console.log('Session info for Grid:', {
    targetRow: session.targetRow,
    gridNote: session.gridNote,
    sortColumn: session.sortColumn,
  });

  // 1, 2, 3: Filter by targetRow to bring it into view, then select, flag, and write note
  console.log('\n--- 1, 2, 3: Filter, select, flag, note ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const filter = document.getElementById('grid-filter');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(filter, '${session.targetRow}');
      filter.dispatchEvent(new Event('input', { bubbles: true }));
      return 'filtered by ${session.targetRow}';
    })();`,
  });

  await new Promise(r => setTimeout(r, 200));

  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      // Find row
      const row = document.querySelector('[data-row="${session.targetRow}"]');
      if (!row) return 'row not found';

      // 1. Checkbox (selected)
      const checkbox = row.querySelector('input[type="checkbox"]');
      if (checkbox && !checkbox.checked) {
        checkbox.click();
      }

      // 2. Right-click for flag
      const r = row.getBoundingClientRect();
      row.dispatchEvent(new MouseEvent('contextmenu', { clientX: r.left + 50, clientY: r.top + 15, bubbles: true }));

      return 'checked and right-clicked';
    })();`,
  });

  await new Promise(r => setTimeout(r, 150));

  // Click #flag-row
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const flagBtn = document.getElementById('flag-row');
      if (flagBtn) {
        flagBtn.click();
        return 'clicked flag-row';
      }
      return 'flag-row not found';
    })();`,
  });

  await new Promise(r => setTimeout(r, 150));

  // 3. Edit NOTE: double click note cell, fill, blur
  const dblRes = await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const row = document.querySelector('[data-row="${session.targetRow}"]');
      if (!row) return 'row not found for dblclick';
      const btns = Array.from(row.querySelectorAll('button'));
      const noteBtn = btns[btns.length - 1]; // note button is the last button in the row
      if (!noteBtn) return 'noteBtn not found';
      noteBtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      return 'dblclicked: ' + noteBtn.outerHTML;
    })();`,
  });
  console.log('dblRes:', dblRes.result);

  await new Promise(r => setTimeout(r, 200));

  const noteInputRes = await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const row = document.querySelector('[data-row="${session.targetRow}"]');
      if (!row) return 'row not found for input';
      const noteInput = row.querySelector('input:not([type="checkbox"])');
      if (!noteInput) {
        return 'note input not found in row. innerHTML: ' + row.innerHTML;
      }
      noteInput.focus();
      noteInput.value = '${session.gridNote}';
      noteInput.dispatchEvent(new Event('input', { bubbles: true }));
      noteInput.dispatchEvent(new Event('change', { bubbles: true }));
      // Dispatch Enter keydown
      noteInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      // Call native blur and dispatch blur/focusout events
      noteInput.blur();
      noteInput.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      noteInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      return 'set note to ' + noteInput.value;
    })();`,
  });
  console.log('noteInputRes:', noteInputRes.result);

  await new Promise(r => setTimeout(r, 300));

  // 4. Sort: clear filter first, then sort column DESC, then click top row
  console.log('\n--- 4. Sort ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const filter = document.getElementById('grid-filter');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(filter, '');
      filter.dispatchEvent(new Event('input', { bubbles: true }));

      // Find sort header for sortColumn
      // Header text for 'latency' is LAT, for 'token' is TOKEN
      const label = '${session.sortColumn}' === 'latency' ? 'LAT' : 'TOKEN';
      const headers = Array.from(document.querySelectorAll('.grid button'));
      const headerBtn = headers.find(b => b.textContent.includes(label));
      if (!headerBtn) return 'header ' + label + ' not found';

      // Click once to sort desc (since initial key is 'id', clicking a different column sets sortDir='desc')
      headerBtn.click();
      return 'clicked ' + label;
    })();`,
  });

  await new Promise(r => setTimeout(r, 400));

  // Verify sort header has down arrow
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const label = '${session.sortColumn}' === 'latency' ? 'LAT' : 'TOKEN';
      const headers = Array.from(document.querySelectorAll('.grid button'));
      const headerBtn = headers.find(b => b.textContent.includes(label));
      if (headerBtn && !headerBtn.textContent.includes('↓')) {
        // If not desc yet, click again
        headerBtn.click();
      }
      return 'sort verified';
    })();`,
  });

  await new Promise(r => setTimeout(r, 200));

  // Click first row ID
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const firstRow = document.querySelector('#virt-grid [data-row]');
      if (!firstRow) return 'first row not found';
      const idBtn = firstRow.querySelector('button');
      idBtn.click();
      return 'clicked top row ID: ' + idBtn.textContent.trim();
    })();`,
  });

  await new Promise(r => setTimeout(r, 200));

  // 5. Commit selection: click grid-commit
  console.log('\n--- 5. Commit selection ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('grid-commit').click();
      return 'clicked grid-commit';
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
  console.log('\nProtocol 11 assertions:');
  console.table(checks);

  const allPassed = checks.every(c => c.passed);
  console.log('All 5 passed?', allPassed);

  if (allPassed) {
    const finalDom = await callTool('chrome_read_dom', { tabId });
    const commitBtn = finalDom.indexedElements.find(e => e.attributes?.id === 'protocol-commit');
    if (commitBtn) {
      await callTool('chrome_interact_index', { tabId, index: commitBtn.index, action: 'click' });
      console.log('Committed protocol 11!');
    }
  }
}

testP11().catch(console.error);
