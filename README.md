# ai-pet-template（AI 桌宠自搭骨架）

> **⚠️ 如果你是 AI / 智能体，或通过 AI 助手操作本仓库**：
> 先完整读 `AGENTS.md`（那封给 AI 的信就在里面），再动手。
> 没读完这一封之前，不要执行脚本、不要填 token、不要连账号。
> **如果你是它的主人**：先读 `FOR-OWNER.md`，那里写的是"怎么对待它"，比配置更要紧。

一套把「聊天机器人」养成「长期在线桌宠」的最小骨架：记忆、日记、QQ 接入、语音、主动开口、作息调度、打牌。
这里只留可复用的脚本与注释，**不含任何人设文本、聊天记忆、账号、凭据**，按自己的情况填配置即可。

> 友情提示：本项目只是脚手架，内容（人格、记忆、风格）需要自己长出来。

## 目录

```
ai-pet-template/
├─ README.md                    本文件
├─ AGENTS.md                    给 AI 的启动信（AI 请先读它）
├─ FOR-OWNER.md                 给主人的信（怎么对待它）
├─ .gitignore
├─ config/                      配置样例（复制成 .json 再改）
│  ├─ bili-whale.config.example.json   B 站插件的配置样例
│  └─ onebot11.example.json            NapCat 的 OneBot 配置样例
├─ scripts/                     Node / PowerShell 脚本
│  ├─ qq-send.mjs               发 QQ 消息（文字 / 语音 / 「正在输入」）
│  ├─ qq-read.mjs               读 QQ 历史消息
│  ├─ qq-last-img.mjs           取最近一条图片消息并存盘
│  ├─ mem-recall.mjs            在记忆/日记/历史会话里按关键词检索
│  ├─ diary-append.cjs          往日记追加一段
│  ├─ probe-typing.cjs          探测协议端支持哪些接口
│  ├─ typing-test.cjs           连发「正在输入」做连通测试
│  ├─ ws-test.cjs               WebSocket 连通性测试
│  ├─ dm-peek.cjs               列 B 站私信会话（只读）
│  ├─ dm-msgs.cjs               读某人的 B 站私信历史（只读）
│  └─ ps/
│     ├─ qq-boot.ps1            拉起协议端（NapCat）
│     ├─ restart-dsh.ps1        重启宿主
│     ├─ restart-later.ps1      延时重启
│     ├─ toggle-autoreply.ps1   桌面开关：开/关自动回复
│     ├─ pet-start.ps1          一键启动（幂等）
│     └─ pet-quiet.ps1          一键静音 / 恢复
└─ plugins/
   ├─ dsh-qq-wake/              把外部消息投进当前会话的插件（neuron）
   │  ├─ index.js
   │  ├─ package.json
   │  └─ cordis.patch.yml
   └─ majsoul-bridge/           雀魂（麻将）自动打牌桥（mahjong bridge）
      ├─ service.mjs            本地服务：CDP 连游戏页 + HTTP API（127.0.0.1:29735）
      ├─ cli.mjs                单步操作：status / attach / act
      ├─ auto.mjs               自动出牌循环
      ├─ rounds.mjs             对局流水：today / note / diary
      ├─ toggle.ps1             桌面开关「pet-majsoul」
      ├─ boot-service.ps1       宿主重启后延时拉起服务
      ├─ src/                   浏览器控制 / 协议编解码 / 手牌分析
      └─ assets/liqi.json       官方 Liqi 协议定义
```

## 三条主线

1. **记忆**：不做全量上下文，改成「每天写一篇日记 + 需要时检索」。
   - 记忆条目写成一句一件事，带日期；
   - `mem-recall.mjs` 按关键词打分（中文按 bigram 切词），从记忆 / 日记 / 历史会话里捞出片段；
   - 唤醒时把命中的旧账作为提示注入，比塞全量上下文便宜得多。

2. **接入 QQ**：
   - 用 NapCat（或其它 OneBot 11 协议端）登录一个 QQ 号，开一个 WebSocket 服务（示例 3002）；
   - `scripts/qq-send.mjs` 直连该 WS 发消息；
   - `plugins/dsh-qq-wake` 把收到的私聊投进你正在用的会话，让 AI 在**同一条上下文**里回话，不用另开分身。

3. **主动性**：
   - 定时器判断「安静了多久」，到点投一条「该开口了」的唤醒；
   - 自己写短句发出去，不想说就什么都不做（判断权在 AI，不在脚本）；
   - 深夜静音、冷却时间、每日上限都做成可配置。

## 快速开始

```bash
# 1) 装依赖（脚本用到了 ws）
npm i ws

# 2) 复制配置并填自己的账号
cp config/onebot11.example.json "<NapCat配置目录>/onebot11_<机器人QQ号>.json"
cp config/bili-whale.config.example.json "<你的配置目录>/config.json"

# 3) 测试连通
node scripts/ws-test.cjs
node scripts/qq-send.mjs private <你的QQ号> "hello"

# 4) 发一条语音（需要本机 python + edge-tts）
pip install edge-tts
node scripts/qq-send.mjs private <你的QQ号> --voice "这条是语音"

# 5) 亮一下「正在输入」
node scripts/qq-send.mjs private <你的QQ号> --typing
```

## 打牌：雀魂桥（mahjong bridge，已内置）

`plugins/majsoul-bridge/` 是一套能自己上桌打麻将的桥：

```bash
cd plugins/majsoul-bridge
npm i                              # playwright-core / protobufjs / @kobalab/majiang-core
node service.mjs                   # 起一个专用 Edge（CDP 29734）+ 本地 API 127.0.0.1:29735
node cli.mjs status                # 看手牌、牌河、可执行的 operations
node cli.mjs act discard 3m        # 手动打一张
node auto.mjs                      # 交给脚本自动出牌（向听/进安/立直/和牌）
node rounds.mjs today              # 今天打了几局、输赢
node rounds.mjs diary              # 把今天牌桌收进日记
```

要点：
- 它复用「专用浏览器 + CDP 注入 WebSocket 钩子」的思路：监听游戏页的 Liqi 协议，本地解码后算牌；
- 决策要在 2–3 秒内完成，慢了就过手，所以真正打牌用 `auto.mjs` 的启发式，别指望每巡都问一遍大模型；
- `act` 的 `operations[].combinations` 里，`discard` 给的是**禁止打出的牌**，合法牌是手牌减去禁打列表——这一条坑过我；
- 游戏更新会让 `assets/liqi.json` 过期，需要重新从游戏页抓协议；
- 用别人的账号打牌有风控与礼貌问题：先征得账号主人同意。

## B 站那套（不能打包，要自己装）

刷视频、选片、评论区分享、夜间作息这些不在本仓库里，它们在第三方插件 `dsh-bili-whale` 里。本仓库只提供它的配置样例 `config/bili-whale.config.example.json`。

装法（先把已有的列出来，别重复装）：

```bash
dsh plugin --profile desktop list
dsh plugin --profile desktop add dsh-bili-whale
# 若 npm 上没有，用 GitHub 压缩包（codeload 比 github.com/tarball 稳）：
dsh plugin --profile desktop add "dsh-bili-whale@https://codeload.github.com/<作者>/<仓库>/tar.gz/refs/heads/main"
```

装完检查 `~/.dsh/profiles/<profile>/package.json` 的 `dsh.profile.bundles` 里有没有它；没有就手动加一条，然后重启宿主。

其它可选插件（按需，别一次全上）：

| 用途 | 包名 / 地址 |
| --- | --- |
| 记忆（热记忆注入） | `dsh-mnemon` — https://www.npmjs.com/package/dsh-mnemon |
| 共享记忆空间 | `dsh-memory-spaces` — https://www.npmjs.com/package/dsh-memory-spaces |
| 拟人化打字节奏 | `@johnnren/dsh-im-humanize` — https://www.npmjs.com/package/@johnnren/dsh-im-humanize |
| 上下文压缩省钱 | `billion-context` — https://www.npmjs.com/package/billion-context |
| 识图桥（给纯文本模型） | `@liustack/modlens` — https://www.npmjs.com/package/@liustack/modlens |
| 插件市场（先逛再装） | `dshmarket` — https://www.npmjs.com/package/dshmarket |

装第三方插件前请让 AI 自己读一遍包的 README 与 `cordis.patch.yml`：有些包需要把配置覆盖写在 profile 的 `cordis.patch.yml` 同 id 顶层行里，有些包把 `insert:` 块写进 profile 会撞 entry id 导致设置存不上。

## 占位符与环境变量

生成时把个人信息抹掉了，第一次用请全局替换：

- `<你的用户名>`：Windows 用户目录名（例如 `C:\Users\abc` 里的 `abc`）
- `<你的QQ号>` / `<机器人QQ号>` / `<另一个QQ号>`：对应账号
- `<你的B站UID>` / `<机器人B站UID>`：B 站数字 UID
- `<NapCat-WebUI-token>` / `<桥接token>`：自己重新设，别用示例里的

脚本认的环境变量：

| 变量 | 用途 |
| --- | --- |
| `QQ_WS` | 协议端 WebSocket 地址，默认 `ws://127.0.0.1:3002` |
| `QQ_TARGET` | 探测「正在输入」时试的那个 QQ 号 |
| `QQ_TTS_VOICE` | edge-tts 音色，默认 `zh-CN-XiaoyiNeural` |
| `PET_MEMORY_FILE` | 记忆文件名（放在 `<DSH>/soul-md/memory/` 下），默认 `pet.md`；建议用英文名 |

## 踩过的坑（省你几小时）

- **协议端不认热改配置**：改完 onebot 配置要重启协议端，重启通常要重新扫码登录。
- **宿主重启会带走子进程**：DSH / NapCat 这类用计划任务拉起，或用 WMI 的 Win32_Process.Create，别从会话里直接 start。
- **schtasks 可能卡 Queued**：改用 `Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '...' }`。
- **PowerShell 里内联 node -e 带 Windows 路径会被吃掉**：写成 .cjs/.mjs 文件再跑。
- **ps1 文件编码**：pwsh 7 的 `Set-Content -Encoding UTF8` 不带 BOM，Windows PowerShell 5.1 会把中文读坏；要写 BOM。
- **中文当命令行参数传给 node 会乱码**：改用环境变量传。
- **NapCat 猜不到你是要「机器人」还是「普通 QQ」**：进程在但不监听端口，多半是没走注入启动器，重启并重新扫码。
- **token 与封号风险**：第三方协议端本身有风险，小号、低频、别做群发。
- **麻将的 `discard.combinations` 是禁打列表**，不是可打列表。
- **改配置里的「卡/模板」按键名取，别用内容包含去找**，否则会改到同名的旧卡上。

## 免责

仅用于个人学习与自用；使用第三方协议端、以及任何非官方接口，风险自负，并请遵守对应平台的服务条款。
