import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import YahooFinance from "yahoo-finance2"
import { computeTa, type Bar } from "./ta"

export let yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] })

// In-process TTL cache. Key = tool + normalized args. LRU-bounded at 200 entries.
const cache = new Map<string, { expires: number; value: unknown }>()
const CACHE_MAX = 200

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.expires > now) {
    cache.delete(key)
    cache.set(key, hit)
    return hit.value as T
  }
  const value = await load()
  cache.set(key, { expires: now + ttlMs, value })
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  return value
}

async function withRetry<T>(load: () => Promise<T>, opts: { attempts?: number; timeoutMs?: number } = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 2)
  const timeoutMs = opts.timeoutMs ?? 10000
  let lastErr: any
  for (let i = 0; i < attempts; i++) {
    try {
      return await Promise.race([
        load(),
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error("upstream timeout")), timeoutMs)),
      ])
    } catch (e: any) {
      lastErr = e
      const msg = String(e?.message ?? e)
      const transient = /timeout|abort|ECONN|ENOTFOUND|ETIMEDOUT|5\d\d|rate|429/i.test(msg)
      if (!transient || i === attempts - 1) throw e
      await new Promise((resolve) => setTimeout(resolve, 200 * (i + 1)))
    }
  }
  throw lastErr
}

const TTL = {
  quote: 15_000,
  history: 60_000,
  fundamentals: 3_600_000,
  news: 300_000,
  options: 15_000,
  quoteSummary: 3_600_000,
  fundamentalsTimeSeries: 3_600_000,
}

const server = new Server(
  { name: "yahoo-finance", version: "1.0.0" },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "yf_quote",
      description: "Get real-time quote data for one or more tickers from Yahoo Finance. Returns price, change, volume, market cap, 52-week range, and other key stats.",
      inputSchema: {
        type: "object",
        properties: {
          tickers: {
            type: "array",
            items: { type: "string" },
            description: "Array of ticker symbols (e.g. ['AAPL', 'MSFT'])",
          },
        },
        required: ["tickers"],
      },
    },
    {
      name: "yf_history",
      description: "Get historical price data for a ticker over a specified period. Returns OHLCV data with dividends and splits. Auto-sets period2 to now for 1d interval if not provided.",
      inputSchema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Ticker symbol (e.g. 'AAPL')" },
          period1: { type: "string", description: "Start date in ISO format (e.g. '2026-01-01') or Unix timestamp" },
          period2: { type: "string", description: "End date in ISO format or Unix timestamp (defaults to now for 1d interval)" },
          interval: {
            type: "string",
            enum: ["1d", "1wk", "1mo"],
            description: "Data interval (default: 1d). Use 1mo for multi-year history, 1d for recent data.",
          },
          fields: {
            type: "array",
            items: { type: "string", enum: ["date", "open", "high", "low", "close", "adjClose", "volume"] },
            description: "Optional subset of fields to return (default: all fields).",
          },
          tail: {
            type: "number",
            description: "Optional number of most recent rows to return (default: all rows).",
          },
        },
        required: ["ticker", "period1"],
      },
    },
    {
      name: "yf_fundamentals",
      description: "Get fundamental data for a ticker including PE ratio, EPS, market cap, dividend yield, beta, book value, and other key financial metrics.",
      inputSchema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Ticker symbol (e.g. 'AAPL')" },
        },
        required: ["ticker"],
      },
    },
    {
      name: "yf_search",
      description: "Search for securities by name or keyword. Returns matching tickers with exchange and type information.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (company name or keyword)" },
        },
        required: ["query"],
      },
    },
    {
      name: "yf_news",
      description: "Get recent news headlines for one or more tickers. Returns per-ticker results with an error field, so a failing ticker is reported instead of silently dropped. Always batch all tickers in one call.",
      inputSchema: {
        type: "object",
        properties: {
          symbols: {
            type: "array",
            items: { type: "string" },
            description: "Array of ticker symbols (e.g. ['AAPL', 'MSFT'])",
          },
          count: {
            type: "number",
            description: "Max headlines per ticker (default 5, max 20)",
          },
          compact: {
            type: "boolean",
            description:
              "Drop link and relatedTickers, cap title at 120 chars, and reduce published to YYYY-MM-DD. Keeps title/publisher/published/relevant.",
          },
        },
        required: ["symbols"],
      },
    },
    {
      name: "ta",
      description:
        "Compute technical indicators for one ticker in one call: quote, SMA/EMA trend, RSI-14 (Wilder), MACD, ATR-14 (Wilder), annualized HV, drawdown, period returns (price and total-return), volume with at-price profile, and swing/pivot support-resistance with Fibonacci levels. Fixed definitions; prefer this over re-deriving indicators from yf_history.",
      inputSchema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Ticker symbol (e.g. 'PL')" },
          period1: {
            type: "string",
            description: "Start date in ISO format. Defaults to 5 years back.",
          },
          period2: { type: "string", description: "End date in ISO format. Defaults to now." },
          interval: {
            type: "string",
            enum: ["1d", "1wk"],
            description: "Bar interval (default: 1d).",
          },
          windows: {
            type: "array",
            items: { type: "number" },
            description: "SMA/EMA windows (default: [20, 50, 100, 200]).",
          },
          levels: {
            type: "boolean",
            description: "Include swing pivots, clustered support/resistance, and Fibonacci levels (default: true).",
          },
        },
        required: ["ticker"],
      },
    },
    {
      name: "yf_correlation",
      description:
        "Pairwise correlation of returns across a ticker set in one call. Aligns common dates, computes simple returns at the requested interval, and returns the correlation matrix plus annualized volatility per ticker. Use instead of hand-correlating yf_history series.",
      inputSchema: {
        type: "object",
        properties: {
          tickers: {
            type: "array",
            items: { type: "string" },
            description: "2-12 ticker symbols (e.g. ['VTI', 'VXUS', 'AVUV'])",
          },
          period1: { type: "string", description: "Start date in ISO format (default: 1 year back)" },
          period2: { type: "string", description: "End date in ISO format (default: now)" },
          interval: {
            type: "string",
            enum: ["1d", "1wk", "1mo"],
            description: "Return interval (default: 1d). Use 1mo for long-horizon correlation.",
          },
        },
        required: ["tickers"],
      },
    },
    {
      name: "yf_dividends",
      description:
        "Dividend history for one ticker with ex-date price behavior. Returns each ex-date and amount, the open gap and close-to-close move on the ex-date, days to recover the pre-ex close, and summary stats (TTM total, yield on last close, mean/median ex-day move, positive rate).",
      inputSchema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Ticker symbol (e.g. 'QYLD')" },
          period1: { type: "string", description: "Start date in ISO format (default: 3 years back)" },
          period2: { type: "string", description: "End date in ISO format (default: now)" },
        },
        required: ["ticker"],
      },
    },
    {
      name: "yf_options",
      description:
        "Options chain for ONE ticker. With `date` omitted returns metadata only (expirationDates, strikes, hasMiniOptions, quote) to avoid huge payloads. With `date` (ISO YYYY-MM-DD) returns that expiration's calls/puts with strike, lastPrice, bid/ask, volume, openInterest, impliedVolatility (decimal) and impliedVolatilityPct (percent), inTheMoney. Filters: side, minOpenInterest, limit. compact drops change/percentChange/lastTradeDate/currency/contractSize. No greeks beyond IV (delta/gamma/theta/vega and IV rank are not provided by yfinance). Single ticker only.",
      inputSchema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Ticker symbol (e.g. 'AAPL')" },
          date: {
            type: "string",
            description: "Expiration date in strict ISO YYYY-MM-DD format. Omit for metadata only.",
          },
          side: {
            type: "string",
            enum: ["all", "call", "put"],
            description: "Which side(s) to return (default: all).",
          },
          minOpenInterest: {
            type: "number",
            description: "Minimum open interest to include a contract (default: 0).",
          },
          limit: {
            type: "number",
            description: "Max contracts per side (default: 100).",
          },
          compact: {
            type: "boolean",
            description: "Drop change/percentChange/lastTradeDate/currency/contractSize (default: true).",
          },
          pretty: {
            type: "boolean",
            description: "Pretty-print JSON with 2-space indent (default: false).",
          },
        },
        required: ["ticker"],
      },
    },
    {
      name: "yf_option_summary",
      description: "Summary of one expiration: avg IV (OI-weighted + unweighted), OI/volume totals, put/call volume + OI ratios, max pain. Single ticker only.",
      inputSchema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Ticker symbol (e.g. 'AAPL')" },
          date: { type: "string", description: "Expiration date strict YYYY-MM-DD." },
          limit: { type: "number", description: "Max contracts per side considered (default: 100, max 200)." },
          pretty: { type: "boolean", description: "Pretty-print JSON (default: false)." },
        },
        required: ["ticker", "date"],
      },
    },
    {
      name: "yf_earnings",
      description: "Earnings dates, surprise history, and analyst estimate trend for ONE ticker. Returns calendarEvents (next earnings date, estimate flag, avg/low/high EPS and revenue), earningsHistory (newest first, limit), and earningsTrend (0q/+1q/... estimates and revisions). Single ticker only.",
      inputSchema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Ticker symbol (e.g. 'AAPL')" },
          limit: { type: "number", description: "Max rows for earnings history (default: 8, max 40)." },
          pretty: { type: "boolean", description: "Pretty-print JSON (default: false)." },
        },
        required: ["ticker"],
      },
    },
    {
      name: "yf_recommendations",
      description: "Analyst recommendation trend snapshot for ONE ticker: period (0m/-1m/-2m/-3m) with strongBuy/buy/hold/sell/strongSell counts. Current snapshot only, not date-indexed history. Single ticker only.",
      inputSchema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Ticker symbol (e.g. 'AAPL')" },
          pretty: { type: "boolean", description: "Pretty-print JSON (default: false)." },
        },
        required: ["ticker"],
      },
    },
    {
      name: "yf_financials",
      description: "Financial statements for ONE ticker via fundamentalsTimeSeries. statement: financials | cash-flow | balance-sheet. freq: quarterly | annual | trailing. Whitelisted key metrics by default; full=true returns all rows/fields (large). Single ticker only.",
      inputSchema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Ticker symbol (e.g. 'AAPL')" },
          statement: { type: "string", enum: ["financials", "cash-flow", "balance-sheet"], description: "Statement type (default: financials)." },
          freq: { type: "string", enum: ["quarterly", "annual", "trailing"], description: "Frequency (default: annual)." },
          period1: { type: "string", description: "Start date ISO (default: 5 years back)." },
          limit: { type: "number", description: "Max periods (default: 5, max 20)." },
          full: { type: "boolean", description: "Return all fields/rows (default: false)." },
          pretty: { type: "boolean", description: "Pretty-print JSON (default: false)." },
        },
        required: ["ticker"],
      },
    },
  ],
}))

export function extractQuoteSummary(quote: any) {
  return {
    symbol: quote.symbol,
    shortName: quote.shortName ?? quote.longName ?? "N/A",
    regularMarketPrice: quote.regularMarketPrice,
    regularMarketChange: quote.regularMarketChange,
    regularMarketChangePercent: quote.regularMarketChangePercent,
    regularMarketPreviousClose: quote.regularMarketPreviousClose,
    regularMarketOpen: quote.regularMarketOpen,
    regularMarketDayHigh: quote.regularMarketDayHigh,
    regularMarketDayLow: quote.regularMarketDayLow,
    regularMarketVolume: quote.regularMarketVolume,
    averageVolume: quote.averageVolume,
    marketCap: quote.marketCap,
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
    trailingPE: quote.trailingPE,
    forwardPE: quote.forwardPE,
    dividendYield: quote.dividendYield,
    beta: quote.beta,
    earningsPerShare: quote.earningsPerShare,
    marketState: quote.marketState ?? null,
  }
}

export function extractFundamentals(quote: any) {
  return {    symbol: quote.symbol,
    shortName: quote.shortName ?? quote.longName ?? "N/A",
    marketCap: quote.marketCap,
    enterpriseValue: quote.enterpriseValue,
    trailingPE: quote.trailingPE,
    forwardPE: quote.forwardPE,
    pegRatio: quote.pegRatio,
    earningsPerShare: quote.earningsPerShare,
    dividendYield: quote.dividendYield,
    dividendRate: quote.dividendRate,
    payoutRatio: quote.payoutRatio,
    beta: quote.beta,
    bookValue: quote.bookValue,
    priceToBook: quote.priceToBook,
    debtToEquity: quote.debtToEquity,
    returnOnEquity: quote.returnOnEquity,
    freeCashflow: quote.freeCashflow,
    operatingCashflow: quote.operatingCashflow,
    revenueGrowth: quote.revenueGrowth,
    earningsGrowth: quote.earningsGrowth,
    grossMargins: quote.grossMargins,
    operatingMargins: quote.operatingMargins,
    profitMargins: quote.profitMargins,
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
    fiftyDayAverage: quote.fiftyDayAverage,
    twoHundredDayAverage: quote.twoHundredDayAverage,
    sharesOutstanding: quote.sharesOutstanding,
    floatShares: quote.floatShares,
    heldPercentInstitutions: quote.heldPercentInstitutions,
    sector: quote.sector,
    industry: quote.industry,
  }
}

async function getQuote(ticker: string) {
  return cached(`yf_quote:${ticker.toUpperCase()}`, TTL.quote, () => yf.quote(ticker))
}

function parseDate(value: string, label: string): Date {
  const date = new Date(value)
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ${label} date string: "${value}". Use ISO format like "2026-01-01" or a Unix timestamp.`)
  }
  return date
}

export function parseDateStrict(value: string, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${label}: "${value}". Use strict YYYY-MM-DD format.`)
  }
  const date = new Date(value + "T00:00:00Z")
  if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid ${label}: "${value}".`)
  }
  return value
}

export function roundTo(value: number | null, digits = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function pearson(x: number[], y: number[]): number | null {
  const n = x.length
  if (n < 2) return null
  const mx = x.reduce((sum, value) => sum + value, 0) / n
  const my = y.reduce((sum, value) => sum + value, 0) / n
  let covariance = 0
  let varianceX = 0
  let varianceY = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx
    const dy = y[i] - my
    covariance += dx * dy
    varianceX += dx * dx
    varianceY += dy * dy
  }
  if (varianceX === 0 || varianceY === 0) return null
  return covariance / Math.sqrt(varianceX * varianceY)
}

function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

async function getHistory(
  ticker: string,
  period1: string,
  period2: string | undefined,
  interval: "1d" | "1wk" | "1mo",
): Promise<Bar[]> {
  const d1 = parseDate(period1, "period1")
  let d2: Date | undefined
  if (period2) d2 = parseDate(period2, "period2")
  else if (interval === "1d") d2 = new Date()

  const chartOptions: any = { period1: d1, interval, return: "array" }
  if (d2) chartOptions.period2 = d2

  const key = `yf_history:${ticker.toUpperCase()}:${d1.toISOString()}:${d2?.toISOString() ?? ""}:${interval}`
  const result = await cached(key, TTL.history, () => yf.chart(ticker, chartOptions))
  const quotes = (result as any)?.quotes ?? []
  // Filter out rows with null OHLCV (incomplete bars from half-days/holidays)
  // instead of throwing like yf.historical() does.
  return quotes
    .filter((q: any) => q.close != null && q.open != null && q.high != null && q.low != null)
    .map((q: any) => ({
      date: q.date instanceof Date ? q.date.toISOString() : String(q.date),
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      adjClose: q.adjclose ?? q.adjClose,
      volume: q.volume ?? 0,
    })) as Bar[]
}

async function getQuoteSummaryModules(ticker: string, modules: string[]) {
  const key = `yf_qs:${ticker.toUpperCase()}:${modules.join(",")}`
  return cached(key, TTL.quoteSummary, async () =>
    withRetry(() => yf.quoteSummary(ticker, { modules: modules as any }), { timeoutMs: 10000 }),
  )
}

function mergeQuoteSummary(base: any, qs: any) {
  const ap = qs?.assetProfile || {}
  const fd = qs?.financialData || {}
  const ks = qs?.defaultKeyStatistics || {}
  const sp = qs?.summaryProfile || {}
  const out: any = { ...base }
  const set = (k: string, v: any) => { if (v !== undefined && v !== null) out[k] = v }

  set("website", ap.website)
  set("fullTimeEmployees", ap.fullTimeEmployees ?? sp.fullTimeEmployees)
  set("description", ap.longBusinessSummary)
  set("sector", ap.sectorDisp || ap.sector || sp.sector)
  set("industry", ap.industryDisp || ap.industry || sp.industry)

  set("enterpriseValue", ks.enterpriseValue)
  set("pegRatio", ks.pegRatio)
  set("trailingEps", ks.trailingEps)
  set("forwardEps", ks.forwardEps)
  set("bookValue", ks.bookValue ?? out.bookValue)
  set("priceToBook", ks.priceToBook ?? out.priceToBook)
  set("beta", ks.beta ?? out.beta)
  set("floatShares", ks.floatShares)
  set("sharesOutstanding", ks.sharesOutstanding ?? out.sharesOutstanding)
  set("heldPercentInstitutions", ks.heldPercentInstitutions)
  set("heldPercentInsiders", ks.heldPercentInsiders)
  set("profitMargins", ks.profitMargins ?? fd.profitMargins)
  set("enterpriseToRevenue", ks.enterpriseToRevenue)
  set("enterpriseToEbitda", ks.enterpriseToEbitda)

  set("totalRevenue", fd.totalRevenue)
  set("totalCash", fd.totalCash)
  set("totalDebt", fd.totalDebt)
  set("quickRatio", fd.quickRatio)
  set("currentRatio", fd.currentRatio)
  set("debtToEquity", fd.debtToEquity)
  set("revenuePerShare", fd.revenuePerShare)
  set("returnOnAssets", fd.returnOnAssets)
  set("returnOnEquity", fd.returnOnEquity)
  set("grossProfits", fd.grossProfits)
  set("freeCashflow", fd.freeCashflow)
  set("operatingCashflow", fd.operatingCashflow)
  set("revenueGrowth", fd.revenueGrowth)
  set("earningsGrowth", fd.earningsGrowth)
  set("grossMargins", fd.grossMargins)
  set("operatingMargins", fd.operatingMargins)
  set("ebitda", fd.ebitda)
  set("ebitdaMargins", fd.ebitdaMargins)
  set("targetHighPrice", fd.targetHighPrice)
  set("targetLowPrice", fd.targetLowPrice)
  set("targetMeanPrice", fd.targetMeanPrice)
  set("targetMedianPrice", fd.targetMedianPrice)
  set("recommendationKey", fd.recommendationKey)
  set("recommendationMean", fd.recommendationMean)
  set("numberOfAnalystOpinions", fd.numberOfAnalystOpinions)

  return out
}

async function getFundamentals(ticker: string) {
  return cached(`yf_fundamentals:${ticker.toUpperCase()}`, TTL.fundamentals, async () => {
    const quote = await withRetry(() => getQuote(ticker), { timeoutMs: 8000 })
    const base = extractFundamentals(quote)
    try {
      const qs = await getQuoteSummaryModules(ticker, ["assetProfile", "financialData", "defaultKeyStatistics", "summaryProfile"])
      return mergeQuoteSummary(base, qs)
    } catch (e) {
      return base
    }
  })
}

async function getNews(symbol: string, count: number) {
  return cached(`yf_news:${symbol.toUpperCase()}:${count}`, TTL.news, async () => {
    const search = await yf.search(symbol, {
      quotesCount: 0,
      newsCount: count * 3,
      enableFuzzyQuery: false,
    })
    const items = (search.news ?? []).map((item: any) => ({
      title: item.title,
      publisher: item.publisher,
      published: item.providerPublishTime ? new Date(item.providerPublishTime).toISOString() : null,
      link: item.link,
      relatedTickers: item.relatedTickers ?? [],
      relevant: (item.relatedTickers ?? []).includes(symbol),
    }))
    // Ticker-specific stories first, sector/market context after.
    return [...items.filter((item) => item.relevant), ...items.filter((item) => !item.relevant)].slice(0, count)
  })
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case "yf_quote": {
        const { tickers } = args as { tickers: string[] }
        const results = await Promise.all(
          tickers.map(async (ticker) => {
            try {
              const quote = await getQuote(ticker)
              return { ticker, data: extractQuoteSummary(quote), error: null }
            } catch (e: any) {
              return { ticker, data: null, error: e.message ?? String(e) }
            }
          }),
        )
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        }
      }

      case "yf_history": {
        const { ticker, period1, period2, interval, fields, tail } = args as {
          ticker: string
          period1: string
          period2?: string
          interval?: "1d" | "1wk" | "1mo"
          fields?: string[]
          tail?: number
        }

        const rows = await getHistory(ticker, period1, period2, interval ?? "1d")
        const allowedFields = new Set(["date", "open", "high", "low", "close", "adjClose", "volume"])
        if (fields) {
          for (const field of fields) {
            if (!allowedFields.has(field)) throw new Error(`Unknown field "${field}". Allowed: ${[...allowedFields].join(", ")}`)
          }
        }
        const selected = fields ? (fields.includes("date") ? fields : ["date", ...fields]) : null
        let projected: any[] = selected
          ? rows.map((row) => Object.fromEntries(selected.map((field) => [field, (row as any)[field]])))
          : rows
        if (tail !== undefined) {
          if (!Number.isInteger(tail) || tail <= 0) throw new Error("tail must be a positive integer")
          projected = projected.slice(-tail)
        }
        return {
          content: [{ type: "text", text: JSON.stringify(projected, null, 2) }],
        }
      }

      case "yf_fundamentals": {
        const { ticker } = args as { ticker: string }
        const fundamentals = await getFundamentals(ticker)
        return {
          content: [{ type: "text", text: JSON.stringify(fundamentals, null, 2) }],
        }
      }

      case "yf_search": {
        const { query } = args as { query: string }
        const results = await yf.search(query)
        const suggestions = (results as any).quotes?.map((q: any) => ({
          symbol: q.symbol,
          name: q.shortname ?? q.longname ?? "N/A",
          exchange: q.exchange ?? "N/A",
          type: q.quoteType ?? "N/A",
          sector: q.sector ?? "N/A",
          industry: q.industry ?? "N/A",
        })) ?? []
        return {
          content: [{ type: "text", text: JSON.stringify(suggestions, null, 2) }],
        }
      }

      case "yf_news": {
        const { symbols, count, compact } = args as { symbols: string[]; count?: number; compact?: boolean }
        const perSymbol = Math.min(Math.max(count ?? 5, 1), 20)
        const isCompact = compact === true
        const results = await Promise.all(
          symbols.map(async (symbol) => {
            try {
              const items = await getNews(symbol, perSymbol)
              const headlines = isCompact
                ? items.map((item: any) => ({
                    title: String(item.title ?? "").slice(0, 120),
                    publisher: item.publisher,
                    published: item.published ? String(item.published).slice(0, 10) : null,
                    relevant: item.relevant,
                  }))
                : items
              return {
                symbol,
                headlines,
                error: headlines.length === 0 ? "no news returned" : null,
              }
            } catch (e: any) {
              return { symbol, headlines: [], error: e.message ?? String(e) }
            }
          }),
        )
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, isCompact ? 0 : 2) }],
        }
      }

      case "ta": {
        const { ticker, period1, period2, interval, windows, levels } = args as {
          ticker: string
          period1?: string
          period2?: string
          interval?: "1d" | "1wk"
          windows?: number[]
          levels?: boolean
        }
        const resolvedInterval = interval ?? "1d"
        const resolvedPeriod1 =
          period1 ?? new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        const resolvedWindows = (windows ?? [20, 50, 100, 200]).filter((window) => Number.isInteger(window) && window > 0)
        if (resolvedWindows.length === 0) throw new Error("windows must contain at least one positive integer")

        const bars = await getHistory(ticker, resolvedPeriod1, period2, resolvedInterval)
        let quote: Record<string, unknown> | null = null
        try {
          quote = extractQuoteSummary(await getQuote(ticker))
        } catch (e: any) {
          quote = { error: e.message ?? String(e) }
        }
        const result = computeTa(bars, { windows: resolvedWindows, levels: levels !== false, interval: resolvedInterval }, quote ?? undefined)
        result.ticker = ticker
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        }
      }

      case "yf_correlation": {
        const { tickers, period1, period2, interval } = args as {
          tickers: string[]
          period1?: string
          period2?: string
          interval?: "1d" | "1wk" | "1mo"
        }
        const symbols = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))]
        if (symbols.length < 2) throw new Error("yf_correlation needs at least 2 distinct tickers")
        if (symbols.length > 12) throw new Error("yf_correlation supports at most 12 tickers")

        const resolvedInterval = interval ?? "1d"
        const minBars = resolvedInterval === "1mo" ? 6 : resolvedInterval === "1wk" ? 12 : 20
        const resolvedPeriod1 =
          period1 ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        const notes: string[] = []
        const series: Record<string, Record<string, number>> = {}

        await Promise.all(
          symbols.map(async (symbol) => {
            try {
              const bars = await getHistory(symbol, resolvedPeriod1, period2, resolvedInterval)
              if (bars.length < minBars) {
                notes.push(`${symbol}: only ${bars.length} bars, excluded`)
                return
              }
              series[symbol] = Object.fromEntries(bars.map((bar) => [bar.date.slice(0, 10), bar.close]))
            } catch (e: any) {
              notes.push(`${symbol}: ${e.message ?? String(e)}`)
            }
          }),
        )

        const available = symbols.filter((symbol) => series[symbol])
        if (available.length < 2) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ tickers: symbols, matrix: null, notes, error: "fewer than 2 tickers had usable history" }, null, 2),
              },
            ],
          }
        }

        const commonDates = Object.keys(series[available[0]])
          .filter((date) => available.every((symbol) => series[symbol][date] !== undefined))
          .sort()
        const returnDates = commonDates.slice(1)
        const returns: Record<string, Record<string, number>> = {}
        for (const symbol of available) {
          returns[symbol] = {}
          for (let i = 1; i < commonDates.length; i++) {
            const previous = series[symbol][commonDates[i - 1]]
            if (previous > 0) returns[symbol][commonDates[i]] = series[symbol][commonDates[i]] / previous - 1
          }
        }

        const periodsPerYear = resolvedInterval === "1d" ? 252 : resolvedInterval === "1wk" ? 52 : 12
        const matrix: Record<string, Record<string, number | null>> = {}
        const volatility: Record<string, number | null> = {}
        for (const a of available) {
          const aReturns = returnDates.map((date) => returns[a][date])
          volatility[a] = roundTo((standardDeviation(aReturns) ?? NaN) * Math.sqrt(periodsPerYear) * 100, 1)
          matrix[a] = {}
          for (const b of available) {
            const bReturns = returnDates.map((date) => returns[b][date])
            matrix[a][b] = roundTo(pearson(aReturns, bReturns), 2)
          }
        }

        const payload = {
          tickers: available,
          interval: resolvedInterval,
          period: { from: commonDates[0], to: commonDates[commonDates.length - 1], returnBars: returnDates.length },
          matrix,
          annualizedVolatilityPct: volatility,
          notes,
        }
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        }
      }

      case "yf_dividends": {
        const { ticker, period1, period2 } = args as { ticker: string; period1?: string; period2?: string }
        const resolvedPeriod1 =
          period1 ?? new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        const bars = await getHistory(ticker, resolvedPeriod1, period2, "1d")
        const dividendRows = await cached(
          `yf_dividends:${ticker.toUpperCase()}:${resolvedPeriod1}:${period2 ?? ""}`,
          TTL.fundamentals,
          async () => {
            const chartResult: any = await yf.chart(ticker, {
              period1: parseDate(resolvedPeriod1, "period1"),
              period2: period2 ? parseDate(period2, "period2") : new Date(),
              interval: "1d",
              events: "div",
              return: "array",
            })
            return (chartResult?.events?.dividends ?? []).map((d: any) => ({
              date: d.date,
              dividends: d.amount,
            }))
          },
        )

        const indexByDate = new Map(bars.map((bar, index) => [bar.date.slice(0, 10), index]))
        const events = dividendRows
          .filter((row) => Number(row.dividends) > 0)
          .map((row) => {
            const exDate = (row.date instanceof Date ? row.date.toISOString() : String(row.date)).slice(0, 10)
            const index = indexByDate.get(exDate)
            if (index === undefined || index === 0) {
              return { exDate, amount: roundTo(Number(row.dividends), 4), gapPct: null, exDayPct: null, recoverDays: null }
            }
            const bar = bars[index]
            const previousClose = bars[index - 1].close
            let recoverDays: number | null = null
            for (let i = index; i < Math.min(bars.length, index + 46); i++) {
              if (bars[i].close >= previousClose) {
                recoverDays = i - index + 1
                break
              }
            }
            return {
              exDate,
              amount: roundTo(Number(row.dividends), 4),
              gapPct: roundTo((bar.open / previousClose - 1) * 100, 2),
              exDayPct: roundTo((bar.close / previousClose - 1) * 100, 2),
              recoverDays,
            }
          })
          .slice(-40)

        const lastClose = bars.length ? bars[bars.length - 1].close : null
        const lastDate = bars.length ? new Date(bars[bars.length - 1].date) : null
        const ttmCutoff = lastDate ? new Date(lastDate.getTime() - 365 * 24 * 60 * 60 * 1000) : null
        const ttmTotal = ttmCutoff
          ? events
              .filter((event) => new Date(event.exDate) >= ttmCutoff)
              .reduce((sum, event) => sum + (event.amount ?? 0), 0)
          : null
        const exDayMoves = events.map((event) => event.exDayPct).filter((value): value is number => value !== null)
        const recoveries = events.map((event) => event.recoverDays).filter((value): value is number => value !== null)

        const payload = {
          ticker,
          events,
          summary: {
            count: events.length,
            first: events[0]?.exDate ?? null,
            last: events[events.length - 1]?.exDate ?? null,
            ttmTotal: ttmTotal === null ? null : roundTo(ttmTotal, 4),
            ttmYieldPct: ttmTotal !== null && lastClose ? roundTo((ttmTotal / lastClose) * 100, 2) : null,
            meanExDayPct: exDayMoves.length
              ? roundTo(exDayMoves.reduce((sum, value) => sum + value, 0) / exDayMoves.length, 2)
              : null,
            medianExDayPct: roundTo(median(exDayMoves), 2),
            positiveRatePct: exDayMoves.length
              ? roundTo((exDayMoves.filter((value) => value > 0).length / exDayMoves.length) * 100, 1)
              : null,
            avgRecoverDays: recoveries.length
              ? roundTo(recoveries.reduce((sum, value) => sum + value, 0) / recoveries.length, 1)
              : null,
          },
        }
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        }
      }

      case "yf_options": {
        const { ticker, date, side, minOpenInterest, minVolume, minStrike, maxStrike, moneyness, maxBidAskSpread, limit, compact, pretty } = args as {
          ticker: string
          date?: string
          side?: "all" | "call" | "put"
          minOpenInterest?: number
          minVolume?: number
          minStrike?: number
          maxStrike?: number
          moneyness?: "itm" | "otm" | "atm"
          maxBidAskSpread?: number
          limit?: number
          compact?: boolean
          pretty?: boolean
        }

        const resolvedSide = side ?? "all"
        if (!["all", "call", "put"].includes(resolvedSide)) throw new Error(`side must be one of: all, call, put`)
        if (moneyness !== undefined && !["itm", "otm", "atm"].includes(moneyness)) throw new Error(`moneyness must be itm, otm, or atm`)
        const resolvedMinOI = Number.isFinite(minOpenInterest) ? Math.max(0, minOpenInterest as number) : 0
        const resolvedMinVol = Number.isFinite(minVolume) ? Math.max(0, minVolume as number) : 0
        const resolvedLimit = Number.isInteger(limit) && (limit as number) > 0 ? (limit as number) : 100
        const isCompact = compact !== false
        const isPretty = pretty === true

        // Metadata-only path when no date.
        if (!date) {
          const metadata = await cached(`yf_options:${ticker.toUpperCase()}:metadata`, TTL.options, async () => {
            const result: any = await withRetry(() => yf.options(ticker, {}), { timeoutMs: 10000 })
            return {
              underlyingSymbol: result.underlyingSymbol,
              expirationDates: (result.expirationDates ?? []).map((d: any) =>
                d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)),
              strikes: result.strikes ?? [],
              hasMiniOptions: result.hasMiniOptions ?? false,
              quote: extractQuoteSummary(result.quote),
            }
          })
          return { content: [{ type: "text", text: JSON.stringify(metadata, null, isPretty ? 2 : 0) }] }
        }

        const strictDate = parseDateStrict(date, "date")

        // Cache the full normalized chain per (ticker, expiration).
        const chain = await cached(`yf_options:chain:${ticker.toUpperCase()}:${strictDate}`, TTL.options, async () => {
          const result: any = await withRetry(() => yf.options(ticker, { date: parseDate(strictDate, "date") }), { timeoutMs: 10000 })
          const exp = (result.options ?? [])[0]
          const normalizeContract = (contract: any) => {
            const iv = typeof contract?.impliedVolatility === "number" ? contract.impliedVolatility : null
            const base: any = {
              contractSymbol: contract?.contractSymbol,
              strike: contract?.strike,
              lastPrice: contract?.lastPrice,
              bid: contract?.bid,
              ask: contract?.ask,
              volume: contract?.volume,
              openInterest: contract?.openInterest,
              impliedVolatility: iv,
              impliedVolatilityPct: iv === null ? null : roundTo(iv * 100, 2),
              inTheMoney: contract?.inTheMoney,
              expiration: contract?.expiration instanceof Date
                ? contract.expiration.toISOString().slice(0, 10)
                : (contract?.expiration != null ? String(contract.expiration).slice(0, 10) : null),
              lastTradeDate: contract?.lastTradeDate instanceof Date
                ? contract.lastTradeDate.toISOString()
                : (contract?.lastTradeDate != null ? String(contract.lastTradeDate) : null),
            }
            if (!isCompact) {
              base.change = contract?.change
              base.percentChange = contract?.percentChange
              base.currency = contract?.currency
              base.contractSize = contract?.contractSize
            }
            return base
          }
          return {
            underlyingSymbol: result.underlyingSymbol,
            expirationDate: exp?.expirationDate instanceof Date
              ? exp.expirationDate.toISOString().slice(0, 10)
              : (exp?.expirationDate != null ? String(exp.expirationDate).slice(0, 10) : null),
            requestedDate: strictDate,
            expirationDates: (result.expirationDates ?? []).map((d: any) =>
              d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)),
            strikes: result.strikes ?? [],
            hasMiniOptions: result.hasMiniOptions ?? false,
            quote: extractQuoteSummary(result.quote),
            underlyingPrice: (result.quote?.regularMarketPrice ?? result.quote?.currentPrice ?? null),
            calls: (exp?.calls ?? []).map(normalizeContract),
            puts: (exp?.puts ?? []).map(normalizeContract),
          }
        })

        const underlyingPrice = chain.underlyingPrice

        const filterSide = (contracts: any[], sideLabel: "call" | "put") => {
          let out = contracts ?? []
          if (resolvedMinOI > 0) out = out.filter((c) => (c.openInterest ?? 0) >= resolvedMinOI)
          if (resolvedMinVol > 0) out = out.filter((c) => (c.volume ?? 0) >= resolvedMinVol)
          if (minStrike !== undefined) out = out.filter((c) => (c.strike ?? 0) >= minStrike)
          if (maxStrike !== undefined) out = out.filter((c) => (c.strike ?? 0) <= maxStrike)
          if (maxBidAskSpread !== undefined) out = out.filter((c) => {
            const bid = c.bid, ask = c.ask
            if (bid == null || ask == null) return false
            return (ask - bid) <= maxBidAskSpread
          })
          if (moneyness && underlyingPrice != null) {
            out = out.filter((c) => {
              const strike = c.strike
              if (strike == null) return false
              const isCall = sideLabel === "call"
              if (moneyness === "itm") return isCall ? strike < underlyingPrice : strike > underlyingPrice
              if (moneyness === "otm") return isCall ? strike > underlyingPrice : strike < underlyingPrice
              // atm: within 1%
              return Math.abs(strike - underlyingPrice) / underlyingPrice <= 0.01
            })
          }
          out = [...out].sort((a, b) => (a.strike ?? 0) - (b.strike ?? 0))
          return out.slice(0, resolvedLimit)
        }

        const calls = resolvedSide === "put" ? [] : filterSide(chain.calls, "call")
        const puts = resolvedSide === "call" ? [] : filterSide(chain.puts, "put")

        const data: any = {
          underlyingSymbol: chain.underlyingSymbol,
          expirationDate: chain.expirationDate,
          requestedDate: strictDate,
          expirationDates: chain.expirationDates,
          strikes: chain.strikes,
          hasMiniOptions: chain.hasMiniOptions,
          quote: chain.quote,
          underlyingPrice,
          calls,
          puts,
          counts: { calls: calls.length, puts: puts.length },
        }
        if (chain.expirationDate && chain.expirationDate !== strictDate) {
          data.expirationMismatchNote = `requested ${strictDate}, got ${chain.expirationDate}`
        }
        return { content: [{ type: "text", text: JSON.stringify(data, null, isPretty ? 2 : 0) }] }
      }

      case "yf_earnings": {
        const { ticker, limit, pretty } = args as { ticker: string; limit?: number; pretty?: boolean }
        const resolvedLimit = Number.isInteger(limit) && (limit as number) > 0 ? Math.min(limit as number, 40) : 8
        const isPretty = pretty === true
        const data = await cached(`yf_earnings:${ticker.toUpperCase()}:${resolvedLimit}`, TTL.quoteSummary, async () => {
          const qs: any = await withRetry(() => yf.quoteSummary(ticker, { modules: ["calendarEvents", "earnings", "earningsHistory", "earningsTrend"] }), { timeoutMs: 10000 })
          const history = Array.isArray(qs?.earningsHistory?.history) ? qs.earningsHistory.history : []
          const trend = Array.isArray(qs?.earningsTrend?.trend) ? qs.earningsTrend.trend : []
          return {
            symbol: ticker.toUpperCase(),
            calendarEvents: qs?.calendarEvents ?? null,
            earnings: qs?.earnings ?? null,
            earningsHistory: history.slice(0, resolvedLimit).map((h: any) => ({
              quarter: h.quarter instanceof Date ? h.quarter.toISOString().slice(0, 10) : String(h.quarter ?? "").slice(0, 10),
              epsActual: h.epsActual ?? null,
              epsEstimate: h.epsEstimate ?? null,
              epsDifference: h.epsDifference ?? null,
              surprisePercent: h.surprisePercent ?? null,
              period: h.period ?? null,
              currency: h.currency ?? null,
            })),
            earningsTrend: trend.slice(0, resolvedLimit).map((t: any) => ({
              period: t.period ?? null,
              endDate: t.endDate instanceof Date ? t.endDate.toISOString().slice(0, 10) : String(t.endDate ?? "").slice(0, 10),
              growth: t.growth ?? null,
              earningsEstimate: t.earningsEstimate ?? null,
              revenueEstimate: t.revenueEstimate ?? null,
              epsTrend: t.epsTrend ?? null,
              epsRevisions: t.epsRevisions ?? null,
            })),
          }
        })
        return { content: [{ type: "text", text: JSON.stringify(data, null, isPretty ? 2 : 0) }] }
      }

      case "yf_recommendations": {
        const { ticker, pretty } = args as { ticker: string; pretty?: boolean }
        const isPretty = pretty === true
        const data = await cached(`yf_recommendations:${ticker.toUpperCase()}`, TTL.quoteSummary, async () => {
          const qs: any = await withRetry(() => yf.quoteSummary(ticker, { modules: ["recommendationTrend"] }), { timeoutMs: 10000 })
          const trend = Array.isArray(qs?.recommendationTrend?.trend) ? qs.recommendationTrend.trend : []
          return {
            symbol: ticker.toUpperCase(),
            recommendationTrend: trend.map((t: any) => ({
              period: t.period ?? null,
              strongBuy: t.strongBuy ?? null,
              buy: t.buy ?? null,
              hold: t.hold ?? null,
              sell: t.sell ?? null,
              strongSell: t.strongSell ?? null,
            })),
          }
        })
        return { content: [{ type: "text", text: JSON.stringify(data, null, isPretty ? 2 : 0) }] }
      }

      case "yf_financials": {
        const { ticker, statement, freq, period1, limit, full, pretty } = args as {
          ticker: string; statement?: string; freq?: string; period1?: string; limit?: number; full?: boolean; pretty?: boolean
        }
        const resolvedStatement = statement ?? "financials"
        const moduleMap: Record<string, string> = { "financials": "financials", "cash-flow": "cash-flow", "balance-sheet": "balance-sheet" }
        const mod = moduleMap[resolvedStatement]
        if (!mod) throw new Error(`statement must be one of: financials, cash-flow, balance-sheet`)
        const resolvedFreq = freq === "quarterly" ? "quarterly" : freq === "trailing" ? "trailing" : "annual"
        const resolvedLimit = Number.isInteger(limit) && (limit as number) > 0 ? Math.min(limit as number, 20) : 5
        const resolvedPeriod1 = period1 ? parseDateStrict(period1, "period1") : new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        const isPretty = pretty === true
        const isFull = full === true
        const whitelist = ["totalRevenue","netIncome","netIncomeCommonStockholders","grossProfit","operatingIncome","EBITDA","operatingCashflow","freeCashflow","capitalExpenditure","totalAssets","totalLiabilitiesNetMinorityInterest","stockholdersEquity","basicEPS","dilutedEPS","basicAverageShares"]
        const data = await cached(`yf_financials:${ticker.toUpperCase()}:${mod}:${resolvedFreq}:${resolvedPeriod1}:${resolvedLimit}:${isFull}`, TTL.fundamentalsTimeSeries, async () => {
          const rows: any = await withRetry(() => yf.fundamentalsTimeSeries(ticker, { period1: resolvedPeriod1, module: mod, type: resolvedFreq as any }), { timeoutMs: 15000 })
          const arr = Array.isArray(rows) ? rows : []
          const trimmed = arr.slice(-resolvedLimit)
          const projected = isFull ? trimmed : trimmed.map((row: any) => {
            const out: any = { date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date ?? "").slice(0, 10), periodType: row.periodType ?? null }
            for (const k of whitelist) if (row[k] !== undefined) out[k] = row[k]
            return out
          })
          return {
            symbol: ticker.toUpperCase(),
            statement: resolvedStatement,
            module: mod,
            freq: resolvedFreq,
            period1: resolvedPeriod1,
            count: projected.length,
            rows: projected,
          }
        })
        return { content: [{ type: "text", text: JSON.stringify(data, null, isPretty ? 2 : 0) }] }
      }

      case "yf_option_summary": {
        const { ticker, date, limit, pretty } = args as { ticker: string; date: string; limit?: number; pretty?: boolean }
        const strictDate = parseDateStrict(date, "date")
        const resolvedLimit = Number.isInteger(limit) && (limit as number) > 0 ? Math.min(limit as number, 200) : 100
        const isPretty = pretty === true
        const data = await cached(`yf_option_summary:${ticker.toUpperCase()}:${strictDate}:${resolvedLimit}`, TTL.options, async () => {
          const result: any = await withRetry(() => yf.options(ticker, { date: parseDate(strictDate, "date") }), { timeoutMs: 10000 })
          const exp = (result.options ?? [])[0]
          const calls = (exp?.calls ?? []).slice(0, resolvedLimit)
          const puts = (exp?.puts ?? []).slice(0, resolvedLimit)
          const num = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : 0)
          const totalOI = (arr: any[]) => arr.reduce((s, c) => s + num(c.openInterest), 0)
          const totalVol = (arr: any[]) => arr.reduce((s, c) => s + num(c.volume), 0)
          const avgIV = (arr: any[]) => {
            const ivs = arr.map((c) => c.impliedVolatility).filter((v: any) => typeof v === "number" && Number.isFinite(v))
            if (!ivs.length) return null
            return roundTo(ivs.reduce((s: number, v: number) => s + v, 0) / ivs.length, 4)
          }
          const oiWeightedIV = (arr: any[]) => {
            let nume = 0, den = 0
            for (const c of arr) {
              if (typeof c.impliedVolatility === "number" && Number.isFinite(c.impliedVolatility) && typeof c.openInterest === "number") {
                nume += c.impliedVolatility * c.openInterest
                den += c.openInterest
              }
            }
            return den > 0 ? roundTo(nume / den, 4) : null
          }
          const callOI = totalOI(calls), putOI = totalOI(puts)
          const callVol = totalVol(calls), putVol = totalVol(puts)
          // max pain over full chain strikes
          const strikes = [...new Set([...calls, ...puts].map((c) => c.strike).filter((v) => typeof v === "number"))].sort((a, b) => a - b)
          let maxPain: number | null = null
          if (strikes.length) {
            const pain: Record<number, number> = {}
            for (const strike of strikes) {
              let p = 0
              for (const c of calls) {
                if (typeof c.strike === "number" && typeof c.openInterest === "number") p += Math.max(strike - c.strike, 0) * c.openInterest
              }
              for (const c of puts) {
                if (typeof c.strike === "number" && typeof c.openInterest === "number") p += Math.max(c.strike - strike, 0) * c.openInterest
              }
              pain[strike] = p
            }
            const minKey = Object.keys(pain).reduce((a, b) => (pain[Number(a)] <= pain[Number(b)] ? a : b))
            maxPain = Number(minKey)
          }
          return {
            symbol: ticker.toUpperCase(),
            expirationDate: exp?.expirationDate instanceof Date ? exp.expirationDate.toISOString().slice(0, 10) : String(exp?.expirationDate ?? "").slice(0, 10),
            underlyingPrice: result.quote?.regularMarketPrice ?? result.quote?.currentPrice ?? null,
            impliedVolatility: {
              callsUnweighted: avgIV(calls),
              putsUnweighted: avgIV(puts),
              callsOIWeighted: oiWeightedIV(calls),
              putsOIWeighted: oiWeightedIV(puts),
            },
            openInterest: { calls: callOI, puts: putOI, total: callOI + putOI },
            volume: { calls: callVol, puts: putVol, total: callVol + putVol },
            putCallRatios: {
              volume: callVol > 0 ? roundTo(putVol / callVol, 4) : null,
              openInterest: callOI > 0 ? roundTo(putOI / callOI, 4) : null,
            },
            maxPain,
            contractsConsidered: { calls: calls.length, puts: puts.length },
          }
        })
        return { content: [{ type: "text", text: JSON.stringify(data, null, isPretty ? 2 : 0) }] }
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message ?? String(error)}` }],
    }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("Yahoo Finance MCP server running on stdio")
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Server error:", error)
    process.exit(1)
  })
}
