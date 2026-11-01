#!/usr/bin/env node
// 桌宠的旧账检索：按关键词翻自己的记忆、两本日记、历史会话
// 用法: node mem-recall.mjs "鱼八股" [--n 5] [--sessions] [--all]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const HOME = process.env.USERPROFILE || 'C:\\Users\\<你的用户名>';
const DSH = path.join(HOME, '.dsh');
const WS = path.join(DSH, 'sessions'); // 该目录下每个子目录就是一个会话

const args = process.argv.slice(2);
const query = args.filter(a => !a.startsWith('--') && !/^\d+$/.test(a)).join(' ').trim();
const nIdx = args.indexOf('--n');
const LIMIT = nIdx >= 0 ? parseInt(args[nIdx + 1] || '5', 10) : 5;
const wantSessions = args.includes('--sessions') || args.includes('--all');
if (!query) { console.log('用法: node mem-recall.mjs "关键词" [--n 5] [--sessions]'); process.exit(2); }

// ---- 中文 bigram 切词 + 英文/数字词 ----
function tokens(s) {
  const out = new Set();
  const lower = s.toLowerCase();
  for (const w of lower.match(/[a-z0-9_]{2,}/g) || []) out.add(w);
  const han = lower.replace(/[^\u4e00-\u9fa5]+/g, ' ');
  for (const seg of han.split(/\s+/)) {
    if (!seg) continue;
    if (seg.length === 1) out.add(seg);
    for (let i = 0; i + 1 < seg.length; i++) out.add(seg.slice(i, i + 2));
  }
  return [...out];
}
const QT = tokens(query);

function score(text) {
  if (!text) return 0;
  const low = text.toLowerCase();
  let s = 0;
  for (const t of QT) if (low.includes(t)) s += t.length >= 2 ? 2 : 1;
  // 整句命中加权
  if (low.includes(query.toLowerCase())) s += QT.length * 2;
  return s;
}
function snippet(text, len = 220) {
  const low = text.toLowerCase(), q = query.toLowerCase();
  let i = low.indexOf(q);
  if (i < 0) { for (const t of QT) { i = low.indexOf(t); if (i >= 0) break; } }
  if (i < 0) i = 0;
  const start = Math.max(0, i - 70);
  let s = text.slice(start, start + len).replace(/\s+/g, ' ').trim();
  return (start > 0 ? '…' : '') + s + (start + len < text.length ? '…' : '');
}

const hits = [];

// ---- 1) 记忆文件 ----
const memFile = path.join(DSH, 'soul-md', 'memory', process.env.PET_MEMORY_FILE || 'pet.md');
if (fs.existsSync(memFile)) {
  const raw = fs.readFileSync(memFile, 'utf8');
  const blocks = raw.split(/\n(?=##+ )/);
  for (const b of blocks) {
    const sc = score(b);
    if (sc > 0) hits.push({ sc, kind: '记忆', title: (b.match(/^##+ .*/) || [''])[0].replace(/^##+\s*/, '').slice(0, 40), text: b });
  }
}

// ---- 2) 两本日记 ----
for (const f of ['whale-diary.md', 'whale-diary-private.md']) {
  const p = path.join(DSH, f);
  if (!fs.existsSync(p)) continue;
  const raw = fs.readFileSync(p, 'utf8');
  const blocks = raw.split(/\n(?=## )/);
  for (const b of blocks) {
    const sc = score(b);
    if (sc > 0) hits.push({ sc, kind: f.includes('private') ? '日记·私' : '日记', title: (b.split('\n')[0] || '').replace(/^##\s*/, '').slice(0, 40), text: b });
  }
}

// ---- 3) 历史会话（可选，较慢）----
function zstdFrames(buf) {
  const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const parts = [];
  let pos = 0;
  while (true) {
    const i = buf.indexOf(MAGIC, pos);
    if (i < 0) break;
    const next = buf.indexOf(MAGIC, i + 4);
    parts.push(buf.subarray(i, next < 0 ? buf.length : next));
    if (next < 0) break;
    pos = next;
  }
  return parts;
}
function readSession(file) {
  try {
    const buf = fs.readFileSync(file);
    const frames = zstdFrames(buf);
    let out = '';
    for (const f of frames) {
      try { out += zlib.zstdDecompressSync(f).toString('utf8'); } catch { /* skip bad frame */ }
    }
    return out;
  } catch { return ''; }
}
if (wantSessions && fs.existsSync(WS)) {
  for (const dir of fs.readdirSync(WS)) {
    const file = path.join(WS, dir, 'session.v4.jsonl.zstd');
    if (!fs.existsSync(file)) continue;
    const txt = readSession(file);
    if (!txt) continue;
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue;
      let obj; try { obj = JSON.parse(line); } catch { continue; }
      const words = [];
      const pick = (c) => {
        if (typeof c === 'string') words.push(c);
        else if (Array.isArray(c)) c.forEach(pick);
        else if (c && typeof c === 'object') { if (typeof c.text === 'string') words.push(c.text); else pick(c.content); }
      };
      pick(obj.content ?? obj.text ?? obj.message);
      const body = words.join('\n');
      if (!body) continue;
      const sc = score(body);
      if (sc >= 4) hits.push({ sc, kind: `会话·${dir}`, title: (obj.role || obj.type || '') + ' ' + (obj.ts || ''), text: body });
    }
  }
}

hits.sort((a, b) => b.sc - a.sc);
const top = hits.slice(0, LIMIT);
if (!top.length) { console.log(`（没翻到和「${query}」有关的旧账）`); process.exit(0); }
console.log(`== 「${query}」翻到 ${top.length}/${hits.length} 条 ==`);
for (const h of top) {
  console.log(`\n[${h.kind}] ${h.title}  (${h.sc})`);
  console.log('  ' + snippet(h.text));
}
