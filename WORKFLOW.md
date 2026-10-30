# 工作流

按「我要做什么」查表，跳到对应一节。每节的结构固定：目标 → 命令 → 通过标准 → 失败怎么办。

口径（名字怎么写、表怎么对、数字什么时候算数）在 `CONVENTIONS.md`；代码组织在 `CLAUDE.md`。这份只管**操作顺序**。

## 0. 三条铁律

1. **system prompt 在同一会话内必须一字节不变**。人设和规则都是前缀缓存的一部分，改一个字节，system 之后的所有缓存作废。别在别的会话正跑时改 `persona.*.zh.md` 或烤入规则。
2. **`>>> baked-rules` 之间不手改**。手改会被下一次 `node build-rules.mjs --with-prompt` 覆盖；真源是 `persona.*.zh.md` 和 `build-rules.mjs` 里的四个数组。
3. **改本体或烤入块必须换进程**，只改 options 不用。验证方式看 pid：

```bash
pgrep -fl plugin-host    # 换前后各看一眼，pid 没变就是没换成
```

只改注释、不动 `BAKED_RULES` 和导出时可以不换，但在收尾里说明跳过原因。

## 1. 改人设

目标：换 personas 里的措辞，不动删/改规则。

```bash
# 1) 改 persona.claude.zh.md 和/或 persona.pi.zh.md
node build-rules.mjs --with-prompt      # 打印两边人设字数；miss 必须 0
node test.mjs                           # 21 条
node verify.mjs claude                  # 看「人设注入: 是」
node verify.mjs pi
node show-rules.mjs                     # 人设块字数、开头三行、计费头在最前
node check-docs.mjs
magpie plugin off system-prune && magpie plugin on system-prune
```

通过标准：`verify` 两个 agent 都是「人设注入：是」、三条官方身份残留都是 `true`（=已消失）；`show-rules` 里「计费头在最前: true」「拒答段还在: false」。`build` 打印的人设字数变了，是这一节唯一预期的数字变化。

失败：`人设注入: 否` 说明 `prependBlocks` 空了或没跑 `--with-prompt`（`verify.mjs` 读的是 `rules.<agent>.json`，不是中间件本体）。

## 2. 改删/改字面量

目标：让某段官方文案消失或反转，动 `build-rules.mjs` 里的 `dropBlocksContaining` / `dropSections` / `cuts` / `replacements` / `dropLinesMatching`。

```bash
node build-rules.mjs --with-prompt      # 两道闸：miss、残留扫描
node test.mjs
node verify.mjs claude
node verify.mjs pi
node show-rules.mjs                     # 官方残余字符数应该减少
node dump-diff.mjs                      # 落 claude / pi 两套 before/after 与 .diff 成品
node check-docs.mjs
magpie plugin off system-prune && magpie plugin on system-prune
```

通过标准：`miss=0`；残留扫描无输出（或新句已进 `residue-allowlist.txt`）；`show-rules` 里对应项翻转（如「拒答段还在: false」「工具描述改写: true」）；`diff/<agent>/*.diff` 里能看到这一处改动。

失败：`MISS replace/block/line/cut` 说明字面量打不中样本——上游改了措辞，或你抄错了。去 `interactive-main.request.json` / `claude-sdk.request.json` / `pi-native.system.txt` 里 grep 真实句子再改。`--allow-miss` 只在排查时用，不进仓库。

## 3. 加一个 agent

目标：让名单里多一个协议形状不同的 agent。三处必改，缺一处跑不通：

1. 抓它的原生 system 存成 `<agent>-native.system.txt`（`build-rules.mjs` 的校验样本）。
2. `build-rules.mjs` 里加 `PROFILES[agent]`（初始给 `prependBlocks: []` + 四个空数组），并在文件末尾的校验处补一行 `miss += check(PROFILES[agent], [样本], "<agent>")`；残留扫描的 `SAMPLES` 也补一条 `[文件, agent, 协议]`。
3. `enabled-agents.json` 加进名单，`build` 会烤进 `BAKED_RULES.agents`。

另外两处按需：`verify.mjs` 现在只认 `claude`（anthropic）和 `pi`（chat），新协议要在那里加分支；`system-prune.middleware.js` 的 `onRequest` switch 已经覆盖 anthropic / chat / responses / gemini 四种，新协议不在其中就得先补分派。

通过标准：`build` 的 miss 只统计到新 agent 的样本且为 0；`node verify.mjs <agent>` 能跑出人设注入与残留断言；`show-rules.mjs` 对 claude 的结果不变。

## 4. 跑消融实验

目标：判断「删掉某段」到底有没有改变行为。用 `probe.mjs` 直连网关，**不用** `claude -p`（SDK 入口本来就没有这些段）。

```bash
node probe.mjs plan                     # 实验设计与判读规则
node probe.mjs selfcheck                # 前置闸，必须过
node probe.mjs build                    # 请求体 → /tmp/probe/requests
node probe.mjs run --arms A,B,E --runs 10 --randomize
node probe.mjs score
```

- 四臂：`A` 现状、`B` 段按原位插回、`E` 再压同义说明（灵敏度对照）、`F` 只压人设那条（归因）。默认 `A,B,E`。
- `run` 会自动旁路网关：把 options 的 `agents` 置空，跑完恢复；原值先存 `/tmp/probe/baseline-options.json`。进程被 Ctrl-C 也会恢复。
- 跑批期间别开别的会话、别开 magpie app 的插件页——它们会用内存状态回写 `plugins.json`，旁路会被冲掉，脚本发现后直接中止批次。
- 断了用 `--resume` 续跑（读已有 `--out` 文件跳过已完成组合）。想只测线上当前状态，加 `--gateway direct`（不碰 options，`B` 臂会被网关重新切掉）。
- 恢复不了就 `node probe.mjs restore`。

通过标准：`selfcheck` 输出 `selfcheck passed`，A 与 B 只差目标段。判读按 `plan` 里那张表：`E≈A` 探针没灵敏度、`E<A` 且 `A≈B` 这段冗余、`A<B` 这段承重。

现状提醒：`cuts` 为空（Artifact `edits` 段已撤销切割），A 自己就带着那段，`selfcheck` 会报「A 已含目标段（cuts 为空）」并退 1。要重跑消融，先按第 5 节反向操作把目标段放回 `cuts`。

## 5. 撤销或恢复一条 cut

目标：把某段重新切掉，或撤销某次切割。

```bash
# 在 build-rules.mjs 里改 cuts（加条目 = 切；置空 = 撤销）
node build-rules.mjs --with-prompt
node test.mjs && node verify.mjs claude && node verify.mjs pi
node show-rules.mjs                     # 官方残余字符数应随切割增减
node dump-diff.mjs                      # 两套重生（claude 四份、pi 两份）
node check-docs.mjs
magpie plugin off system-prune && magpie plugin on system-prune
node probe.mjs selfcheck                # 切割生效后才能过
```

通过标准：`selfcheck` 过；`show-rules` 的「官方残余」字符数按切掉的长度减少；`diff/<agent>/official.diff` 里能看到这段消失。

撤销切割时别忘了同步文档：`CLAUDE.md` 的「首轮结论」与「宿主层对照表」、`CONVENTIONS.md` 的数字条款、`README.md` 的探针章节都提到过 Artifact 段的处置。

## 6. 发布前

```bash
node scrub-fixtures.mjs                 # 幂等，跑几次都一样
git status --short                      # 看 request 快照有没有被带进 diff
node check-docs.mjs
```

脱敏对象：`interactive-main.request.json`、`claude-sdk.request.json`、`interactive-title.request.json` 的 `session_id`，`live.claude.md` 与 `diff/*` 里的 `device_id` / `account_uuid` / `KEY`。`evi-backup.json` 和 `interactive-index.jsonl` 在 `.gitignore` 里，别取消忽略。

## 7. 回滚

| 层 | 动作 |
|---|---|
| 规则/人设 | `git diff` 看清，再 `git checkout -- <file>`（不自动 commit 也不自动 revert，要人点头） |
| 烤入块 | 改真源后重跑 `node build-rules.mjs --with-prompt`，不要反转产物 |
| options | `node probe.mjs restore`（用 `/tmp/probe/baseline-options.json`）；文件没了就手动设回 `magpie plugin options system-prune '{"agents":["claude","pi"]}'` |
| 旧人设载荷 | `evi-backup.json`（本地文件，不进仓库） |
| 网关进程 | `magpie plugin off system-prune && magpie plugin on system-prune` |

## 8. 失败处置

| 症状 | 原因 | 动作 |
|---|---|---|
| `MISS replace: …` | 上游改了措辞，或字面量抄错 | 从快照里 grep 真实句子，重写规则 |
| `! 残留可疑句 N 条` | 上游换了句式，没有规则管它 | 加规则删/改，确认故意保留的进 `residue-allowlist.txt` |
| `no plugin "system-prune.middleware.js"` | 用文件名当插件名 | 用 `system-prune` |
| `selfcheck` 报「A 已含目标段」 | `cuts` 为空，A/B 同源 | 先把目标段放回 `cuts` |
| `网关旁路没生效（agents 不是空）` | 有进程回写 `plugins.json` | 关掉 app 插件页/别的会话，重跑 |
| `网关旁路被回写，批次中止` | 同上，跑到一半被冲 | 同上，用 `--resume` 续 |
| `人设注入: 否` | 没跑 `--with-prompt`，或 `prependBlocks` 空 | 重跑 build，看 `rules.<agent>.json` |
| `build` 退 1 但输出看着正常 | 残留扫描命中，退出码在后面才设 | 看最后两行 `!` 开头的提示 |
| `恢复 options 失败` | CLI 写入被 app 回写顶掉 | 手动 `magpie plugin options` 再试 |

## 9. 已知坑

- **options 不是持久配置**。app 重启会用内存状态回写 `plugins.json`（2026-10-29 实测丢过一次，旧值只剩 `plugins.json.bak`）。要持久就改 `enabled-agents.json` 再 build。
- **claude 两个入口的 system 不同**。交互式 CLI 与 SDK `claude -p` 的身份块措辞和正文长度都不一样，校验必须取两份快照的并集，别只对一个。
- **`ab-test.mjs` 不是消融工具**。它用 `claude -p` / `pi -p` 跑真实 agent，测的是工具选择与风格；system 段消融用 `probe.mjs`。
- **探针的 n 要够**。n=10/臂只分辨得开大效应，别把 `A≈B` 写成「等价」。
- **`--allow-miss` / `--allow-residue` 不进仓库**。它们是排查开关，带着提交等于把哑弹当绿灯。
- **改一个字节就会掉缓存**。所以任何「按轮次精简 prompt」的想法，先在 `probe.mjs score` 里看 cacheRead，再决定。
