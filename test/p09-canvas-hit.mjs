// P09/P12 canvas hit orchestrator — pure MCP tool calls only (no page injection).
// Pipeline: element screenshot (set ctx) -> 4 center calibration clicks -> footer
// miss vectors -> local phase fit (free u,v absorbs mapping offset) -> timed
// tracked burst clicks at slow-phase moments.
import fs from 'node:fs';
import os from 'node:os';

const BASE = 'http://127.0.0.1:12306/mcp';
const TOKEN = fs.readFileSync(os.userInfo().homedir + '/.chrome-mcp/bridge-token', 'utf8').trim();
const TAB = Number(process.argv[2] || 1581256720);
const ROUNDS = Number(process.argv[3] || 2);

let sid = null, id = 1;
async function rpc(method, params) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: 'Bearer ' + TOKEN,
      ...(sid ? { 'mcp-session-id': sid } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }),
  });
  const s = res.headers.get('mcp-session-id');
  if (s) sid = s;
  const t = await res.text();
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + t.slice(0, 300));
  for (const line of t.split('\n')) {
    if (line.startsWith('data: ')) { try { return JSON.parse(line.slice(6)); } catch {} }
  }
  return JSON.parse(t);
}
async function call(tool, args) {
  const t0 = Date.now();
  const r = await rpc('tools/call', { name: tool, arguments: args });
  return { t0, t1: Date.now(), r };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Canvas geometry: bitmap 280x140, CSS 348x174 -> css->bitmap scale S.
const S = 280 / 348;
const K = 1 / S;
const CLICK_X = 174, CLICK_Y = 87; // canvas center in element CSS coords

async function readMisses() {
  const f = await call('chrome_get_web_content', { tabId: TAB, selector: 'footer' });
  const inner = JSON.parse(f.r.result?.content?.[0]?.text || '{}');
  const txt = inner.textContent || '';
  const out = [];
  for (const m of txt.matchAll(/canvas miss (-?[\d.]+),(-?[\d.]+)/g)) {
    out.push([parseFloat(m[1]), parseFloat(m[2])]);
  }
  return { misses: out, text: txt };
}

// Fit val = u + amp*trig(ph + dt/period) via phase grid + linear mean, then refine.
function fitChain(samples, amp, period, useCos) {
  const evalResid = (ph) => {
    const cs = samples.map((o) => (useCos ? Math.cos(ph + o.dt / period) : Math.sin(ph + o.dt / period)));
    let su = 0;
    for (let i = 0; i < samples.length; i++) su += samples[i].val - amp * cs[i];
    const u = su / samples.length;
    let err = 0;
    for (let i = 0; i < samples.length; i++) { const d = samples[i].val - u - amp * cs[i]; err += d * d; }
    return { ph, u, err };
  };
  let best = null;
  for (let ph = 0; ph < Math.PI * 2; ph += 0.002) {
    const r = evalResid(ph);
    if (!best || r.err < best.err) best = r;
  }
  for (let step = 0.002; step > 1e-5; step /= 2) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const dph of [-step, step]) {
        const r = evalResid(best.ph + dph);
        if (r.err < best.err - 1e-12) { best = { ...r, ph: r.ph < 0 ? r.ph + Math.PI * 2 : r.ph }; improved = true; }
      }
    }
  }
  best.rms = Math.sqrt(best.err / samples.length);
  return best;
}

const anchorPool = []; // {t0, css:[x,y], miss:[dx,dy]}

async function calibrationRound() {
  // 1) element screenshot sets coordinate ctx (TTL 5min, run is <60s)
  const shot = await call('chrome_screenshot', { tabId: TAB, selector: '#hit-canvas' });
  console.log('shot ctx set in', shot.t1 - shot.t0, 'ms');

  // 2) 4 center calibration clicks (~1.45s apart)
  const t0s = [];
  for (let i = 0; i < 4; i++) {
    const c = await call('chrome_interact_index', { tabId: TAB, coordinate: { x: CLICK_X, y: CLICK_Y }, action: 'click', waitForSettle: false });
    t0s.push({ t0: c.t0, dur: c.t1 - c.t0 });
    console.log('cal click', i, c.t1 - c.t0, 'ms');
    if (i < 3) await sleep(Math.max(0, 1450 - (c.t1 - c.t0)));
  }
  await sleep(400); // let React flush the log feed render
  const { misses } = await readMisses();
  console.log('misses now:', JSON.stringify(misses));
  if (misses.length < 4) throw new Error('expected >=4 misses, got ' + misses.length);
  const newest4 = misses.slice(-4);
  for (let i = 0; i < 4; i++) anchorPool.push({ t0: t0s[i].t0, css: [CLICK_X, CLICK_Y], miss: newest4[i] });
}

function fitAll() {
  const tRef = anchorPool[0].t0;
  const xs = [], ys = [];
  for (const a of anchorPool) {
    const px = a.css[0] * S, py = a.css[1] * S; // nominal bitmap landing point
    xs.push({ dt: a.t0 - tRef, val: px - a.miss[0] });
    ys.push({ dt: a.t0 - tRef, val: py - a.miss[1] });
  }
  const fx = fitChain(xs, 28, 500, true);
  const fy = fitChain(ys, 22, 420, false);
  console.log('fit x: u=%s ph=%s rms=%s | y: v=%s ph=%s rms=%s',
    fx.u.toFixed(2), fx.ph.toFixed(3), fx.rms.toFixed(2), fy.u.toFixed(2), fy.ph.toFixed(3), fy.rms.toFixed(2));
  return { tRef, fx, fy };
}

function circleAt(fit, t) {
  const dt = t - fit.tRef;
  return {
    x: fit.fx.u + 28 * Math.cos(fit.fx.ph + dt / 500),
    y: fit.fy.u + 22 * Math.sin(fit.fy.ph + dt / 420),
    vx: -(28 / 500) * Math.sin(fit.fx.ph + dt / 500),
    vy: (22 / 420) * Math.cos(fit.fy.ph + dt / 420),
  };
}

function cssForBitmap(fit, bx, by) {
  // actual bitmap = css*S + (u-70) -> css = (target - (u-70)) * K
  return { x: (bx - (fit.fx.u - 70)) * K, y: (by - (fit.fy.u - 70)) * K };
}

async function burst(fit) {
  const now = Date.now();
  let bestT = null, bestSpeed = 1e9;
  for (let t = now + 1100; t <= now + 3200; t += 2) {
    const c = circleAt(fit, t);
    const sp = Math.hypot(c.vx, c.vy);
    if (sp < bestSpeed) { bestSpeed = sp; bestT = t; }
  }
  console.log('slow t in', bestT - now, 'ms, speed', bestSpeed.toFixed(4), 'bitmap/ms');
  const SPACING = 300;
  for (let j = 0; j < 3; j++) {
    const tSend = bestT + j * SPACING;
    const lead = tSend - Date.now();
    if (lead > 0) await sleep(lead);
    const tActual = Date.now();
    const c = circleAt(fit, tActual);
    const css = cssForBitmap(fit, c.x, c.y);
    const cl = await call('chrome_interact_index', { tabId: TAB, coordinate: { x: css.x, y: css.y }, action: 'click', waitForSettle: false });
    console.log('burst', j, 'css=(%s,%s) circle=(%s,%s) v=%s dur=%sms',
      css.x.toFixed(1), css.y.toFixed(1), c.x.toFixed(1), c.y.toFixed(1), Math.hypot(c.vx, c.vy).toFixed(4), cl.t1 - cl.t0);
    const gap = SPACING - (cl.t1 - cl.t0);
    if (gap > 0) await sleep(gap);
  }
}

async function canvasPassed() {
  const a = await call('chrome_get_web_content', { tabId: TAB, selector: 'aside' });
  const inner = JSON.parse(a.r.result?.content?.[0]?.text || '{}');
  const txt = inner.textContent || '';
  return /canvas[\s\S]{0,60}▣/.test(txt) || /PASS canvas/.test(txt);
}

// ---- main
await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'runner', version: '1.0' } });
await rpc('notifications/initialized', {}).catch(() => {});
let hit = await canvasPassed();
for (let round = 1; round <= ROUNDS && !hit; round++) {
  console.log('=== round', round, '===');
  anchorPool.length = 0;
  await calibrationRound();
  const fit = fitAll();
  const sanity = fit.fx.rms < 2 && fit.fy.rms < 2 && Math.abs(fit.fx.u - 70) < 35 && Math.abs(fit.fy.u - 70) < 30;
  if (!sanity) { console.log('fit sanity FAILED, abort burst'); process.exit(2); }
  await burst(fit);
  const { misses, text } = await readMisses();
  const calKeys = new Set(anchorPool.map((a) => a.miss.join(',')));
  const newOnes = misses.filter((m) => !calKeys.has(m.join(',')));
  console.log('after burst: PASS-in-log=', /PASS canvas/.test(text), 'newMissValues=', JSON.stringify(newOnes));
  if (/PASS canvas/.test(text) || newOnes.length === 0 || (await canvasPassed())) {
    hit = true;
    console.log('CANVAS HIT (round ' + round + ')');
  } else {
    console.log('round', round, 'missed -> recalibrate');
  }
}
console.log(hit ? 'RESULT: PASS' : 'RESULT: MISS');
