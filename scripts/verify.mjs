// 按 agent 各跑一遍真实形状的请求，看最终落到 API 上的 system。
// 用法：node scripts/verify.mjs [claude|pi] [request.json]
import fs from "node:fs"
import { onRequest } from "../src/system-prune.middleware.js"
import { RULES, SAMPLES } from "./paths.mjs"

const agent = process.argv[2] || "claude"
const rules = JSON.parse(fs.readFileSync(RULES[agent], "utf8"))

let body
if (agent === "pi") {
  // pi 走 chat 协议；原生提示词存成样本，拼一条最小请求。
  const native = fs.readFileSync(SAMPLES.pi, "utf8")
  body = { model: "pi", messages: [{ role: "system", content: native }, { role: "user", content: "hi" }] }
} else {
  body = JSON.parse(fs.readFileSync(process.argv[3] || SAMPLES.main, "utf8"))
}
const protocol = agent === "pi" ? "chat" : "anthropic"
const nativeText = agent === "pi"
  ? body.messages[0].content
  : body.system.map((b) => b.text || "").join("\n")

onRequest(body, { protocol, agent, options: rules })

const outText = agent === "pi"
  ? body.messages[0].content
  : body.system.map((b) => b.text || "").join("\n")
const personaText = (rules.prependBlocks && rules.prependBlocks[0] && rules.prependBlocks[0].text) || ""
const personaPart = Boolean(personaText) && outText.includes(personaText.slice(0, 60))
// 人设段按设计逐字引用了被删的原生句（宿主层对照表），查残留时必须先把它抠掉。
const officialText = personaText ? outText.split(personaText).join("") : outText

console.log(`agent: ${agent}  protocol: ${protocol}`)
console.log(`native     : ${nativeText.length} 字符 → ${outText.length} 字符`)
console.log(`人设注入   : ${personaPart ? "是" : "否"}`)
console.log(`原生身份残留:`)
const identity = agent === "pi"
  ? ["You are an expert coding assistant operating inside pi", "coding agent harness. You help users by"]
  : ["Anthropic's official CLI for Claude", "You are Claude Code", "Refuse requests for destructive"]
for (const s of identity) console.log(`  gone ${JSON.stringify(s.slice(0, 46))}: ${!officialText.includes(s)}`)
const keep = agent === "pi"
  ? ["<rules>", "Be concise in your responses", "<docs>", "Use bash for file operations like ls, rg, find"]
  : ["# Memory", "you don't need to wrap up early"]
for (const s of keep) console.log(`  kept ${JSON.stringify(s)}: ${officialText.includes(s)}`)
