import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(path.join(here, '../packages/shared/dist/index.mjs')).href);
import { pathToFileURL } from 'node:url';
const { TOOL_SCHEMAS, TOOL_CATEGORIES } = shared;

const groups = [
  ['navigate', '导航与标签页 / Navigation & Tabs'],
  ['perceive', '页面感知 / Perception'],
  ['act', '交互操作 / Interaction'],
  ['observe', '观察与滚动 / Observation & Scrolling'],
  ['manage', '数据管理 / Data Management'],
];

const toolDoc = (t) => {
  const props = (t.inputSchema?.properties) || {};
  const req = t.inputSchema?.required || [];
  const params = Object.entries(props).map(([k, v]) => {
    const en = v.enum ? ':' + v.enum.join('|') : '';
    const rq = req.includes(k) ? '（必填）' : '';
    const desc = (v.description || '').split('\n')[0].slice(0, 150);
    return '- `' + k + en + '`' + rq + ' — ' + desc;
  });
  const desc = (t.description || '').split('\n')[0];
  return '### `' + t.name + '`\n\n' + desc + '\n\n' + params.join('\n') + '\n';
};

let out = '# BrowserClaw 工具参考 / Tool Reference\n\n';
out += '> 本文档由 `scripts/gen-tools-doc.mjs` 从 `packages/shared/src/tools.ts` 的 schema 生成，与代码保持一致。重新生成：`node scripts/gen-tools-doc.mjs`。\n\n';
out += '| Profile | 工具数 | Schema 开销 |\n| --- | --- | --- |\n| full（默认） | 46 | ~17.2k tokens |\n| core | 28 | ~13.2k tokens |\n| crawl | 12 | ~4.8k tokens |\n\n';
out += '被 profile 隐藏的工具可用 `chrome_tool_docs` 按类别查询参数（该工具在任何 profile 均可用）。\n\n';

const byName = new Map(TOOL_SCHEMAS.map((t) => [t.name, t]));
const seen = new Set();
for (const [key, label] of groups) {
  out += '\n## ' + label + '\n\n';
  for (const name of (TOOL_CATEGORIES[key] || '').split(' ').filter(Boolean)) {
    if (seen.has(name)) continue;
    seen.add(name);
    const t = byName.get(name);
    if (t) out += toolDoc(t) + '\n';
  }
}
out += '\n## 其他工具 / Remaining tools\n\n';
for (const t of TOOL_SCHEMAS) {
  if (!seen.has(t.name)) { out += toolDoc(t) + '\n'; seen.add(t.name); }
}
fs.writeFileSync(new URL('../docs/TOOLS.md', import.meta.url), out);
console.log('docs/TOOLS.md regenerated:', TOOL_SCHEMAS.length, 'tools');
