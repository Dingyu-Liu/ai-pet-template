const WebSocket = require('ws'); // npm i ws
const ws = new WebSocket('ws://127.0.0.1:3002');
let id = 0;
const pending = new Map();
const call = (action, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ action, params, echo: String(i) })); setTimeout(() => { if (pending.has(i)) { pending.delete(i); res({ timeout: true }); } }, 4000); });
ws.on('message', (b) => { const m = JSON.parse(b.toString()); const r = pending.get(Number(m.echo)); if (r) { pending.delete(Number(m.echo)); r(m); } });
ws.on('open', async () => {
  const acts = await call('get_supported_actions', {});
  const list = acts.data || acts;
  console.log('supported:', JSON.stringify(list).slice(0, 3000));
  for (const cand of ['set_input_status', 'send_typing', 'set_typing', 'friend_typing']) {
    const r = await call(cand, { user_id: Number(process.env.QQ_TARGET || 0), event_type: 1 });
    console.log(cand, '->', JSON.stringify(r).slice(0, 300));
  }
  process.exit(0);
});
ws.on('error', (e) => { console.log('err', e.message); process.exit(1); });
