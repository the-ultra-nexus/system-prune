# 工作流

按「我要做什么」查表，跳到对应一节。每节的结构固定：目标 → 命令 → 通过标准 → 失败怎么办。

口径（名字怎么写、表怎么对、数字什么时候算数）在 `docs/CONVENTIONS.md`；代码组织在 `CLAUDE.md`。这份只管**操作顺序**。

## 0. 三条铁律

1. **system prompt 在同一会话内必须一字节不变**。人设和规则都是前缀缓存的一部分，改一个字节，system 之后的所有缓存作废。别在别的会话正跑时改 `prompt/persona*.md` / `prompt/rules*.md` 或烤入规则。
2. **`>>> baked-rules` 之间不手改**。手改会被下一次 `node scripts/build-rules.mjs --with-prompt` 覆盖；真源是 `prompt/persona*.md`、`prompt/rules*.md`、`config/enabled-agents.json`、`config/switches.json` 和 `config/official.json`。
3. **改本体或烤入块必须换进程**，只改 options 不用。验证方式看 pid：

```bash
pgrep -fl plugin-host    # 换前后各看一眼，pid 没变就是没换成
```

只改注释、不动 `BAKED_RULES` 和导出时可以不换，但在收尾里说明跳过原因。

开关默认：`persona: true` / `official: true` / `ruleFiles: "rules.claude.1"` / `rulePosition: "before"`——持久值在 `config/switches.json`，build 时烤进 `BAKED_RULES`；options 同名键只当临时覆盖。`rules/rules.json` 是离线完整规则集，只给 verify / dump-diff / dry-run 用，不进网关运行时。

## 1. 改人设

目标：换 personas 里的措辞，不动删/改规则。

```bash
# 1) 改 prompt/persona*.md（## Routing 之前）和/或 prompt/rules*.md（之后，可多份）；值直接写原文
node scripts/build-rules.mjs --with-prompt   # 打印人设字数与规则块数；miss 必须 0
node test/test.mjs                           # 28 条
node scripts/verify.mjs claude               # 看「人设注入: 是」
node scripts/verify.mjs pi
node scripts/show-rules.mjs                  # 烤入默认：开关、块顺序、人设/规则块字数、计费头
node scripts/check-docs.mjs
magpie plugin off system-prune && magpie plugin on system-prune   # 仅远程 hw-ecs-ts；本机宿主是 cc-switch
```

通过标准：`verify` 两个 agent 都是「人设注入：是」「官方身份残留：否」「冲突点已替换：是」「Environment 随 official：是」；`show-rules` 不带参数时是「persona=on」、规则块 1 份、块顺序与 `rulePosition` 一致、计费头在最前。`build` 打印的人设字数/规则块数变了，是这一节唯一预期的数字变化。

失败：`人设注入: 否` 说明 `prependBlocks` 空了或没跑 `--with-prompt`（`scripts/verify.mjs` 读的是 `rules/rules.<agent>.json`，不是中间件本体）。

## 2. 换一份规则 / 增删规则

目标：让运行时插另一份规则，或新增一份规则文件。不再修改官方正文。

```bash
# 新增/编辑 prompt/rules.<主题>.md，文件名去掉 .md 就是 ruleFiles 的可选值
node scripts/build-rules.mjs --with-prompt
node test/test.mjs
node scripts/verify.mjs claude
node scripts/verify.mjs pi
node scripts/show-rules.mjs                  # 看烤入的规则块数、块顺序与 rulePosition 是否对得上
node scripts/show-rules.mjs rules/rules.json # 看离线完整规则集（人设 + 全部规则）
node scripts/check-docs.mjs
magpie plugin off system-prune && magpie plugin on system-prune   # 仅远程 hw-ecs-ts；本机宿主是 cc-switch
```

通过标准：`verify` 两个 agent 都是「人设注入：是」「官方身份残留：否」「冲突点已替换：是」「Environment 随 official：是」；`show-rules` 的「规则块」跟着 `ruleFiles` 变（`""` = 0 份）；`build` 打印的规则块数增加。

换规则用 option 即可，不用改文件：在 `hw-ecs-ts` 上跑 `magpie plugin options system-prune '{"ruleFiles":"rules.deepseek.1"}'`。要让规则块排在人设前面，同时设 `"rulePosition":"before"`；切回 deepseek 规则时记得改回 `"after"`。持久默认改 `config/switches.json` 再 build。

### 官方冲突点

`config/official.json` 的 `dropBlocks` / `dropLines` / `replacements`，只放会和人设冲突的官方句子（身份块、拒答段、审批话术、发布禁令、品牌行、Environment 里的下载/解压行；自指模型行是否删由 `dropLines` 决定）。改完 `node scripts/build-rules.mjs --with-prompt`，`verify` 会检查 Environment 按 `official` 开关处理。

## 3. 加一个 agent

目标：让名单里多一个协议形状不同的 agent。两处必改：

1. 抓它的原生 system 存成 `samples/<agent>-native.system.txt`（verify / dump-diff 的对照底稿）。
2. `config/enabled-agents.json` 加进名单，`build` 会烤进 `BAKED_RULES.agents`。

共享人设 `prompt/persona*.md` + `prompt/rules*.md` 不用复制或按 agent 改；要按 agent 增减规则，在 options 里设 `ruleFiles`。

另外两处按需：`scripts/verify.mjs` 现在只认 `claude`（anthropic）和 `pi`（chat），新协议要在那里加分支；`src/system-prune.middleware.js` 的 `onRequest` switch 已经覆盖 anthropic / chat / responses / gemini 四种，新协议不在其中就得先补分派。

通过标准：`node scripts/verify.mjs <agent>` 能跑出「人设注入：是」「官方身份残留：否」「冲突点已替换：是」「Environment 随 official：是」；`scripts/show-rules.mjs` 对 claude 的默认结果不变。

## 4. 行为 A/B（可选）

目标：比较中间件开/关时的工具选择、任务完成与风格。用真实 agent，不涉及官方正文消融。

```bash
node probe/ab-test.mjs both --runs=5
```

它会临时把插件 options 的 `agents` 清空（等于关掉中间件），跑完恢复；别在别的会话忙的时候跑。

## 5. 发布前

```bash
node scripts/scrub-fixtures.mjs              # 幂等，跑几次都一样
git status --short                           # 看 request 快照有没有被带进 diff
node scripts/check-docs.mjs
```

脱敏对象：`samples/interactive-main.request.json`、`samples/claude-sdk.request.json`、`samples/interactive-title.request.json` 的 `session_id`，`samples/live.claude.md` 与 `docs/diff/*` 里的 `device_id` / `account_uuid` / `KEY`。`local/evi-backup.json` 和 `local/interactive-index.jsonl` 在 `.gitignore` 里，别取消忽略。

## 6. 回滚

| 层 | 动作 |
|---|---|
| 规则/人设 | `git diff` 看清，再 `git checkout -- <file>`（不自动 commit 也不自动 revert，要人点头） |
| 烤入块 | 改真源后重跑 `node scripts/build-rules.mjs --with-prompt`，不要反转产物 |
| options | 远程 `hw-ecs-ts`：手动设回 `magpie plugin options system-prune '{"agents":["claude","pi"],"persona":true,"official":true,"ruleFiles":"rules.claude.1","rulePosition":"before"}'` |
| 旧人设载荷 | `local/evi-backup.json`（本地文件，不进仓库） |
| 网关进程 | 远程 `hw-ecs-ts`：`magpie plugin off system-prune && magpie plugin on system-prune`（本机宿主是 cc-switch，无此步） |

## 7. 失败处置

| 症状 | 原因 | 动作 |
|---|---|---|
| `no plugin "system-prune.middleware.js"` | 用文件名当插件名 | 用 `system-prune` |
| `网关旁路没生效（agents 不是空）` | 有进程回写 `plugins.json` | 关掉 app 插件页/别的会话，重跑 |
| `网关旁路被回写，批次中止` | 同上，跑到一半被冲 | 同上，用 `--resume` 续 |
| `人设注入: 否` | 没跑 `--with-prompt`，或 `prependBlocks` 空 | 重跑 build，看 `rules/rules.json` |
| 规则块没出现 | `ruleFiles` 为空串、id 写错，或 build 没烤 `ruleBlocks` | 核对 `prompt/rules*.md` 去掉 `.md` 的 id |
| 块顺序不对 | `rulePosition` 与预期不符（当前默认 `before`） | 看 `show-rules` 的「块顺序」，改 `config/switches.json` 或 options |
| `恢复 options 失败` | CLI 写入被 app 回写顶掉 | 手动 `magpie plugin options` 再试 |

## 8. 已知坑

- **options 不是持久配置**。app 重启会用内存状态回写 `plugins.json`（2026-10-29 实测丢过一次，旧值只剩 `plugins.json.bak`）。要持久就改 `config/enabled-agents.json` / `config/switches.json` 再 build。
- **`probe/ab-test.mjs` 测的是行为 A/B**。它用 `claude -p` / `pi -p` 跑真实 agent，比较中间件开/关时的工具选择与风格；不再有 system 段消融。
- **改一个字节就会掉缓存**。所以任何「按轮次精简 prompt」的想法，先在 `probe/ab-test.mjs` 里看缓存命中，再决定。
- **远程更新不认 `plugin add`**。在 `hw-ecs-ts` 上重装同一个 GitHub spec 不会刷新（2026-11-01 实测仍停在旧提交）；`magpie plugin update` 是全量，会顺带更新 6 个社区 auth 插件。可靠路径是 `scp src/system-prune.middleware.js hw-ecs-ts:~/.config/magpie/plugins/node_modules/system-prune/src/`，再 `magpie plugin off/on system-prune`。手动覆盖后安装记录仍指旧提交，下次 `add` / `update` 会冲掉，重做一遍即可。
