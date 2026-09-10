import { callTool } from './mcp-runner.mjs';

async function testP07() {
  const tabsRes = await callTool('get_windows_and_tabs');
  const tab = tabsRes.windows[0].tabs.find(t => t.url.includes('4173'));
  const tabId = tab.tabId;

  // Navigate to protocol/drag and reload
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      window.location.hash = '#/protocol/drag';
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
  const want = session.sliderTarget;
  console.log('Session info for Drag. Slider target:', want);

  // 1. HTML5 drop well
  console.log('\n--- 1. HTML5 DnD ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const well = document.getElementById('drop-well');
      const dt = new DataTransfer();
      dt.setData('text/plain', 'MODULE');
      well.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      well.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      return 'dropped module';
    })();`,
  });

  // 2. Pointer drag to bottom-right target
  console.log('\n--- 2. Pointer drag ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const arena = document.getElementById('pointer-arena');
      const block = document.getElementById('pointer-block');
      const r = arena.getBoundingClientRect();

      // target condition: x > r.width - 110 && y > r.height - 80
      const targetClientX = r.left + r.width - 50;
      const targetClientY = r.top + r.height - 40;

      block.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + 20, clientY: r.top + 20, bubbles: true }));
      arena.dispatchEvent(new PointerEvent('pointermove', { clientX: targetClientX, clientY: targetClientY, bubbles: true }));
      arena.dispatchEvent(new PointerEvent('pointerup', { clientX: targetClientX, clientY: targetClientY, bubbles: true }));
      return 'dragged pointer block';
    })();`,
  });

  // 3. Sortable: target order is A->Z
  console.log('\n--- 3. Sortable ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const lis = Array.from(document.querySelectorAll('ul li[draggable]'));
      const gauntLi = lis.find(li => li.textContent.trim() === 'GAUNT');
      const target0 = lis[0];
      gauntLi.dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
      target0.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
      target0.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true }));
      return 'dragged GAUNT to 0';
    })();`,
  });

  await new Promise(r => setTimeout(r, 200));

  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      // Current order: ["GAUNT", "ORBIT", "KITE", "NEXUS", "PRISM"]
      // To get ["GAUNT", "KITE", "NEXUS", "ORBIT", "PRISM"],
      // drag ORBIT (index 1) onto NEXUS (index 3)
      const lis = Array.from(document.querySelectorAll('ul li[draggable]'));
      const orbitLi = lis.find(li => li.textContent.trim() === 'ORBIT');
      const nexusLi = lis.find(li => li.textContent.trim() === 'NEXUS');
      orbitLi.dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
      nexusLi.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
      nexusLi.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true }));
      return 'dragged ORBIT to NEXUS';
    })();`,
  });

  // 4. Native range
  console.log('\n--- 4. Native range ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const input = document.getElementById('native-range');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, '${want}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return 'set native range to ${want}';
    })();`,
  });

  // 5. Custom slider
  console.log('\n--- 5. Custom slider ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const slider = document.getElementById('custom-slider');
      const r = slider.getBoundingClientRect();
      const targetClientX = r.left + (${want} / 100) * r.width;
      slider.dispatchEvent(new PointerEvent('pointerdown', { clientX: targetClientX, bubbles: true }));
      slider.dispatchEvent(new PointerEvent('pointermove', { clientX: targetClientX, bubbles: true }));
      slider.dispatchEvent(new PointerEvent('pointerup', { clientX: targetClientX, bubbles: true }));
      return 'set custom slider to ${want}';
    })();`,
  });

  // 6. Resize panel to 340px
  console.log('\n--- 6. Resize panel ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const panel = document.getElementById('resize-panel');
      const handle = document.getElementById('resize-handle');
      const r = panel.getBoundingClientRect();
      const targetClientX = r.left + 340;
      handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.right, bubbles: true }));
      handle.dispatchEvent(new PointerEvent('pointermove', { clientX: targetClientX, bubbles: true }));
      handle.dispatchEvent(new PointerEvent('pointerup', { clientX: targetClientX, bubbles: true }));
      return 'resized panel to 340';
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
  console.log('\nProtocol 7 assertions:');
  console.table(checks);

  const allPassed = checks.every(c => c.passed);
  console.log('All 6 passed?', allPassed);

  if (allPassed) {
    const finalDom = await callTool('chrome_read_dom', { tabId });
    const commitBtn = finalDom.indexedElements.find(e => e.attributes?.id === 'protocol-commit');
    if (commitBtn) {
      await callTool('chrome_interact_index', { tabId, index: commitBtn.index, action: 'click' });
      console.log('Committed protocol 7!');
    }
  }
}

testP07().catch(console.error);
