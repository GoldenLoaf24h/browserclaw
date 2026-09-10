import { callTool } from './mcp-runner.mjs';

async function testP03() {
  const tabsRes = await callTool('get_windows_and_tabs');
  const tab = tabsRes.windows[0].tabs.find(t => t.url.includes('4173'));
  const tabId = tab.tabId;

  // Navigate to protocol/form and reload to reset state
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      window.location.hash = '#/protocol/form';
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
  console.log('Session info for Form:', {
    operator: session.operator,
    email: session.email,
    phone: session.phone,
    country: session.country,
    authDate: session.authDate,
    csrf: session.csrf,
  });

  // STEP 0: Identity
  console.log('\n--- Step 0: Identity ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      // 1. Inputs
      const inputs = Array.from(document.querySelectorAll('input'));
      const opInput = inputs.find(i => i.closest('label')?.textContent?.includes('OPERATOR SURNAME'));
      const mailInput = inputs.find(i => i.closest('label')?.textContent?.includes('MAILBOX'));
      const phoneInput = inputs.find(i => i.closest('label')?.textContent?.includes('VOICE LINE'));

      // Helper for React 18/19 controlled inputs
      function setVal(input, val) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      setVal(opInput, '${session.operator}');
      setVal(mailInput, '${session.email}');
      setVal(phoneInput, '${session.phone}');

      // 2. Country dropdown
      const countryTrigger = document.getElementById('country-trigger');
      countryTrigger.click();
      return 'filled identity';
    })();`,
  });

  await new Promise(r => setTimeout(r, 100));

  // Select country in dropdown
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const countryBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '${session.country}');
      if (countryBtn) {
        countryBtn.click();
        return 'selected country';
      }
      return 'country not found';
    })();`,
  });

  // 3. Date picker
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const [y, m, d] = '${session.authDate}'.split('-').map(Number);
      // Click day button matching authDate
      const dayBtns = Array.from(document.querySelectorAll('.grid-cols-7 button'));
      // Find button whose text is String(d)
      const dayBtn = dayBtns.find(b => b.textContent.trim() === String(d) && !b.disabled);
      if (dayBtn) {
        dayBtn.click();
        return 'selected date ' + d;
      }
      return 'date button not found';
    })();`,
  });

  // Click NEXT GATE (form-next-1)
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('form-next-1').click();
      return 'clicked next 1';
    })();`,
  });

  await new Promise(r => setTimeout(r, 300));

  // STEP 1: Secrets
  console.log('\n--- Step 1: Secrets ---');
  const prefix = session.id.slice(3, 5);
  const password = `${prefix}#Secret999`;

  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const userInput = inputs.find(i => i.closest('label')?.textContent?.includes('USERNAME'));
      const pwInput = inputs.find(i => i.closest('label')?.textContent?.includes('PASSPHRASE'));
      const csrfInput = inputs.find(i => i.closest('label')?.textContent?.includes('CSRF TOKEN'));

      function setVal(input, val) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      setVal(userInput, '${session.operator}');
      setVal(pwInput, '${password}');
      setVal(csrfInput, '${session.csrf}');

      // Hover OTP enclave to trigger OTP generation
      const enclave = document.getElementById('otp-enclave');
      enclave.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));

      // Calculate current OTP
      const slot = Math.floor(Date.now() / 30000);
      const x = Math.abs(Math.sin(${session.otpSeed} * 997 + slot * 13.37) * 1000000);
      const otpStr = String(Math.floor(x) % 1000000).padStart(6, '0');

      for (let i = 0; i < 6; i++) {
        const otpIn = document.getElementById('otp-' + i);
        setVal(otpIn, otpStr[i]);
      }

      return 'filled secrets, otp=' + otpStr;
    })();`,
  });

  // Click NEXT GATE (form-next-2)
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('form-next-2').click();
      return 'clicked next 2';
    })();`,
  });

  await new Promise(r => setTimeout(r, 300));

  // STEP 2: Seal
  console.log('\n--- Step 2: Seal ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      // 1. Scroll legal box to bottom
      const legalBox = document.getElementById('legal-box');
      legalBox.scrollTop = legalBox.scrollHeight;
      legalBox.dispatchEvent(new Event('scroll'));
      return 'scrolled legal box';
    })();`,
  });

  await new Promise(r => setTimeout(r, 200));

  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      // 2. Click custom check
      const check = document.getElementById('custom-check');
      check.click();

      // 3. Select clearance OMEGA
      const sel = document.getElementById('clearance-select');
      sel.value = 'OMEGA';
      sel.dispatchEvent(new Event('change', { bubbles: true }));

      // 4. Draw stroke on canvas
      const canvas = document.getElementById('sig-canvas');
      const ctx = canvas.getContext('2d');
      const r = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + 20, clientY: r.top + 20, bubbles: true }));
      for (let i = 1; i <= 50; i++) {
        canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + 20 + i * 2, clientY: r.top + 20 + (i % 5), bubbles: true }));
      }
      canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: r.left + 120, clientY: r.top + 20, bubbles: true }));

      // 5. Drag chip into dock
      const dock = document.getElementById('cred-dock');
      const dt = new DataTransfer();
      dt.setData('text/plain', 'NEXUS-CRED');
      dock.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      dock.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));

      return 'done step 2 actions';
    })();`,
  });

  await new Promise(r => setTimeout(r, 300));

  // Finalize
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('form-finalize').click();
      return 'clicked finalize';
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
  console.log('\nProtocol 3 assertions:');
  console.table(checks);

  const allPassed = checks.every(c => c.passed);
  console.log('All 10 passed?', allPassed);

  if (allPassed) {
    const finalDom = await callTool('chrome_read_dom', { tabId });
    const commitBtn = finalDom.indexedElements.find(e => e.attributes?.id === 'protocol-commit');
    if (commitBtn) {
      await callTool('chrome_interact_index', { tabId, index: commitBtn.index, action: 'click' });
      console.log('Committed protocol 3!');
    }
  }
}

testP03().catch(console.error);
