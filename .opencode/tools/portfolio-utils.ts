import { tool } from "@opencode-ai/plugin"

interface Holding {
  ticker: string
  shares: number
  current_price?: number | null
  cost_basis_per_share: number
  asset_class: string
}

export const alloc = tool({
  description: "Calculate asset allocation breakdown from investment holdings",
  args: {
    holdingsJSON: tool.schema.string().describe("JSON string of holdings array: [{ticker, shares, current_price, cost_basis_per_share, asset_class}]"),
  },
  async execute(args) {
    const holdings: Holding[] = JSON.parse(args.holdingsJSON)
    const totalValue = holdings.reduce((sum, h) => sum + (h.shares * (h.current_price ?? h.cost_basis_per_share)), 0)
    const byClass: Record<string, { value: number; holdings: { ticker: string; value: number; pct: number }[] }> = {}
    for (const h of holdings) {
      const value = h.shares * (h.current_price ?? h.cost_basis_per_share)
      const pct = (value / totalValue) * 100
      if (!byClass[h.asset_class]) byClass[h.asset_class] = { value: 0, holdings: [] }
      byClass[h.asset_class].value += value
      byClass[h.asset_class].holdings.push({ ticker: h.ticker, value, pct })
    }
    const lines = [`Total Portfolio Value: $${totalValue.toFixed(2)}`, ""]
    lines.push("Asset Allocation:")
    lines.push("Class           | Value       | %")
    lines.push("----------------|-------------|-----")
    for (const [cls, data] of Object.entries(byClass).sort((a, b) => b[1].value - a[1].value)) {
      const pct = (data.value / totalValue) * 100
      lines.push(`${cls.padEnd(15)} | $${data.value.toFixed(2).padStart(10)} | ${pct.toFixed(1)}%`)
    }
    lines.push("")
    for (const [cls, data] of Object.entries(byClass).sort((a, b) => b[1].value - a[1].value)) {
      if (data.holdings.length > 1) {
        lines.push(`${cls} Breakdown:`)
        for (const h of data.holdings.sort((a, b) => b.value - a.value)) {
          lines.push(`  ${h.ticker}: $${h.value.toFixed(2)} (${h.pct.toFixed(1)}% of portfolio, ${((h.value / data.value) * 100).toFixed(1)}% of ${cls})`)
        }
        lines.push("")
      }
    }
    return lines.join("\n")
  },
})

export const diversify = tool({
  description: "Calculate diversification score and concentration analysis for a portfolio",
  args: {
    holdingsJSON: tool.schema.string().describe("JSON string of holdings array: [{ticker, shares, current_price, cost_basis_per_share, asset_class}]"),
  },
  async execute(args) {
    const holdings: Holding[] = JSON.parse(args.holdingsJSON)
    const totalValue = holdings.reduce((sum, h) => sum + (h.shares * (h.current_price ?? h.cost_basis_per_share)), 0)
    const weights = holdings.map(h => (h.shares * (h.current_price ?? h.cost_basis_per_share)) / totalValue)
    const hhi = weights.reduce((sum, w) => sum + w * w, 0)
    const effectiveN = 1 / hhi
    const sorted = [...holdings].sort((a, b) => (b.shares * (b.current_price ?? b.cost_basis_per_share)) - (a.shares * (a.current_price ?? a.cost_basis_per_share)))
    const top5Value = sorted.slice(0, 5).reduce((sum, h) => sum + (h.shares * (h.current_price ?? h.cost_basis_per_share)), 0)
    const top5Pct = (top5Value / totalValue) * 100
    const byClass: Record<string, number> = {}
    for (const h of holdings) {
      byClass[h.asset_class] = (byClass[h.asset_class] ?? 0) + (h.shares * (h.current_price ?? h.cost_basis_per_share))
    }
    const numClasses = Object.keys(byClass).length
    let score = 100
    if (hhi > 0.2) score -= 20
    else if (hhi > 0.1) score -= 10
    if (effectiveN < 5) score -= 15
    else if (effectiveN < 10) score -= 5
    if (top5Pct > 70) score -= 10
    else if (top5Pct > 50) score -= 5
    if (numClasses < 3) score -= 10
    else if (numClasses < 4) score -= 5
    const assessment = score >= 80 ? "Well diversified" : score >= 60 ? "Moderately diversified" : score >= 40 ? "Somewhat concentrated" : "Highly concentrated"
    return [
      `Diversification Score: ${score}/100 (${assessment})`,
      `Herfindahl-Hirschman Index (HHI): ${hhi.toFixed(4)}`,
      `Effective N (diversity equivalent): ${effectiveN.toFixed(1)}`,
      ``,
      `Concentration Analysis:`,
      `Number of Holdings: ${holdings.length}`,
      `Number of Asset Classes: ${numClasses}`,
      `Top 5 Holdings: ${top5Pct.toFixed(1)}% of portfolio`,
      ``,
      `Top Holdings:`,
      ...sorted.slice(0, 10).map((h, i) => {
        const val = h.shares * (h.current_price ?? h.cost_basis_per_share)
        const pct = (val / totalValue) * 100
        return `  ${i + 1}. ${h.ticker} — $${val.toFixed(2)} (${pct.toFixed(1)}%)`
      }),
    ].join("\n")
  },
})

export const rebalance = tool({
  description: "Generate a rebalancing plan from current holdings and target allocation percentages",
  args: {
    holdingsJSON: tool.schema.string().describe("JSON string of current holdings array"),
    targetAllocJSON: tool.schema.string().describe('JSON object mapping asset_class to target %, e.g. {"us_stock": 60, "bond": 30, "cash": 10}'),
  },
  async execute(args) {
    const holdings: Holding[] = JSON.parse(args.holdingsJSON)
    const targetAlloc: Record<string, number> = JSON.parse(args.targetAllocJSON)
    const totalValue = holdings.reduce((sum, h) => sum + (h.shares * (h.current_price ?? h.cost_basis_per_share)), 0)
    const currentByClass: Record<string, number> = {}
    for (const h of holdings) {
      const value = h.shares * (h.current_price ?? h.cost_basis_per_share)
      currentByClass[h.asset_class] = (currentByClass[h.asset_class] ?? 0) + value
    }
    const lines = ["Rebalancing Plan", "=================", ""]
    lines.push("Class           | Current    | Target     | Difference | Action")
    lines.push("----------------|------------|------------|------------|-------")
    for (const [cls, targetPct] of Object.entries(targetAlloc).sort((a, b) => b[1] - a[1])) {
      const currentVal = currentByClass[cls] ?? 0
      const currentPct = (currentVal / totalValue) * 100
      const diffPct = targetPct - currentPct
      const diffVal = (diffPct / 100) * totalValue
      const action = Math.abs(diffPct) < 1 ? "OK" : diffPct > 0 ? `Buy $${diffVal.toFixed(0)}` : `Sell $${Math.abs(diffVal).toFixed(0)}`
      lines.push(`${cls.padEnd(15)} | ${currentPct.toFixed(1).padStart(8)}% | ${targetPct.toFixed(1).padStart(8)}% | ${(diffPct > 0 ? "+" : "")}${diffPct.toFixed(1).padStart(8)}% | ${action}`)
    }
    const totalAlloc = Object.values(targetAlloc).reduce((a, b) => a + b, 0)
    if (Math.abs(totalAlloc - 100) > 0.5) {
      lines.push("")
      lines.push(`Warning: Target allocations sum to ${totalAlloc}%, not 100%`)
    }
    return lines.join("\n")
  },
})

export const returns = tool({
  description: "Calculate time-weighted return for a portfolio given holdings and price history",
  args: {
    holdingsJSON: tool.schema.string().describe("JSON string of holdings array"),
    priceDataJSON: tool.schema.string().describe('JSON object mapping ticker to { begin_price: number, end_price: number }'),
  },
  async execute(args) {
    const holdings: Holding[] = JSON.parse(args.holdingsJSON)
    const priceData: Record<string, { begin_price: number; end_price: number }> = JSON.parse(args.priceDataJSON)
    let totalBegin = 0; let totalEnd = 0; let totalCost = 0
    const details: { ticker: string; begin: number; end: number; cost: number; return: number }[] = []
    for (const h of holdings) {
      const prices = priceData[h.ticker]
      if (!prices) continue
      const beginValue = h.shares * prices.begin_price
      const endValue = h.shares * prices.end_price
      const costValue = h.shares * h.cost_basis_per_share
      totalBegin += beginValue
      totalEnd += endValue
      totalCost += costValue
      details.push({ ticker: h.ticker, begin: beginValue, end: endValue, cost: costValue, return: (endValue - beginValue) / beginValue })
    }
    const portfolioReturn = totalBegin > 0 ? (totalEnd - totalBegin) / totalBegin : 0
    const costReturn = totalCost > 0 ? (totalEnd - totalCost) / totalCost : 0
    const lines = [
      "Portfolio Return Summary",
      "=======================",
      `TWR (Time-Weighted): ${(portfolioReturn * 100).toFixed(2)}%`,
      `Return on Cost Basis: ${(costReturn * 100).toFixed(2)}%`,
      `Beginning Value: $${totalBegin.toFixed(2)}`,
      `Ending Value: $${totalEnd.toFixed(2)}`,
      `Cost Basis: $${totalCost.toFixed(2)}`,
      `Unrealized P&L: $${(totalEnd - totalCost).toFixed(2)} (${(costReturn * 100).toFixed(2)}%)`,
      "",
      "Individual Holdings:",
      "Ticker | Begin      | End        | Return",
      "-------|------------|------------|-------",
    ]
    for (const d of details.sort((a, b) => b.return - a.return)) {
      lines.push(`${d.ticker.padEnd(6)} | $${d.begin.toFixed(2).padStart(9)} | $${d.end.toFixed(2).padStart(9)} | ${(d.return * 100).toFixed(2).padStart(6)}%`)
    }
    return lines.join("\n")
  },
})
