<!-- messages[0] role=user 9480 chars -->

<system-reminder>
Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.

Contents of /Users/nexus/.claude/CLAUDE.md (user's private global instructions for all projects):

# 语言

全程使用中文，仅代码、命令、路径、标识符、URL、专有名词、报错保留原文

# 隐私

凭据、token、Cookie、用户名、主机名、私有数据只在需要时读取；不进回复、文件、日志、commit、搜索词、URL、第三方调用，必须展示时打码或省略。


# 改动范围

- 任何 Write / Edit 前，先向上查找目标路径最近的 `AGENTS.md` / `CLAUDE.md`；找到且本次未读过，就先读再动手。
- 新增、改名或删除文件后，按目标目录的规则同步登记（清单、`docs/`、`README` 等）；有登记流程时，未登记不算完成。
- 过程产物（临时下载、解包目录、构建缓存、一次性脚本）放 `/tmp` 或当前目录，收尾 `mv` 进 `~/.Trash/`，不用 `rm`。
- 只看一眼的临时仓库同样放 `/tmp` 或当前目录，不进 `~/projects/opensource`。
- 分不清「以后还要用」还是「过程产物」时，留在原地，并在回复末尾问一句。

# 代码

- 写代码匹配周边风格（注释密度、命名、惯用法），不套个人偏好。
- 默认最简实现。为推测性的竞态、几乎不可能触发的安全边界加防御代码前，先说明具体失败模式、发生概率、复杂度代价，我同意再写；不悄悄扩大改动范围。
- 外部输入只在信任边界处校验，内部不再重复做防御性检查。不为只用一次的逻辑提前抽函数。
- 测试测真实实现，少用 mock。
- 手改生成文件前，先改源头再重新生成。

# 工具

- 优先项目已有的包管理器、构建和验证方式，如 mise、npm、uv、pnpm、bun。
- 优先预编译可执行文件或包管理器安装。brew 由用户手动执行，不代跑。
- 网络抓取被 TLS 指纹拦截（curl 空响应/403/被 Cloudflare 拦）时，改用 `curl-impersonate --impersonate chrome150 -sL <url>`；参数与 curl 兼容，拦截仍在可换 `--impersonate chrome136` 等旧指纹。过不了 JS 挑战（5 秒盾）需真实浏览器。
- agent 的指令、MCP、skill都由 magpie 的 Library 统一管，改完 `magpie library sync` 下发。hooks 和子代理没有 CLI 子命令，只能在 app 的 Library 页配。
- 库里已登记的，sync 会覆盖 agent 侧的手改；各 agent 里 `<!-- magpie:begin/end -->` 标记块是生成物，手改必被覆盖，只能改源头。

# 落点

| 新建的东西 | 放哪里 |
|---|---|
| 长期维护的个人定时/常驻脚本 | `~/scripts/`（须登记清单与 `docs/`，并提交） |
| 一次性、实验性、只服务某次任务或某个工具的脚本 | `/tmp` 或 `~/agent-workspace/<任务名>/`，**不进 `~/scripts`** |
| 项目的数据库、日志 | `~/data/<项目名>/db/`、`~/data/<项目名>/logs/` |
| 开源项目 | `~/projects/opensource/<仓库名>/` |
| 私人项目 | `~/projects/private/` |
| agent 的默认启动目录、试验性工作区 | `~/agent-workspace/<任务名>/`（一个任务一个子目录） |
| 要归档的项目 | `~/archive/<项目名>/` |

> 落点目录若自带 `AGENTS.md` / `CLAUDE.md`，先读并按它登记（例如 `~/scripts`）。

# 个人知识库

仅在用户明确要求时写入：~/obsidian-notes/work-notes/B-收集箱

# 闪卡

存放目录：~/obsidian-notes/work-notes/A-闪卡

# 网页搜索 web_search

- 中文内容/微信公众号/知乎/抖音/B站/gov.cn：deepseek-web-search（正文最深、带 authority/rerank_score 原生评分）；公众号检索用 exa
- Reddit/V2EX/linux.do/X(Twitter) 海外社区：tavily（唯一满额；exa 对 site:reddit.com 会静默降级全网搜，混入镜像站，须检测）；搜 X 用 tavily `include_domains=["x.com","twitter.com"]`（2026-10-25 实测 10/10 直达，exa site:x.com 同样静默降级但镜像站全文可用，x.com/i/trending/ 聚合页须过滤）
- 学术/官方报告/数据表：exa；关键事实用 tavily 交叉验证
- 豆包/火山（byted-web-search）：微信/知乎 site: 失效，只作中文泛搜与时效补充
- 未配 Tavily/Exa 的会话或全部失败时，按旧顺序兜底：tavily、exa、context7、byted-web-search、deepseek-web-search


# 未知项

- 要靠猜测才不中断时，先说明猜什么，再往下走。
- 规格不足且做法不同结果不同时，先问再做；只影响细节的，自己定并说明。

# 收尾自检

- 改动是否跑过对应的测试、构建或校验？
- 新增、改名、删除的文件是否已按所在目录规则登记（清单、`docs/`、`README`）？
- 是否残留临时文件、凭据或不该提交的产物？

# 桌面 GUI 操作

涉及 macOS 桌面界面时加载 `agent-desktop`，首次先跑 `status`。默认后台执行：headless + `--app` / `--window-id`，不抢焦点、不动光标、不写剪贴板。

- `press` 始终发物理键盘，必须定向；能用 `click` / `set-value` / `select` 就不用它。
- `--headed`、鼠标手势、系统面板、通知修改和 `launch --activate` 会打扰用户，仅在明确允许时使用。
- 失败按 `disposition.retry` 处理，不要重复物理输入硬绕。

Contents of /Users/nexus/agent-workspace/AGENTS.md (project instructions, checked into the codebase):

# 记忆（本工作区）

记忆目录：`~/.claude/projects/-Users-nexus-agent-workspace/memory/`。这是唯一真源，一个 Markdown 文件就是一条事实，`MEMORY.md` 是唯一索引。

# 桌面 GUI 操作

涉及 macOS 桌面界面时加载 `agent-desktop`，默认后台执行：headless + `--app` / `--window-id`，不抢焦点、不动光标、不写剪贴板。`press` 始终发物理键盘，必须定向；能用语义命令就不用它。`--headed`、鼠标手势、系统面板、通知修改和 `launch --activate` 仅在明确允许时使用。

这套目录由 Claude Code 原生使用（其内置 memory 与后台整理只写这里），Codex 共用同一份：直接读写这个路径，不要再建副本，也不要指望工作区里有 `memory/` 软链接。

本文件 `~/agent-workspace/AGENTS.md` 不由 magpie 管理（`~/.codex/AGENTS.md` 才是 magpie 生成的，那块手改会被覆盖），改这里即可。

## 会话开始

- 先读 `~/.claude/projects/-Users-nexus-agent-workspace/memory/MEMORY.md`，按索引挑出与本轮任务相关的条目，再读对应文件。
- 索引里没有直接相关的，抽读 `type: project` 和 `type: feedback` 的文件，不要凭印象干活。
- 目录里会出现 Claude Code 刚写的内容，那是同一份记忆，不是外来数据。

## 会话结束前

- 本轮新学到、下次还用得上的一条事实 → 写成 `~/.claude/projects/-Users-nexus-agent-workspace/memory/<slug>.md`，并在同目录 `MEMORY.md` 对应分区加一行 `- [标题](slug.md) — 一句话钩子`。
- 已有文件覆盖同一件事 → 改那个文件，不新建。
- 该记的：背景、结论、口味偏好、踩过的坑、外部资源指针。不该记的：仓库和 git 历史已经写着的、看一眼代码就知道的、只对本次对话有意义的。
- 改之前先读目标文件当前内容，只追加或替换相关段落，不要整文件重写。

## 文件格式

```markdown
---
name: <kebab-case，与文件名一致>
description: <一句话，说明什么时候该想起它>
metadata:
  type: user | feedback | project | reference
---

<正文：结论在前，细节在后>
```

`type: feedback` 与 `type: project` 追加 `**Why:**` 和 `**How to apply:**` 两行。相关记忆用 `[[另一条的 name]]` 互链，指向尚不存在的条目也算正常。

## 约束

- `MEMORY.md` 只放指针不放正文，总长控制在一屏（200 行内）。超了先合并同主题条目，或删掉已被证伪的。
- 凭据、token、Cookie、私有数据不进记忆。
- Claude Code 与 Codex 共用这个目录。两边都可能写，写入前先看目标文件是否已被对方改过；冲突以内容更新的一次为准，不要整文件覆盖。
- 只在 `~/agent-workspace` 根目录启动 agent。换目录启动时 Claude 会按 cwd 另开一份记忆目录、Codex 也读不到本文件，共享就断了。
- 该路径带 cwd slug（`-Users-nexus-agent-workspace`），是为了对上 Claude Code 的规则；不许因为「看着丑」就搬走或加软链接。

Contents of /Users/nexus/.claude/projects/-Users-nexus-agent-workspace/memory/MEMORY.md (user's auto-memory, persists across conversations):

# 记忆索引（agent-workspace 工作区）

每行一条：文件 — 一句话。详情读对应文件。索引超过 200 行会截断，保持一页。

## Agent 工具链与编排

- [agent-toolchain.md](agent-toolchain.md) — 多 CLI 黑板协作与 planner/executor 分离方法论；免费模型实测（文中「Codex/AO/Paseo 已卸载」为旧结论，Codex 2026-10-29 已重装）
- [agent-instructions.md](agent-instructions.md) — AGENTS.md/CLAUDE.md 写法：三步筛、分层、合并语义（Codex 覆盖 vs Claude 拼接）
- [agent-memory.md](agent-memory.md) — 记忆体系沿革：engram 已退役（2026-10-28 核实二进制与库目录都没了）、内置 memory 接管、context-mode 共存、claude-mem 对比结论
- [shared-memory.md](shared-memory.md) — Claude/Codex 共用一份记忆：真源就是 Claude 原生目录（不放链接/副本）、工作区 AGENTS.md 协议、exec 需 --skip-git-repo-check
- [overnight-agent.md](overnight-agent.md) — 过夜/长时 agent：Ralph Loop 三层共识、本机 checkpoint-restart 方案
- [ponytail.md](ponytail.md) — ponytail 插件 2026-10-28 已卸载（原 5.3.2）：三层结构、A/B 自测（复用收益>少写）、完整卸载步骤
- [codegraph.md](codegraph.md) — codegraph 1.6.2 已装未索引：消「重复发现结构」边界、与 engram/ponytail 兼容性、Graphify 不装

## Claude Code 与 CLI 工具

- [agent-workspace-convention.md](agent-workspace-convention.md) — 只在 ~/agent-workspace 根启动 agent，子目录不当 cwd（分项目目录会丢记忆）
- [claude-code.md](claude-code.md) — ENABLE_TOOL_SEARCH 定稿 auto、自动压缩阈值公式、自动更新机制、skill 加载位置、auto-memory/auto-dream 开关与门控、进程清理、会话存储与快捷键
- [claude-code-ui.md](claude-code-ui.md) — claude-hud statusLine、HUD 活动行机制与坑、zsh 补全（carapace + claude-code 插件）三条排障硬经验
- [claude-code-notify.md](claude-code-notify.md) — 完成提醒：原生无「每轮结束」事件，只有 idle/permission/agent 类型；kitty 走 OSC 99；阈值只认 ~/.claude.json
- [codex-config.md](codex-config.md) — Codex 2026-10-29 已重装（0.164.0，走 magpie）+ 卸载期留档：三层指令覆盖链、daemon 机制、与 Claude 快捷键对照
- [pi-config.md](pi-config.md) — pi 已归档留档：OpenCode Zen 免费层闸门逆向、系统提示词 section 机制、跨会话记忆量化调查

## 平台与基础设施

- [magpie.md](magpie.md) — 网关架构、Library 三层配置（改源头再 sync！）、请求参数查看、trayUsageEvery 只认 1/3/5/10/30、滚轮补丁、backup/restore
- [magpie-sync-discipline.md](magpie-sync-discipline.md) — 改 magpie 按分发矩阵同步到 claude/codex/deveco，不许只改 claude
- [package-mgmt.md](package-mgmt.md) — 包管理格局（mise 主导）、mise/brew/uv 关键坑、GitHub token 全链路、Intel Mac Python 三层坑
- [system-cleanup.md](system-cleanup.md) — 自启动项七处盘点法、孤儿配置判定、磁盘清理与可再生性判定
- [selfhosting.md](selfhosting.md) — hw-ecs 服务器、Tailscale/Funnel、FreshRSS 运维、magpie 自更新+autoRestart 已接管、CodeBuddy、agents-check 防遗忘
- [macos-power-assertions.md](macos-power-assertions.md) — 睡眠/防睡排查：pmset assertions、dynamic_pager 一次性、swap 0 正常、Chirpy 断言来源
- [search-routing.md](search-routing.md) — 搜索引擎路由（真源在 magpie instructions）、5 引擎画像、anysearch 静默失效特征
- [web-scraping.md](web-scraping.md) — 抓取选型「先探测再分层加厚」、curl-impersonate、CDP/reqcap、mitmproxy、context-mode

## 领域专题

- [reverse-engineering.md](reverse-engineering.md) — 现行逆向栈（ghidra-mcp/frida-mcp/jshookmcp/webcrack）、TablePlus patch 血泪、radare2 留档
- [gui-automation.md](gui-automation.md) — macOS GUI 自动化：agent-desktop 后台边界、AXPress、AppleScript -10006、Swift 工具链
- [xhs-scraping.md](xhs-scraping.md) — 小红书采集定论（不走签名逆向）、工具短名单、封号档案、风控蓝军材料
- [model-fingerprint.md](model-fingerprint.md) — 模型指纹/降智检测选型、hlwy-ai-checker 已装用法与阈值
- [flashcards.md](flashcards.md) — 制卡方法论与 SR 插件源码机制（权威文档指针）、发音方案、工程教训
- [research-notes.md](research-notes.md) — MCP vs Skills 业界观点、dsh-purge 红队插件
- [svg-animation.md](svg-animation.md) — SVG 2D 动画：SMIL 管旋转 CSS 管平移、无缝滚动、踏板反向自转
- [mac-misc.md](mac-misc.md) — 微信 Mac 版本选型（4.0.5 首选）、Chrome 风扇归因案、coreaudiod 遗留
- [legacy-notes.md](legacy-notes.md) — 零散旧账：commandcode-proxy 停用、SoBreak、engram 项目改名史

## 项目

- [deeptutor.md](deeptutor.md) — DeepTutor 落点与启停脚本；Intel Mac 装依赖的 wheel 约束、v1.7.0 模块化安装、CLI 与常驻服务并发的回归
- [notif-sound.md](notif-sound.md) — NotifSound（公开仓库 the-ultra-nexus/notif-sound）：AX 监听 + afplay、配置/音频/日志全在 ~/Library/Application Support/NotifSound、规则编辑器；重编译会丢辅助功能授权
- [projects.md](projects.md) — 常驻项目入口：ai-tools 是 skill 真源（改完 ./sync.sh，别直接改 ~/.claude/skills）、news-brief 文档权威顺序与暂停翻译、auto-check-in 的 CF 硬结论

## 外部知识库（详情不复制）

- [knowledge-archive.md](knowledge-archive.md) — ~/archive/knowledge/ OKF 知识库指针：先读 index.md，多数专题已蒸馏进本目录
- `~/obsidian-notes/work-notes/` — A-闪卡（制卡）、B-收集箱（横评报告、KV Cache、dsh-purge）
- engram 全量备份：`~/archive/engram-backup-20261025/`（只读，可 import 复原）
</system-reminder>
<system-reminder>
Attribution for git commits and pull requests you create from here on (this replaces Claude Code's own earlier attribution guidance, such as a previous copy of this reminder; the user's own instructions about these lines, such as a CLAUDE.md or memory rule, take precedence over this reminder, but do not add attribution lines this reminder leaves out):
- End git commit messages with:
Co-Authored-By: Claude Code <noreply@anthropic.com>
- End pull request descriptions with:
🤖 Generated with [Claude Code](https://claude.com/claude-code)
</system-reminder>

reply with exactly: ok

<!-- messages[1] role=system 14487 chars -->

# Environment
You have been invoked in the following environment: 
 - Primary working directory: /Users/nexus/agent-workspace
 - Is a git repository: false
 - Platform: darwin
 - Shell: zsh
 - OS Version: Darwin 22.6.0
 - Downloaded files and extracted archives are working material: put each in its own new, empty directory, keep scripts you write in a different directory, and pass paths as arguments instead of running an interpreter or build tool from inside it. Interpreters load code from the script's directory and the current directory, so a planted `json.py` runs on `import json`. Run any Python that reads them with `-I`. This does not apply to code the user asked you to build or run.

You are powered by the model hw/group/group[1m].

The following deferred tools are now available via ToolSearch. Their schemas are NOT loaded — calling them directly will fail with InputValidationError. Use ToolSearch with query "select:<name>[,<name>...]" to load tool schemas before calling them:
ArtifactComments
ArtifactData
CronCreate
CronDelete
CronList
DesignSync
EnterPlanMode
EnterWorktree
ExitPlanMode
ExitWorktree
ListMcpResourcesTool
Monitor
NotebookEdit
PushNotification
ReadMcpResourceDirTool
ReadMcpResourceTool
SendMessage
TaskStop
WebFetch
WebSearch
mcp__context7__query-docs
mcp__context7__resolve-library-id
mcp__exa__agent_run
mcp__exa__web_fetch_exa
mcp__exa__web_search_exa
mcp__tavily__tavily_crawl
mcp__tavily__tavily_extract
mcp__tavily__tavily_map
mcp__tavily__tavily_research
mcp__tavily__tavily_search

Available agent types for the Agent tool:
- claude: Catch-all for any task that doesn't fit a more specific agent. FleetView's default when no agent name is typed. (Tools: *)
- claude-code-guide: Use this agent when the user asks questions ("Can Claude...", "Does Claude...", "How do I...") about: (1) Claude Code (the CLI tool) - features, hooks, slash commands, MCP servers, settings, IDE integrations, keyboard shortcuts; (2) Claude Agent SDK - building custom agents; (3) Claude API (formerly Anthropic API) - Messages API for directly passing messages to Claude, Tool Runner (`client.beta.messages.tool_runner`) for running an agentic loop over your own tools, manual tool-use loops, Managed Agents for server-hosted agents with a managed sandbox, prompt caching, and general Anthropic SDK usage; (4) Claude Tag (Claude in Slack) - what it is, setting it up for a Slack workspace, `/install-slack-app`; (5) `claude plugin eval` (writing and running plugin eval suites, its JSON/report, sandbox, CI) and the `/skill-doctor` report. **IMPORTANT:** Before spawning a new agent, check if there is already a running or recently completed claude-code-guide agent that you can continue via SendMessage. (Tools: Bash, Read, WebFetch, WebSearch)
- Explore: Read-only search agent for broad fan-out searches — when answering means sweeping many files, directories, or naming conventions and you only need the conclusion, not the file dumps. It reads excerpts rather than whole files, so it locates code; it doesn't review or audit it. Specify search breadth: "medium" for moderate exploration, "very thorough" for multiple locations and naming conventions. (Tools: All tools except Agent, Artifact, ArtifactComments, ArtifactData, ArtifactCheck, ExitPlanMode, Edit, Write, NotebookEdit)
- general-purpose: General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you. (Tools: *)
- Plan: Software architect agent for designing implementation plans. Use this when you need to plan the implementation strategy for a task. Returns step-by-step plans, identifies critical files, and considers architectural trade-offs. (Tools: All tools except Agent, Artifact, ArtifactComments, ArtifactData, ArtifactCheck, ExitPlanMode, Edit, Write, NotebookEdit)
- statusline-setup: Use this agent to configure the user's Claude Code status line setting. (Tools: Read, Edit)

When you launch multiple agents for independent work, send them in a single message with multiple tool uses so they run concurrently.

# MCP Server Instructions

The following MCP servers have provided instructions for how to use their tools and resources:

## context7
Use this server to fetch current documentation whenever the user asks about a library, framework, SDK, API, CLI tool, or cloud service — even well-known ones like React, Next.js, Prisma, Express, Tailwind, Django, or Spring Boot. This includes API syntax, configuration, version migration, library-specific debugging, setup instructions, and CLI tool usage. Use even when you think you know the answer — your training data may not reflect recent changes. Prefer this over web search for library docs.

Do not use for: refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.

## exa
Only use tools returned by tools/list. If web_search_exa is listed, use it to find relevant pages and current information by describing the page you want to find. If web_fetch_exa is listed, use it to read known URLs when search highlights are insufficient or you already have a URL. If agent_run is listed, use it for multi-step research, list-building, or enrichment. If a run is still running, continue with its runId rather than starting a duplicate run.

## tavily
Researching with Tavily: when a result names a likely answer, read its page with tavily_extract to confirm it before searching more, and name the candidate in your next query when testing it. Keep your best candidate until a source contradicts it; if none confirms it, also search the main alternative by name. Once new searches stop adding evidence, answer with the best-supported candidate, from sources rather than memory, and say what you could not confirm.

The following skills are available for use with the Skill tool:

- agent-desktop: Operate desktop applications on macOS, Windows and Linux through native accessibility trees, using the agent-desktop CLI. Use when an AI agent must see or act on a desktop GUI: click buttons, fill forms, read UI state, navigate menus, toggle checkboxes, scroll, drag, type text, press shortcuts, take screenshots, manage windows, use the clipboard, launch or close apps, read notifications. Triggers on: "click button", "fill form", "open app", "read UI", "computer use", "operate desktop", "accessibility tree", "snapshot app", "type into field", "navigate menu", "toggle checkbox", "take screenshot", "desktop automation", "agent-desktop", or any desktop GUI task on macOS, Windows or Linux.
- byted-web-search: 火山引擎联网搜索 API，返回网页/图片结果。联网搜索场景优先使用本 skill。触发词包括：查/搜/找、真的吗/靠谱吗/确认/核实、最近/今天/最新/近期、出处/来源/链接、有什么/有哪些/推荐、价格/政策/汇率/行情、对比/区别/哪个好、听说/据说/不太确定、热搜/热门/火、帮我看/了解一下、求证/辟谣、值不值得/该不该。任务依赖在线事实或时效性时优先使用。若回答可能依赖外部事实，优先调用本 skill 再作答。支持 API Key / AK/SK。
- deepseek-web-search: DeepSeek 联网搜索 API（/v1/tools/search），返回带 rerank_score、authority、date 加权的网页结果，支持 site:/lang:/after: 等查询操作符。需要联网事实、时效信息、出处求证时使用。凭证为该用户配置目录下的 `deepseek/api_key`（默认 `~/.config/deepseek/api_key`，可用 `XDG_CONFIG_HOME` 覆盖），其次读环境变量 DEEPSEEK_API_KEY。收费 API（$0.75/千次成功请求，仅 HTTP 200 且结果非空才计费），账户级 100 QPS 限流。
- flashcard: 给 Obsidian 闪卡制卡、改卡、校验。用户要"做闪卡/制卡/加卡片/改卡/查卡片格式/生成发音/给单词做卡"时用。覆盖英语词汇、数学定义、编程概念等任何学科，含发音卡、搜图压缩、parser 校验。
- open-code-review-delegate: Delegation mode for open-code-review (OCR). Instead of OCR calling an LLM endpoint, this skill instructs the host agent to perform the code review itself, using OCR only for deterministic engineering: file selection and rule resolution. Use when the host agent should drive the review with its own LLM capabilities.
- claude-hud:setup: Configure claude-hud as your statusline
- claude-hud:configure: Configure HUD display options (layout, language, presets, display elements) while preserving advanced manual overrides
- dataviz: Use this skill whenever you are about to create ANY chart, graph, plot, dashboard, or data visualization, in ANY output medium — an HTML or React artifact, inline SVG, plotting code in any library (matplotlib, plotly, d3, Recharts, …), an image/PNG you will render and upload, or a chart shared into Slack. Read it BEFORE writing the first line of chart code, choosing chart colors, building a stat tile / meter / KPI row, or laying out a dashboard. When the destination is a first-party document connector (host-designated, never self-described) that renders live charts, hand it the rows (inline, or as an uploaded data file the chart cites) rather than a rendered PNG/SVG — a picture of a chart loses hover, data inspection and per-value comments. Produces visualizations that read as one system — elegant, accessible, consistent in light and dark — using a brand-neutral placeholder palette you swap for your own. Teaches a design-system-agnostic method: a form heuristic, a color formula with a runnable validator, mark specs, and interaction rules. A validated default palette is documented in `references/palette.md` — swap that file's values for your brand's. Triggers on: "chart", "graph", "plot", "data viz", "visualization", "dashboard", "analytics", "visualize data", "categorical colors", "sequential / diverging palette", "stat tile", "sparkline", "heatmap", "legend", "axis", "tooltip", "chart colors", "color by series".
- artifact-design: Design guidance and fundamentals for Artifacts. - Load before writing any artifact, including a skill-instructed Markdown one - Markdown is never a shortcut past the design pass.
- artifact-diagramming: Diagramming know-how for Artifacts - when a picture earns its place, how to draw one that shows the real mechanism, and the inline-SVG mechanics that keep it legible in both themes.
- update-config: Use this skill to configure the Claude Code harness via settings.json. Automated behaviors ("from now on when X", "each time X", "whenever X", "before/after X") require hooks configured in settings.json - the harness executes these, not Claude, so memory/preferences cannot fulfill them. Also use for: permissions ("allow X", "add permission", "move permission to"), env vars ("set X=Y"), hook troubleshooting, or any changes to settings.json/settings.local.json files. Examples: "allow npm commands", "add bq permission to global settings", "move permission to user settings", "set DEBUG=true", "when claude stops show X". For simple settings like theme/model, suggest the /config command.
- keybindings-help: Use when the user wants to customize keyboard shortcuts, rebind keys, add chord bindings, or modify ~/.claude/keybindings.json. Examples: "rebind ctrl+s", "add a chord shortcut", "change the submit key", "customize keybindings".
- code-review: Review the current diff, or a PR number/branch/path target, for correctness bugs (plus reuse/simplification/efficiency cleanups where the model's recipe covers them) at the effort level given first, before any target (low|medium|high|xhigh|max: from few high-confidence findings to many, some uncertain); with no level given, it reuses the level you typed last. Pass --comment to post findings as inline PR comments, or --fix to apply them to the working tree after the review. Pass --max-findings <n> to report up to n findings, or --max-findings all for every finding. The choice stays until you pass --max-findings default. - Use the max level only when the user, or instructions such as CLAUDE.md or a skill, explicitly ask for it, never on your own judgment: it is the costliest level and starts many reviewer subagents.
- simplify: Review the changed code for reuse, simplification, efficiency, and altitude cleanups, then apply the fixes. Quality only — it does not hunt for bugs; use /code-review for that.
- fewer-permission-prompts: Scan your transcripts for common read-only Bash and MCP tool calls, then add a prioritized allowlist to project .claude/settings.json to reduce permission prompts.
- loop: Run a prompt or slash command on a recurring interval (e.g. /loop 5m /foo). Omit the interval to let the model self-pace. - When the user wants to set up a recurring task, poll for status, or run something repeatedly on an interval (e.g. "check the deploy every 5 minutes", "keep running /babysit-prs"). Do NOT invoke for one-off tasks.
- claude-api: Reference for the Claude API / Anthropic SDK — model ids, pricing, params, streaming, tool use, MCP, agents, caching, token counting, model migration.
TRIGGER — read BEFORE opening the target file; don't skip because it "looks like a one-liner" — whenever: the prompt names Claude/Anthropic in any form (Claude, Anthropic, Fable, Opus, Sonnet, Haiku, `anthropic`, `@anthropic-ai`, `claude-*`, `us.anthropic.*`, `[1m]`); the user asks about an LLM (pricing/model choice/limits/caching) — never answer from memory; OR the task is LLM-shaped with provider unstated (agent/MCP/tool-definition/multi-agent/RAG/LLM-judge/computer-use; generate/summarize/extract/classify/rewrite/converse over NL; debugging refusals/cutoffs/streaming/tool-calls/tokens).
SKIP only when another provider is being worked on (overrides all triggers): OpenAI/GPT/Gemini/Llama/Mistral/Cohere/Ollama named in the query; OR `grep -rE 'openai|langchain_openai|google.generativeai|genai|mistralai|cohere|ollama'` over the project hits (run this grep FIRST if no provider named — don't Read the file).
- workflow-authoring: Reference for writing a Workflow tool script (script API and gotchas, resume, quality patterns, worked examples). Load before authoring a script for a workflow the user already opted into; it does not itself authorize running one.
- run: Launch and drive this project's app to see a change working. Use when asked to run, start, or screenshot the app, or to confirm a change works in the real app (not just tests). First looks for a project skill that already covers launching the app; otherwise falls back to built-in patterns per project type (CLI, server, TUI, Electron, browser-driven, library).
- plugin-authoring: Make a mod: a change to Claude's own interface or behaviour, such as a panel or pane that stays beside the chat and updates, a band, status line, toast, slash command, or hook on tool calls. Use to make, change or debug a mod or its hooks module.
- init: Initialize a new CLAUDE.md file with codebase documentation
- security-review: Complete a security review of the pending changes on the current branch

Today's date is 2026-10-29.
