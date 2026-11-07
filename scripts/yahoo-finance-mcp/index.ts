import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import YahooFinance from "yahoo-finance2"
import { computeTa, type Bar } from "./ta"

const yf = new YahooFinance()

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

const TTL = {
  quote: 15_000,
  history: 60_000,
  fundamentals: 3_600_000,
  news: 300_000,
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
  ],
}))

function extractQuoteSummary(quote: any) {
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
  }
}

function extractFundamentals(quote: any) {
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

function roundTo(value: number | null, digits = 2): number | null {
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

  const queryOptions: any = { period1: d1, interval }
  if (d2) queryOptions.period2 = d2

  const key = `yf_history:${ticker.toUpperCase()}:${d1.toISOString()}:${d2?.toISOString() ?? ""}:${interval}`
  const rows = await cached(key, TTL.history, () => yf.historical(ticker, queryOptions))
  return (rows as any[]).map((row) => ({
    ...row,
    date: row.date instanceof Date ? row.date.toISOString() : String(row.date),
  })) as Bar[]
}

async function getFundamentals(ticker: string) {
  return cached(`yf_fundamentals:${ticker.toUpperCase()}`, TTL.fundamentals, async () =>
    extractFundamentals(await getQuote(ticker)),
  )
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
            const options: any = { period1: parseDate(resolvedPeriod1, "period1"), events: "dividends" }
            if (period2) options.period2 = parseDate(period2, "period2")
            return (await yf.historical(ticker, options)) as any[]
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

main().catch((error) => {
  console.error("Server error:", error)
  process.exit(1)
})
