// 文档一致性检查：把 CONVENTIONS.md 里能机检的条款变成断言。
// 用法：node check-docs.mjs
// 只看文本，不跑网关，不读 .gitignore 之外的东西（git 缺席时跳过覆盖检查）。
import fs from "node:fs"
import { execFileSync } from "node:child_process"

const DOCS = ["README.md", "CLAUDE.md", "CONVENTIONS.md", "WORKFLOW.md", "diff/README.md"]
const problems = []
const notes = []

const read = (f) => fs.readFileSync(f, "utf8")
const exists = (f) => {
  try { fs.accessSync(f); return true } catch { return false }
}

// 仓库里所有 .mjs 的 basename，用来判断文档里的命令有没有指向不存在的脚本。
function scriptNames() {
  const out = new Set()
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".git")) continue
      const p = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(p)
      else if (entry.name.endsWith(".mjs")) out.add(entry.name)
    }
  }
  walk(".")
  return out
}

const scripts = scriptNames()
const docs = Object.fromEntries(DOCS.map((f) => [f, read(f)]))

// ── 1. 文档里的 node 命令必须指向存在的脚本 ────────────────────────────────
for (const [file, text] of Object.entries(docs)) {
  for (const m of text.matchAll(/node\s+([\w./~-]+\.mjs)/g)) {
    const base = m[1].split("/").pop()
    if (!scripts.has(base)) problems.push(`${file}: node ${m[1]} —— 仓库里没有这个脚本`)
  }
}

// ── 2. magpie 插件名只有 system-prune 或它的目录路径 ──────────────────────
for (const [file, text] of Object.entries(docs)) {
  for (const m of text.matchAll(/magpie\s+plugin\s+(?:add|on|off|options|rm)\s+([^\s'"]+)/g)) {
    const name = (m[1].match(/^[`'"]*([\w./~:-]+)/) || [, m[1]])[1]
    const ok = name === "system-prune" || name.endsWith("/system-prune")
    if (!ok) problems.push(`${file}: magpie plugin 用了 "${name}" —— 插件标识是 system-prune`)
  }
}

// ── 3. 两份文件表逐字相同 ───────────────────────────────────────────────
function fileTable(text) {
  const m = text.match(/\| 文件 \| 角色 \|\n\|---\|---\|\n(?:^\|.*\n)+/m)
  return m ? m[0] : ""
}
const tableReadme = fileTable(docs["README.md"])
const tableClaude = fileTable(docs["CLAUDE.md"])
if (!tableReadme) problems.push("README.md: 找不到「文件」表")
if (!tableClaude) problems.push("CLAUDE.md: 找不到「文件」表")
if (tableReadme && tableClaude && tableReadme !== tableClaude) {
  problems.push("README.md 与 CLAUDE.md 的文件表不一致 —— 两张表要逐字相同")
}

// ── 4. 文件表覆盖所有已跟踪的顶层文件 ──────────────────────────────────
const EXEMPT = new Set(["README.md", "CLAUDE.md", "CONVENTIONS.md", "WORKFLOW.md", "package.json", ".gitignore"])
let tracked = []
try {
  tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean)
} catch {
  notes.push("git 不可用，跳过文件表覆盖检查")
}
if (tracked.length) {
  const top = tracked.filter((f) => !f.includes("/"))
  for (const f of top) {
    if (EXEMPT.has(f)) continue
    if (!tableReadme.includes(f)) problems.push(`README.md 文件表漏了已入库文件 ${f}`)
    if (tableClaude && !tableClaude.includes(f)) problems.push(`CLAUDE.md 文件表漏了已入库文件 ${f}`)
  }
  // 表里点名、但仓库里不存在的路径（本地文件除外）也算漂了。
  for (const m of tableReadme.matchAll(/`([\w./-]+\.(?:mjs|js|json|md|txt|jsonl))`/g)) {
    const f = m[1]
    if (exists(f)) continue
    if (tracked.includes(f)) continue
    notes.push(`文件表里的 ${f} 不在仓库里（本地文件请注明「本地」）`)
  }
}

// ── 5. 单测条数与 test.mjs 的实际用例数一致 ────────────────────────────
const caseCount = (read("test.mjs").match(/^\/\/ (\d+)\. /gm) || []).length
for (const file of ["README.md", "CLAUDE.md", "CONVENTIONS.md"]) {
  for (const m of docs[file].matchAll(/(\d+)\s*条(?:中间件行为)?单测/g)) {
    if (Number(m[1]) !== caseCount) {
      problems.push(`${file}: 写了 ${m[1]} 条单测，test.mjs 实际 ${caseCount} 条`)
    }
  }
}

// ── 6. probe.mjs 的子命令必须与代码里的 switch 一致 ────────────────────
const probeCmds = new Set((read("probe.mjs").match(/cmd === "([a-z-]+)"/g) || [])
  .map((s) => s.replace(/cmd === "|"/g, "")))
for (const [file, text] of Object.entries(docs)) {
  for (const m of text.matchAll(/probe\.mjs\s+([a-z-]+)/g)) {
    if (!probeCmds.has(m[1])) {
      problems.push(`${file}: probe.mjs 没有子命令 "${m[1]}"（有：${[...probeCmds].join(", ")}）`)
    }
  }
  // 文件表里那一串反引号子命令
  const listed = text.match(/探针 CLI：(.+?)，/)
  if (listed) {
    for (const m of listed[1].matchAll(/`([a-z-]+)`/g)) {
      if (!probeCmds.has(m[1])) problems.push(`${file}: 探针 CLI 列出的 "${m[1]}" 代码里不存在`)
    }
  }
}

// ── 结论 ────────────────────────────────────────────────────────────────
for (const n of notes) console.log(`  note ${n}`)
if (problems.length) {
  console.log(`! 文档与代码不一致 ${problems.length} 处`)
  for (const p of problems) console.log(`  - ${p}`)
  process.exitCode = 1
} else {
  console.log("check-docs: 文档与代码一致")
}
