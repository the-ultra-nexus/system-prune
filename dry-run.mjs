import fs from "node:fs"
import { onRequest } from "./system-prune.middleware.js"

const file = process.argv[2] || "interactive-main.request.json"
const raw = fs.readFileSync(new URL(file, import.meta.url), "utf8")
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
