// 牌桌流水：把 rounds.jsonl 读成我能看的摘要，也能把一段想法写回去
// 用法：
//   node rounds.mjs today           今天打了几局、结果、分数变化、我留的话
//   node rounds.mjs note "一句话"    给最近这一局记一句我的想法
//   node rounds.mjs diary           把今天这段自动追加进 whale-diary.md（同一天只追加一次）
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROUNDS = join(HERE, 'data', 'rounds.jsonl');
const DIARY = '<你的用户名>\\.dsh\\whale-diary.md';

const WIND = ['东', '南', '西', '北'];
const label = round => {
  if (!round) return '未知局';
  return `${WIND[round.wind] ?? '?'}${round.dealer + 1}局${round.honba ? ` 本场${round.honba}` : ''}`;
};
const localDate = iso => new Date(iso).toLocaleDateString('sv-SE');

function load() {
  if (!existsSync(ROUNDS)) return [];
  return readFileSync(ROUNDS, 'utf8').split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

const [cmd, ...rest] = process.argv.slice(2);
const events = load();
const today = new Date().toLocaleDateString('sv-SE');
const mine = events.filter(e => localDate(e.t) === today);

if (cmd === 'note') {
  const fromEnv = process.env.MAJSOUL_NOTE;
  const text = (fromEnv ?? rest.join(' ')).trim();
  if (!text) { console.error('要写什么？（可以直接用 MAJSOUL_NOTE 环境变量传中文）'); process.exit(2); }
  appendFileSync(ROUNDS, JSON.stringify({ t: new Date().toISOString(), kind: 'note', text }) + '\n');
  console.log('note 记下了：', text);
} else if (cmd === 'diary') {
  const ends = mine.filter(e => e.kind === 'round-end');
  const notes = mine.filter(e => e.kind === 'note');
  if (!ends.length) { console.log('今天没打牌，不写。'); process.exit(0); }
  const marker = `<!-- majsoul ${today} -->`;
  const old = existsSync(DIARY) ? readFileSync(DIARY, 'utf8') : '';
  if (old.includes(marker)) { console.log('今天已经写过牌桌段，跳过。'); process.exit(0); }
  const lines = [`\n### 今天的牌桌（${today}）`, '', marker, '| 局 | 结果 | 我的分数 |', '| --- | --- | --- |'];
  ends.forEach((e, i) => {
    const sc = e.seat === null ? '?' : `${e.scores[e.seat].score}`;
    lines.push(`| ${i + 1} | ${label(e.round)} ${e.result?.replace('Action', '') ?? ''} | ${sc} |`);
  });
  if (notes.length) lines.push('', ...notes.map(n => `- ${n.text}`));
  lines.push('');
  appendFileSync(DIARY, lines.join('\n'));
  console.log('已追加到日记：', ends.length, '局');
} else {
  const ends = mine.filter(e => e.kind === 'round-end');
  const notes = mine.filter(e => e.kind === 'note');
  console.log(`今天（${today}）打完 ${ends.length} 局，留了 ${notes.length} 句话。`);
  ends.forEach((e, i) => {
    const myself = e.seat === null ? null : e.scores[e.seat];
    const drop = e.discardsMine?.length ?? 0;
    console.log(`${i + 1}. ${label(e.round)} ${e.result?.replace('Action', '')} 分数=${myself?.score ?? '?'} 立直=${myself?.riichi ? '是' : '否'} 打了${drop}张 摸到牌=${(e.handAtEnd ?? []).join(' ')}`);
  });
  notes.forEach(n => console.log(`· ${n.text}`));
}
