import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import YahooFinance from "yahoo-finance2"

const yf = new YahooFinance()

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
  return {
    symbol: quote.symbol,
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

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case "yf_quote": {
        const { tickers } = args as { tickers: string[] }
        const results = await Promise.all(
          tickers.map(async (ticker) => {
            try {
              const quote = await yf.quote(ticker)
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
        const { ticker, period1, period2, interval } = args as {
          ticker: string
          period1: string
          period2?: string
          interval?: "1d" | "1wk" | "1mo"
        }

        const resolvedInterval = interval ?? "1d"

        const d1 = new Date(period1)
        if (isNaN(d1.getTime())) {
          throw new Error(
            `Invalid period1 date string: "${period1}". Use ISO format like "2026-01-01" or a Unix timestamp.`,
          )
        }

        let d2: Date | undefined
        if (period2) {
          d2 = new Date(period2)
          if (isNaN(d2.getTime())) {
            throw new Error(
              `Invalid period2 date string: "${period2}". Use ISO format like "2026-07-30" or a Unix timestamp.`,
            )
          }
        } else if (resolvedInterval === "1d") {
          d2 = new Date()
        }

        const queryOptions: any = { period1: d1, interval: resolvedInterval }
        if (d2) queryOptions.period2 = d2

        const result = await yf.historical(ticker, queryOptions)
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        }
      }

      case "yf_fundamentals": {
        const { ticker } = args as { ticker: string }
        const quote = await yf.quote(ticker)
        return {
          content: [{ type: "text", text: JSON.stringify(extractFundamentals(quote), null, 2) }],
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
