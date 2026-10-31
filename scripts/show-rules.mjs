// 看中间件此刻实际会执行什么：烤入的规则 + options 叠加后的结果。
// 用法：node scripts/show-rules.mjs [options.json]
//   node scripts/show-rules.mjs                # 只看烤入的那份
//   node scripts/show-rules.mjs rules/rules.json   # 看叠加以后的
import fs from "node:fs"
import { RULES_FILE, SAMPLES } from "./paths.mjs"

const mod = await import("../src/system-prune.middleware.js")
const body = JSON.parse(fs.readFileSync(SAMPLES.main, "utf8"))
const before = body.system.map((b) => b.text || "").join("\n").length
// 人设与规则块都是注入内容；官方残余要把它们整体剔掉，不能只剔人设块。
// rules.json 的 prependBlocks[0] 固定是人设，用它认人设块（人设正文里不放标记）。
const injectedBlocks = JSON.parse(fs.readFileSync(RULES_FILE, "utf8")).prependBlocks.map((b) => b.text)
const injected = new Set(injectedBlocks)
const personaText = injectedBlocks[0]

const opts = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], "utf8")) : undefined
mod.onRequest(body, { protocol: "anthropic", agent: "claude", ...(opts ? { options: opts } : {}) })

const blocks = body.system.map((b) => b.text || "")
const persona = blocks.find((t) => t === personaText)
const ruleCount = blocks.filter((t) => injected.has(t) && t !== personaText).length
const official = blocks.filter((t) => !injected.has(t) && !t.startsWith("x-anthropic-billing")).join("\n")
const tools = (body.tools || []).map((t) => t.description || "").join("\n")

// 烤入默认：persona 开、official 开；传 rules 文件时按文件里的开关算。
const flags = { persona: opts ? opts.persona !== false : true, official: opts ? opts.official !== false : true }
console.log("source      :", opts ? "options 叠在烤入规则上" : "只有烤入的规则（options 为空）")
console.log("开关        :", `persona=${flags.persona ? "on" : "off"}`, `official=${flags.official ? "on" : "off"}`)
console.log("system 块   :", blocks.length, `(改前 ${before} 字符 → 改后 ${blocks.join("\n").length})`)
console.log("块顺序      :", blocks.map((t) => t.replace(/\s+/g, " ").slice(0, 16)).join(" → "))
console.log("人设块      :", persona ? `${persona.length} 字符` : "缺失")
console.log("规则块      :", ruleCount, "份")
if (persona) console.log("开头三行    :", JSON.stringify(persona.split("\n").slice(0, 3)).slice(0, 160))
console.log("官方正文    :", official.length, "字符")
console.log("官方身份保留:", official.includes("official CLI for Claude"))
console.log("拒答段保留  :", official.includes("Refuse requests for destructive"))
console.log("工具描述原样:", !tools.includes("are published when the task asks"))
console.log("计费头在最前:", /^x-anthropic-billing-header/.test(blocks[0]))
