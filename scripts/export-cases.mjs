// 导出开关组合对照：persona × official × ruleFiles = 12 种，claude / pi 各一套。
// 每个场景都真实跑一遍 onRequest，产物是 before/after 与 diff -u。
// 用法：node scripts/export-cases.mjs [输出目录]   默认 docs/cases
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { onRequest } from "../src/system-prune.middleware.js"
import { CASES_DIR, ROOT, RULES_FILE, SAMPLES } from "./paths.mjs"

const OUT = path.resolve(process.argv[2] || CASES_DIR)
const rules = JSON.parse(fs.readFileSync(RULES_FILE, "utf8"))
const injectedTexts = (rules.prependBlocks || []).map((b) => b.text).filter(Boolean)

const clone = (x) => JSON.parse(JSON.stringify(x))
const blocksOf = (body) => (Array.isArray(body.system) ? body.system : [{ text: String(body.system || "") }])
const partsOf = (body) => {
  const c = body.messages && body.messages[0] ? body.messages[0].content : ""
  return typeof c === "string" ? [c] : (c || []).map((p) => p.text || "")
}
const isChat = (protocol) => protocol === "chat"

const AGENTS = {
  claude: {
    protocol: "anthropic",
    body: () => JSON.parse(fs.readFileSync(SAMPLES.main, "utf8")),
  },
  pi: {
    protocol: "chat",
    body: () => ({
      model: "pi",
      messages: [{ role: "system", content: fs.readFileSync(SAMPLES.pi, "utf8") }, { role: "user", content: "hi" }],
    }),
  },
}

function renderSystem(body, protocol) {
  if (isChat(protocol)) {
    return partsOf(body).map((t, i) => `<!-- part ${i} ${t.length} chars -->\n\n${t}`).join("\n\n") + "\n"
  }
  return blocksOf(body)
    .map((b, i) => `<!-- block ${i} ${b.cache_control ? JSON.stringify(b.cache_control) : ""} ${(b.text || "").length} chars -->\n\n${b.text || ""}`)
    .join("\n\n") + "\n"
}

// 官方正文 = 剥掉人设与规则块；chat 下 system 就是 messages[0]，直接按字面剔除。
function officialText(body, protocol) {
  let text = isChat(protocol) ? partsOf(body).join("\n") : blocksOf(body).map((b) => b.text || "").join("\n")
  for (const p of injectedTexts) text = text.split(p).join("")
  if (!isChat(protocol)) {
    text = text.split("\n").filter((line, i) => !(i === 0 && /^x-anthropic-billing-header/.test(line))).join("\n")
  }
  return text.replace(/\n{3,}/g, "\n\n").trim() + "\n"
}

function sideMessages(body) {
  return (body.messages || []).map((m, i) => {
    const c = m.content
    const t = typeof c === "string" ? c : (c || []).map((p) => p.text || "").join("\n")
    return `<!-- messages[${i}] role=${m.role} ${t.length} chars -->\n\n${t}`
  }).join("\n\n") + "\n"
}

function sideTools(body) {
  return (body.tools || []).map((t) => {
    const name = t.name || (t.function && t.function.name) || "?"
    return `<!-- tool ${name} -->\n\n${t.description || (t.function && t.function.description) || ""}`
  }).join("\n\n") + "\n"
}

function writeDiff(a, b, out) {
  let text = ""
  try {
    text = execFileSync("diff", ["-u", a, b], { encoding: "utf8" })
  } catch (e) {
    text = e.stdout || ""
  }
  fs.writeFileSync(out, text)
  return text ? text.split("\n").length - 1 : 0
}

const scenarios = []
for (const persona of [true, false]) {
  for (const official of [true, false]) {
    for (const ruleFiles of ["", "rules.deepseek.1", "rules.deepseek.2"]) {
      scenarios.push({
        id: `p${persona ? 1 : 0}-o${official ? 1 : 0}-r${ruleFiles ? ruleFiles.split(".").pop() : 0}`,
        persona,
        official,
        ruleFiles,
      })
    }
  }
}

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })
const index = [
  "# system-prune 开关组合导出",
  "",
  "样本：claude = `samples/interactive-main.request.json`；pi = `samples/pi-native.system.txt`。",
  "每格都是拿当时的请求跑一遍 `onRequest`，不是手写的示意。",
  "",
  `重新生成：\`node scripts/export-cases.mjs\`（默认写到 \`docs/cases/\`）。`,
  "",
  "| 场景 | persona | official | ruleFiles | system 字符 | official 字符 | system.diff | official.diff | messages.diff | tools.diff |",
  "|---|---|---|---|---|---|---|---|---|---|",
]

for (const [agent, spec] of Object.entries(AGENTS)) {
  const agentDir = path.join(OUT, agent)
  fs.mkdirSync(agentDir, { recursive: true })
  const before = spec.body()
  const beforeDir = path.join(agentDir, "before")
  fs.mkdirSync(beforeDir, { recursive: true })
  fs.writeFileSync(path.join(beforeDir, "system.md"), renderSystem(before, spec.protocol))
  fs.writeFileSync(path.join(beforeDir, "official.md"), officialText(before, spec.protocol))
  if (!isChat(spec.protocol)) fs.writeFileSync(path.join(beforeDir, "messages.md"), sideMessages(before))
  fs.writeFileSync(path.join(beforeDir, "tools.md"), sideTools(before))

  for (const sc of scenarios) {
    const after = clone(before)
    const options = { agents: ["claude", "pi"], persona: sc.persona, official: sc.official, ruleFiles: sc.ruleFiles }
    onRequest(after, { protocol: spec.protocol, agent, options })
    const dir = path.join(agentDir, sc.id)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "options.json"), JSON.stringify(options, null, 2) + "\n")
    fs.writeFileSync(path.join(dir, "system.md"), renderSystem(after, spec.protocol))
    fs.writeFileSync(path.join(dir, "official.md"), officialText(after, spec.protocol))
    if (!isChat(spec.protocol)) fs.writeFileSync(path.join(dir, "messages.md"), sideMessages(after))
    fs.writeFileSync(path.join(dir, "tools.md"), sideTools(after))

    const sysDiff = writeDiff(path.join(beforeDir, "system.md"), path.join(dir, "system.md"), path.join(dir, "system.diff"))
    const offDiff = writeDiff(path.join(beforeDir, "official.md"), path.join(dir, "official.md"), path.join(dir, "official.diff"))
    const msgDiff = isChat(spec.protocol)
      ? "-"
      : writeDiff(path.join(beforeDir, "messages.md"), path.join(dir, "messages.md"), path.join(dir, "messages.diff"))
    const toolDiff = writeDiff(path.join(beforeDir, "tools.md"), path.join(dir, "tools.md"), path.join(dir, "tools.diff"))

    const beforeSys = isChat(spec.protocol) ? partsOf(before).join("\n") : blocksOf(before).map((b) => b.text || "").join("\n")
    const afterSys = isChat(spec.protocol) ? partsOf(after).join("\n") : blocksOf(after).map((b) => b.text || "").join("\n")
    const beforeOff = officialText(before, spec.protocol).trim().length
    const afterOff = officialText(after, spec.protocol).trim().length

    index.push(`| [${agent}/${sc.id}](${agent}/${sc.id}/system.diff) | ${sc.persona} | ${sc.official} | \`${sc.ruleFiles || '""'}\` | ${beforeSys.length} → ${afterSys.length} | ${beforeOff} → ${afterOff} | ${sysDiff} | ${offDiff} | ${msgDiff} | ${toolDiff} |`)
  }
}

fs.writeFileSync(path.join(OUT, "index.md"), index.join("\n") + "\n")
fs.writeFileSync(path.join(OUT, "cases.json"), JSON.stringify(scenarios, null, 2) + "\n")
console.log(`${path.relative(ROOT, OUT)}  ${scenarios.length} 种组合 × ${Object.keys(AGENTS).length} 个 agent`)
