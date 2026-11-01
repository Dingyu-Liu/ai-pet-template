// 取最近一条图片消息并下载：node qq-last-img.mjs private <你的QQ号>
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const [, , kind, target] = process.argv;
const action = kind === 'group' ? 'get_group_msg_history' : 'get_friend_msg_history';
const params = kind === 'group' ? { group_id: Number(target), count: 20 } : { user_id: Number(target), count: 20 };
const id = 'lastimg-' + Date.now();
const ws = new WebSocket('ws://127.0.0.1:3002');
const t = setTimeout(() => { console.log('[timeout]'); process.exit(1); }, 20000);

ws.on('open', () => ws.send(JSON.stringify({ action, params, echo: id })));
ws.on('message', async (buf) => {
  let j; try { j = JSON.parse(String(buf)); } catch { return; }
  if (j.echo !== id) return;
  clearTimeout(t);
  const list = j.data?.messages || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    const img = (m.message || []).find(s => s.type === 'image');
    if (!img) continue;
    const d = img.data || {};
    console.log('message_id=' + m.message_id + ' time=' + m.time + ' from=' + (m.sender?.nickname || m.user_id));
    console.log('file=' + (d.file || ''));
    console.log('url=' + (d.url || ''));
    const url = d.url || d.file;
    if (url) {
      try {
        const r = await fetch(url);
        if (!r.ok) { console.log('[download fail] ' + r.status); process.exit(1); }
        const b = Buffer.from(await r.arrayBuffer());
        const p = 'C:\\Users\\<你的用户名>\\.dsh\\whale-work\\qq-last-img.png';
        fs.writeFileSync(p, b);
        console.log('[saved] ' + p + ' ' + b.length + ' bytes');
      } catch (e) { console.log('[download error] ' + e.message); process.exit(1); }
    }
    process.exit(0);
  }
  console.log('[no image in last 20 messages]');
  process.exit(1);
});
ws.on('error', (e) => { console.log('[error]', e.message); process.exit(1); });
