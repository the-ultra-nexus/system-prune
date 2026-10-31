// 仓库内固定路径集中在这：脚本一律从这里取，别再用 import.meta.url 拼相对路径。
// 改目录布局只动这一份，以及 README / CLAUDE.md 里的文件表。
import path from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const at = (...parts) => path.join(ROOT, ...parts)

export const MIDDLEWARE = at("src", "system-prune.middleware.js")
export const ENABLED_AGENTS = at("config", "enabled-agents.json")
export const SWITCHES = at("config", "switches.json")
export const OFFICIAL = at("config", "official.json")
export const PROMPT_DIR = at("prompt")
export const RULES_FILE = at("rules", "rules.json")
export const PERSONA_PAYLOAD = at("rules", "persona.payload.json")
export const SAMPLES = {
  main: at("samples", "interactive-main.request.json"),
  sdk: at("samples", "claude-sdk.request.json"),
  title: at("samples", "interactive-title.request.json"),
  pi: at("samples", "pi-native.system.txt"),
  live: at("samples", "live.claude.md"),
}
export const DIFF_DIR = at("docs", "diff")
export const CASES_DIR = at("docs", "cases")
