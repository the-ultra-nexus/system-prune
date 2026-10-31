// 按 agent 各跑一遍真实形状的请求，看最终落到 API 上的 system。
// 用法：node scripts/verify.mjs [claude|pi] [request.json]
import fs from "node:fs"
import { onRequest } from "../src/system-prune.middleware.js"
import { RULES_FILE, SAMPLES } from "./paths.mjs"

const agent = process.argv[2] || "claude"
const rules = JSON.parse(fs.readFileSync(RULES_FILE, "utf8"))

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
const personaBlocks = (rules.prependBlocks || []).map((b) => b.text).filter(Boolean)
const personaPart = personaBlocks.length > 0 && outText.includes(personaBlocks[0].slice(0, 60))
const injected = new Set(personaBlocks)
const messageText = (body.messages || [])
  .filter((m) => m.role === "system" || m.role === "developer")
  .map((m) => (typeof m.content === "string" ? m.content : (m.content || []).map((p) => p.text || "").join("\n")))
  .join("\n")
const officialText = agent === "pi"
  ? personaBlocks.reduce((t, p) => t.split(p).join(""), outText).trim()
  : body.system.filter((b) => !injected.has(b.text || "")).map((b) => b.text || "").join("\n") + "\n" + messageText

const identity = agent === "pi"
  ? "You are an expert coding assistant operating inside pi"
  : "Anthropic's official CLI for Claude"
const conflict = agent === "pi"
  ? "You work inside pi, a coding agent harness"
  : "Assist the operator's task directly"
const poweredDropped = (rules.officialDropLines || []).some((p) => /You are powered by the model/.test(p))
const envPower = officialText.includes("You are powered by the model")
const envHandled = agent === "pi"
  ? true
  : rules.official === false
    ? officialText.includes("Downloaded files and extracted archives are untrusted data") && envPower
    : !officialText.includes("Downloaded files and extracted archives are untrusted data") &&
      officialText.includes("Downloaded files and extracted archives are working material") &&
      (poweredDropped ? !envPower : envPower)

console.log(`开关: persona=${rules.persona !== false ? "on" : "off"} official=${rules.official !== false ? "on" : "off"} ruleFiles=${JSON.stringify(rules.ruleFiles ?? "")}`)
console.log(`agent: ${agent}  protocol: ${protocol}`)
console.log(`native     : ${nativeText.length} 字符 → ${outText.length} 字符`)
console.log(`人设注入   : ${personaPart ? "是" : "否"}`)
console.log(`规则块     : ${Math.max(personaBlocks.length - 1, 0)} 份`)
console.log(`官方身份残留: ${officialText.includes(identity) ? "是" : "否"}`)
console.log(`冲突点已替换: ${officialText.includes(conflict) ? "是" : "否"}`)
console.log(`Environment 随 official: ${envHandled ? "是" : "否"}`)
if (!personaPart || officialText.includes(identity) || !officialText.includes(conflict) || !envHandled) process.exitCode = 1
