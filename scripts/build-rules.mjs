// 生成 rules/rules.json，并把 prompt 烤进中间件本体。
//   rules/rules.json            —— 离线完整规则集（人设 + 全部规则块），给 verify / dump-diff 用
//   rules/persona.payload.json  —— middleware-system-prompt 格式的人设载荷（备用）
//   src/system-prune.middleware.js 的 >>> baked-rules 块 —— 名单 + 开关 + 人设块 + 规则块
//
// 人设与规则共享，不按 agent 区分；运行时只插一份规则，由 ruleFiles 选。
// 用法：node scripts/build-rules.mjs [--with-prompt]
import fs from "node:fs"
import path from "node:path"
import { ENABLED_AGENTS, MIDDLEWARE, OFFICIAL, PERSONA_PAYLOAD, PROMPT_DIR, RULES_FILE, SWITCHES } from "./paths.mjs"

const argv = process.argv.slice(2)
const withPrompt = argv.includes("--with-prompt")

// 人设与规则分文件：persona*.md 一份（## Routing 之前），rules*.md 任意多份（之后）。
// 新规则直接加一个 rules.<主题>.md，build 按文件名排序烤成独立块。
const personaFiles = fs.readdirSync(PROMPT_DIR).filter((name) => /^persona.*\.md$/.test(name))
if (personaFiles.length !== 1) throw new Error(`prompt/ 下应当恰好有一份 persona*.md，实际 ${personaFiles.length} 份`)
const personaSource = fs.readFileSync(path.join(PROMPT_DIR, personaFiles[0]), "utf8").trim()
const personaBlock = { text: personaSource, cache: true, ttl: "1h" }

const ruleFiles = fs.readdirSync(PROMPT_DIR).filter((name) => /^rules.*\.md$/.test(name)).sort((a, b) => a.localeCompare(b))
if (!ruleFiles.length) throw new Error("prompt/ 下没有 rules*.md")
const ruleBlocks = ruleFiles.map((name) => ({
  id: name.replace(/\.md$/, ""),
  text: fs.readFileSync(path.join(PROMPT_DIR, name), "utf8").trim(),
  cache: true,
  ttl: "1h",
}))

// 官方 prompt 的增删改文本全在 config/official.json，这里只读，不再内联。
// 只处理这些冲突点；Environment 也在这张表里，运行时不删段、不切区间。
const official = JSON.parse(fs.readFileSync(OFFICIAL, "utf8"))
const officialDropBlocks = official.dropBlocks
const officialDropLines = official.dropLines
const officialReplacements = official.replacements

// 离线完整规则集：人设 + 全部规则块。ruleFiles 置空，避免运行时再叠一份烤入规则。
const fullRules = {
  persona: true,
  ruleFiles: "",
  official: true,
  officialDropBlocks,
  officialDropLines,
  officialReplacements,
  prependBlocks: withPrompt ? [personaBlock, ...ruleBlocks.map(({ id, ...block }) => block)] : [],
  appendBlocks: [],
}
fs.writeFileSync(RULES_FILE, `${JSON.stringify(fullRules, null, 2)}\n`)
fs.writeFileSync(PERSONA_PAYLOAD, `${JSON.stringify({ agents: ["claude"], override: true, position: "prepend", system_prompt: personaSource }, null, 2)}\n`)

// agents 是开关，不是排除表：名单里没有的 agent 一个字节都不动；空名单 = 谁都不动。
let enabled = []
try {
  enabled = JSON.parse(fs.readFileSync(ENABLED_AGENTS, "utf8"))
} catch {
  console.log("[warn] 读不到 config/enabled-agents.json，按空名单（谁都改不了）")
}
if (!Array.isArray(enabled)) enabled = []
enabled = enabled.filter((name) => typeof name === "string" && name)

// 两个开关的持久值存在 config/switches.json，build 时烤进 baked 顶层。
// options 里同名键只当临时覆盖；app 重启回写 plugins.json 也不会改掉这里的默认。
const ruleIds = ["", ...ruleBlocks.map((b) => b.id)]
let switches = { persona: true, official: true, ruleFiles: "rules.deepseek.2" }
try {
  const raw = JSON.parse(fs.readFileSync(SWITCHES, "utf8"))
  if (typeof raw.persona === "boolean") switches.persona = raw.persona
  if (typeof raw.official === "boolean") switches.official = raw.official
  if (typeof raw.ruleFiles === "string" && ruleIds.includes(raw.ruleFiles)) switches.ruleFiles = raw.ruleFiles
} catch {
  console.log("[warn] 读不到 config/switches.json，按 persona=true / official=true / ruleFiles=\"rules.deepseek.2\"")
}

const baked = {
  agents: enabled,
  persona: switches.persona,
  official: switches.official,
  ruleFiles: switches.ruleFiles,
  officialDropBlocks,
  officialDropLines,
  officialReplacements,
  prependBlocks: withPrompt ? [personaBlock] : [],
  ruleBlocks: withPrompt ? ruleBlocks : [],
  debug: false,
}

// 把规则烤进中间件本体：magpie app 重启时会用内存状态回写 plugins.json，CLI 设的 options 会被冲掉。
// 文件是唯一真源，options 只当临时覆盖。
if (withPrompt) {
  const src = fs.readFileSync(MIDDLEWARE, "utf8")
  const block = `// >>> baked-rules (由 build-rules.mjs 生成，别手改)\nconst BAKED_RULES = ${JSON.stringify(baked, null, 2)}\n// <<< baked-rules`
  const re = /\/\/ >>> baked-rules[\s\S]*?\/\/ <<< baked-rules/
  if (!re.test(src)) throw new Error("中间件里找不到 baked-rules 标记，别继续")
  fs.writeFileSync(MIDDLEWARE, src.replace(re, () => block))
}

console.log(`rules -> rules/rules.json   人设 ${personaSource.length} 字   规则块 ${ruleBlocks.length} 份`)
console.log(`agents -> ${enabled.length ? enabled.join(", ") : "（空：谁都不改）"}`)
console.log(`switches -> persona=${switches.persona ? "on" : "off"} official=${switches.official ? "on" : "off"} ruleFiles=${JSON.stringify(switches.ruleFiles)}（config/switches.json）`)
console.log(`rule files -> ${ruleFiles.join(", ")}`)
