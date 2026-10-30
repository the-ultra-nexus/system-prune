// 手工试跑：拿一条真实请求跑一遍自定义规则，打印块与字节变化。
// 用法：node scripts/dry-run.mjs [request.json]
import fs from "node:fs"
import { onRequest } from "../src/system-prune.middleware.js"
import { SAMPLES } from "./paths.mjs"

const file = process.argv[2] || SAMPLES.main
const raw = fs.readFileSync(file, "utf8")
const body = JSON.parse(raw)

const before = JSON.stringify(body).length
const rules = {
  dropBlocksContaining: ["x-anthropic-billing-header"],
  dropSections: ["# Context management", "# Memory", "# MCP Server Instructions"],
  agents: ["claude"],
}

const result = onRequest(body, { protocol: "anthropic", agent: "claude", options: rules })
const after = JSON.stringify(body).length

console.log("changed:", result !== undefined)
console.log("bytes:", before, "->", after, "(-" + (before - after) + ")")
if (Array.isArray(body.system)) {
  console.log("system blocks:", body.system.length)
  body.system.forEach((b, i) => console.log("  #" + i, b.text.length, b.cache_control ? "cache" : ""))
}
for (const m of body.messages || []) {
  const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content)
  console.log("message", m.role, text.length)
}
