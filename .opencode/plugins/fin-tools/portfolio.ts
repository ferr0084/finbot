import type { Info as ToolInfo } from "@opencode/plugin/promise/tool"

type JsonResult = { content: string }

function json(payload: unknown): JsonResult {
  return { content: JSON.stringify(payload, null, 2) }
}

interface Holding {
  ticker: string
  shares: number
  current_price?: number | null
  cost_basis_per_share: number
  asset_class: string
}

const NS = "portfolio-utils"

const holdingsInput = {
  type: "object",
  properties: {
    holdingsJSON: {
      type: "string",
      description:
        "JSON string of holdings array: [{ticker, shares, current_price, cost_basis_per_share, asset_class}]",
    },
  },
  required: ["holdingsJSON"],
  additionalProperties: false,
}

function valueOf(h: Holding): number {
  return h.shares * (h.current_price ?? h.cost_basis_per_share)
}

export const alloc: ToolInfo = {
  name: "alloc",
  description: "Calculate asset allocation breakdown from investment holdings",
  input: holdingsInput,
  options: { namespace: NS, codemode: true },
  execute: async (input) => {
    const holdings: Holding[] = JSON.parse((input as { holdingsJSON: string }).holdingsJSON)
    const totalValue = holdings.reduce((sum, h) => sum + valueOf(h), 0)
    const byClass: Record<string, { value: number; holdings: { ticker: string; value: number; pct: number; pctOfClass: number }[] }> = {}
    for (const h of holdings) {
      const value = valueOf(h)
      const pct = (value / totalValue) * 100
      if (!byClass[h.asset_class]) byClass[h.asset_class] = { value: 0, holdings: [] }
      byClass[h.asset_class].value += value
      byClass[h.asset_class].holdings.push({ ticker: h.ticker, value, pct, pctOfClass: 0 })
    }
    const classes = Object.entries(byClass)
      .sort((a, b) => b[1].value - a[1].value)
      .map(([assetClass, data]) => ({
        assetClass,
        value: data.value,
        pct: (data.value / totalValue) * 100,
        holdings: data.holdings
          .map((h) => ({ ...h, pctOfClass: (h.value / data.value) * 100 }))
          .sort((a, b) => b.value - a.value),
      }))
    return json({
      tool: "alloc",
      totalValue,
      byClass: classes,
      display: `${classes.map((c) => `${c.assetClass} ${c.pct.toFixed(1)}%`).join(" | ")}`,
      inputs: { holdingsCount: holdings.length },
      assumptions: ["Market value = shares × current_price, falling back to cost_basis_per_share when current_price is null"],
    })
  },
}

export const diversify: ToolInfo = {
  name: "diversify",
  description: "Calculate diversification score and concentration analysis for a portfolio",
  input: holdingsInput,
  options: { namespace: NS, codemode: true },
  execute: async (input) => {
    const holdings: Holding[] = JSON.parse((input as { holdingsJSON: string }).holdingsJSON)
    const totalValue = holdings.reduce((sum, h) => sum + valueOf(h), 0)
    const weights = holdings.map((h) => valueOf(h) / totalValue)
    const hhi = weights.reduce((sum, w) => sum + w * w, 0)
    const effectiveN = 1 / hhi
    const sorted = [...holdings].sort((a, b) => valueOf(b) - valueOf(a))
    const top5Value = sorted.slice(0, 5).reduce((sum, h) => sum + valueOf(h), 0)
    const top5Pct = (top5Value / totalValue) * 100
    const byClass: Record<string, number> = {}
    for (const h of holdings) {
      byClass[h.asset_class] = (byClass[h.asset_class] ?? 0) + valueOf(h)
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
    const assessment =
      score >= 80 ? "Well diversified" : score >= 60 ? "Moderately diversified" : score >= 40 ? "Somewhat concentrated" : "Highly concentrated"
    return json({
      tool: "diversify",
      score,
      assessment,
      hhi,
      effectiveN,
      holdingsCount: holdings.length,
      assetClassCount: numClasses,
      top5Pct,
      topHoldings: sorted.slice(0, 10).map((h) => {
        const value = valueOf(h)
        return { ticker: h.ticker, value, pct: (value / totalValue) * 100 }
      }),
      display: `${score}/100 (${assessment})`,
      inputs: { holdingsCount: holdings.length },
      assumptions: ["HHI on market-value weights", "Top 5 concentration on market-value weights"],
    })
  },
}

export const rebalance: ToolInfo = {
  name: "rebalance",
  description: "Generate a rebalancing plan from current holdings and target allocation percentages",
  input: {
    type: "object",
    properties: {
      holdingsJSON: { type: "string", description: "JSON string of current holdings array" },
      targetAllocJSON: {
        type: "string",
        description: 'JSON object mapping asset_class to target %, e.g. {"us_stock": 60, "bond": 30, "cash": 10}',
      },
    },
    required: ["holdingsJSON", "targetAllocJSON"],
    additionalProperties: false,
  },
  options: { namespace: NS, codemode: true },
  execute: async (input) => {
    const { holdingsJSON, targetAllocJSON } = input as { holdingsJSON: string; targetAllocJSON: string }
    const holdings: Holding[] = JSON.parse(holdingsJSON)
    const targetAlloc: Record<string, number> = JSON.parse(targetAllocJSON)
    const totalValue = holdings.reduce((sum, h) => sum + valueOf(h), 0)
    const currentByClass: Record<string, number> = {}
    for (const h of holdings) {
      currentByClass[h.asset_class] = (currentByClass[h.asset_class] ?? 0) + valueOf(h)
    }
    const rows = Object.entries(targetAlloc)
      .sort((a, b) => b[1] - a[1])
      .map(([assetClass, targetPct]) => {
        const currentVal = currentByClass[assetClass] ?? 0
        const currentPct = (currentVal / totalValue) * 100
        const diffPct = targetPct - currentPct
        const diffValue = (diffPct / 100) * totalValue
        const action = Math.abs(diffPct) < 1 ? "OK" : diffPct > 0 ? `Buy $${diffValue.toFixed(0)}` : `Sell $${Math.abs(diffValue).toFixed(0)}`
        return { assetClass, currentPct, targetPct, diffPct, diffValue, action }
      })
    const totalAlloc = Object.values(targetAlloc).reduce((a, b) => a + b, 0)
    return json({
      tool: "rebalance",
      totalValue,
      rows,
      warning: Math.abs(totalAlloc - 100) > 0.5 ? `Target allocations sum to ${totalAlloc}%, not 100%` : null,
      display: rows.map((r) => `${r.assetClass}: ${r.action}`).join(" | "),
      inputs: { holdingsCount: holdings.length, classes: Object.keys(targetAlloc).length },
      assumptions: ["Trades sized at current market value", "No tax or transaction costs modeled"],
    })
  },
}

export const returns: ToolInfo = {
  name: "returns",
  description: "Calculate time-weighted return for a portfolio given holdings and price history",
  input: {
    type: "object",
    properties: {
      holdingsJSON: { type: "string", description: "JSON string of holdings array" },
      priceDataJSON: {
        type: "string",
        description: 'JSON object mapping ticker to { begin_price: number, end_price: number }',
      },
    },
    required: ["holdingsJSON", "priceDataJSON"],
    additionalProperties: false,
  },
  options: { namespace: NS, codemode: true },
  execute: async (input) => {
    const { holdingsJSON, priceDataJSON } = input as { holdingsJSON: string; priceDataJSON: string }
    const holdings: Holding[] = JSON.parse(holdingsJSON)
    const priceData: Record<string, { begin_price: number; end_price: number }> = JSON.parse(priceDataJSON)
    let totalBegin = 0
    let totalEnd = 0
    let totalCost = 0
    const missingPriceData: string[] = []
    const details: { ticker: string; begin: number; end: number; cost: number; return: number }[] = []
    for (const h of holdings) {
      const prices = priceData[h.ticker]
      if (!prices) {
        missingPriceData.push(h.ticker)
        continue
      }
      const beginValue = h.shares * prices.begin_price
      const endValue = h.shares * prices.end_price
      const costValue = h.shares * h.cost_basis_per_share
      totalBegin += beginValue
      totalEnd += endValue
      totalCost += costValue
      details.push({ ticker: h.ticker, begin: beginValue, end: endValue, cost: costValue, return: (endValue - beginValue) / beginValue })
    }
    const twr = totalBegin > 0 ? (totalEnd - totalBegin) / totalBegin : 0
    const costReturn = totalCost > 0 ? (totalEnd - totalCost) / totalCost : 0
    return json({
      tool: "returns",
      twr,
      returnOnCost: costReturn,
      beginningValue: totalBegin,
      endingValue: totalEnd,
      costBasis: totalCost,
      unrealizedPnl: totalEnd - totalCost,
      unrealizedPct: costReturn,
      holdings: details.sort((a, b) => b.return - a.return),
      missingPriceData,
      display: `TWR ${(twr * 100).toFixed(2)}% | Return on cost ${(costReturn * 100).toFixed(2)}%`,
      inputs: { holdingsCount: holdings.length, pricedHoldings: details.length },
      assumptions: ["Time-weighted return approximated from begin/end prices", "Holdings without price data are excluded and listed in missingPriceData"],
    })
  },
}

export const portfolioTools: ToolInfo[] = [alloc, diversify, rebalance, returns]
