import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(path.join(here, '../packages/shared/dist/index.mjs')).href);
const { TOOL_SCHEMAS, TOOL_CATEGORIES, CORE_TOOL_NAMES, CRAWL_TOOL_NAMES } = shared;

const groups = [
  ['navigate', '导航与标签页 / Navigation & Tabs'],
  ['perceive', '页面感知 / Perception'],
  ['act', '交互操作 / Interaction'],
  ['observe', '观察与滚动 / Observation & Scrolling'],
  ['manage', '数据管理 / Data Management'],
  ['diagnose', '代码诊断与调试 / Diagnostics & Debugging'],
  ['network', '网络拦截与捕获 / Network Interception & Capture'],
];

const toolDoc = (t) => {
  const props = (t.inputSchema?.properties) || {};
  const req = t.inputSchema?.required || [];
  const params = Object.entries(props).map(([k, v]) => {
    const en = v.enum ? ':' + v.enum.join('|') : '';
    const rq = req.includes(k) ? '（必填）' : '';
    const desc = (v.description || '').split('\n')[0];
    return '- `' + k + en + '`' + rq + ' — ' + desc;
  });
  const desc = (t.description || '').split('\n')[0];
  return '### `' + t.name + '`\n\n' + desc + '\n\n' + params.join('\n') + '\n';
};

let out = '# BrowserClaw 工具参考 / Tool Reference\n\n';
out += '> 本文档由 `scripts/gen-tools-doc.mjs` 从 `packages/shared/src/tools.ts` 的 schema 生成，与代码保持一致。重新生成：`node scripts/gen-tools-doc.mjs`。\n\n';
out += `| core（默认） | ${CORE_TOOL_NAMES.size} | ~11.5k tokens | 核心高频利器（DOM 索引直点/表单/视觉/搜索） |\n`;
out += `| full | ${TOOL_SCHEMAS.length} | ~19.5k tokens | 完整底层 CDP 穿透与扩展控制 |\n`;
out += `| crawl | ${CRAWL_TOOL_NAMES.size} | ~5.8k tokens | 极速批量网页抓取与数据提取 |\n\n`;
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
fs.writeFileSync(path.join(here, '../docs/TOOLS.md'), out);
console.log('docs/TOOLS.md regenerated:', TOOL_SCHEMAS.length, 'tools');

