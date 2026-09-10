import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.CHROME_MCP_BASE || 'http://127.0.0.1:12306';
const token = readFileSync(join(homedir(), '.chrome-mcp', 'bridge-token'), 'utf8').trim();
let sessionId = null;
let nextId = 1;

function parseBody(text, contentType) {
  if (!text) return null;
  if (contentType.indexOf('text/event-stream') !== -1) {
    const lines = text.split(/\r?\n/).filter(function (l) { return l.indexOf('data:') === 0; });
    if (!lines.length) return null;
    try { return JSON.parse(lines[lines.length - 1].slice(5).trim()); } catch (e) { return null; }
  }
  try { return JSON.parse(text); } catch (e) { return null; }
}

async function rpc(method, params, isNotification = false) {
  const body = { jsonrpc: '2.0', method: method };
  if (params) body.params = params;
  if (!isNotification) body.id = nextId++;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: 'Bearer ' + token,
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const res = await fetch(BASE + '/mcp', { method: 'POST', headers: headers, body: JSON.stringify(body) });
  const sid = res.headers.get('mcp-session-id');
  if (sid) sessionId = sid;
  const text = await res.text();
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + text.slice(0, 500));
  if (isNotification) return null;
  const parsed = parseBody(text, res.headers.get('content-type') || '');
  if (!parsed) throw new Error('unparseable response: ' + text.slice(0, 300));
  if (parsed.error) throw new Error('RPC error: ' + JSON.stringify(parsed.error));
  return parsed.result;
}

export async function initSession() {
  if (sessionId) return;
  await rpc('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'automation-runner', version: '1.0.0' },
  }, false);
  await rpc('notifications/initialized', undefined, true);
}

export async function callTool(name, args = {}) {
  await initSession();
  const res = await rpc('tools/call', { name, arguments: args });
  if (res.isError) {
    const errText = res.content?.map(c => c.text).join('\n') || JSON.stringify(res);
    throw new Error(`Tool ${name} failed: ${errText}`);
  }
  const text = res.content?.[0]?.text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
