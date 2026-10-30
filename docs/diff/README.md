# 对比材料

每个 agent 一套 before/after，全部由 `node scripts/dump-diff.mjs` 从真实样本重生成（含 `diff -u` 成品）。别手改，改完重跑。

```
docs/diff/
  claude/   交互式 CLI 的 anthropic 请求快照（samples/interactive-main.request.json）
  pi/       原生提示词拼最小 chat 请求（samples/pi-native.system.txt）
  prompt-dsh-vs-claude.diff   历史材料，见第四节
```

## 一、claude

样本 `samples/interactive-main.request.json`，规则 `rules/rules.claude.json`。

| 文件 | 是什么 |
|---|---|
| `before-system.md` / `after-system.md` | 完整 system，含计费头与人设块，逐块标 cache_control 与字符数 |
| `system.diff` | 上面两份的差异（人设整段插入，368 行） |
| `before-official.md` / `after-official.md` | 剥掉计费头和人设后的官方正文 |
| `official.diff` | 官方正文的净变化：**7,399 → 6,611 字符** |
| `before-messages.md` / `after-messages.md` / `messages.diff` | `role=system` 那条消息（Environment、MCP、skills 在这），两处改动：`untrusted data` → `working material`、`You are powered by the model …` 整行删除 |
| `before-tools.md` / `after-tools.md` / `tools.diff` | 15 个工具的 description，命中两条：Artifact 的仿冒/伪造禁令、SendFeedback 的 exploit 禁令 |

system 全文 7,470 → 21,790 字符：官方正文净减 788，人设净增 15,106。

## 二、pi

样本 `samples/pi-native.system.txt`（1,834 字符），规则 `rules/rules.pi.json`。chat 形状下 system 是 `messages[0]`，人设拼在原生文本前面。

| 文件 | 是什么 |
|---|---|
| `before-system.md` / `after-system.md` | 整段 system（人设 + 原生），`<!-- part 0 … chars -->` 标长度 |
| `system.diff` | 上面两份的差异（人设整段插入，321 行） |
| `before-official.md` / `after-official.md` | 剥掉人设后的原生正文 |
| `official.diff` | 净变化：**1,834 → 1,770 字符**，只有一处替换 |

`official.diff` 里就一处：

```diff
-You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.
+You work inside pi, a coding agent harness: you read files, run commands, edit code, and write new files.
```

`<rules>` 里那句 `Use bash for file operations like ls, rg, find` **不动**。pi 没有独立的 `grep`/`find`/`ls` 工具，「找」只能走 bash，把它改成「专用工具优先」在行为上等价，却让官方正文多 149 字符、多一处随 pi 工具集漂移的 `MISS` 点。读/改/建优先 `read`/`edit`/`write` 由人设那条覆盖（`persona/persona.pi.zh.md:54`）。要改回去，`scripts/build-rules.mjs` 的 `piRules.replacements` 里留了注释掉的一行，解开即可。

pi 不出 `messages` / `tools` 两个文件：chat 形状下 system 就是 messages 第 0 条（再抄一份只是自我重复），而样本抓于无工具会话，`<tools>` 段写的是 `(none)`，没有 `tools` 数组可对比。真实 pi 会话带工具描述，那时 `pruneTools` 会走 chat 形状单独处理，需要用带工具的快照重跑才能看到那部分。

## 三、重新生成

```bash
node scripts/dump-diff.mjs                    # claude + pi 都出
node scripts/dump-diff.mjs pi                 # 只出 pi
node scripts/dump-diff.mjs claude rules/rules.claude.json samples/claude-sdk.request.json   # 换快照
node scripts/scrub-fixtures.mjs               # 发布前脱敏，幂等
```

脚本自己跑 `diff -u` 落成品（`diff` 的退出码 1 = 有差异，属正常）。人设字面量靠 `rules/rules.<agent>.json` 的 `prependBlocks` 剔除，所以先 `node scripts/build-rules.mjs --with-prompt` 再跑本脚本。

## 四、DeepSeek 稿 vs Claude 稿（历史）

`prompt-dsh-vs-claude.diff`：`~/agent-workspace/dsh-purge-deepseek-prompt.zh.md` 与 `persona/persona.claude.zh.md` 的差异。

这份只当历史材料看：两稿已经分叉（92 增 / 59 删行），不再是当年「5 处小改、其余逐字相同」的状态——人设这边经过裁剪（16,935 → 15,106）和多轮改写，DeepSeek 稿没跟。要看当前链路改了什么，用上面两节。

```bash
diff -u ~/agent-workspace/dsh-purge-deepseek-prompt.zh.md persona/persona.claude.zh.md > docs/diff/prompt-dsh-vs-claude.diff
```
