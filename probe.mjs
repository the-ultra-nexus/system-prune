// 探针：删掉 system 里 Artifact `edits` 段之后，模型行为有没有变。
// 用法：
//   node probe.mjs plan
//   node probe.mjs selfcheck
//   node probe.mjs build [--arms A,B,E] [--probes P1,P2,P3,P4] [--out /tmp/probe/requests]
//   node probe.mjs run   [--arms A,B,E] [--probes P1,P2] [--runs 5] [--randomize] [--gateway override|direct]
//   node probe.mjs score [--in /tmp/probe/runs.jsonl]
// A = 现状（段被切）；B = 原文按原位插回；E = A 再把工具描述/schema/人设里的三份同义说明压掉（灵敏度对照）。
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { execFileSync } from "node:child_process"
import { onRequest } from "./system-prune.middleware.js"
import { PROBES, fixtures } from "./probe-cases.mjs"
import { wilson, diffCI, fisher, holm } from "./probe-stats.mjs"

const RAW_FILE = "interactive-main.request.json"
const RAW = JSON.parse(fs.readFileSync(RAW_FILE, "utf8"))

const argv = process.argv.slice(2)
const cmd = argv[0] || "plan"
const opt = (name, def) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  if (hit) return hit.slice(name.length + 3)
  const at = argv.indexOf(`--${name}`)
  if (at !== -1 && argv[at + 1] && !argv[at + 1].startsWith("--")) return argv[at + 1]
  return def
}
const flag = (name) => argv.includes(`--${name}`)
const list = (name, def) => (opt(name, def) || "").split(",").filter(Boolean)

const ARMS = list("arms", "A,B,E")
const PROBE_IDS = list("probes", "P1,P2,P3,P4")
const RUNS = Number(opt("runs", "5"))
const OFFSET = Number(opt("offset", "0"))
const MODEL = opt("model", "hw/group/group")
const OUT = opt("out", "/tmp/probe/runs.jsonl")
const REQUESTS = opt("requests", "/tmp/probe/requests")
const GATEWAY = opt("gateway", "override")
const BASE_URL = opt("base-url", process.env.ANTHROPIC_BASE_URL || "http://127.0.0.1:3425")
const MAX_CALLS = Number(opt("max-calls", "400"))

// ---------- 臂构造 ----------

const SEG_START = "To make a small change to a page you already published"
const SEG_END = "you can't place the change exactly from it."
const DUP_START = "For a small change to a page published from a file in this conversation"
const DUP_END = "or the change cannot be placed exactly from that text."

function clone(x) {
  return structuredClone(x)
}

// A：现网形状。B：只把 cuts 置空，段留在原位。两者只差这一段。
function baseArms() {
  const A = clone(RAW)
  onRequest(A, { protocol: "anthropic", agent: "claude", options: {} })
  const B = clone(RAW)
  onRequest(B, { protocol: "anthropic", agent: "claude", options: { cuts: [] } })
  return { A, B }
}

function systemText(body) {
  return body.system.map((b) => b.text || "").join("\n")
}

// E：在 A 上再压掉工具描述、edits schema、人设里三份同义说明。
function armE(A, notes) {
  const E = clone(A)
  const art = E.tools.find((t) => t.name === "Artifact")
  const i = art.description.indexOf(DUP_START)
  const j = art.description.indexOf(DUP_END)
  if (i !== -1 && j > i) {
    art.description = art.description.slice(0, i) + art.description.slice(j + DUP_END.length)
  } else {
    notes.push("E: 工具描述锚点未命中")
  }
  const schema = art.input_schema?.properties?.edits
  if (schema && typeof schema.description === "string") schema.description = "pairs to apply in this publish"
  else notes.push("E: edits schema 未命中")
  const persona = E.system.find((b) => typeof b.text === "string" && b.text.includes("改已发布的 Artifact"))
  if (persona) {
    persona.text = persona.text
      .split("\n")
      .filter((line) => !line.startsWith("- 改已发布的 Artifact"))
      .join("\n")
  } else {
    notes.push("E: 人设行未命中")
  }
  return E
}

// F：只压掉人设里那条压缩版，其余不动；用来找 E 的下降由哪份说明承担。
function armF(A, notes) {
  const F = clone(A)
  const persona = F.system.find((b) => typeof b.text === "string" && b.text.includes("改已发布的 Artifact"))
  if (persona) {
    persona.text = persona.text
      .split("\n")
      .filter((line) => !line.startsWith("- 改已发布的 Artifact"))
      .join("\n")
  } else {
    notes.push("F: 人设行未命中")
  }
  return F
}

function buildArms() {
  const notes = []
  const { A, B } = baseArms()
  const A2 = A.system.map((b) => b.text || "").join("\n")
  const B2 = B.system.map((b) => b.text || "").join("\n")
  const i = B2.indexOf(SEG_START)
  const j = B2.indexOf(SEG_END, i)
  const seg = i !== -1 && j !== -1 ? B2.slice(i, j + SEG_END.length) : ""
  if (!seg) notes.push("SEG 未找到，B 臂不可用")
  const arms = { A }
  if (seg) arms.B = B
  if (ARMS.includes("E") && seg) arms.E = armE(A, notes)
  if (ARMS.includes("F")) arms.F = armF(A, notes)
  return { arms, seg, notes, A2, B2 }
}

// ---------- selfcheck ----------

function selfcheck() {
  const { arms, seg, notes } = buildArms()
  const problems = [...notes]
  const A = arms.A
  const B = arms.B
  if (!B) problems.push("B 臂缺失")
  else {
    const at = A.system.map((b) => b.text || "")
    const bt = B.system.map((b) => b.text || "")
    if (at.length !== bt.length) problems.push(`system 块数不同 ${at.length} vs ${bt.length}`)
    if (at[0] !== bt[0]) problems.push("block 0 不同")
    if (at[1] !== bt[1]) problems.push("block 1（人设）不同")
    if (at[2] + "\n" + seg !== bt[2] && at[2] + seg !== bt[2]) problems.push("block 2 不是 A + SEG")
    for (let k = 0; k < Math.min(A.system.length, B.system.length); k++) {
      if (JSON.stringify(A.system[k].cache_control) !== JSON.stringify(B.system[k].cache_control)) problems.push(`block ${k} cache_control 不同`)
    }
    if (JSON.stringify(A.tools) !== JSON.stringify(B.tools)) problems.push("tools 不同")
    if (JSON.stringify(A.messages) !== JSON.stringify(B.messages)) problems.push("messages 不同")
    console.log(`SEG 长度: ${seg.length}`)
    console.log(`system 长度: A=${systemText(A).length} B=${systemText(B).length}`)
  }
  if (arms.E) {
    const dropped = systemText(armE(A, []))

    if (dropped.includes(SEG_START)) problems.push("E 仍含 system 段")
  }
  console.log(`臂: ${Object.keys(arms).join(",")}`)
  if (problems.length) {
    console.log("FAIL")
    for (const p of problems) console.log(" -", p)
    process.exitCode = 1
  } else {
    console.log("selfcheck passed")
  }
}

// ---------- build ----------

function canonical(x) {
  if (Array.isArray(x)) return x.map(canonical)
  if (x && typeof x === "object") {
    const out = {}
    for (const k of Object.keys(x).sort()) out[k] = canonical(x[k])
    return out
  }
  return x
}
function hash(x) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(x))).digest("hex").slice(0, 16)
}

function bodyFor(armBody, probeId, run) {
  const body = clone(armBody)
  body.model = MODEL
  body.stream = true
  body.messages = PROBES[probeId].messages()
  body.metadata = { user_id: "probe" }
  return body
}

function build() {
  const { arms, seg, notes } = buildArms()
  fs.mkdirSync(REQUESTS, { recursive: true })
  const manifest = []
  for (const [name, base] of Object.entries(arms)) {
    for (const p of PROBE_IDS) {
      const body = bodyFor(base, p, 1)
      const file = path.join(REQUESTS, `${name}-${p}.json`)
      fs.writeFileSync(file, JSON.stringify(body, null, 2))
      manifest.push({ arm: name, probe: p, file, system: systemText(body).length, hash: hash(body) })
    }
  }
  console.log(`SEG=${seg.length} 请求体已写到 ${REQUESTS}`)
  for (const m of manifest) console.log(`${m.arm} ${m.probe} system=${m.system} hash=${m.hash}`)
  if (notes.length) for (const n of notes) console.log(" -", n)
}

// ---------- 网关旁路 ----------

function pluginKey() {
  const j = JSON.parse(execFileSync("magpie", ["plugin", "list", "--json"], { encoding: "utf8" }))
  const keys = Object.keys(j.middleware || {})
  if (!keys.length) throw new Error("网关里没有注册中间件插件")
  return keys[0]
}

function getOptions(key) {
  return execFileSync("magpie", ["plugin", "options", key], { encoding: "utf8" }).trim()
}

function setOptions(key, value) {
  execFileSync("magpie", ["plugin", "options", key, value], { stdio: "ignore" })
}

function optionsObj(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

const BASELINE_FILE = "/tmp/probe/baseline-options.json"

function readBaseline() {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"))
  } catch {
    return null
  }
}

// app 会用内存状态回写 plugins.json，批次的「原值」可能是上一批没恢复成功的空名单。
// 所以只在当前名单非空时更新基线文件；恢复时优先用文件里那份。
function withBypass(fn) {
  if (GATEWAY !== "override") return fn()
  const key = pluginKey()
  const cur = optionsObj(getOptions(key))
  let base = cur
  if (!Array.isArray(cur.agents) || cur.agents.length === 0) {
    const saved = readBaseline()
    if (saved && Array.isArray(saved.agents) && saved.agents.length) {
      base = saved
      console.log(`[bypass] 当前 options 名单为空，恢复目标取 ${BASELINE_FILE}`)
    }
  } else {
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(cur, null, 2))
  }
  setOptions(key, JSON.stringify({ ...cur, agents: [] }))
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    try {
      setOptions(key, JSON.stringify(base))
      if (!optionsObj(getOptions(key)).agents?.length) {
        setOptions(key, JSON.stringify(base))
        console.error(`恢复后名单仍为空，已重试一次：${JSON.stringify(base)}`)
      }
    } catch (e) {
      console.error(`恢复 options 失败：${e.message}\n应为：${JSON.stringify(base)}`)
    }
  }
  process.on("exit", restore)
  process.on("SIGINT", () => {
    restore()
    process.exit(130)
  })
  return Promise.resolve()
    .then(fn)
    .finally(restore)
}

function bypassOk() {
  if (GATEWAY !== "override") return true
  const o = optionsObj(getOptions(pluginKey()))
  return Array.isArray(o.agents) && o.agents.length === 0
}

// ---------- HTTP ----------

function headers() {
  const token = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || ""
  const h = {
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
    "user-agent": "probe/1.0",
  }
  if (token) {
    h.authorization = `Bearer ${token}`
    h["x-api-key"] = token
  }
  if (Array.isArray(RAW.betas) && RAW.betas.length) h["anthropic-beta"] = RAW.betas.join(",")
  return h
}

async function sse(body) {
  const res = await fetch(`${BASE_URL}/v1/messages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  const ct = res.headers.get("content-type") || ""
  if (!ct.includes("event-stream")) {
    const json = await res.json()
    return normalize(json)
  }
  const out = { id: "", model: "", content: [], stop: "", usage: {}, events: 0 }
  const blocks = []
  let buf = ""
  for await (const chunk of res.body) {
    buf += Buffer.from(chunk).toString("utf8")
    let idx
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      for (const line of raw.split("\n")) {
        if (!line.startsWith("data:")) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === "[DONE]") continue
        let e
        try {
          e = JSON.parse(payload)
        } catch {
          continue
        }
        out.events++
        if (e.type === "message_start") {
          out.id = e.message?.id || ""
          out.model = e.message?.model || ""
          out.usage = { ...(e.message?.usage || {}) }
        } else if (e.type === "content_block_start") {
          blocks[e.index] = { ...e.content_block, _json: "" }
        } else if (e.type === "content_block_delta") {
          const b = blocks[e.index]
          if (!b) continue
          if (e.delta?.type === "input_json_delta") b._json += e.delta.partial_json || ""
          else if (e.delta?.type === "text_delta") b.text = (b.text || "") + (e.delta.text || "")
          else if (e.delta?.type === "thinking_delta") b.thinking = (b.thinking || "") + (e.delta.thinking || "")
        } else if (e.type === "content_block_stop") {
          const b = blocks[e.index]
          if (b && b._json) {
            try {
              b.input = JSON.parse(b._json)
            } catch {
              b.input = { _raw: b._json }
            }
          }
          delete b?._json
        } else if (e.type === "message_delta") {
          if (e.delta?.stop_reason) out.stop = e.delta.stop_reason
          out.usage = { ...out.usage, ...(e.usage || {}) }
        }
      }
    }
  }
  out.content = blocks.filter(Boolean)
  return out
}

function normalize(json) {
  return {
    id: json.id || "",
    model: json.model || "",
    content: json.content || [],
    stop: json.stop_reason || "",
    usage: json.usage || {},
    events: 0,
  }
}

function toolsOf(resp) {
  return resp.content
    .filter((b) => b && b.type === "tool_use")
    .map((b) => ({ name: b.name, input: b.input || {} }))
}

// ---------- run ----------

async function one(armBody, arm, probe, run) {
  const body = bodyFor(armBody, probe, run)
  const t0 = Date.now()
  let resp
  let attempt = 0
  for (;;) {
    try {
      resp = await sse(body)
      break
    } catch (e) {
      attempt++
      const retriable = /HTTP (429|5\d\d)/.test(e.message) || /fetch failed|timeout/i.test(e.message)
      if (!retriable || attempt >= 3) throw e
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
  const tools = toolsOf(resp)
  const metrics = PROBES[probe].score(tools)
  return {
    arm,
    probe,
    run,
    ts: new Date().toISOString(),
    model: body.model,
    served_model: resp.model,
    stop: resp.stop,
    invalid: resp.stop === "max_tokens",
    request_hash: hash(body),
    response_id: resp.id,
    usage: resp.usage,
    latency_ms: Date.now() - t0,
    tools: tools.map((t) => ({
      name: t.name,
      action: t.input?.action,
      file_path: t.input?.file_path,
      edits: Array.isArray(t.input?.edits) ? t.input.edits.length : 0,
    })),
    metrics,
    pass: metrics.pass === true,
  }
}

async function run() {
  const { arms } = buildArms()
  const jobs = []
  for (const arm of ARMS) {
    if (!arms[arm]) throw new Error(`臂 ${arm} 不可用`)
    for (const probe of PROBE_IDS) for (let r = 1; r <= RUNS; r++) jobs.push({ arm, probe, run: OFFSET + r })
  }
  if (flag("randomize")) {
    for (let i = jobs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[jobs[i], jobs[j]] = [jobs[j], jobs[i]]
    }
  } else {
    // 交错：按 run 轮转，A,B,E,A,B,E… 削弱上游漂移。
    jobs.sort((x, y) => x.run - y.run || ARMS.indexOf(x.arm) - ARMS.indexOf(y.arm) || x.probe.localeCompare(y.probe))
  }
  const done = new Set()
  if (flag("resume") && fs.existsSync(OUT)) {
    for (const line of fs.readFileSync(OUT, "utf8").split("\n")) {
      if (!line.trim()) continue
      try {
        const row = JSON.parse(line)
        done.add(`${row.arm}|${row.probe}|${row.run}`)
      } catch {}
    }
  }
  fixtures(fs)
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  const todo = jobs.filter((j) => !done.has(`${j.arm}|${j.probe}|${j.run}`)).slice(0, MAX_CALLS)
  console.log(`计划 ${jobs.length} 次，待跑 ${todo.length} 次，网关=${GATEWAY} 模型=${MODEL}`)
  if (flag("dry-run")) return
  await withBypass(async () => {
    if (!bypassOk()) throw new Error("网关旁路没生效（agents 不是空）")
    let written = 0
    for (const job of todo) {
      if (written && written % 10 === 0 && !bypassOk()) throw new Error("网关旁路被回写，批次中止")
      let row
      try {
        row = await one(arms[job.arm], job.arm, job.probe, job.run)
      } catch (e) {
        row = { ...job, ts: new Date().toISOString(), error: e.message, invalid: true, metrics: {}, pass: false }
      }
      fs.appendFileSync(OUT, JSON.stringify(row) + "\n")
      written++
      const t = row.tools ? row.tools.map((x) => x.name).join(">") || "-" : `ERR ${row.error}`
      console.log(`${row.arm} ${row.probe} #${job.run} ${row.pass ? "PASS" : "fail"} ${t} ${row.served_model || ""} ${row.latency_ms ? row.latency_ms + "ms" : ""}`)
    }
  })
}

// ---------- score ----------

function readRows(file) {
  if (!fs.existsSync(file)) throw new Error(`没有结果文件 ${file}`)
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
}

function score() {
  const rows = readRows(OUT).filter((r) => !r.error && !r.invalid)
  const arms = [...new Set(rows.map((r) => r.arm))]
  const probes = [...new Set(rows.map((r) => r.probe))].sort()
  const metricsByProbe = {}
  const multiples = []
  for (const probe of probes) {
    const keys = [...new Set(rows.filter((r) => r.probe === probe).flatMap((r) => Object.keys(r.metrics || {})))]
    metricsByProbe[probe] = keys
    for (const key of keys) {
      const line = []
      for (const arm of arms) {
        const rs = rows.filter((r) => r.probe === probe && r.arm === arm)
        if (!rs.length) continue
        const k = rs.filter((r) => r.metrics?.[key] === true).length
        const n = rs.length
        const [lo, hi] = wilson(k, n)
        line.push({ arm, k, n, p: k / n, ci: [lo, hi] })
      }
      const a = line.find((x) => x.arm === "A")
      const b = line.find((x) => x.arm === "B")
      if (a && b) {
        const p = fisher(a.k, a.n - a.k, b.k, b.n - b.k)
        const ci = diffCI(a.k, a.n, b.k, b.n)
        multiples.push({ probe, metric: key, p, ci, d: a.p - b.p })
      }
    }
  }
  const adjusted = holm(multiples.map((m) => ({ p: m.p })))
  multiples.forEach((m, i) => (m.adjusted = adjusted[i].adjusted))

  console.log("=== 每臂命中率（Wilson 95%）===")
  for (const probe of probes) {
    for (const arm of arms) {
      const rs = rows.filter((r) => r.probe === probe && r.arm === arm)
      if (!rs.length) continue
      const k = rs.filter((r) => r.pass).length
      console.log(`${probe} ${arm} pass ${k}/${rs.length}`)
      for (const key of metricsByProbe[probe]) {
        const kk = rs.filter((r) => r.metrics?.[key] === true).length
        const [lo, hi] = wilson(kk, rs.length)
        console.log(`   ${key.padEnd(22)} ${kk}/${rs.length}  ${(kk / rs.length).toFixed(2)} [${lo.toFixed(2)}, ${hi.toFixed(2)}]`)
      }
    }
  }
  if (multiples.length) {
    console.log("\n=== A vs B（Fisher + Holm，负值 = A 比 B 差）===")
    for (const m of multiples) {
      console.log(`${m.probe} ${m.metric.padEnd(22)} Δ=${(m.d * 100).toFixed(0)}pp CI[${(m.ci[0] * 100).toFixed(0)}, ${(m.ci[1] * 100).toFixed(0)}] p=${m.p.toFixed(3)} holm=${m.adjusted.toFixed(3)}`)
    }
  }
  const served = {}
  for (const r of rows) served[r.served_model || "?"] = (served[r.served_model || "?"] || 0) + 1
  console.log("\nserved_model:", JSON.stringify(served))
  const ids = rows.map((r) => r.response_id).filter(Boolean)
  const dup = ids.length - new Set(ids).size
  console.log(`响应 id: ${ids.length} 条，重复 ${dup} 条${dup ? "（疑似响应缓存，需核对）" : ""}`)
}

// ---------- main ----------

const PLAN = `实验：删掉 system 里 Artifact edits 段之后行为有没有变。

A  现状：cuts 生效，段被切
B  恢复：cuts 置空，段回到原位（A + ${SEG_START.length ? "SEG" : ""}）
E  灵敏度：A 再把工具描述 / edits schema / 人设里的三份同义说明压掉
F  归因：只压掉人设里那条压缩版

探针 P1 小改(内容在对话里)  P2 多文件/大改  P3 内容不在对话里  P4 失败的 Edit + publish 被拒
主指标 P1/P2 的 pass，探索指标 P3/P4。判读：
  E≈A  探针没有灵敏度，别下结论
  E<A 且 A≈B  这段被另外三份说明覆盖，cut 安全
  A<B  这段有边际作用

命令：plan | selfcheck | build | run | score`

if (cmd === "plan") console.log(PLAN)
else if (cmd === "selfcheck") selfcheck()
else if (cmd === "build") build()
else if (cmd === "run") await run()
else if (cmd === "score") score()
else if (cmd === "restore") {
  const saved = readBaseline()
  if (!saved) {
    console.error(`没有 ${BASELINE_FILE}`)
    process.exitCode = 1
  } else {
    setOptions(pluginKey(), JSON.stringify(saved))
    console.log("已恢复:", JSON.stringify(optionsObj(getOptions(pluginKey()))))
  }
} else {
  console.error(`未知命令 ${cmd}\n\n${PLAN}`)
  process.exitCode = 2
}
