# 项目规范

这份只管**文档与代码的一致性**：口径怎么写、名字怎么叫、哪些东西必须由脚本保证。改规则怎么做、代码怎么组织，看 `CLAUDE.md`；操作顺序与失败处置，看 `docs/WORKFLOW.md`。

`node scripts/check-docs.mjs` 把下面能机检的条款全部断言掉；它进验证链，不绿不算改完。

## 一、名字只有一种写法

| 东西 | 唯一写法 | 反面 |
|---|---|---|
| 插件标识（手敲命令） | `system-prune` | `system-prune.middleware.js`（magpie 报 `no plugin`） |
| 插件标识（脚本里） | `magpie plugin list --json` 的 `middleware` key，即安装时的绝对路径 | 自己拼路径（装机位置一变就失效） |
| 安装 | `magpie plugin add ~/projects/opensource/system-prune` | 拿文件名当插件名 |
| 生成脚本 | `scripts/build-rules.mjs` | `build-claude-rules.mjs`（不存在） |
| 人设源 | `prompt/persona*.md`（恰好一份，`## Routing` 之前）/ `prompt/rules*.md`（之后，可多份） | `prompt/vars.json`（已删除；值直接写在原文）、`prompt/persona.<agent>.zh.md`（已删除；源文件共享） |
| 探针结果文件参数 | `--out` | `--in`（不存在） |

magpie 两种都收：短名是目录名，注册 key 是安装时的绝对路径。`probe/ab-test.mjs` 从 `plugin list --json` 取 key 再调 `options`，文档里的手敲命令统一写短名。文件名永远不是插件标识。

文档里出现的每条 `node <file>.mjs` 必须当场可跑：文件在仓库里、参数是代码认的、子命令在 `switch` 里。

## 二、文件表是两份，内容一份

`README.md` 和 `CLAUDE.md` 各有一张「文件」表，**逐字相同**（同一顺序、同一措辞），由 `scripts/check-docs.mjs` 比对。

- 新增、改名、删除文件后，两张表一起改；只改一张等于没改。
- 表必须覆盖所有已跟踪文件；写目录行（如 `docs/diff/`）即视为覆盖其下全部文件。豁免：`README.md`、`CLAUDE.md`、`docs/CONVENTIONS.md`、`docs/WORKFLOW.md`、`package.json`、`.gitignore`。
- 本地文件（`.gitignore` 里的）也登记，角色里注明「本地」，别让人照着找。

## 三、数字只在实测当天有效

- 会随改动漂的数字（快照长度、人设字数、system 字符数）**不写进规范句**；必须写时带上「当前快照」字样，让人知道要去重测。
- 实验结论写全四件：臂、样本量、统计口径、日期。少一样就是传闻。
- 写「必过」「一定」「等价」之前先跑一遍。旧探针的 `selfcheck` 一度因 `cuts` 为空而必 FAIL；那套消融脚本已删除，别再引用它的结论当现行行为。

## 四、生成物不手改

`rules/rules.json`、`rules/persona.payload.json`、`src/system-prune.middleware.js` 的 `>>> baked-rules` 块、`docs/diff/` 下的 before/after、`docs/cases/`（本地生成，不进仓库）全部由脚本产出。改源头再重跑，别在产物上打补丁。`rules/rules.json` 里的 `prependBlocks` 是人设 + 全部规则块，只给 verify / dump-diff 当离线完整规则集；运行时按 `ruleFiles` 从 `ruleBlocks` 里选一份。

`docs/diff/<agent>/` 下的 before/after 与 `.diff` 全部由 `scripts/dump-diff.mjs` 产出（它自己跑 `diff -u`，退出码 1 = 有差异属正常）。`docs/cases/`（本地生成）由 `scripts/export-cases.mjs` 产出，按 persona × official × ruleFiles 的 12 种组合各跑一遍。人设与规则字面量靠 `rules/rules.json` 的 `prependBlocks` 逐块剔除，所以先 build 再 dump / export。

## 五、命令块要与代码同源

文档里的命令块按「能贴进终端就跑」写，不做伪代码。`check-docs.mjs` 会断言 `node <file>.mjs` 指向的脚本存在、路径正确。

## 六、改完的验证链

```bash
node scripts/build-rules.mjs --with-prompt   # 只烤块，不再校验官方字面量
node test/test.mjs                           # 28 条
node scripts/verify.mjs claude               # 人设注入 + 冲突点替换（含 Environment）
node scripts/verify.mjs pi
node scripts/show-rules.mjs
node scripts/check-docs.mjs                  # 本文件的可机检条款
```

全绿才算改完。只改注释、不动 `BAKED_RULES` 与导出时，可以跳过 `magpie plugin off/on`，并在收尾里说明跳过的原因。

## 七、不要写进文档的东西

- 不描述没实现的开关（曾经把分层人设写成「备好但默认关」，代码里连参数都没有）。
- 不把宿主层的手术过程写回人设 prompt（`CLAUDE.md` 的对照表是给人看的，不进上下文）。
- 不在文档里留凭据、session、真名路径；快照先过 `scripts/scrub-fixtures.mjs`。
