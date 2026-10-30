// 二值指标的区间与检验：Wilson 区间、Newcombe 风险差区间、Fisher 精确检验、Holm 校正。

export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1]
  const p = k / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)]
}

// Newcombe 混合区间：用两臂各自的 Wilson 上下界拼风险差的 CI。
export function diffCI(k1, n1, k2, n2) {
  if (!n1 || !n2) return [NaN, NaN]
  const p1 = k1 / n1
  const p2 = k2 / n2
  const [l1, u1] = wilson(k1, n1)
  const [l2, u2] = wilson(k2, n2)
  const d = p1 - p2
  return [
    d - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2),
    d + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2),
  ]
}

const LOGF = [0]
function logFact(n) {
  for (let i = LOGF.length; i <= n; i++) LOGF[i] = LOGF[i - 1] + Math.log(i)
  return LOGF[n]
}
function hyper(a, b, c, d) {
  const n = a + b + c + d
  const r1 = a + b
  const c1 = a + c
  return Math.exp(logFact(r1) + logFact(n - r1) + logFact(c1) + logFact(n - c1) - logFact(n) - logFact(a) - logFact(b) - logFact(c) - logFact(d))
}

// 2×2 双侧精确检验。a/d 为两臂的成功数，b/c 为失败数。
export function fisher(a, b, c, d) {
  const n = a + b + c + d
  if (!n) return 1
  const r1 = a + b
  const r2 = c + d
  const c1 = a + c
  const lo = Math.max(0, c1 - r2)
  const hi = Math.min(r1, c1)
  const pObs = hyper(a, b, c, d)
  let p = 0
  for (let i = lo; i <= hi; i++) {
    const q = hyper(i, r1 - i, c1 - i, r2 - (c1 - i))
    if (q <= pObs + 1e-9) p += q
  }
  return Math.min(1, p)
}

// Holm：p 从小到大，第 i 个乘 (m - i)，再取累计最大，最后截到 1。
export function holm(items) {
  const sorted = items.map((x, i) => ({ ...x, i })).sort((x, y) => x.p - y.p)
  let prev = 0
  for (let i = 0; i < sorted.length; i++) {
    const adj = Math.min(1, Math.max(prev, sorted[i].p * (sorted.length - i)))
    sorted[i].adjusted = adj
    prev = adj
  }
  const out = items.slice()
  for (const s of sorted) out[s.i] = { ...items[s.i], adjusted: s.adjusted }
  return out
}
