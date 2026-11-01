// 桌宠的自动出牌（按「雀魂提示词-完整版.md」的规矩）
// 牌效优先、能小和先和；不瞎副露；对手立直先打现物；三麻先拔北。
// 用法：node auto.mjs   （后台挂着；桌面「pet-majsoul」关了就只看不动）
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const API = 'http://127.0.0.1:29735';
const SWITCH = join(HERE, '..', 'pet-majsoul.txt');
const LOG = join(HERE, 'data', 'auto.log');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const base = t => (t && t[0] === '0' ? `5${t[1]}` : t);

function allow() {
  try { return readFileSync(SWITCH, 'utf8').trim().toLowerCase() !== 'off'; } catch { return false; }
}
function log(...a) {
  const line = `[${new Date().toISOString()}] ${a.join(' ')}`;
  console.log(line);
  try { appendFileSync(LOG, line + '\n'); } catch {}
}
async function status() {
  const r = await fetch(`${API}/status`, { signal: AbortSignal.timeout(3000) });
  return r.json();
}
async function act(args) {
  const r = await fetch(`${API}/act`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(6000) });
  return r.json();
}

/** 从候选里挑一张：先看牌效，对手立直就把安全度提上来。 */
function choose(cands, banned, hand, threats) {
  const legal = cands.filter(c => hand.includes(c.tile) && !banned.includes(base(c.tile)));
  if (!legal.length) return null;
  const safeOf = c => (threats.length && (c.genbutsuAgainst ?? '') !== '' ? 1 : 0);
  const score = c => [
    c.shanten ?? 9,               // 向听越小越好
    -safeOf(c),                   // 有立直威胁时现物优先
    c.discardFuriten ? 1 : 0,     // 尽量不把自己打成振听
    -(c.ukeire ?? 0),             // 进张越多越好
  ];
  const cmp = (a, b) => {
    const A = score(a), B = score(b);
    for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return A[i] - B[i];
    return 0;
  };
  return legal.slice().sort(cmp)[0];
}

let lastVersion = null;
log('auto 启动（按提示词的规矩）');

while (true) {
  try {
    const s = await status();
    if (!s.connected || !allow()) { lastVersion = null; await sleep(1500); continue; }
    if (!s.ready || s.version === lastVersion) { await sleep(600); continue; }
    lastVersion = s.version;

    const ops = (s.operations ?? []).map(o => o.type);
    const hand = s.hand?.sortedHand ?? [];
    const cands = s.hand?.discardCandidates ?? [];
    const threats = s.hand?.riichiThreats ?? [];
    const threePlayer = (s.hand?.seatWind ? (s.playerCount === 3 || s.round?.playerCount === 3) : false);

    // 1) 能和就和
    if (ops.includes(8)) { log('自摸'); await act({ version: s.version, action: 'tsumo' }); continue; }
    if (ops.includes(9)) { log('荣和'); await act({ version: s.version, action: 'ron' }); continue; }

    // 2) 三麻：孤张北先拔
    if (ops.includes(11) && hand.includes('4z')) { log('拔北'); await act({ version: s.version, action: 'babei' }); continue; }

    // 3) 立直：听牌且不是振听才下
    const riichiOp = (s.operations ?? []).find(o => o.type === 7);
    if (riichiOp && s.hand?.closed) {
      const allowed = (riichiOp.combinations ?? []).map(c => c.split('|')[0]).filter(Boolean);
      const best = choose(cands.filter(c => allowed.includes(c.tile)), [], hand, threats);
      const shanten = best ? cands.find(c => c.tile === best.tile)?.shanten : 9;
      const furiten = best ? !!cands.find(c => c.tile === best.tile)?.discardFuriten : true;
      if (best && shanten === 0 && !furiten) {
        const res = await act({ version: s.version, action: 'riichi', tile: best.tile });
        log('立直', best.tile, res.ok ? '' : JSON.stringify(res.error ?? res));
        continue;
      }
    }

    // 4) 普通弃牌：discard 的 combinations 是「禁打」，别搞反
    const discardOp = (s.operations ?? []).find(o => o.type === 1);
    if (discardOp) {
      const banned = (discardOp.combinations ?? []).map(c => c.split('|')[0]).filter(Boolean);
      const best = choose(cands, banned, hand, threats);
      if (best) {
        const res = await act({ version: s.version, action: 'discard', tile: best.tile, tsumogiri: best.tile === s.hand?.drawn });
        log('打', best.tile, `向听${best.shanten} 进张${best.ukeire}`, threats.length ? '(有立直)' : '', res.ok ? '' : JSON.stringify(res.error ?? res));
        continue;
      }
      // 候选表缺失时兜底：摸切
      const fallback = s.hand?.drawn ?? hand.find(t => !banned.includes(base(t)));
      if (fallback) {
        const res = await act({ version: s.version, action: 'discard', tile: fallback, tsumogiri: fallback === s.hand?.drawn });
        log('兜底打', fallback, res.ok ? '' : JSON.stringify(res.error ?? res));
        continue;
      }
    }

    // 5) 其余（吃碰杠、流局之类）一律过：没算出役就不鸣牌
    const res = await act({ version: s.version, action: 'pass' });
    log('过', res.ok ? '' : JSON.stringify(res.error ?? res));
  } catch (e) {
    console.error(new Date().toISOString(), 'auto 出错：', e?.message ?? e);
    await sleep(2000);
  }
}
