// 重新生成 docs/diff/ 下的对比材料：每个 agent 一套 before/after，外加 diff -u 成品。
// 用法：node scripts/dump-diff.mjs [claude|pi|both] [rules.json] [request.json]
//   node scripts/dump-diff.mjs                # 两个 agent 都出
//   node scripts/dump-diff.mjs pi             # 只出 pi
//   node scripts/dump-diff.mjs claude rules/rules.json samples/claude-sdk.request.json   # 换快照
// claude 走 anthropic 形状（真实请求快照），pi 走 chat 形状（原生提示词拼最小请求）。
// docs/diff/*.diff 由本脚本直接生成，不用再手工跑 diff -u。
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { onRequest } from "../src/system-prune.middleware.js"
import { DIFF_DIR, ROOT, RULES_FILE, SAMPLES } from "./paths.mjs"

const argv = process.argv.slice(2)
const which = ["claude", "pi", "both"].includes(argv[0]) ? argv[0] : "both"
const rest = ["claude", "pi", "both"].includes(argv[0]) ? argv.slice(1) : argv

const AGENTS = {
  claude: {
    protocol: "anthropic",
    sample: rest[1] || SAMPLES.main,
    body: (f) => JSON.parse(fs.readFileSync(f, "utf8")),
  },
  pi: {
    protocol: "chat",
    sample: SAMPLES.pi,
    body: (f) => ({
      model: "pi",
      messages: [{ role: "system", content: fs.readFileSync(f, "utf8") }, { role: "user", content: "hi" }],
    }),
  },
}

const clone = (x) => JSON.parse(JSON.stringify(x))
const blocksOf = (body) => (Array.isArray(body.system) ? body.system : [{ text: String(body.system || "") }])
const partsOf = (body) => {
  const c = body.messages && body.messages[0] ? body.messages[0].content : ""
  return typeof c === "string" ? [c] : (c || []).map((p) => p.text || "")
}
const isChat = (protocol) => protocol === "chat"

function render(body, protocol) {
  if (isChat(protocol)) {
    return partsOf(body)
      .map((t, i) => `<!-- part ${i} ${t.length} chars -->\n\n${t}`)
      .join("\n\n") + "\n"
  }
  return blocksOf(body)
    .map((b, i) => `<!-- block ${i} ${b.cache_control ? JSON.stringify(b.cache_control) : ""} ${(b.text || "").length} chars -->\n\n${b.text || ""}`)
    .join("\n\n") + "\n"
}

// 官方正文 = 剥掉人设块（chat 里人设是拼进去的同一段文本，直接按字面剔除）。
function officialText(body, protocol, rules) {
  const personas = (rules.prependBlocks || []).map((b) => b.text).filter(Boolean)
  let text = isChat(protocol) ? partsOf(body).join("\n") : blocksOf(body).map((b) => b.text || "").join("\n")
  for (const p of personas) text = text.split(p).join("")
  if (!isChat(protocol)) {
    text = text.split("\n").filter((line, i, all) => !(i === 0 && /^x-anthropic-billing-header/.test(line))).join("\n")
  }
  return text.replace(/\n{3,}/g, "\n\n").trim() + "\n"
}

function sideMessages(body) {
  const parts = []
  for (const [i, m] of (body.messages || []).entries()) {
    const c = m.content
    const t = typeof c === "string" ? c : (c || []).map((p) => p.text || "").join("\n")
    parts.push(`<!-- messages[${i}] role=${m.role} ${t.length} chars -->\n\n${t}`)
  }
  return parts.join("\n\n") + "\n"
}

function sideTools(body) {
  return (body.tools || [])
    .map((t) => `<!-- tool ${t.name || (t.function && t.function.name) || "?"} -->\n\n${t.description || (t.function && t.function.description) || ""}`)
    .join("\n\n") + "\n"
}

function writeDiff(a, b, out) {
  let text = ""
  try {
    text = execFileSync("diff", ["-u", a, b], { encoding: "utf8" })
  } catch (e) {
    // diff 有差异时退出码 1，stdout 才是要的内容。
    text = e.stdout || ""
  }
  fs.writeFileSync(out, text)
  return text.split("\n").length
}

function runAgent(agent) {
  const spec = AGENTS[agent]
  const rules = JSON.parse(fs.readFileSync(RULES_FILE, "utf8"))
  const before = spec.body(spec.sample)
  const after = clone(before)
  onRequest(after, { protocol: spec.protocol, agent, options: rules })
  const dir = path.join(DIFF_DIR, agent)
  fs.mkdirSync(dir, { recursive: true })

  fs.writeFileSync(`${dir}/before-system.md`, render(before, spec.protocol))
  fs.writeFileSync(`${dir}/after-system.md`, render(after, spec.protocol))
  fs.writeFileSync(`${dir}/before-official.md`, officialText(before, spec.protocol, rules))
  fs.writeFileSync(`${dir}/after-official.md`, officialText(after, spec.protocol, rules))

  const lines = []
  lines.push(`system.diff       ${writeDiff(`${dir}/before-system.md`, `${dir}/after-system.md`, `${dir}/system.diff`)} 行`)
  lines.push(`official.diff     ${writeDiff(`${dir}/before-official.md`, `${dir}/after-official.md`, `${dir}/official.diff`)} 行`)

  // pi 的 system message 就是第 0 条，单独再抄一份 messages 只会自我重复。
  if (!isChat(spec.protocol)) {
    fs.writeFileSync(`${dir}/before-messages.md`, sideMessages(before))
    fs.writeFileSync(`${dir}/after-messages.md`, sideMessages(after))
    lines.push(`messages.diff     ${writeDiff(`${dir}/before-messages.md`, `${dir}/after-messages.md`, `${dir}/messages.diff`)} 行`)
  }

  if ((before.tools || []).length) {
    fs.writeFileSync(`${dir}/before-tools.md`, sideTools(before))
    fs.writeFileSync(`${dir}/after-tools.md`, sideTools(after))
    lines.push(`tools.diff        ${writeDiff(`${dir}/before-tools.md`, `${dir}/after-tools.md`, `${dir}/tools.diff`)} 行（${before.tools.length} 个工具）`)
  } else {
    lines.push("tools            样本无 tools 数组，跳过")
  }

  const beforeSys = isChat(spec.protocol) ? partsOf(before).join("\n") : blocksOf(before).map((b) => b.text || "").join("\n")
  const afterSys = isChat(spec.protocol) ? partsOf(after).join("\n") : blocksOf(after).map((b) => b.text || "").join("\n")
  console.log(`\n[${agent}] ${spec.protocol}  ${path.relative(ROOT, spec.sample)}`)
  console.log(`  system ${beforeSys.length} → ${afterSys.length} 字符`)
  console.log(`  official ${officialText(before, spec.protocol, rules).trim().length} → ${officialText(after, spec.protocol, rules).trim().length} 字符`)
  for (const l of lines) console.log(`  ${l}`)
}

for (const agent of which === "both" ? ["claude", "pi"] : [which]) runAgent(agent)
console.log("\nnext: node scripts/check-docs.mjs")
