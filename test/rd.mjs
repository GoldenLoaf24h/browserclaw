// Agent perception helper: prints chrome_read_dom output, trimmed for token economy.
// Usage: node rd.mjs ['{"tabId":123}'] [filterRegex]   (no filter -> full treeString)
import { mcpCall } from './mcp-client.mjs';
const args = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const r = await mcpCall('chrome_read_dom', args);
const re = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
if (!re) {
  process.stdout.write(r.treeString + '\n');
} else {
  for (const el of r.indexedElements ?? []) {
    if (!re.test(JSON.stringify(el))) continue;
    const id = el.attributes?.id ? '#' + el.attributes.id : '';
    const ty = el.attributes?.type ? '[' + el.attributes.type + ']' : '';
    const rc = el.rect ? Math.round(el.rect.x) + ',' + Math.round(el.rect.y) + ' ' + Math.round(el.rect.width) + 'x' + Math.round(el.rect.height) : '-';
    console.log(`[${el.index}] <${el.tagName}>${id}${ty} "${el.text}" rect=${rc} vis=${el.isVisible}`);
  }
}
