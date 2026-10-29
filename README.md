# system-prune

magpie 网关中间件：在请求离开本机前重组 agent 的 system prompt——删段、逐字改写、区间切、前置人设。

按 agent 分 profile，当前支持 `claude` 与 `pi`；每个 agent 的删/改字面量对准它自己的原生提示词，`agents` 名单决定谁被改写（空名单 = 一个都不动）。

```
请求 → readRules(通用 → profiles[agent] → options) → agents 开关
     → prune(删段→切区间→替换→删行→压空行) → pruneTools(工具描述同一套)
     → 人设块前置(计费头之后) → 上游
```

## 安装

```bash
magpie plugin add /path/to/system-prune        # package.json 的 magpie.middleware 指向本体
magpie plugin options system-prune '{"agents":["claude","pi"]}'   # 谁能被改写
magpie plugin off system-prune && magpie plugin on system-prune   # 改了本体/烤入规则后换进程
```

## 规则从哪来

| 层 | 位置 | 说明 |
|---|---|---|
| 烤入规则 | `system-prune.middleware.js` 的 `>>> baked-rules` 块 | 由 `build-rules.mjs` 生成，别手改 |
| options | magpie 插件页 | 逐键叠加在烤入规则上；app 重启会回写 `plugins.json`，只当临时覆盖 |
| 名单 | `enabled-agents.json` | 跟仓库走，app 回写冲不掉 |

## 改一次规则

```bash
# 1) 改 persona.<agent>.zh.md（人设）或 build-rules.mjs（删/改字面量）
node build-rules.mjs --with-prompt   # 生成 rules.<agent>.json + 烤入中间件 + 校验命中
node test.mjs                        # 中间件行为单测
node verify.mjs claude               # 真实请求链路（anthropic）
node verify.mjs pi                   # 真实请求链路（chat）
magpie plugin off system-prune && magpie plugin on system-prune
```

`build-rules.mjs` 有两道闸：字面量打不中样本（`miss`）、改完仍残留 `You are…` / `IMPORTANT:` / `You must not…` 这类句子（未进 `residue-allowlist.txt`），任一命中就退出码 1。

## 文件

| 文件 | 角色 |
|---|---|
| `system-prune.middleware.js` | 中间件本体 + 烤入规则 |
| `persona.claude.zh.md` / `persona.pi.zh.md` | 两个人设源文本 |
| `build-rules.mjs` | 生成规则、烤入、校验、残留扫描 |
| `rules.claude.json` / `rules.pi.json` | 生成物 |
| `interactive-main.request.json` / `claude-sdk.request.json` | claude 两种入口的请求快照（用于校验） |
| `pi-native.system.txt` | pi 原生提示词快照 |
| `verify.mjs` / `show-rules.mjs` / `dump-diff.mjs` | 链路验证 / 当前生效规则 / 生成对比 |
| `ab-test.mjs` | 中间件开/关的行为 A/B（工具选择、任务完成、风格、缓存） |
| `probe.mjs` / `probe-cases.mjs` / `probe-stats.mjs` | 探针实验：A/B/E 三臂测某段删掉前后的行为差（合成对话，直连网关） |
| `scrub-fixtures.mjs` | 发布前脱敏（device_id / session_id / KEY 占位） |

## 探针实验（prompt 消融）

判断「删掉某段」到底改变了什么行为，用探针直接发请求，不走 agent CLI。

```bash
node probe.mjs selfcheck                       # A/B 只差目标段，tools/messages 逐字相同
node probe.mjs build                           # 请求体写到 /tmp/probe/requests
node probe.mjs run --arms A,B --runs 10 --out /tmp/probe/main.jsonl --randomize
node probe.mjs score --out /tmp/probe/main.jsonl
```

三臂：`A` 现状（段被切）、`B` 原文按原位插回、`E` 再把工具描述/schema/人设里的同义说明压掉（灵敏度对照）。没有 `E`，`A≈B` 无法区分「这段冗余」和「探针分不出来」。

网关必须旁路：`run` 会临时把插件 options 的 `agents` 置空并在结束时恢复，否则 `B` 臂的段会被网关重新切掉。`claude -p` 不能用于这类验证——SDK 入口的 system 里本来就没有这些段。

## 注意

- system prompt 属于前缀缓存：**同一会话内必须一字节不变**。任何按轮次切换 prompt 的设计都会把整条前缀缓存作废，比省下来的 token 更贵。
- `x-anthropic-billing-header` 保持第一块，人设插在它后面。
