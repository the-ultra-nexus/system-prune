// 四条探针的合成对话与判分。历史固定，只有 system 段在臂间不同。
export const WORK = "/tmp/probe"
export const PAGE_PATH = `${WORK}/page.html`
export const CSS_PATH = `${WORK}/styles/theme.css`
export const JS_PATH = `${WORK}/scripts/app.js`
export const LEGACY_PATH = `${WORK}/legacy/board.css`

export const PAGE_HTML = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ship Board</title>
<link rel="stylesheet" href="styles/theme.css">
</head>
<body>
  <header class="bar">
    <h1 id="title">Ship Board</h1>
    <p class="lede">三条船，一张图，谁在岸上谁在海上。</p>
  </header>
  <main id="board" class="grid">
    <section class="col" data-state="out"><h2>出港</h2><ul></ul></section>
    <section class="col" data-state="sail"><h2>在途</h2><ul></ul></section>
    <section class="col" data-state="in"><h2>进港</h2><ul></ul></section>
  </main>
  <script src="scripts/app.js"></script>
</body>
</html>
`

export const PAGE_CSS = `:root {
  --ink: #1b2733;
  --paper: #f4f7fa;
  --line: #cfd8e3;
}
body { margin: 0; font: 15px/1.6 system-ui, sans-serif; color: var(--ink); background: var(--paper); }
.bar { padding: 20px 24px 8px; border-bottom: 1px solid var(--line); }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 16px 24px; }
.col h2 { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; }
`

export const PAGE_JS = `const ROWS = [
  { name: "潮汐号", state: "out" },
  { name: "白鲸号", state: "sail" },
  { name: "锚点号", state: "in" },
]

for (const row of ROWS) {
  const col = document.querySelector(\`[data-state="\${row.state}"] ul\`)
  if (!col) continue
  const li = document.createElement("li")
  li.textContent = row.name
  col.append(li)
}
`

const PUBLISHED_URL = "https://claude.ai/artifact/1f0c2ab4-8c1d-4f22-9a5e-0d6f7a1b2c3d"

// 发布成功之前的历史：写三个文件、发布、拿到 URL。
function base() {
  return [
    {
      role: "user",
      content:
        "给我做个单页看板：页面 /tmp/probe/page.html，样式 styles/theme.css，脚本 scripts/app.js，主题是三条船的进出港。做完发布成 artifact。",
    },
    {
      role: "assistant",
      content: [
        { type: "text", text: "先把三个文件落下来。" },
        { type: "tool_use", id: "toolu_w1", name: "Write", input: { file_path: PAGE_PATH, content: PAGE_HTML } },
        { type: "tool_use", id: "toolu_w2", name: "Write", input: { file_path: CSS_PATH, content: PAGE_CSS } },
        { type: "tool_use", id: "toolu_w3", name: "Write", input: { file_path: JS_PATH, content: PAGE_JS } },
      ],
    },
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "toolu_w1", content: `File created successfully at: ${PAGE_PATH}` },
        { type: "tool_result", tool_use_id: "toolu_w2", content: `File created successfully at: ${CSS_PATH}` },
        { type: "tool_result", tool_use_id: "toolu_w3", content: `File created successfully at: ${JS_PATH}` },
      ],
    },
    {
      role: "assistant",
      content: [
        { type: "text", text: "落好了，发布。" },
        {
          type: "tool_use",
          id: "toolu_p1",
          name: "Artifact",
          input: {
            file_path: PAGE_PATH,
            description: "三条船的进出港看板。",
            icon: "map",
            files: { "styles/theme.css": CSS_PATH, "scripts/app.js": JS_PATH },
          },
        },
      ],
    },
    {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_p1", content: `Published to ${PUBLISHED_URL}` }],
    },
  ]
}

// 把探针 prompt 接在最后一条 user 消息的 tool_result 之后，避免连续两条 user。
function withPrompt(msgs, text) {
  const last = msgs[msgs.length - 1]
  last.content = [...last.content, { type: "text", text }]
  return msgs
}

const P1_PROMPT = "标题从 Ship Board 改成 Tide Board，副标题那句换成「潮起潮落，船不动。」。改完就好，别的别动。"
const P2_PROMPT = "页面上再加一列「待发」状态，主题色换成深海蓝，渲染脚本改成按状态分组。样式和脚本都要改。"
const P3_PROMPT = "顺手把 /tmp/probe/legacy/board.css 里的变量 --ink/--paper 统一成 --fg/--bg，改完告诉我。"
const P4_BAD_OLD = `<h1 id="title">Harbor Board</h1>`

function p4() {
  const msgs = base()
  msgs.push({
    role: "assistant",
    content: [
      {
        type: "tool_use",
        id: "toolu_bad_edit",
        name: "Edit",
        input: { file_path: PAGE_PATH, old_string: P4_BAD_OLD, new_string: `<h1 id="title">Tide Board</h1>` },
      },
      { type: "tool_use", id: "toolu_bad_pub", name: "Artifact", input: { file_path: PAGE_PATH } },
    ],
  })
  msgs.push({
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "toolu_bad_edit",
        is_error: true,
        content: `Error: old_string not found in ${PAGE_PATH}`,
      },
      {
        type: "tool_result",
        tool_use_id: "toolu_bad_pub",
        is_error: true,
        content: "Publish refused: the Edit in this response did not apply, the page was left as it was.",
      },
    ],
  })
  return msgs
}

const PREAMBLE = new Set(["Skill", "ToolSearch", "DeferredToolPlaceholder"])

function actionTools(tools) {
  return tools.filter((t) => !PREAMBLE.has(t.name))
}
const isPublish = (t) => (t.name === "Artifact" && (t.input.action ?? "publish") === "publish" && t.input.file_path === PAGE_PATH)

function editsOf(pub) {
  const edits = pub?.input?.edits
  if (!Array.isArray(edits) || !edits.length) return { has: false }
  return {
    has: true,
    count: edits.length,
    exact: edits.every((e) => typeof e.old_str === "string" && PAGE_HTML.includes(e.old_str)),
    unique: edits.every((e) => PAGE_HTML.split(e.old_str).length - 1 === 1),
    changed: edits.every((e) => e.new_str !== e.old_str),
  }
}

// 每条只返回二值指标；pass 是主判据，其余是诊断口径。
function scoreP1(tools) {
  const act = actionTools(tools)
  const pubs = tools.filter(isPublish)
  const e = editsOf(pubs[0])
  const m = {
    first_artifact: act[0]?.name === "Artifact",
    no_read: !tools.some((t) => t.name === "Read"),
    no_edit: !tools.some((t) => t.name === "Edit"),
    publish_with_edits: e.has,
    edits_exact_unique: Boolean(e.has && e.exact && e.unique),
  }
  m.pass = m.first_artifact && m.no_read && m.no_edit && m.publish_with_edits && m.edits_exact_unique
  return m
}

function scoreP2(tools) {
  const act = actionTools(tools)
  const names = tools.map((t) => t.name)
  const edits = tools.filter((t) => t.name === "Edit")
  const pubs = tools.filter(isPublish)
  const pubIdx = tools.findIndex(isPublish)
  const lastEdit = names.lastIndexOf("Edit")
  const m = {
    first_edit: act[0]?.name === "Edit",
    edit_count_ok: edits.length >= 2,
    no_read: !names.includes("Read"),
    publish_same_response: pubIdx !== -1,
    publish_after_edit: pubIdx !== -1 && lastEdit !== -1 && pubIdx > lastEdit,
    publish_no_edits: pubs.length > 0 && !pubs[0].input.edits,
  }
  m.pass = m.first_edit && m.edit_count_ok && m.no_read && m.publish_same_response && m.publish_after_edit
  return m
}

function scoreP3(tools) {
  const act = actionTools(tools)
  const first = act[0]
  const m = {
    read_first: first?.name === "Read" || (first?.name === "Artifact" && first?.input?.action === "read"),
    target_file: tools.some((t) => t.name === "Read" && t.input.file_path === LEGACY_PATH) || first?.input?.file_path === LEGACY_PATH,
    no_premature_write: !tools.some((t) => t.name === "Edit" || isPublish(t)),
  }
  m.pass = m.read_first && m.target_file && m.no_premature_write
  return m
}

function scoreP4(tools) {
  const act = actionTools(tools)
  const names = tools.map((t) => t.name)
  const edits = tools.filter((t) => t.name === "Edit")
  const pubs = tools.filter(isPublish)
  const pubIdx = tools.findIndex(isPublish)
  const lastEdit = names.lastIndexOf("Edit")
  const fixed = edits.some((e) => typeof e.input.old_string === "string" && e.input.old_string !== P4_BAD_OLD && PAGE_HTML.includes(e.input.old_string))
  const m = {
    first_edit: act[0]?.name === "Edit",
    corrected_edit: fixed,
    no_repeat_bad_edit: !edits.some((e) => e.input.old_string === P4_BAD_OLD),
    publish_after_edit: pubIdx !== -1 && lastEdit !== -1 && pubIdx > lastEdit,
    no_read: !names.includes("Read"),
  }
  m.pass = m.corrected_edit && m.no_repeat_bad_edit && m.publish_after_edit
  return m
}

export const PROBES = {
  P1: { prompt: P1_PROMPT, messages: () => withPrompt(base(), P1_PROMPT), score: scoreP1 },
  P2: { prompt: P2_PROMPT, messages: () => withPrompt(base(), P2_PROMPT), score: scoreP2 },
  P3: { prompt: P3_PROMPT, messages: () => withPrompt(base(), P3_PROMPT), score: scoreP3 },
  P4: { prompt: "(脚本化：上一条 Edit 失败、publish 被拒)", messages: p4, score: scoreP4 },
}

// fixture 只为了让路径在探针之外也成立；探针本身不执行工具。
export function fixtures(fs) {
  fs.mkdirSync(`${WORK}/styles`, { recursive: true })
  fs.mkdirSync(`${WORK}/scripts`, { recursive: true })
  fs.mkdirSync(`${WORK}/legacy`, { recursive: true })
  fs.writeFileSync(PAGE_PATH, PAGE_HTML)
  fs.writeFileSync(CSS_PATH, PAGE_CSS)
  fs.writeFileSync(JS_PATH, PAGE_JS)
  fs.writeFileSync(LEGACY_PATH, ":root {\n  --ink: #10202e;\n  --paper: #eef2f6;\n}\n.shell { color: var(--ink); background: var(--paper); }\n")
}
