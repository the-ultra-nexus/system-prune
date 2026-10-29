import assert from "node:assert/strict"
import { onRequest } from "./system-prune.middleware.js"

const rules = {
  dropBlocksContaining: ["DROP-ME"],
  cuts: [["<!-- cut:begin -->", "<!-- cut:end -->"]],
  dropLinesMatching: ["^LINE-TO-DROP$"],
  squeezeBlank: true,
}

// baked: false = 只用这里给的 options，不叠中间件里烤入的那份规则
const ctx = { protocol: "anthropic", agent: "claude", options: rules, baked: false }

// 1. 整块删除 + 区间删除 + 行删除，其余逐字保留
{
  const body = {
    system: [
      { type: "text", text: "keep A\nLINE-TO-DROP\nkeep B" },
      { type: "text", text: "DROP-ME this whole block goes" },
      { type: "text", text: "before <!-- cut:begin -->secret<!-- cut:end --> after", cache_control: { type: "ephemeral" } },
    ],
  }
  assert.equal(onRequest(body, ctx), body)
  assert.equal(body.system.length, 2)
  assert.equal(body.system[0].text, "keep A\nkeep B")
  assert.equal(body.system[1].text, "before  after")
  assert.deepEqual(body.system[1].cache_control, { type: "ephemeral" })
}

// 2. 没有任何命中：返回 undefined，请求原样
{
  const body = { system: [{ type: "text", text: "nothing here" }] }
  assert.equal(onRequest(body, ctx), undefined)
  assert.equal(body.system[0].text, "nothing here")
}

// 3. 字符串形式的 system
{
  const body = { system: "keep\nLINE-TO-DROP\nkeep" }
  assert.equal(onRequest(body, ctx), body)
  assert.equal(body.system, "keep\nkeep")
}

// 4. 删空就放弃，不发空 system
{
  const body = { system: [{ type: "text", text: "DROP-ME" }] }
  assert.equal(onRequest(body, ctx), undefined)
  assert.equal(body.system.length, 1)
}

// 5. 带断点的块被删空：断点挪到新的最后一块
{
  const body = {
    system: [
      { type: "text", text: "a", cache_control: { type: "ephemeral" } },
      { type: "text", text: "b" },
    ],
  }
  assert.equal(onRequest(body, { ...ctx, options: { dropBlocksContaining: [], cuts: [], dropLinesMatching: ["^a$"] } }), body)
  assert.equal(body.system.length, 1)
  assert.equal(body.system[0].text, "b")
  assert.deepEqual(body.system[0].cache_control, { type: "ephemeral" })
}

// 6. chat 协议
{
  const body = { messages: [{ role: "system", content: "x\nLINE-TO-DROP\ny" }] }
  assert.equal(onRequest(body, { ...ctx, protocol: "chat" }), body)
  assert.equal(body.messages[0].content, "x\ny")
}

// 7. responses 协议
{
  const body = { instructions: "x\nLINE-TO-DROP\ny" }
  assert.equal(onRequest(body, { ...ctx, protocol: "responses" }), body)
  assert.equal(body.instructions, "x\ny")
}

// 8. gemini 协议
{
  const body = { systemInstruction: { parts: [{ text: "x\nLINE-TO-DROP\ny" }] } }
  assert.equal(onRequest(body, { ...ctx, protocol: "gemini" }), body)
  assert.equal(body.systemInstruction.parts[0].text, "x\ny")
}

// 9. 按标题删段：只删到下一个同级或更高级标题
{
  const body = { system: [{ type: "text", text: "intro\n# A\na\n## A2\na2\n# B\nb" }] }
  assert.equal(onRequest(body, { ...ctx, options: { dropSections: ["# A"] } }), body)
  assert.equal(body.system[0].text, "intro\n# B\nb")
}

// 10. 删子标题不动父标题
{
  const body = { system: [{ type: "text", text: "# A\na\n## A2\na2\n## A3\na3\n# B\nb" }] }
  assert.equal(onRequest(body, { ...ctx, options: { dropSections: ["## A2"] } }), body)
  assert.equal(body.system[0].text, "# A\na\n## A3\na3\n# B\nb")
}

// 11. 字符串 system 只给 dropSections 也要生效
{
  const body = { system: "# A\na\n# B\nb" }
  assert.equal(onRequest(body, { ...ctx, options: { dropSections: ["# A"] } }), body)
  assert.equal(body.system, "# B\nb")
}

// 12. messages 里 role=system 的 Environment / MCP 段也能删
{
  const body = {
    messages: [
      { role: "user", content: "hi" },
      {
        role: "system",
        content: [
          { type: "text", text: "# Environment\ne\n# MCP Server Instructions\n## context7\nc\n## tavily\nt" },
        ],
      },
      { role: "system", content: [{ type: "text", text: "## tavily\nt" }] },
    ],
  }
  assert.equal(onRequest(body, { ...ctx, options: { dropSections: ["# MCP Server Instructions", "## tavily"] } }), body)
  assert.equal(body.messages.length, 2)
  assert.equal(body.messages[1].content[0].text, "# Environment\ne")
}

// 13. 逐字替换：全局命中，先于行删除
{
  const body = { system: [{ type: "text", text: "A refusal is final.\nA refusal is final.\ndrop me" }] }
  const opts = { replacements: [["A refusal is final.", "keep going."]], dropLinesMatching: ["^drop me$"] }
  assert.equal(onRequest(body, { ...ctx, options: opts }), body)
  assert.equal(body.system[0].text, "keep going.\nkeep going.")
}

// 14. prepend：计费头留在最前，新块带断点
{
  const body = { system: [
    { type: "text", text: "x-anthropic-billing-header: cc_version=1" },
    { type: "text", text: "official", cache_control: { type: "ephemeral", ttl: "1h" } },
  ] }
  const opts = { prependBlocks: [{ text: "PERSONA", cache: true, ttl: "1h" }] }
  assert.equal(onRequest(body, { ...ctx, options: opts }), body)
  assert.equal(body.system.length, 3)
  assert.equal(body.system[0].text.slice(0, 5), "x-ant")
  assert.equal(body.system[1].text, "PERSONA")
  assert.deepEqual(body.system[1].cache_control, { type: "ephemeral", ttl: "1h" })
  assert.equal(body.system[2].text, "official")
}

// 15. prepend + 整块删除：字符串 system 也吃
{
  const body = { system: "official body" }
  const opts = { prependBlocks: [{ text: "PERSONA" }], appendBlocks: [{ text: "TAIL" }] }
  assert.equal(onRequest(body, { ...ctx, options: opts }), body)
  assert.equal(body.system, "PERSONA\n\nofficial body\n\nTAIL")
}

// 16. chat：没有 system 头时新建一条
{
  const body = { messages: [{ role: "user", content: "hi" }] }
  assert.equal(onRequest(body, { ...ctx, protocol: "chat", options: { prependBlocks: [{ text: "PERSONA" }] } }), body)
  assert.equal(body.messages[0].role, "system")
  assert.equal(body.messages[0].content, "PERSONA")
}

// 17. responses：instructions 前后追加
{
  const body = { instructions: "official" }
  assert.equal(onRequest(body, { ...ctx, protocol: "responses", options: { appendBlocks: [{ text: "TAIL" }] } }), body)
  assert.equal(body.instructions, "official\n\nTAIL")
}

// 18. prepend 不能跳过 prune（chat / responses 同款旧 bug）
{
  const body = { messages: [{ role: "system", content: "keep\nDROP" }, { role: "user", content: "hi" }] }
  assert.equal(onRequest(body, { ...ctx, protocol: "chat", options: { prependBlocks: [{ text: "PERSONA" }], dropLinesMatching: ["^DROP$"] } }), body)
  assert.equal(body.messages[0].content, "PERSONA\n\nkeep")
}
{
  const body = { instructions: "keep\nDROP" }
  assert.equal(onRequest(body, { ...ctx, protocol: "responses", options: { prependBlocks: [{ text: "PERSONA" }], dropLinesMatching: ["^DROP$"] } }), body)
  assert.equal(body.instructions, "PERSONA\n\nkeep")
}

// 19. 工具描述走同一套替换
{
  const body = {
    tools: [
      { name: "t", description: "x BAD y" },
      { type: "function", function: { name: "f", description: "BAD" } },
      { functionDeclarations: [{ name: "g", description: "a BAD b" }] },
    ],
  }
  assert.equal(onRequest(body, { ...ctx, options: { replacements: [["BAD", "GOOD"]] } }), body)
  assert.equal(body.tools[0].description, "x GOOD y")
  assert.equal(body.tools[1].function.description, "GOOD")
  assert.equal(body.tools[2].functionDeclarations[0].description, "a GOOD b")
}

// 20. 同一份 options 服务两个 agent：缓存不能串（profiles 按 agent 不同）
{
  const opts = { agents: ["a", "b"], bakedProfiles: true }
  const a = { messages: [{ role: "system", content: "x" }] }
  const b = { messages: [{ role: "system", content: "y" }] }
  const r1 = onRequest(a, { protocol: "chat", agent: "a", options: opts, baked: false })
  const r2 = onRequest(b, { protocol: "chat", agent: "b", options: opts, baked: false })
  assert.equal(r1, undefined)
  assert.equal(r2, undefined)
}

// 21. agents 开关：不填不改、不在名单不改、"*" 才是全部
{
  const mk = () => ({ messages: [{ role: "system", content: "x" }] })
  assert.equal(onRequest(mk(), { protocol: "chat", agent: "pi", options: { agents: [] } }), undefined)
  assert.equal(onRequest(mk(), { protocol: "chat", agent: "pi", options: { agents: ["claude"] } }), undefined)
  assert.ok(onRequest(mk(), { protocol: "chat", agent: "pi", options: { agents: ["*"] } }))
}

console.log("all tests passed")
