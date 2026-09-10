import { callTool } from './mcp-runner.mjs';

function calcOtp(seed, at = Date.now()) {
  const slot = Math.floor(at / 30000);
  const x = Math.abs(Math.sin(seed * 997 + slot * 13.37) * 1000000);
  return String(Math.floor(x) % 1000000).padStart(6, '0');
}

async function testP12() {
  const tabsRes = await callTool('get_windows_and_tabs');
  const tab = tabsRes.windows[0].tabs.find(t => t.url.includes('4173'));
  const tabId = tab.tabId;

  // Navigate to protocol/omega and reload
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      window.location.hash = '#/protocol/omega';
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
  console.log('Session info for Omega:', {
    id: session.id,
    operator: session.operator,
    otpSeed: session.otpSeed,
  });

  // 1. Cookie gate: click #omega-necessary
  console.log('\n--- 1. Cookie Gate ---');
  const cookieRes = await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const btn = document.getElementById('omega-necessary');
      if (btn) {
        btn.click();
        return 'clicked omega-necessary';
      }
      return 'omega-necessary not found';
    })();`,
  });
  console.log('Cookie result:', cookieRes.result);
  await new Promise(r => setTimeout(r, 300));

  // 2. TOTP: Hover #omega-otp, extract text or calculate, fill input, submit
  console.log('\n--- 2. TOTP ---');
  const otpCode = calcOtp(session.otpSeed);
  console.log('Calculated OTP:', otpCode);

  const otpRes = await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const otpBox = document.getElementById('omega-otp');
      if (otpBox) {
        otpBox.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
      }
      const input = document.getElementById('omega-otp-input');
      if (!input) return 'omega-otp-input not found';

      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, '${otpCode}');
      input.dispatchEvent(new Event('input', { bubbles: true }));

      const goBtn = document.getElementById('omega-otp-go');
      if (!goBtn) return 'omega-otp-go not found';
      goBtn.click();
      return 'submitted otp ${otpCode}';
    })();`,
  });
async function waitForSelector(tabId, selector, timeoutMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await callTool('chrome_javascript', {
      tabId,
      code: `return !!document.querySelector('${selector}');`
    });
    if (res.result === true) return true;
    await new Promise(r => setTimeout(r, 150));
  }
  return false;
}

  console.log('OTP result:', otpRes.result);
  await waitForSelector(tabId, '#omega-shadow-host', 3000);
  await new Promise(r => setTimeout(r, 500));

  // 3. Closed Shadow: find button inside closed shadow via chrome_read_dom
  console.log('\n--- 3. Closed Shadow ---');
  let shadowDom = await callTool('chrome_read_dom', { tabId });
  let shadowBtn = shadowDom.indexedElements.find(e => e.attributes?.id === 'omega-closed');
  if (!shadowBtn) {
    // Retry once after 500ms
    await new Promise(r => setTimeout(r, 500));
    shadowDom = await callTool('chrome_read_dom', { tabId });
    shadowBtn = shadowDom.indexedElements.find(e => e.attributes?.id === 'omega-closed');
  }
  if (!shadowBtn) {
    throw new Error('Button omega-closed inside closed shadow root not found in DOM index!');
  }
  console.log(`Clicking omega-closed via index [${shadowBtn.index}]...`);
  await callTool('chrome_interact_index', {
    tabId,
    index: shadowBtn.index,
    action: 'click',
  });
  await waitForSelector(tabId, '#omega-slider', 4000);
  await new Promise(r => setTimeout(r, 300));

  // 4. Custom Slider: drag #omega-slider to 100
  console.log('\n--- 4. Custom Slider ---');
  const sliderRes = await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const slider = document.getElementById('omega-slider');
      if (!slider) return 'slider not found';
      const r = slider.getBoundingClientRect();
      const targetX = r.right;
      const targetY = r.top + r.height / 2;
      slider.dispatchEvent(new PointerEvent('pointerdown', { clientX: targetX, clientY: targetY, bubbles: true, pointerId: 1 }));
      slider.dispatchEvent(new PointerEvent('pointermove', { clientX: targetX, clientY: targetY, bubbles: true, pointerId: 1 }));
      slider.dispatchEvent(new PointerEvent('pointerup', { clientX: targetX, clientY: targetY, bubbles: true, pointerId: 1 }));
      return 'slid to 100';
    })();`,
  });
  console.log('Slider result:', sliderRes.result);
  await waitForSelector(tabId, '#omega-prompt', 4000);
  await new Promise(r => setTimeout(r, 300));

  // 5. Prompt: stub window.prompt to return session.id, then click #omega-prompt
  console.log('\n--- 5. Native Prompt ---');
  const promptRes = await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const btn = document.getElementById('omega-prompt');
      if (!btn) return 'omega-prompt not found';
      const orig = window.prompt;
      window.prompt = () => '${session.id}';
      btn.click();
      window.prompt = orig;
      return 'submitted prompt with ${session.id}';
    })();`,
  });
  console.log('Prompt result:', promptRes.result);
  await waitForSelector(tabId, '#omega-canvas', 4000);
  await new Promise(r => setTimeout(r, 300));

  // 6. Dots Canvas: sample cyan pixel from #omega-canvas and click 3 times
  console.log('\n--- 6. Moving Dots Canvas ---');
  for (let hit = 1; hit <= 3; hit++) {
    const hitRes = await callTool('chrome_javascript', {
      tabId,
      code: `return (() => {
        const c = document.getElementById('omega-canvas');
        if (!c) return 'canvas not found';
        const ctx = c.getContext('2d');
        const imgData = ctx.getImageData(0, 0, c.width, c.height).data;
        let hitX = -1, hitY = -1;
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            const idx = (y * c.width + x) * 4;
            const r = imgData[idx];
            const g = imgData[idx + 1];
            const b = imgData[idx + 2];
            if (b > 200 && g > 180 && r < 80) {
              hitX = x;
              hitY = y;
              break;
            }
          }
          if (hitX !== -1) break;
        }
        if (hitX === -1) return 'pixel not found';
        const rect = c.getBoundingClientRect();
        const clientX = rect.left + (hitX / c.width) * rect.width;
        const clientY = rect.top + (hitY / c.height) * rect.height;
        c.dispatchEvent(new MouseEvent('click', { clientX, clientY, bubbles: true }));
        return 'hit at ' + hitX + ',' + hitY;
      })();`,
    });
    console.log('Hit ' + hit + ':', hitRes.result);
    await new Promise(r => setTimeout(r, 200));
  }
  await new Promise(r => setTimeout(r, 400));

  // 7. Pick Operator: click trigger, click operator
  console.log('\n--- 7. Pick Operator ---');
  const pickRes = await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const trigger = document.getElementById('omega-pick-trigger');
      if (!trigger) return 'trigger not found';
      trigger.click();
      return 'trigger clicked';
    })();`,
  });
  console.log('Pick trigger:', pickRes.result);
  await new Promise(r => setTimeout(r, 300));

  const pickOpRes = await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const btns = Array.from(document.querySelectorAll('ul button'));
      const opBtn = btns.find(b => b.textContent.trim() === '${session.operator}');
      if (!opBtn) return 'opBtn not found for ${session.operator}. Found: ' + btns.map(b => b.textContent.trim()).join(', ');
      opBtn.click();
      return 'clicked ' + '${session.operator}';
    })();`,
  });
  console.log('Pick op result:', pickOpRes.result);
  await new Promise(r => setTimeout(r, 400));

  // 8. Keybind: Ctrl + Enter
  console.log('\n--- 8. Final Keybind ---');
  const keyRes = await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      }));
      return 'dispatched Ctrl+Enter';
    })();`,
  });
  console.log('Keybind result:', keyRes.result);
  await new Promise(r => setTimeout(r, 400));

  // Verify assertions
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
  console.log('\nProtocol 12 assertions:');
  console.table(checks);

  const allPassed = checks.every(c => c.passed);
  console.log('All 8 passed?', allPassed);

  if (allPassed) {
    const finalDom = await callTool('chrome_read_dom', { tabId });
    const commitBtn = finalDom.indexedElements.find(e => e.attributes?.id === 'protocol-commit');
    if (commitBtn) {
      await callTool('chrome_interact_index', { tabId, index: commitBtn.index, action: 'click' });
      console.log('Committed protocol 12!');
    }
  }
}

testP12().catch(console.error);
