# system-prune

magpie 网关中间件：在请求离开本机前重组 agent 的 system prompt。四个开关：**人设注入默认开**（`persona`），**官方冲突点修正默认开**（`official`），**规则默认加载主规则**（`ruleFiles`），**规则块默认排在人设前**（`rulePosition`）。

文档口径见 `docs/CONVENTIONS.md`：名字怎么写、表怎么对、数字什么时候算数；能机检的条款由 `node scripts/check-docs.mjs` 断言，不绿不算改完。操作顺序（改人设 / 改规则 / 加 agent / 回滚 / 脱敏）见 `docs/WORKFLOW.md`。

人设与规则源不再分 agent：`prompt/persona*.md` 一份、`prompt/rules*.md` 任意多份，claude 与 pi 共用。`agents` 名单决定谁被处理（空名单 = 一个都不动）。`official` 只改官方 prompt 里会和人设冲突的句子，`# Environment` 同样受它控制。

```
请求 → resolveSource(烤入通用 → options 逐键叠加)
     → agents 开关（没填就放行不改）
     → official 开关（默认开）→ 删身份块、替换冲突句（含 # Environment）
     → persona 开关（默认开）→ 人设块
     → ruleFiles 选择（"" / "rules.claude.1" / "rules.deepseek.1" / "rules.deepseek.2"）
     → rulePosition（after 人设后 / before 人设前）→ 规则块（计费头之后）
     → 上游
```

协议覆盖四种形状：`anthropic` / `chat` / `responses` / `gemini`，其余协议直接放行。

## 文档

| 文档 | 管什么 |
|---|---|
| `README.md` | 上手：装、改一次规则、跑探针 |
| `docs/CONVENTIONS.md` | 口径：名字怎么写、表怎么对、数字什么时候算数、哪些是生成物 |
| `docs/WORKFLOW.md` | 按场景查操作顺序、通过标准与失败处置 |
| `CLAUDE.md` | 代码组织、数据流、宿主层对照表（给人看，不进 prompt） |
| `docs/diff/README.md` | 前后对比材料怎么读、怎么重生成 |
| `docs/cases/index.md` | 本地生成的 12 种 persona / official / ruleFiles 组合前后版本与 diff |

`node scripts/check-docs.mjs` 把前四份里能机检的条款断言掉，它进验证链。

## 目录

```
src/       插件本体（magpie 按 package.json 的 magpie.middleware 加载它）
scripts/   生成、校验、脱敏等开发脚本；路径常量集中在 scripts/paths.mjs
probe/     行为 A/B：中间件开/关的对照
test/      中间件行为单测
prompt/   提示词源：persona*.md（边界前）+ rules*.md（边界后，可多份）+ 残留白名单
rules/     生成物：各 agent 的完整规则集与人设载荷，别手改
samples/   真实请求快照、原生提示词样本、线上 system 文本
config/    名单与开关等配置
docs/      规范、流程与前后对比材料
local/     本地备份与日志（`.gitignore` 里，不进仓库）
```

所有脚本都从 `scripts/paths.mjs` 取路径，不依赖当前工作目录；换目录布局只改那一份。

## 安装

插件标识就是仓库名 `system-prune`。本地安装注册名是目录名；GitHub 安装取 `package.json` 的 `name`，同样是 `system-prune`：

```bash
magpie plugin add ~/projects/opensource/system-prune        # package.json 的 magpie.middleware 指向 src/ 里的本体
magpie plugin add github:the-ultra-nexus/system-prune       # 从 GitHub 安装，注册名取 package.json 的 name
magpie plugin options system-prune '{"agents":["claude","pi"],"persona":true,"official":true,"ruleFiles":"rules.deepseek.2"}'   # 谁能被处理、改哪些官方冲突点、插哪份规则
magpie plugin options system-prune '{"ruleFiles":""}'        # 只留人设，不插规则
magpie plugin off system-prune && magpie plugin on system-prune   # 改了本体/烤入规则后换进程
```

`magpie plugin options system-prune`（不带 JSON）是查看当前 options。

## 选项一览

magpie 插件页 / `magpie plugin options` 只显示 `plugins.json` 里实际存在的键。当前已显式列出五个开关（`agents` / `persona` / `official` / `ruleFiles` / `rulePosition`），插件页就能看到；规则块正文与官方替换表留在烤入块里不搬进 options。

| 键 | 默认 | 作用 |
|---|---|---|
| `agents` | build 时取 `config/enabled-agents.json`（当前 `["claude","pi"]`） | 总开关：空数组谁都不动，`["*"]` 才是全部 |
| `persona` | `true` | 人设开关；`false` 时不插 `prependBlocks` / `appendBlocks` |
| `official` | `true` | 官方冲突点修正；`false` 时官方正文一个字节都不动 |
| `ruleFiles` | `"rules.claude.1"` | 单选：`""` 不加载，或写 `prompt/rules*.md` 去掉 `.md` 的 id（如 `"rules.claude.1"` / `"rules.deepseek.2"`） |
| `rulePosition` | `"before"` | 规则块相对人设块的位置：`"before"` 规则在前，`"after"` 人设在前 |
| `ruleBlocks` | build 生成 | 规则块 `[{ id, text, cache, ttl }]`；运行时按 `ruleFiles` 选一份，不建议手填 |
| `officialDropBlocks` / `officialDropLines` / `officialReplacements` | build 生成 | 官方冲突块/行/替换表；`official` 关时全不执行 |
| `debug` | `false` | 每块只打一行摘要 |

常用组合：

```bash
magpie plugin options system-prune '{"agents":["claude","pi"],"persona":true,"official":true,"ruleFiles":"rules.deepseek.2"}'   # 人设 + 官方修正 + 主规则
magpie plugin options system-prune '{"agents":["claude","pi"],"official":false}'                                                # 官方正文保持原样
magpie plugin options system-prune '{"agents":["claude","pi"],"ruleFiles":"rules.deepseek.1"}'                                  # 换一份规则
magpie plugin options system-prune '{"agents":["claude","pi"],"ruleFiles":""}'                                                  # 只留人设
magpie plugin options system-prune '{"ruleFiles":"rules.claude.1","rulePosition":"before"}'                                     # 规则排在人设前
printf '{"persona":true,"official":true,"ruleFiles":"rules.claude.1","rulePosition":"before"}\n' > config/switches.json && node scripts/build-rules.mjs --with-prompt   # 持久改开关
```

options 是临时覆盖：app 重启会用内存状态回写 `plugins.json`。持久值走 `config/enabled-agents.json`、`config/switches.json` 与 `build-rules.mjs` 的烤入块——改完跑一次 build，即使 `plugins.json` 里几个键被冲掉，烤入的默认值仍然生效。

## 规则从哪来

逐层叠加，后者覆盖前者：

| 层 | 位置 | 说明 |
|---|---|---|
| 通用规则 | `src/system-prune.middleware.js` 的 `>>> baked-rules` 块 | 由 `scripts/build-rules.mjs` 生成，别手改 |
| 人设 / 规则块 | 同上（`prependBlocks` / `ruleBlocks`） | 人设一份、规则按 `prompt/rules*.md` 各烤一块 |
| 官方冲突表 | `config/official.json`（`dropBlocks` / `dropLines` / `replacements`） | build 时读入并烤进 `official*` 数组 |
| options | magpie 插件页 / `magpie plugin options` | 逐键叠加；app 重启会回写 `plugins.json`，只当临时覆盖 |
| 名单 | `config/enabled-agents.json` | build 时烤进 `agents`，跟仓库走，app 回写冲不掉 |
| 开关 | `config/switches.json` → `>>> baked-rules` 顶层 / options | build 时烤入 `persona` / `official` / `ruleFiles` / `rulePosition`；options 同名键只当临时覆盖 |

`agents` 是开关，不是排除表：**填了才改，不填不改**，`["*"]` 才是全部。

`persona` 关掉后人设块不插；`official` 关掉后官方正文原样；`ruleFiles` 为空字符串时不插任何规则块，写哪一份 id 就只插对应那一份；`rulePosition` 决定规则块排在选中的人设块前面还是后面。这几个开关都按 agent 名单先过一道：名单为空时什么也不做。

## 改一次规则

线性版。分场景的完整步骤、通过标准与失败处置见 `docs/WORKFLOW.md`（含加 agent、跑消融、撤销 cut、回滚）。

`package.json` 里备了同名快捷方式（`npm run build|test|verify|show|diff|check|scrub`），下面写全路径，贴进终端就能跑：

```bash
# 1) 改 prompt/persona*.md（## Routing 之前）或 prompt/rules*.md（之后，可多份）；值直接写原文
node scripts/build-rules.mjs --with-prompt   # 生成 rules/rules.json + 烤入中间件
node test/test.mjs                           # 28 条中间件行为单测
node scripts/verify.mjs claude               # 真实请求链路（anthropic）
node scripts/verify.mjs pi                   # 真实请求链路（chat）
node scripts/show-rules.mjs                  # 确认此刻实际生效的是哪一份
node scripts/dump-diff.mjs                   # 重生成 docs/diff/ 对比材料
node scripts/check-docs.mjs                  # 文档与代码一致性
magpie plugin off system-prune && magpie plugin on system-prune
```

`scripts/build-rules.mjs` 把人设、规则块和官方冲突表烤进 `BAKED_RULES`，同时生成 `rules/rules.json` 给 verify / dump-diff。它不再校验官方提示词字面量。

## 文件

| 文件 | 角色 |
|---|---|
| `src/system-prune.middleware.js` | 中间件本体 + 烤入规则（唯一真源） |
| `scripts/paths.mjs` | 仓库路径常量，脚本一律从这取，改布局只动它 |
| `scripts/build-rules.mjs` | 生成 `rules/rules.json`、烤入中间件 |
| `scripts/verify.mjs` | 按 agent 跑真实形状请求（claude=anthropic 样本，pi=chat 现造） |
| `scripts/show-rules.mjs` | 打印此刻实际执行的规则与产物形状 |
| `scripts/dump-diff.mjs` | 生成 `docs/diff/<agent>/` 的 before/after 与 `diff -u` 成品（claude / pi） |
| `scripts/export-cases.mjs` | 导出 12 种开关组合的 before/after 与 diff 到 `docs/cases/` |
| `scripts/dry-run.mjs` | 手工试跑：一条请求跑一遍自定义注入规则，打印块与字节变化 |
| `scripts/scrub-fixtures.mjs` | 发布前脱敏（device_id / session_id / account_uuid / KEY 占位），幂等 |
| `scripts/check-docs.mjs` | 文档一致性断言：命令可跑、插件名、两表相同、文件覆盖、单测条数、探针子命令 |
| `test/test.mjs` | 单测，`ctx.baked === false` 隔离烤入规则 |
| `probe/ab-test.mjs` | 中间件开/关的行为 A/B（工具选择命中率、任务完成、风格、缓存） |
| `prompt/` | 提示词源：`persona*.md`（`## Routing` 之前）、`rules*.md`（之后，可多份）；值直接写在原文 |
| `rules/rules.json` | 生成物：人设与全部规则块的离线完整规则集（给 verify / dump-diff 用） |
| `rules/persona.payload.json` | 生成物：`middleware-system-prompt` 的载荷格式（备用） |
| `config/enabled-agents.json` | 名单源，build 时烤入 `agents` |
| `config/switches.json` | 开关源（`persona` / `official` / `ruleFiles` / `rulePosition`），build 时烤入 baked 顶层 |
| `config/official.json` | 官方 prompt 的删块、删行、逐字替换文本；build 时读入并烤入 `official*` 数组 |
| `samples/interactive-main.request.json` | 交互式 CLI 的原始请求快照（校验 + 探针底稿） |
| `samples/claude-sdk.request.json` | SDK `claude -p` 入口的请求快照；与上者取并集校验 |
| `samples/interactive-title.request.json` | 标题生成请求快照（脱敏对象） |
| `samples/pi-native.system.txt` | pi 原生提示词样本（校验 pi 字面量用） |
| `samples/live.claude.md` | 线上抓到的完整 system 文本，脱敏对象 |
| `docs/diff/` | 每个 agent 一套前后对比（`docs/diff/claude/`、`docs/diff/pi/`）+ diff 成品，说明见 `docs/diff/README.md` |
| `docs/cases/` | 本地生成的开关组合导出（index.md + claude/pi 各 12 场景的前后版本与 diff），不进仓库；由 `scripts/export-cases.mjs` 生成 |
| `local/` | 本地文件（`.gitignore` 里）：`local/evi-backup.json` 旧人设载荷、`local/interactive-index.jsonl` magpie 请求索引日志（含 session_id，别提交） |
| `.archify/` | 管线图（archify 产物），按 `workflow-<slug>-<时间戳>` 分目录（本地） |

## 行为 A/B（可选）

判断中间件开/关有没有改变工具选择或风格，用 `probe/ab-test.mjs` 跑真实 agent：

```bash
node probe/ab-test.mjs both --runs=5
```

它会临时把插件 options 的 `agents` 清空（等于关掉中间件），跑完恢复。旧的 system 段消融脚本已删除，运行时只在 `official` 开时改冲突点。

## 注意

- system prompt 属于前缀缓存：**同一会话内必须一字节不变**。任何按轮次切换 prompt 的设计都会把整条前缀缓存作废，比省下来的 token 更贵。
- `x-anthropic-billing-header` 保持第一块，人设插在它后面。
- 改中间件本体或烤入块必须换进程；只改 options 不用重启。
