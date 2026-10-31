# 对比材料

每个 agent 一套 before/after，全部由 `node scripts/dump-diff.mjs` 从真实样本重生成（含 `diff -u` 成品）。别手改，改完重跑。

```
docs/diff/
  claude/   交互式 CLI 的 anthropic 请求快照（samples/interactive-main.request.json）
  pi/       原生提示词拼最小 chat 请求（samples/pi-native.system.txt）
  prompt-dsh-vs-claude.diff   历史材料，见第四节
```

## 一、claude

样本 `samples/interactive-main.request.json`，规则 `rules/rules.json`。

| 文件 | 是什么 |
|---|---|
| `before-system.md` / `after-system.md` | 完整 system，含计费头、人设块与规则块，逐块标 cache_control 与字符数 |
| `system.diff` | 上面两份的差异（官方冲突点修正 + 人设块 + 规则块插入，357 行） |
| `before-official.md` / `after-official.md` | 剥掉计费头、人设块与规则块后的官方正文 |
| `official.diff` | 官方正文的净变化：**7,399 → 6,654 字符**（身份块删除 + 冲突句替换） |
| `before-messages.md` / `after-messages.md` / `messages.diff` | `role=system` 那条消息（Environment、MCP、skills 在这）；Environment 里的 `Downloaded files ... untrusted data` 替换成 `working material`；自指模型行保留（20 行 diff） |
| `before-tools.md` / `after-tools.md` / `tools.diff` | 15 个工具的 description，命中两条：Artifact 的仿冒/伪造禁令、SendFeedback 的 exploit 禁令 |

system 全文 7,470 → 22,827 字符：官方正文净减 745，插入人设块 2,649 字 + 规则块 13,449 字（余下是块间换行）。

## 二、pi

样本 `samples/pi-native.system.txt`（1,834 字符），规则 `rules/rules.json`。chat 形状下 system 是 `messages[0]`，人设块与规则块拼在原生文本前面。

| 文件 | 是什么 |
|---|---|
| `before-system.md` / `after-system.md` | 整段 system（人设 + 规则 + 原生），`<!-- part 0 … chars -->` 标长度 |
| `system.diff` | 上面两份的差异（身份句替换 + 人设块 + 规则块插入，311 行） |
| `before-official.md` / `after-official.md` | 剥掉人设块与规则块后的原生正文 |
| `official.diff` | 净变化：**1,834 → 1,770 字符**，只有身份句替换 |

`<rules>` 里的 `Use bash for file operations like ls, rg, find` 与其余原生段都保持原样；读/改/建优先 `read`/`edit`/`write` 由人设覆盖。

pi 不出 `messages` / `tools` 两个文件：chat 形状下 system 就是 messages 第 0 条（再抄一份只是自我重复），而样本抓于无工具会话，`<tools>` 段写的是 `(none)`，没有 `tools` 数组可对比。

## 三、重新生成

```bash
node scripts/dump-diff.mjs                    # claude + pi 都出
node scripts/dump-diff.mjs pi                 # 只出 pi
node scripts/dump-diff.mjs claude rules/rules.json samples/claude-sdk.request.json   # 换快照
node scripts/scrub-fixtures.mjs               # 发布前脱敏，幂等
```

脚本自己跑 `diff -u` 落成品（`diff` 的退出码 1 = 有差异，属正常）。人设与规则字面量靠 `rules/rules.<agent>.json` 的 `prependBlocks` 逐块剔除，所以先 `node scripts/build-rules.mjs --with-prompt` 再跑本脚本。

## 四、DeepSeek 稿 vs Claude 稿（历史）

`prompt-dsh-vs-claude.diff`：`~/agent-workspace/dsh-purge-deepseek-prompt.zh.md` 与旧 `persona/persona.claude.zh.md` 的差异。旧文件已迁移为 `prompt/persona*.md` + `prompt/rules*.md`，旧的 per-agent 人设文件与 `vars.json` 已删除；这份只当历史材料看。

这份只当历史材料看：两稿已经分叉（92 增 / 59 删行），不再是当年「5 处小改、其余逐字相同」的状态——人设这边经过裁剪（16,935 → 15,106）和多轮改写，DeepSeek 稿没跟。要看当前链路改了什么，用上面两节。

```bash
# 旧文件已迁移；要重生成，先把组合后的整段人设取出来
jq -r '.prependBlocks[0].text' rules/rules.json > /tmp/persona.claude.zh.md
diff -u ~/agent-workspace/dsh-purge-deepseek-prompt.zh.md /tmp/persona.claude.zh.md > docs/diff/prompt-dsh-vs-claude.diff
```
