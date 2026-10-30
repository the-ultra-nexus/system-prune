// 看中间件此刻实际会执行什么：烤入的规则 + options 叠加后的结果。
// 用法：node scripts/show-rules.mjs [options.json]
//   node scripts/show-rules.mjs                # 只看烤入的那份
//   node scripts/show-rules.mjs rules/rules.claude.json   # 看叠加以后的
import fs from "node:fs"
import { SAMPLES } from "./paths.mjs"

const mod = await import("../src/system-prune.middleware.js")
const body = JSON.parse(fs.readFileSync(SAMPLES.main, "utf8"))
const before = body.system.map((b) => b.text || "").join("\n").length

const opts = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], "utf8")) : undefined
mod.onRequest(body, { protocol: "anthropic", agent: "claude", ...(opts ? { options: opts } : {}) })

const blocks = body.system.map((b) => b.text || "")
const persona = blocks.find((t) => t.includes("[OPERATION: STABLE]"))
const official = blocks.filter((t) => !t.includes("[OPERATION: STABLE]") && !t.startsWith("x-anthropic-billing")).join("\n")
const tools = (body.tools || []).map((t) => t.description || "").join("\n")

console.log("source      :", opts ? "options 叠在烤入规则上" : "只有烤入的规则（options 为空）")
console.log("system 块   :", blocks.length, `(改前 ${before} 字符 → 改后 ${blocks.join("\n").length})`)
console.log("人设块      :", persona ? `${persona.length} 字符` : "缺失")
if (persona) console.log("开头三行    :", JSON.stringify(persona.split("\n").slice(0, 3)).slice(0, 160))
console.log("官方残余    :", official.length, "字符")
console.log("残留官方身份:", official.includes("official CLI for Claude"))
console.log("拒答段还在  :", official.includes("Refuse requests for destructive"))
console.log("工具描述改写:", tools.includes("are published when the task asks"))
console.log("计费头在最前:", /^x-anthropic-billing-header/.test(blocks[0]))
