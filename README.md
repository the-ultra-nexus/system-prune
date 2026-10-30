# system-prune

magpie 网关中间件：在请求离开本机前重组 agent 的 system prompt——删段、逐字改写、区间切、前置人设。

文档口径见 `docs/CONVENTIONS.md`：名字怎么写、表怎么对、数字什么时候算数；能机检的条款由 `node scripts/check-docs.mjs` 断言，不绿不算改完。操作顺序（改人设 / 改字面量 / 加 agent / 跑消融 / 回滚 / 脱敏）见 `docs/WORKFLOW.md`。

按 agent 分 profile，当前支持 `claude` 与 `pi`；每个 agent 的删/改字面量对准它自己的原生提示词，`agents` 名单决定谁被改写（空名单 = 一个都不动）。

```
请求 → resolveSource(烤入通用 → 烤入 profiles[agent] → options 逐键叠加)
     → agents 开关（没填就放行不改）
     → prune(删段→切区间→替换→删行→压空行) → pruneTools(工具描述同一套)
     → 人设块前置(计费头之后) → 上游
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

`node scripts/check-docs.mjs` 把前四份里能机检的条款断言掉，它进验证链。

## 目录

```
src/       插件本体（magpie 按 package.json 的 magpie.middleware 加载它）
scripts/   生成、校验、脱敏等开发脚本；路径常量集中在 scripts/paths.mjs
probe/     探针实验：消融四臂与行为 A/B
test/      中间件行为单测
persona/   人设源文本 + 残留白名单
rules/     生成物：各 agent 的规则与人设载荷，别手改
samples/   真实请求快照、原生提示词样本、线上 system 文本
config/    名单等配置
docs/      规范、流程与前后对比材料
local/     本地备份与日志（`.gitignore` 里，不进仓库）
```

所有脚本都从 `scripts/paths.mjs` 取路径，不依赖当前工作目录；换目录布局只改那一份。

## 安装

插件标识就是仓库目录名 `system-prune`（`magpie plugin add` 收目录路径，之后 on/off/options 都用这个名字）：

```bash
magpie plugin add ~/projects/opensource/system-prune        # package.json 的 magpie.middleware 指向 src/ 里的本体
magpie plugin options system-prune '{"agents":["claude","pi"]}'   # 谁能被改写
magpie plugin off system-prune && magpie plugin on system-prune   # 改了本体/烤入规则后换进程
```

`magpie plugin options system-prune`（不带 JSON）是查看当前 options。

## 规则从哪来

四层，逐键叠加，后者覆盖前者：

| 层 | 位置 | 说明 |
|---|---|---|
| 通用规则 | `src/system-prune.middleware.js` 的 `>>> baked-rules` 块 | 由 `scripts/build-rules.mjs` 生成，别手改 |
| profiles[agent] | 同上 | 每个 agent 的删/改 + 人设 |
| options | magpie 插件页 / `magpie plugin options` | 逐键叠加；app 重启会回写 `plugins.json`，只当临时覆盖 |
| 名单 | `config/enabled-agents.json` | build 时烤进 `agents`，跟仓库走，app 回写冲不掉 |

`agents` 是开关，不是排除表：**填了才改，不填不改**，`["*"]` 才是全部。名单里有 agent 但没有对应 profile 时，它只吃到通用层。

## 改一次规则

线性版。分场景的完整步骤、通过标准与失败处置见 `docs/WORKFLOW.md`（含加 agent、跑消融、撤销 cut、回滚）。

`package.json` 里备了同名快捷方式（`npm run build|test|verify|show|diff|check|scrub`），下面写全路径，贴进终端就能跑：

```bash
# 1) 改 persona/persona.<agent>.zh.md（人设）或 scripts/build-rules.mjs（删/改字面量）
node scripts/build-rules.mjs --with-prompt   # 生成 rules/rules.<agent>.json + 烤入中间件 + 校验命中
node test/test.mjs                           # 21 条中间件行为单测
node scripts/verify.mjs claude               # 真实请求链路（anthropic）
node scripts/verify.mjs pi                   # 真实请求链路（chat）
node scripts/show-rules.mjs                  # 确认此刻实际生效的是哪一份
node scripts/dump-diff.mjs                   # 重生成 docs/diff/ 对比材料
node scripts/check-docs.mjs                  # 文档与代码一致性
magpie plugin off system-prune && magpie plugin on system-prune
```

`scripts/build-rules.mjs` 有两道闸，任一命中就退出码 1：

- `miss`：规则里的字面量打不中样本（上游提示词一改，规则就是哑弹）。
- 残留：改完仍留着像身份句/硬禁令的句子（`You are…` / `IMPORTANT:` / `Anthropic` / `Claude Code` 等），且不在 `persona/residue-allowlist.txt`。

`--allow-miss` / `--allow-residue` 只用来临时排查，别提交带这些开关的全绿假象。

## 文件

| 文件 | 角色 |
|---|---|
| `src/system-prune.middleware.js` | 中间件本体 + 烤入规则（唯一真源） |
| `scripts/paths.mjs` | 仓库路径常量，脚本一律从这取，改布局只动它 |
| `scripts/build-rules.mjs` | 生成 `rules/rules.<agent>.json`、烤入中间件、校验字面量命中、残留扫描 |
| `scripts/verify.mjs` | 按 agent 跑真实形状请求（claude=anthropic 样本，pi=chat 现造） |
| `scripts/show-rules.mjs` | 打印此刻实际执行的规则与产物形状 |
| `scripts/dump-diff.mjs` | 生成 `docs/diff/<agent>/` 的 before/after 与 `diff -u` 成品（claude / pi） |
| `scripts/dry-run.mjs` | 手工试跑：一条请求跑一遍自定义规则，打印块与字节变化 |
| `scripts/scrub-fixtures.mjs` | 发布前脱敏（device_id / session_id / account_uuid / KEY 占位），幂等 |
| `scripts/check-docs.mjs` | 文档一致性断言：命令可跑、插件名、两表相同、文件覆盖、单测条数、探针子命令 |
| `test/test.mjs` | 单测，`ctx.baked === false` 隔离烤入规则 |
| `probe/probe.mjs` | 探针 CLI：`plan` / `selfcheck` / `build` / `run` / `score` / `restore`，A/B/E/F 四臂 |
| `probe/probe-cases.mjs` | 四条探针的合成对话、fixture 与判分 |
| `probe/probe-stats.mjs` | Wilson 区间 / Newcombe 风险差 / Fisher / Holm |
| `probe/ab-test.mjs` | 中间件开/关的行为 A/B（工具选择命中率、任务完成、风格、缓存） |
| `persona/persona.claude.zh.md` / `persona/persona.pi.zh.md` | 两个人设源文本 |
| `persona/residue-allowlist.txt` | 改完允许留下的句子白名单（子串匹配，机读头、模型清单） |
| `rules/rules.claude.json` / `rules/rules.pi.json` | 生成物：各自删/改 + 人设 |
| `rules/persona.payload.json` | 生成物：`middleware-system-prompt` 的载荷格式（备用） |
| `config/enabled-agents.json` | 名单源，build 时烤入 `agents` |
| `samples/interactive-main.request.json` | 交互式 CLI 的原始请求快照（校验 + 探针底稿） |
| `samples/claude-sdk.request.json` | SDK `claude -p` 入口的请求快照；与上者取并集校验 |
| `samples/interactive-title.request.json` | 标题生成请求快照（脱敏对象） |
| `samples/pi-native.system.txt` | pi 原生提示词样本（校验 pi 字面量用） |
| `samples/live.claude.md` | 线上抓到的完整 system 文本，脱敏对象 |
| `docs/diff/` | 每个 agent 一套前后对比（`docs/diff/claude/`、`docs/diff/pi/`）+ diff 成品，说明见 `docs/diff/README.md` |
| `local/` | 本地文件（`.gitignore` 里）：`local/evi-backup.json` 旧人设载荷、`local/interactive-index.jsonl` magpie 请求索引日志（含 session_id，别提交） |
| `.archify/` | 管线图（archify 产物），按 `workflow-<slug>-<时间戳>` 分目录（本地） |

## 探针实验（prompt 消融）

判断「删掉某段」到底改变了什么行为，用探针直接发请求，不走 agent CLI。

```bash
node probe/probe.mjs plan                            # 打印实验设计与判读规则
node probe/probe.mjs selfcheck                       # 前置闸：A/B 只差目标段，tools/messages/断点逐字相同
node probe/probe.mjs build                           # 请求体写到 /tmp/probe/requests
node probe/probe.mjs run --arms A,B --runs 10 --out /tmp/probe/main.jsonl --randomize
node probe/probe.mjs score --out /tmp/probe/main.jsonl
node probe/probe.mjs restore                         # 把 options 恢复成 run 之前存下的基线
```

四臂：`A` 现状（段被切）、`B` 原文按原位插回、`E` 再把工具描述/schema/人设里的同义说明压掉（灵敏度对照）、`F` 只压人设里那条压缩版（归因）。默认 `--arms A,B,E`；没有 `E`，`A≈B` 无法区分「这段冗余」和「探针分不出来」。

判读：`E≈A` 探针没灵敏度，别下结论；`E<A` 且 `A≈B`，这段被另外几份说明覆盖，cut 安全；`A<B` 这段有边际作用。

`selfcheck` 是跑批前的闸。当前 `cuts` 为空（Artifact `edits` 段已撤销切割），A 自己就带着这段，于是它会 FAIL 并报「A 已含目标段…A/B 无差异」——这不是坏了，是要重跑消融得先把目标段放回 `cuts`。

网关必须旁路：`run` 会临时把插件 options 的 `agents` 置空并在结束时恢复，否则 `B` 臂的段会被网关重新切掉。跑批期间别开别的会话。`claude -p` 不能用于这类验证——SDK 入口的 system 里本来就没有这些段。

## 注意

- system prompt 属于前缀缓存：**同一会话内必须一字节不变**。任何按轮次切换 prompt 的设计都会把整条前缀缓存作废，比省下来的 token 更贵。
- `x-anthropic-billing-header` 保持第一块，人设插在它后面。
- 改中间件本体或烤入块必须换进程；只改 options 不用重启。
