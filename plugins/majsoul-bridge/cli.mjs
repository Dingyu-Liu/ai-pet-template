// pet-majsoul的遥控器：node cli.mjs status | attach | act <动作> [牌] [--index N] [--tsumogiri]
const API = 'http://127.0.0.1:29735';
const [cmd, ...rest] = process.argv.slice(2);

async function call(path, init) {
  const r = await fetch(API + path, init);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

if (cmd === 'status') {
  const s = await call('/status');
  console.log(s.render ?? JSON.stringify(s, null, 2));
} else if (cmd === 'attach') {
  const s = await call('/attach', { method: 'POST' });
  console.log(s.render ?? JSON.stringify(s, null, 2));
} else if (cmd === 'act') {
  const action = rest.shift();
  let tile, index, tsumogiri = false;
  for (const a of rest) {
    if (a === '--tsumogiri') tsumogiri = true;
    else if (a.startsWith('--index')) index = Number(a.split('=')[1] ?? rest[rest.indexOf(a) + 1]);
    else if (!tile) tile = a;
  }
  const body = { action };
  if (tile) body.tile = tile;
  if (Number.isFinite(index)) body.index = index;
  if (tsumogiri) body.tsumogiri = true;
  const s = await call('/status');
  if (s.version) body.version = s.version;
  console.log(JSON.stringify(await call('/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), null, 2));
} else {
  console.log('用法: node cli.mjs status | attach | act <discard|chi|pon|riichi|tsumo|ron|pass…> [牌] [--index=N] [--tsumogiri]');
}
