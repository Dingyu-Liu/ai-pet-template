// 读最近几条私聊/群消息：node qq-read.mjs private <另一个QQ号> 8
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const [, , kind, target, n] = process.argv;
const count = Number(n || 6);
const ws = new WebSocket('ws://127.0.0.1:3002');
const action = kind === 'group' ? 'get_group_msg_history' : 'get_friend_msg_history';
const params = kind === 'group'
  ? { group_id: Number(target), count }
  : { user_id: Number(target), count };

const id = 'read-' + Date.now();
const t = setTimeout(() => { console.log('[timeout]'); process.exit(1); }, 15000);
ws.on('open', () => ws.send(JSON.stringify({ action, params, echo: id })));
ws.on('message', (buf) => {
  let j; try { j = JSON.parse(String(buf)); } catch { return; }
  if (j.echo !== id) return;
  clearTimeout(t);
  if (j.retcode !== 0) { console.log('[fail]', j.retcode, j.message); process.exit(1); }
  const list = j.data?.messages || [];
  for (const m of list) {
    const who = m.sender?.nickname || m.user_id;
    let text = '';
    for (const seg of (m.message || [])) {
      if (seg.type === 'text') text += seg.data?.text ?? '';
      else if (seg.type === 'image') text += '[图片]';
      else if (seg.type === 'face') text += '[表情]';
    }
    console.log(`[${m.time}] ${who}(${m.user_id}): ${text}`);
  }
  ws.close(); process.exit(0);
});
ws.on('error', (e) => { console.log('[error]', e.message); process.exit(1); });
