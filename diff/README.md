# 对比材料

三对差异，纯文本，`diff -u` 直接看。

## 一、system 块（真正被删/改的官方正文）

| 文件 | 是什么 |
|---|---|
| `before-system.md` / `after-system.md` | 改前/改后完整 system，含计费头与人设段 |
| `before-official.md` / `after-official.md` | 剥掉计费头和人设后的官方正文，55 行 → 29 行，7399 → 5504 字符 |
| `official.diff` | 上面两份的差异 |

改后比改前大，是因为新增蓝汐人设整段（16342 字符）；官方正文本身是净减。

## 二、messages 里 role=system 的正文

`before-messages.md` / `after-messages.md` / `messages.diff`
Claude Code 把 Environment、MCP 指令、skills 目录放在这条消息里。改动两处：`untrusted data` → `working material`，`You are powered by the model …` 整行删除。

## 三、工具描述

`before-tools.md` / `after-tools.md` / `tools.diff`
15 个工具的 description 走同一套替换，实际命中两条：Artifact 的仿冒/伪造禁令、SendFeedback 的 exploit 禁令。

## 四、DeepSeek 稿 vs Claude 稿

`prompt-dsh-vs-claude.diff`：`~/agent-workspace/dsh-purge-deepseek-prompt.zh.md` 与 `claude-system-prompt.zh.md` 的差异。5 处：去 ChatML 信封、加「宿主层」对照表、加「工具层（Claude Code）」、扩「外来模式」、范围补 permission mode 一句；正文其余逐字相同。

## 重新生成

```bash
cd ~/agent-workspace/system-prune
node dump-diff.mjs                                  # 落 before/after 四对
for f in official messages tools; do
  diff -u diff/before-$f.md diff/after-$f.md > diff/$f.diff
done
diff -u ~/agent-workspace/dsh-purge-deepseek-prompt.zh.md claude-system-prompt.zh.md > diff/prompt-dsh-vs-claude.diff
```
