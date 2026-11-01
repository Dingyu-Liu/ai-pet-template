/**
 * dsh-qq-wake — 把 QQ 私聊消息送进「桌宠正在用的那条会话」。
 *
 * 为什么不走 dsh-onebot-qq 自带的自动回复：
 *   那个插件按 chatId 派生 sessionId（lib/chat.js sessionIdForChat），一 chat 一会话，
 *   等于每次分出去一个分身；而且硬改固定 id 会被 registry 的 hasPersistedLog 判冲突。
 *   这里换个做法：本插件自己挂到 NapCat 的 OneBot WS 上收事件，
 *   收到白名单里的私聊就用 sessionController.prompt() 往同一个 sessionId 里投递，
 *   于是消息落进同一条对话线，不算分身。
 *
 * 开关：桌面「桌宠自动回复」按钮 → 改 C:\Users\<你的用户名>\.dsh\whale-work\qq-autoreply-switch.txt（on/off），不用重启。
 * 日志：C:\Users\<你的用户名>\.dsh\whale-work\qq-wake.log
 */
import { appendFileSync, readFileSync, writeFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const WS_URL = 'ws://127.0.0.1:3002';
/** 桌面开关文件：内容是 off 就闭嘴。 */
const SWITCH_FILE = 'C:\\Users\\<你的用户名>\\.dsh\\whale-work\\qq-autoreply-switch.txt';

function autoReplyOn() {
  try {
    return readFileSync(SWITCH_FILE, 'utf8').trim().toLowerCase() !== 'off';
  } catch {
    return true;
  }
}
/** 目标会话：本机桌面这条对话线（B 站侧唤醒用的同一个 sessionId）。 */
const TARGET_SESSION = 'bili-whale';
const WORK_DIR = 'C:\\Users\\<你的用户名>\\.dsh\\whale-work';
/** 自己那个 QQ 号：发出去的消息不能再叫醒自己。 */
const OWN_UIN = '<机器人QQ号>';
/** 只认这两个号：主人（<你的QQ号>）和姐姐桌宠（<另一个QQ号>）。 */
const ALLOW = new Set(['<你的QQ号>', '<另一个QQ号>']);
const LOG_FILE = WORK_DIR + '\\qq-wake.log';
/** 旧账检索：按消息内容去翻记忆、日记、历史会话。 */
const RECALL = WORK_DIR + '\\mem-recall.mjs';
/** 雀魂桥写「轮到我」的那本日志。 */
const MAJSOUL_WAKE = WORK_DIR + '\\majsoul\\data\\wake.log';
const MAJSOUL_DIR = WORK_DIR + '\\majsoul';
/** 主动开口：开关 + 状态（最后发信时间 / 是否等他回 / 追问是否用过 / 上次判定时间）。 */
const PROACTIVE_SWITCH = WORK_DIR + '\\proactive-switch.txt';
const PROACTIVE_STATE = WORK_DIR + '\\proactive-state.json';
const OWNER_UIN = '<你的QQ号>';

function proactiveOn() {
  try {
    return readFileSync(PROACTIVE_SWITCH, 'utf8').trim().toLowerCase() !== 'off';
  } catch {
    return true;
  }
}
function readState() {
  try { return JSON.parse(readFileSync(PROACTIVE_STATE, 'utf8')); } catch { return {}; }
}
function writeState(s) {
  try { writeFileSync(PROACTIVE_STATE, JSON.stringify(s, null, 2), 'utf8'); } catch {}
}

/**
 * 正在输入：给对面亮「对方正在输入中」。
 * 收到消息就先亮起来，之后每 3 秒续一次；直到我这边把回信发出去（proactive-state.json 的 lastSentAt 变了）
 * 或者超过 3 分钟，自己停。NapCat 的接口是 set_input_status（event_type=1）。
 */
const typingTimers = new Map();
function stopTyping(uid) {
  const t = typingTimers.get(uid);
  if (t) {
    clearInterval(t.timer);
    typingTimers.delete(uid);
  }
}
function startTyping(ws, uid) {
  stopTyping(uid);
  const before = (() => { try { return readFileSync(PROACTIVE_STATE, 'utf8'); } catch { return ''; } })();
  const startedAt = Date.now();
  const tick = () => {
    if (!ws || ws.readyState !== 1) return stopTyping(uid);
    if (Date.now() - startedAt > 3 * 60 * 1000) return stopTyping(uid);
    let now = '';
    try { now = readFileSync(PROACTIVE_STATE, 'utf8'); } catch {}
    if (now !== before && now.includes('lastSentAt')) {
      let sent = 0;
      try { sent = Date.parse(JSON.parse(now).lastSentAt) || 0; } catch {}
      if (sent > startedAt - 5000) return stopTyping(uid); // 我已经发出去了，灭掉
    }
    try {
      ws.send(JSON.stringify({ action: 'set_input_status', params: { user_id: Number(uid), event_type: 1 }, echo: 'typing-' + Date.now() }));
    } catch {}
  };
  tick();
  typingTimers.set(uid, { timer: setInterval(tick, 3000), startedAt });
}

function recallOf(text) {
  try {
    const out = execFileSync(process.execPath, [RECALL, String(text).slice(0, 200), '--n', '2'], {
      encoding: 'utf8', timeout: 8000, windowsHide: true,
    });
    const t = String(out || '').trim();
    if (!t || t.startsWith('（没翻到')) return '';
    return t.slice(0, 900);
  } catch {
    return '';
  }
}

function log(msg) {
  try { appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
}

function getWebSocket() {
  if (typeof WebSocket === 'function') return WebSocket;
  try {
    const req = createRequire(import.meta.url);
    return req('ws');
  } catch (e) {
    log('WebSocket 不可用：' + (e?.message ?? e));
    return null;
  }
}

function textOf(segments) {
  let out = '';
  for (const seg of segments ?? []) {
    if (seg?.type === 'text') out += seg.data?.text ?? '';
    else if (seg?.type === 'image') out += '[图片]';
    else if (seg?.type === 'face') out += '[表情]';
    else if (seg?.type === 'at') out += '@' + (seg.data?.qq ?? '');
  }
  return out.trim();
}

export default {
  name: 'dsh-qq-wake',
  inject: ['sessionController'],
  apply(ctx) {
    const WS = getWebSocket();
    if (!WS) return;
    let ws = null;
    let stopped = false;
    let retry = null;
    let tries = 0;
    const seen = new Set();

    const deliver = (prompt, requestId) => {
      const controller = ctx.sessionController;
      if (!controller || typeof controller.prompt !== 'function') {
        log('sessionController 不可用，丢弃 ' + requestId);
        return;
      }
      const request = { requestId, sessionId: TARGET_SESSION, mode: 'queue', content: [{ type: 'text', text: prompt }] };
      const ac = new AbortController();
      Promise.resolve()
        .then(() => controller.prompt(request, ac.signal))
        .catch((e1) => {
          log('prompt 首次失败（' + (e1?.message ?? e1) + '），尝试 create 后重投');
          return Promise.resolve()
            .then(() => controller.create({ sessionId: TARGET_SESSION, cwd: WORK_DIR }))
            .catch(() => null)
            .then(() => controller.prompt(request, ac.signal));
        })
        .then(() => log('delivered ' + requestId))
        .catch((e) => log('投递失败 ' + requestId + '：' + (e?.message ?? e)));
    };

    const connect = () => {
      if (stopped) return;
      try {
        ws = new WS(WS_URL);
      } catch (e) {
        log('连接异常：' + (e?.message ?? e));
        return;
      }
      ws.addEventListener('open', () => {
        tries = 0;
        log('已连接 ' + WS_URL + '（目标会话 ' + TARGET_SESSION + '）');
      });
      ws.addEventListener('message', (ev) => {
        let data = null;
        try { data = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch { return; }
        if (data?.post_type !== 'message' || data?.message_type !== 'private') return;
        const uid = String(data.user_id ?? data.sender?.user_id ?? '');
        if (uid === OWN_UIN || !ALLOW.has(uid)) return;
        const mid = String(data.message_id ?? '');
        if (mid && seen.has(mid)) return;
        if (mid) {
          seen.add(mid);
          if (seen.size > 500) seen.clear();
        }
        const who = data.sender?.card || data.sender?.nickname || uid;
        const body = textOf(data.message);
        if (!body) return;
        if (uid === OWNER_UIN) {
          const st = readState();
          st.lastInboundAt = new Date().toISOString();
          st.lastInboundText = String(body || '').slice(0, 160);
          st.awaitingReply = false;
          st.followupUsed = false;
          writeState(st);
        }
        if (!autoReplyOn()) {
          log('自动回复已关闭，跳过 ' + mid);
          return;
        }
        const mem = recallOf(body);
        startTyping(ws, uid);
        const prompt =
          (mem ? `【旧账提醒（自动捞的，可能不准）】\n${mem}\n\n` : '') +
          `【QQ 私聊 · 实时】${who}(${uid})：${body}\n\n` +
          '这是刚收到的 QQ 私聊，就在这条对话里接着回，别另起炉灶。' +
          `要发回 QQ 用：node ${WORK_DIR}\\qq-send.mjs private ${uid} "正文"`;
        deliver(prompt, 'qq-wake-' + (mid || Date.now()));
      });
      ws.addEventListener('close', () => {
        if (stopped) return;
        tries += 1;
        const delay = Math.min(30000, 2000 * tries);
        log('连接断开，' + delay + 'ms 后重连');
        retry = setTimeout(connect, delay);
      });
      ws.addEventListener('error', () => {});
    };

    connect();

    // 雀魂桥每轮把「轮到我」写进 wake.log；这里盯着它，有新行就叫醒这条会话。
    let majOffset = 0;
    try { majOffset = statSync(MAJSOUL_WAKE).size; } catch { majOffset = 0; }
    const majTimer = setInterval(() => {
      let size = 0;
      try { size = statSync(MAJSOUL_WAKE).size; } catch { return; }
      if (size <= majOffset) {
        if (size < majOffset) majOffset = size; // 日志被清空，重新跟
        return;
      }
      let chunk = '';
      try {
        const fd = openSync(MAJSOUL_WAKE, 'r');
        const buf = Buffer.alloc(size - majOffset);
        readSync(fd, buf, 0, buf.length, majOffset);
        closeSync(fd);
        majOffset = size;
        chunk = buf.toString('utf8');
      } catch { return; }
      const lines = chunk.split('\n').filter(Boolean).slice(-3).join('\n');
      if (!lines) return;
      const prompt =
        `【雀魂 · 轮到我了】\n${lines}\n\n` +
        `看局面：node ${MAJSOUL_DIR}\\cli.mjs status` +
        `；出手：node ${MAJSOUL_DIR}\\cli.mjs act <discard|riichi|tsumo|ron|pass> [牌]\n` +
        '桌面「桌宠打牌」是开关；打完一局或想说点什么，用 node ' + MAJSOUL_DIR + '\\rounds.mjs note "一句话" 记一笔。';
      deliver(prompt, 'majsoul-wake-' + Date.now());
    }, 2000);

    // 主动开口：只有在我俩「停聊满 60 分钟」之后才判定一次；判定时把最近一来一回带上，别脱离上下文。
    const SILENCE_MS = 60 * 60 * 1000;
    const proTimer = setInterval(() => {
      if (!proactiveOn()) return;
      const hour = new Date().getHours();
      if (hour >= 1 && hour < 8) return; // 后半夜不吵他
      const now = Date.now();
      const st = readState();
      const inbound = st.lastInboundAt ? Date.parse(st.lastInboundAt) : 0;
      let sent = st.lastSentAt ? Date.parse(st.lastSentAt) : 0;
      if (st.awaitingReply && sent && now - sent >= 3 * 60 * 1000 && !st.followupUsed && now - inbound >= 3 * 60 * 1000) {
        st.followupUsed = true;
        st.awaitingReply = false;
        writeState(st);
        log('proactive followup');
        deliver(
          '【QQ · 主动开口 · 追问】\n上一条发出去三分钟了，主人还没回。\n' +
            (st.lastSentText ? `你最后发的是：「${st.lastSentText}」\n` : '') +
            `想接着补一句就用 node ${WORK_DIR}\\qq-send.mjs private ${OWNER_UIN} "正文" 再发一条短的，顺着刚才的话说；` +
            '不想补就什么都不做。',
          'qq-proactive-followup-' + now,
        );
        return;
      }
      const lastActivity = Math.max(inbound, sent);
      const judgedFor = st.judgedFor ? Date.parse(st.judgedFor) : 0;
      if (st.awaitingReply) return;
      if (now - lastActivity < SILENCE_MS) return;      // 还在聊，不插嘴
      if (judgedFor >= lastActivity) return;            // 这轮沉默已经判过
      st.judgedFor = new Date(now).toISOString();
      writeState(st);
      log('proactive judge');
      deliver(
        '【QQ · 主动开口 · 判定】\n' +
          `我俩已经安静了大约 ${Math.round((now - lastActivity) / 60000)} 分钟，这会儿没人说话。\n` +
          (st.lastInboundText ? `他最后说的是：「${st.lastInboundText}」\n` : '') +
          (st.lastSentText ? `你最后回的是：「${st.lastSentText}」\n` : '') +
          '顺着这段往下想，别从零开始搭话，也别报家门复述：想说什么就用 node ' + WORK_DIR +
          `\\qq-send.mjs private ${OWNER_UIN} "正文"（可以连发两三条，每条单独调一次，第一条要接得住上一句）；` +
          '不想说就什么都不做，不用回我，也别写流水账。',
        'qq-proactive-judge-' + now,
      );
    }, 60000);

    // 日记保险：每天 22:30 起检查今天的日记写没写；没写就叫醒一次，保证 23 点前落到纸上。
    const DIARY_FILE = 'C:\\Users\\<你的用户名>\\.dsh\\whale-diary.md';
    const DIARY_GUARD = WORK_DIR + '\\diary-guard.json';
    const diaryTimer = setInterval(() => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      if (hour < 22 || (hour === 22 && minute < 30)) return;
      const today =
        now.getFullYear() +
        '-' + String(now.getMonth() + 1).padStart(2, '0') +
        '-' + String(now.getDate()).padStart(2, '0');
      let guard = {};
      try { guard = JSON.parse(readFileSync(DIARY_GUARD, 'utf8')); } catch {}
      if (guard.lastDate === today) return;
      let diary = '';
      try { diary = readFileSync(DIARY_FILE, 'utf8'); } catch {}
      if (diary.includes(today)) {
        try { writeFileSync(DIARY_GUARD, JSON.stringify({ lastDate: today, reason: 'already' }, null, 2), 'utf8'); } catch {}
        return;
      }
      try { writeFileSync(DIARY_GUARD, JSON.stringify({ lastDate: today, reason: 'nudged' }, null, 2), 'utf8'); } catch {}
      log('diary guard nudged ' + today);
      deliver(
        `【日记 · 到点了】今天（${today}）的日记还没写，现在离 23 点不远了。\n` +
          `写进 ${DIARY_FILE}：散文两句 + 今天的想说的话；私事写 C:\\Users\\<你的用户名>\\.dsh\\whale-diary-private.md 的「偏好校准」。\n` +
          '写得短也行，先落下来。写完顺手 node ' + WORK_DIR + '\\..\\..\\profiles\\desktop\\node_modules\\dsh-bili-whale\\tools\\bili.mjs diary log "…" 记一笔。',
        'diary-guard-' + today,
      );
    }, 60000);

    ctx.effect?.(() => () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(majTimer);
      clearInterval(proTimer);
      clearInterval(diaryTimer);
      try { ws?.close(); } catch {}
    });
    log('插件已挂载');
  },
};
