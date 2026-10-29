// 发布前脱敏：请求快照里的 device_id / session_id、magpie 的 API_KEY 占位名。
// 幂等，跑几次都一样。用法：node scrub-fixtures.mjs
import fs from "node:fs"

const REQUESTS = ["interactive-main.request.json", "claude-sdk.request.json", "interactive-title.request.json"]
const TEXTUAL = ["live.claude.md"]
const DIRS = ["diff"]

let touched = 0

for (const file of REQUESTS) {
  let body
  try { body = JSON.parse(fs.readFileSync(file, "utf8")) } catch { continue }
  if (body.metadata && body.metadata.user_id) {
    body.metadata.user_id = JSON.stringify({ session_id: "REDACTED" })
    fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`)
    touched++
  }
}

function scrubText(file) {
  const src = fs.readFileSync(file, "utf8")
  const out = src
    .replace(/"device_id"\s*:\s*"[^"]*"/g, '"device_id": "REDACTED"')
    .replace(/"account_uuid"\s*:\s*"[^"]*"/g, '"account_uuid": "REDACTED"')
    .replace(/"session_id"\s*:\s*"[0-9a-fA-F-]{8,}"/g, '"session_id": "REDACTED"')
    .replace(/\{\{API_KEY_[A-Za-z0-9_]+\}\}/g, "{{API_KEY_***}}")
  if (out !== src) { fs.writeFileSync(file, out); touched++ }
}

for (const file of TEXTUAL) {
  if (fs.existsSync(file)) scrubText(file)
}
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith(".md") || name.endsWith(".diff")) scrubText(`${dir}/${name}`)
  }
}
console.log(`scrubbed ${touched} file(s)`)
