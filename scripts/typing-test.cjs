const WebSocket = require('ws') // npm i ws;
const ws = new WebSocket('ws://127.0.0.1:3002');
let id = 0; const pending = new Map();
const call = (action, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ action, params, echo: String(i) })); setTimeout(() => { if (pending.has(i)) { pending.delete(i); res({ timeout: true }); } }, 4000); });
ws.on('message', (b) => { const m = JSON.parse(b.toString()); const r = pending.get(Number(m.echo)); if (r) { pending.delete(Number(m.echo)); r(m); } });
ws.on('open', async () => {
  for (let i = 0; i < 6; i++) {
    const r = await call('set_input_status', { user_id: Number(process.env.QQ_TARGET || 0), event_type: 1 });
    console.log(i, r.status, JSON.stringify(r.data));
    await new Promise(r2 => setTimeout(r2, 3000));
  }
  process.exit(0);
});
ws.on('error', (e) => { console.log('err', e.message); process.exit(1); });
