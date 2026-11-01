// 桌宠的雀魂桥：专用 Edge(CDP) → liqi 协议 → 牌效 → 我出手
// 用法：node service.mjs  （首次会拉起专用 Edge 并打开雀魂网页，登录/开局由我或主人手动完成）
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GameBrowser, ActionUncertainError } from './src/browser.ts';
import { analyzeHand } from './src/hand.ts';
import { renderMajsoulState } from './src/render.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DATA = join(HERE, 'data');
const PROFILE = join(DATA, 'edge-profile');
const LOG = join(DATA, 'actions.jsonl');
const SWITCH = join(HERE, '..', 'pet-majsoul.txt');
const CDP_PORT = 29734;
const API_PORT = 29735;
const GAME_URL = 'https://game.maj-soul.com/1/';

mkdirSync(PROFILE, { recursive: true });

function allowActions() {
  try { return readFileSync(SWITCH, 'utf8').trim().toLowerCase() !== 'off'; } catch { return false; }
}
function log(...args) { console.log(new Date().toISOString(), ...args); }

function findBrowser() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  const hit = candidates.find(p => existsSync(p));
  if (!hit) throw new Error('找不到 Edge/Chrome，装一个再来。');
  return hit;
}

async function cdpReady() {
  try {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch { return false; }
}

async function ensureBrowser() {
  if (await cdpReady()) return 'already';
  const exe = findBrowser();
  const args = [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=msEdgeFirstRunExperience',
    'about:blank',
  ];
  const child = spawn(exe, args, { detached: true, stdio: 'ignore' });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await cdpReady()) return 'started';
  }
  throw new Error('专用浏览器没起来（CDP 端口没响应）。');
}

const game = new GameBrowser(allowActions, LOG, () => 4000, () => 30);
let attached = false;

function status() {
  const observation = game.snapshot();
  const hand = analyzeHand(observation);
  const view = observation;
  return {
    connected: game.connected,
    busy: game.busy,
    error: game.error || null,
    allowActions: allowActions(),
    version: view.version,
    active: view.active,
    ready: view.ready,
    seat: view.seat,
    operations: view.operations,
    drawn: view.drawn,
    round: view.round,
    lastAction: view.lastAction?.name ?? null,
    operationReceivedAt: view.operationReceivedAt,
    render: renderMajsoulState({
      connected: game.connected, busy: game.busy, error: game.error, allowActions: allowActions(),
      decisionTargetMs: 5000, observation: observation, handAnalysis: hand, fastMode: false,
      elapsedDecisionMs: view.operationReceivedAt === null ? null : Date.now() - view.operationReceivedAt,
      metricsFile: LOG,
    }),
    hand,
  };
}

async function attach() {
  const how = await ensureBrowser();
  log('browser', how);
  await game.connect(`http://127.0.0.1:${CDP_PORT}`, GAME_URL, true);
  attached = true;
  log('attached, connected =', game.connected);
}

function send(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/status') return send(res, 200, status());
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, attached, cdp: await cdpReady(), switch: allowActions() });
    if (req.method === 'POST' && url.pathname === '/attach') {
      await attach();
      return send(res, 200, status());
    }
    if (req.method === 'POST' && url.pathname === '/act') {
      if (!allowActions()) return send(res, 403, { failed: true, error: '「pet-majsoul」是关着的，先开开关。' });
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const args = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      try {
        const result = await game.execute(args, 8000);
        const { observation, ...rest } = result;
        return send(res, 200, { ok: true, ...rest, version: observation?.version });
      } catch (error) {
        const unknown = error instanceof ActionUncertainError;
        return send(res, 200, { failed: true, outcome: unknown ? 'unknown' : 'rejected', error: String(error?.message ?? error) });
      }
    }
    send(res, 404, { error: 'not found' });
  } catch (error) {
    send(res, 500, { failed: true, error: String(error?.message ?? error) });
  }
});

const ROUNDS = join(DATA, 'rounds.jsonl');
const END_NAMES = new Set(['ActionHule', 'ActionNoTile', 'ActionLiuJu']);
let lastRoundSignature = null;
let roundStartedAt = null;

function roundRecord(extra) {
  const view = game.snapshot();
  appendFileSync(ROUNDS, JSON.stringify({
    t: new Date().toISOString(),
    round: view.round,
    seat: view.seat,
    scores: view.players.map(p => ({ score: p.score, riichi: p.riichi, melds: p.melds.length, discards: p.discards.length })),
    hand: view.hand,
    doras: view.doras,
    ...extra,
  }) + '\n');
}

game.onState = view => {
  const important = view.ready && (view.operations ?? []).some(op => [7, 8, 9].includes(op.type));
  if (important && allowActions() && !game.busy) {
    appendFileSync(join(DATA, 'wake.log'), `${new Date().toISOString()} ready version=${view.version} seat=${view.seat} ops=${(view.operations ?? []).map(o => o.type).join(',')}\n`);
  }
  const name = view.lastAction?.name ?? '';
  if (name === 'ActionNewRound') {
    const sig = `new:${JSON.stringify(view.round)}:${JSON.stringify(view.players.map(p => p.score))}`;
    if (sig !== lastRoundSignature) {
      lastRoundSignature = sig;
      roundStartedAt = Date.now();
      roundRecord({ kind: 'round-start' });
    }
  } else if (END_NAMES.has(name)) {
    const sig = `end:${name}:${JSON.stringify(view.round)}:${JSON.stringify(view.players.map(p => p.score))}`;
    if (sig !== lastRoundSignature) {
      lastRoundSignature = sig;
      roundRecord({ kind: 'round-end', result: name, handAtEnd: view.hand, discardsMine: view.seat === null ? [] : view.players[view.seat].discards.map(d => d.tile), durationMs: roundStartedAt ? Date.now() - roundStartedAt : null });
    }
  }
};

await attach().catch(e => { log('attach failed:', e.message); });
server.listen(API_PORT, '127.0.0.1', () => log(`api on http://127.0.0.1:${API_PORT}`));
