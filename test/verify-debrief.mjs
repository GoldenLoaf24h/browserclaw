import { callTool } from './mcp-runner.mjs';

async function verifyDebrief() {
  const tabsRes = await callTool('get_windows_and_tabs');
  const tab = tabsRes.windows[0].tabs.find(t => t.url.includes('4173'));
  const tabId = tab.tabId;

  // Navigate to #/debrief
  await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      window.location.hash = '#/debrief';
      return 'navigated to #/debrief';
    })();`,
  });
  await new Promise(r => setTimeout(r, 1000));

  // Inspect debrief page text and localStorage
  const debriefRes = await callTool('chrome_javascript', {
    tabId,
    code: `return (() => {
      const state = JSON.parse(localStorage.getItem('nexus-lab-v1') || '{}');
      const runs = state.runs || {};
      const runKeys = Object.keys(runs);
      const passedCount = runKeys.filter(k => runs[k].passed).length;
      let totalChecks = 0;
      let passedChecks = 0;
      for (const k of runKeys) {
        const c = runs[k].checks || [];
        totalChecks += c.length;
        passedChecks += c.filter(x => x.passed).length;
      }

      const bodyText = document.body.innerText;
      return JSON.stringify({
        protocolsRun: runKeys.length,
        protocolsPassed: passedCount,
        totalChecks,
        passedChecks,
        runsSummary: runKeys.map(k => {
          const c = runs[k].checks || [];
          const passed = c.filter(x => x.passed).length;
          return {
            id: k,
            passed: runs[k].passed,
            checks: passed + '/' + c.length
          };
        }),
        bodySnippet: bodyText.slice(0, 1500)
      });
    })();`,
  });

  const data = JSON.parse(debriefRes.result);
  console.log('Debrief Summary:');
  console.log('Protocols: ' + data.protocolsPassed + ' / ' + data.protocolsRun + ' passed');
  console.log('Assertions: ' + data.passedChecks + ' / ' + data.totalChecks + ' passed');
  console.table(data.runsSummary);
  console.log('\nPage Body Preview:\n', data.bodySnippet);
}

verifyDebrief().catch(console.error);
