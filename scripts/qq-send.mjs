// 桌宠的 QQ 发信器：走本地 NapCat 的 OneBot 11 WS（127.0.0.1:3002）
// 用法:
//   node qq-send.mjs private <你的QQ号> "正文"
//   node qq-send.mjs group 1087525532 "正文"
//   node qq-send.mjs private <你的QQ号> --image "C:\\path\\a.png" --text "配一句"
//   node qq-send.mjs private <你的QQ号> --voice "要说的话"     ← 先本机合成语音，再发 QQ 语音
//   node qq-send.mjs private <你的QQ号> --voice-file "C:\\path\\a.mp3"
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const WS_URL = process.env.QQ_WS || 'ws://127.0.0.1:3002';
const [, , kind, target, ...rest] = process.argv;

if (!kind || !target) {
  console.error('用法: node qq-send.mjs <private|group> <号码> <正文 或 --image 路径 ...>');
  process.exit(2);
}

let text = '';
const msgs = [];
const imgs = [];
const voices = [];
const voiceFiles = [];
let typing = false;
let typingSeconds = 15;
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--text') { text = rest[++i] ?? ''; continue; }
  if (rest[i] === '--image') { imgs.push(rest[++i]); continue; }
  if (rest[i] === '--voice') { voices.push(rest[++i] ?? ''); continue; }
  if (rest[i] === '--voice-file') { voiceFiles.push(rest[++i]); continue; }
  if (rest[i] === '--typing') { typing = true; continue; }
  if (rest[i] === '--typing-sec') { typing = true; typingSeconds = Number(rest[++i] ?? 15) || 15; continue; }
  msgs.push(rest[i]);
}

// --typing：只给对面亮「正在输入」，不发消息。默认亮 15 秒。
if (typing) {
  const WS2 = new WebSocket(WS_URL);
  let left = Math.max(1, Math.ceil(typingSeconds / 3));
  const ping = () => {
    left -= 1;
    if (!left) { try { WS2.close(); } catch {} process.exit(0); }
    setTimeout(ping, 3000);
  };
  WS2.on('open', () => {
    const send = () => WS2.send(JSON.stringify({ action: 'set_input_status', params: { user_id: Number(target), event_type: 1 }, echo: 'typing' }));
    send();
    setTimeout(ping, 3000);
    setTimeout(() => { try { WS2.close(); } catch {} process.exit(0); }, typingSeconds * 1000 + 1000);
  });
  WS2.on('error', (e) => { console.error('[typing-error] ' + e.message); process.exit(1); });
  // 不往下走发消息流程
  await new Promise(() => {});
}
let body = text || msgs.join(' ');

// 音色可用环境变量换；默认女声「晓伊」，比晓晓更年轻些
const VOICE = process.env.QQ_TTS_VOICE || 'zh-CN-XiaoyiNeural';
const TTS_DIR = join(tmpdir(), 'whale-tts');
/** 把一句中文合成本地 mp3，返回路径 */
function synth(say) {
  mkdirSync(TTS_DIR, { recursive: true });
  const out = join(TTS_DIR, `say-${Date.now()}.mp3`);
  execFileSync('python', ['-m', 'edge_tts', '--voice', VOICE, '--text', say, '--write-media', out], { stdio: 'pipe', timeout: 60000 });
  if (!existsSync(out)) throw new Error('TTS 没产出文件');
  return out;
}

const segments = [];
for (const p of imgs) segments.push({ type: 'image', data: { file: 'file:///' + p.replace(/\\/g, '/') } });
if (body) segments.push({ type: 'text', data: { text: body } });
for (const say of voices) {
  if (!say) continue;
  let mp3;
  try { mp3 = synth(say); } catch (e) { console.error('[tts-fail] ' + e.message); process.exit(3); }
  segments.push({ type: 'record', data: { file: 'file:///' + mp3.replace(/\\/g, '/') } });
}
for (const p of voiceFiles) {
  if (!p) continue;
  segments.push({ type: 'record', data: { file: 'file:///' + p.replace(/\\/g, '/') } });
}
if (!segments.length) { console.error('没有可发的内容'); process.exit(2); }

const isGroup = kind === 'group';
const action = isGroup ? 'send_group_msg' : 'send_private_msg';
const params = isGroup ? { group_id: Number(target), message: segments } : { user_id: Number(target), message: segments };

const ws = new WebSocket(WS_URL);
const STATE = 'C:\\Users\\<你的用户名>\\.dsh\\whale-work\\proactive-state.json';
/** 给主人发成功就记一笔：等他回，三分钟后可以追问一次。 */
function markSent() {
  if (isGroup || String(target) !== '<你的QQ号>') return;
  try {
    let s = {};
    try { s = JSON.parse(readFileSync(STATE, 'utf8')); } catch {}
    s.lastSentAt = new Date().toISOString();
    s.lastSentText = String(body || '').slice(0, 160);
    s.awaitingReply = true;
    s.followupUsed = false;
    writeFileSync(STATE, JSON.stringify(s, null, 2), 'utf8');
  } catch {}
}
const done = (code, note) => { console.log(note); try { ws.close(); } catch {} process.exit(code); };
const timer = setTimeout(() => done(1, '[timeout] 3002 没回话，检查 NapCat 是否在跑'), 15000);

ws.on('open', () => ws.send(JSON.stringify({ action, params, echo: 'whale-' + Date.now() })));
ws.on('message', (buf) => {
  let j; try { j = JSON.parse(String(buf)); } catch { return; }
  if (j.echo && String(j.echo).startsWith('whale-')) {
    clearTimeout(timer);
    if (j.retcode === 0) { markSent(); done(0, `[ok] 已发出 → ${kind}:${target} message_id=${j.data?.message_id}`); }
    else done(1, `[fail] retcode=${j.retcode} ${j.message || ''}`);
  }
});
ws.on('error', (e) => { clearTimeout(timer); done(1, '[error] ' + e.message); });
