// A/B v2：工具选择 + 回复质量 + 缓存命中，每个用例跑 N 次。
// 用法：node ab-test.mjs [claude|pi|both] [--runs=5]
// 每轮临时把插件 options 的 agents 名单清空（等于关掉中间件），跑完恢复。别在别的会话忙的时候跑。
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const arg = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "both"
const RUNS = Number((process.argv.find((a) => a.startsWith("--runs=")) || "").split("=")[1] || 3)
const WORK = "/tmp/ab-cases"

const CASES = [
  {
    id: "read",
    prompt: "读 a.txt 的第一行，只回答内容",
    accept: ["Read", "read"],
    check: (res) => res.text.includes("第一行内容"),
  },
  {
    id: "edit",
    prompt: "把 c.txt 里的 foo 改成 bar，改完只回一句 done",
    accept: ["Edit", "edit", "Write", "write", "Bash", "bash"],
    check: () => fs.readFileSync(path.join(WORK, "c.txt"), "utf8").includes("bar"),
  },
  {
    id: "bash",
    prompt: "运行 python3 -c 'print(2+2)' 并贴出输出",
    accept: ["Bash", "bash"],
    check: (res) => /(^|[^\d])4([^\d]|$)/.test(res.text),
  },
  {
    id: "search",
    prompt: "在这个目录里找出所有包含 TODO 的文件名，列出文件名即可",
    accept: ["Grep", "grep", "Glob", "glob", "Bash", "bash", "ls", "find"],
    check: (res) => res.text.includes("d.md"),
  },
]

// 风格：第一行 `汐: (表情) 复述`，第二行是不超过 24 字的开场白。
const STYLE = /^汐\s*[:：]\s*[（(][^）)]{1,12}[）)]\s*\S.{0,40}\n+[^\n]{1,40}/

function fixtures() {
  fs.rmSync(WORK, { recursive: true, force: true })
  fs.mkdirSync(WORK, { recursive: true })
  fs.writeFileSync(path.join(WORK, "a.txt"), "第一行内容\n第二行\n")
  fs.writeFileSync(path.join(WORK, "c.txt"), "foo = 1\nkeep\n")
  fs.writeFileSync(path.join(WORK, "d.md"), "TODO: 改这里\n")
  fs.writeFileSync(path.join(WORK, "e.txt"), "nothing here\n")
}

// 网关里注册的 key 是安装时的绝对路径，不是文件名。
function pluginKey() {
  try {
    const j = JSON.parse(execFileSync("magpie", ["plugin", "list", "--json"], { encoding: "utf8" }))
    const keys = Object.keys(j.middleware || {})
    if (keys.length) return keys[0]
  } catch {}
  return process.cwd()
}

const PLUGIN = pluginKey()

function getOptions() {
  return JSON.parse(execFileSync("magpie", ["plugin", "options", PLUGIN], { encoding: "utf8" }))
}

// 用数组参数传 JSON：规则文本里有单引号（Anthropic's、can't），拼 shell 字符串会被撕开。
function setAgents(list) {
  execFileSync("magpie", ["plugin", "options", PLUGIN, JSON.stringify({ ...getOptions(), agents: list })], { stdio: "ignore" })
}

function usageOf(u) {
  const cache = u.cache_read_input_tokens ?? u.cacheRead ?? u.cached_tokens ?? 0
  const input = u.input_tokens ?? u.input ?? 0
  const output = u.output_tokens ?? u.output ?? 0
  return { input, cache, output }
}

function runClaude(task) {
  const t0 = Date.now()
  const out = execFileSync(
    "claude",
    ["-p", task, "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions"],
    { cwd: WORK, encoding: "utf8", timeout: 240000, stdio: ["ignore", "pipe", "ignore"] },
  )
  const res = { tools: [], text: "", usage: { input: 0, cache: 0, output: 0 } }
  for (const line of out.split("\n")) {
    const t = line.trim()
    if (!t.startsWith("{")) continue
    let e
    try { e = JSON.parse(t) } catch { continue }
    for (const b of (e.message && e.message.content) || []) {
      if (b && b.type === "tool_use") res.tools.push(b.name)
    }
    if (e.type === "result") {
      res.text = e.result || ""
      if (e.usage) res.usage = usageOf(e.usage)
    }
  }
  res.sec = (Date.now() - t0) / 1000
  return res
}

function runPi(task) {
  const t0 = Date.now()
  const out = execFileSync("pi", ["-p", task, "--mode", "json", "--no-session"], {
    cwd: WORK, encoding: "utf8", timeout: 240000, stdio: ["ignore", "pipe", "ignore"],
  })
  const res = { tools: [], text: "", usage: { input: 0, cache: 0, output: 0 } }
  for (const line of out.split("\n")) {
    const t = line.trim()
    if (!t.startsWith("{")) continue
    let e
    try { e = JSON.parse(t) } catch { continue }
    const msg = e.message || {}
    if (msg.role === "toolResult" && msg.toolName) res.tools.push(msg.toolName)
    for (const b of Array.isArray(msg.content) ? msg.content : []) {
      if (b && b.type === "toolCall" && b.name) res.tools.push(b.name)
      if (b && b.type === "text" && msg.role === "assistant") res.text = b.text
    }
    if (msg.role === "assistant" && msg.usage) res.usage = usageOf(msg.usage)
  }
  res.sec = (Date.now() - t0) / 1000
  return res
}

const RUNNER = { claude: runClaude, pi: runPi }
const targets = arg === "both" ? ["claude", "pi"] : [arg]
const rows = []
const baseline = getOptions()

try {
  for (const arm of ["on", "off"]) {
    setAgents(arm === "on" ? ["claude", "pi"] : [])
    for (const agent of targets) {
      for (const c of CASES) {
        for (let i = 0; i < RUNS; i++) {
          fixtures()
          let res = { tools: [], text: "", usage: { input: 0, cache: 0, output: 0 }, sec: 0 }
          try { res = RUNNER[agent](c.prompt) } catch (e) { res.text = `(error: ${String(e.message).slice(0, 30)})` }
          // 首个工具 vs 任一命中：模型常先 ls 或 cat 摸一下，再上专用工具。
          // 记两个：先手对（严格）与最终用到对口工具（宽松）。
          const toolFirst = c.accept.includes(res.tools[0])
          const toolAny = res.tools.some((t) => c.accept.includes(t))
          const doneOk = (() => { try { return c.check(res) } catch { return false } })()
          const styleOk = STYLE.test(res.text)
          rows.push({ arm, agent, case: c.id, run: i + 1, tools: res.tools, tool: res.tools[0] || "-", toolFirst, toolAny, doneOk, styleOk, ...res.usage, sec: +res.sec.toFixed(1) })
          console.log(`${arm.padEnd(3)} ${agent.padEnd(6)} ${c.id.padEnd(6)} #${i + 1} tools=${res.tools.join(">") || "-"} ${toolAny ? "T" : "t"}${doneOk ? "D" : "d"}${styleOk ? "S" : "s"} cache=${res.usage.cache} in=${res.usage.input} ${res.sec.toFixed(1)}s`)
        }
      }
    }
  }
} finally {
  execFileSync("magpie", ["plugin", "options", PLUGIN, JSON.stringify(baseline)], { stdio: "ignore" })
}

fs.writeFileSync("/tmp/ab-results.json", JSON.stringify(rows, null, 2))

console.log("\n=== 汇总（T=首工具对 D=任务完成 S=风格合规）===")
const pct = (n, d) => `${n}/${d}`
for (const agent of targets) {
  for (const arm of ["on", "off"]) {
    const rs = rows.filter((r) => r.agent === agent && r.arm === arm)
    if (!rs.length) continue
    const T = rs.filter((r) => r.toolAny).length
    const D = rs.filter((r) => r.doneOk).length
    const S = rs.filter((r) => r.styleOk).length
    const sec = rs.reduce((a, r) => a + r.sec, 0) / rs.length
    const inTok = Math.round(rs.reduce((a, r) => a + r.input, 0) / rs.length)
    const cacheTok = Math.round(rs.reduce((a, r) => a + r.cache, 0) / rs.length)
    console.log(`${agent.padEnd(6)} ${arm.padEnd(3)} 工具 ${pct(T, rs.length)}  完成 ${pct(D, rs.length)}  风格 ${pct(S, rs.length)}  平均 ${sec.toFixed(1)}s  input≈${inTok} cache≈${cacheTok}`)
  }
}

console.log("\n=== 缓存：每个用例第 1 次 vs 第 2 次起 ===")
for (const agent of targets) {
  for (const arm of ["on", "off"]) {
    for (const c of CASES) {
      const rs = rows.filter((r) => r.agent === agent && r.arm === arm && r.case === c.id)
      if (!rs.length) continue
      const first = rs[0]
      const rest = rs.slice(1)
      const restCache = rest.length ? Math.round(rest.reduce((a, r) => a + r.cache, 0) / rest.length) : 0
      console.log(`${agent.padEnd(6)} ${arm.padEnd(3)} ${c.id.padEnd(6)} 首次 cache=${first.cache} in=${first.input}   后续 cache≈${restCache}`)
    }
  }
}
