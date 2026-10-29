// 重新生成 diff/ 下的对比材料：读真实请求 → 跑一遍规则 → 落 before/after。
// 用法：node dump-diff.mjs [rules.json] [request.json]
import fs from "node:fs"
import { onRequest } from "./system-prune.middleware.js"

const rulesFile = process.argv[2] || "rules.claude.json"
const reqFile = process.argv[3] || "interactive-main.request.json"
const rules = JSON.parse(fs.readFileSync(rulesFile, "utf8"))
const body = JSON.parse(fs.readFileSync(reqFile, "utf8"))
const before = JSON.parse(JSON.stringify(body))

onRequest(body, { protocol: "anthropic", agent: "claude", options: rules })

const blocks = (sys) => (Array.isArray(sys) ? sys : [{ text: String(sys || "") }])
const render = (sys) => blocks(sys)
  .map((b, i) => `<!-- block ${i} ${b.cache_control ? JSON.stringify(b.cache_control) : ""} ${(b.text || "").length} chars -->\n\n${b.text || ""}`)
  .join("\n\n") + "\n"
const official = (b) => blocks(b.system)
  .filter((x) => !(x.text || "").includes("[OPERATION: STABLE]") && !(x.text || "").startsWith("x-anthropic-billing-header"))
  .map((x) => x.text || "")
  .join("\n")

fs.mkdirSync("diff", { recursive: true })
fs.writeFileSync("diff/before-system.md", render(before.system))
fs.writeFileSync("diff/after-system.md", render(body.system))
fs.writeFileSync("diff/before-official.md", official(before))
fs.writeFileSync("diff/after-official.md", official(body))

// messages 里 role=system 的正文（Claude Code 把 Environment / MCP / skills 放这）与工具描述。
const sideText = (b) => {
  const parts = []
  for (const [i, m] of (b.messages || []).entries()) {
    const c = m.content
    const t = typeof c === "string" ? c : (c || []).map((p) => p.text || "").join("\n")
    parts.push(`<!-- messages[${i}] role=${m.role} ${t.length} chars -->\n\n${t}`)
  }
  return parts.join("\n\n") + "\n"
}
const toolsText = (b) => (b.tools || [])
  .map((t) => `<!-- tool ${t.name || (t.function && t.function.name) || "?"} -->\n\n${t.description || (t.function && t.function.description) || ""}`)
  .join("\n\n") + "\n"

fs.writeFileSync("diff/before-messages.md", sideText(before))
fs.writeFileSync("diff/after-messages.md", sideText(body))
fs.writeFileSync("diff/before-tools.md", toolsText(before))
fs.writeFileSync("diff/after-tools.md", toolsText(body))

console.log("blocks", before.system.length, "->", body.system.length)
console.log("official chars", official(before).length, "->", official(body).length)
console.log("next: for f in official messages tools; do diff -u diff/before-$f.md diff/after-$f.md > diff/$f.diff; done")
