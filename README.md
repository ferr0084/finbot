# FinBot — AI-Powered Personal Financial Advisor

An [opencode](https://opencode.ai) agent that acts as a personal financial advisor: portfolio analysis, market research, risk profiling, budgeting, retirement planning, and tax-aware strategies.

This is a clean template — **no personal data is included**. Add your own finances in `data/`.

## Prerequisites

- [opencode](https://opencode.ai) CLI (v2.2+)
- [bun](https://bun.sh)

## Setup

```sh
git clone <repo-url> finbot
cd finbot
bun install                                  # typecheck/test dependencies
bun install --cwd .opencode                  # plugin runtime (@opencode/plugin)
bun install --cwd scripts/yahoo-finance-mcp  # market-data MCP (yahoo-finance2)
opencode
```

In opencode, switch to the **finbot** agent (Tab or `@finbot`).

## Add your data

Schemas live in `data/schema/`. Personal data is organized per member:

```
data/members/<id>/profile.json      member profile (id = self/spouse, the stable owner key)
data/members/<id>/accounts.json     brokerage/retirement/checking accounts (each has owner)
data/members/<id>/investments.json  holdings (cost basis only; prices are fetched live)
data/members/<id>/transactions.json cash flow
data/members/<id>/budgets.json      spending budgets
data/members/<id>/goals.json        savings/retirement goals
data/members/<id>/watchlist.json    tickers you track
```

`data/members/household/` is a member-style directory for joint records (accounts with `owner:"joint"`, plus household goals/watchlist/transactions/budgets). It has no `profile.json` — the household is not a person. Staged raw imports (e.g. broker CSV exports) go in `data/import/` and are not read for analysis.

Ask FinBot to save a fact and it will write the member or household file for you. Your `data/members/`, `data/import/`, and `plans/` directories are gitignored; only `data/schema/` ships with the template.

## Market data

**yahoo-finance MCP (zero config).** Bundled in `scripts/yahoo-finance-mcp/`, needs only bun. Exposes eight tools:

| Tool | Returns |
|---|---|
| `yf_quote` | Price, change, day/52W range, volume, market cap, P/E, beta (batch) |
| `yf_history` | OHLCV bars; `fields`/`tail` shrink the payload |
| `yf_fundamentals` | Valuation, margins, growth, balance-sheet ratios, sector |
| `yf_search` | Name/keyword → ticker, exchange, type |
| `yf_news` | Batched headlines with per-symbol `error`; `compact` halves the payload |
| `ta` | Trend, RSI/MACD, period returns (price and total), ATR/HV/drawdown, volume profile, S/R + Fibonacci |
| `yf_correlation` | Pairwise return correlation matrix + annualized vol |
| `yf_dividends` | Ex-dates, TTM total/yield, ex-day gap and recovery behavior |

Recurring analysis uses these generic tools instead of per-ticker scripts. Responses are cached in-process (quotes 15s, history 60s, fundamentals 1h, news 5min). No API keys required.

**Calc tools (plugin).** `.opencode/plugins/fin-tools/` registers `fin-calc_*` (NPV, CAGR, Sharpe, PMT, inflation, …), `portfolio-utils_*` (allocation, diversification, returns), and `fin-data_snapshot` — a price-free digest of every member's accounts and holdings (it returns `prices_required`; pass a batched `yf_quote` price map back to get valuations).

Macro series, analyst targets, ETF expense ratios/holdings, and options data are not in the MCP — the finbot agent fetches those via web search and tags them `[search]`. Tool details live in the Market Data Tools section of `AGENTS.md`.

## Development

```sh
bun run test        # ta fixture regression against scripts/__fixtures__/PL-2026-11-05.json
bun run typecheck   # tsc --noEmit across plugins and scripts
bun run mcp         # run the yahoo-finance MCP standalone (stdio)
python3 scripts/validate_data.py  # check the data/ layout and cross-references
```

Config and plugins hot-reload; MCP server code needs a config change (or restart) to reconnect. `/reload` forces a full reload. `opencode debug agents` prints the resolved agent config and permissions.

## Layout

- `opencode.json` — agents, permissions, MCP server registration
- `.opencode/agents/finbot.md` — the finbot agent
- `.opencode/skills/` — domain skills (retirement, portfolio, tax, budget, watchlist, risk, market research, plan review)
- `.opencode/plugins/fin-tools/` — calc, portfolio, and snapshot tools
- `data/schema/` — JSON schemas for your data files
- `scripts/yahoo-finance-mcp/` — bundled market-data MCP (`index.ts` tools, `ta.ts` indicators)
- `scripts/ta-fixture-test.ts` — indicator regression test
- `scripts/validate_data.py` — validates the `data/` layout and account/investment cross-references
- `plans/` — saved analysis artifacts (gitignored)

## Notes

- Default assumptions: 7% nominal / 4% real equity returns, 3% inflation, 4% SWR (3-3.5% early retirement), US tax jurisdiction. FinBot justifies every override.
- The verification gate is opt-in: ask for a review and the agent delegates to the `verifier` subagent.
- All advice is AI-generated for informational purposes only and is not financial advice.
