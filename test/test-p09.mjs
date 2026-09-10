import { callTool } from './mcp-runner.mjs';

async function testP09() {
  const tabsRes = await callTool('get_windows_and_tabs');
  const tab = tabsRes.windows[0].tabs.find(t => t.url.includes('4173'));
  const tabId = tab.tabId;

  // Navigate to protocol/visual and reload
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      window.location.hash = '#/protocol/visual';
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
  console.log('Session info for Visual. Quiz mode:', session.quizMode, 'otpSeed:', session.otpSeed);

  // 1. Image grid quiz
  console.log('\n--- 1. Image grid quiz ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const QUIZ = [
        { tags: ["animals"] },
        { tags: ["vehicles"] },
        { tags: ["animals"] },
        { tags: [] },
        { tags: ["animals"] },
        { tags: ["vehicles"] },
      ];
      const targetMode = '${session.quizMode}';
      QUIZ.forEach((q, i) => {
        if (q.tags.includes(targetMode)) {
          document.getElementById('quiz-' + i).click();
        }
      });
      return 'clicked quiz buttons for ' + targetMode;
    })();`,
  });

  await new Promise(r => setTimeout(r, 200));

  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('quiz-submit').click();
      return 'submitted quiz';
    })();`,
  });

  // 2. Ghost button
  console.log('\n--- 2. Ghost button ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('ghost-btn').click();
      return 'clicked ghost';
    })();`,
  });

  // 3. Pseudo decoy: real node
  console.log('\n--- 3. Pseudo decoy: real node ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('real-pseudo').click();
      return 'clicked real-pseudo';
    })();`,
  });

  // 4. Canvas hit test
  console.log('\n--- 4. Canvas hit test ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const canvas = document.getElementById('hit-canvas');
      const r = canvas.getBoundingClientRect();
      // The circle position oscillates around (70, 70) with radius ~28
      // Read circle position from canvas pixels or sample around center
      const ctx = canvas.getContext('2d');
      // Search for cyan pixel (#22d3ee -> r: 34, g: 211, b: 238)
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let foundX = 70, foundY = 70;
      for (let y = 30; y < 110; y += 4) {
        for (let x = 30; x < 120; x += 4) {
          const idx = (y * canvas.width + x) * 4;
          const red = imgData.data[idx];
          const green = imgData.data[idx + 1];
          const blue = imgData.data[idx + 2];
          if (green > 180 && blue > 200 && red < 60) {
            foundX = x;
            foundY = y;
            break;
          }
        }
      }
      const clientX = r.left + (foundX / canvas.width) * r.width;
      const clientY = r.top + (foundY / canvas.height) * r.height;
      canvas.dispatchEvent(new MouseEvent('click', { clientX, clientY, bubbles: true }));
      return 'clicked canvas at ' + foundX + ',' + foundY;
    })();`,
  });

  // 5. SVG path
  console.log('\n--- 5. SVG path ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('svg-hot').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return 'clicked svg-hot';
    })();`,
  });

  // 6. Visible text vs aria
  console.log('\n--- 6. Visible commit ---');
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('visible-commit').click();
      return 'clicked visible-commit';
    })();`,
  });

  // 7. Match LED
  console.log('\n--- 7. Match LED ---');
  const ledColors = ["green", "cyan", "amber"];
  const targetLed = ledColors[session.otpSeed % 3];
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      document.getElementById('led-${targetLed}').click();
      return 'clicked led-${targetLed}';
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
  console.log('\nProtocol 9 assertions:');
  console.table(checks);

  const allPassed = checks.every(c => c.passed);
  console.log('All 7 passed?', allPassed);

  if (allPassed) {
    const finalDom = await callTool('chrome_read_dom', { tabId });
    const commitBtn = finalDom.indexedElements.find(e => e.attributes?.id === 'protocol-commit');
    if (commitBtn) {
      await callTool('chrome_interact_index', { tabId, index: commitBtn.index, action: 'click' });
      console.log('Committed protocol 9!');
    }
  }
}

testP09().catch(console.error);
