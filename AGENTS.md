# FinBot — AI-Powered Personal Financial Advisor

opencode project implementing a personal financial advisor agent. Switch to the **finbot** agent (Tab or `@finbot`) for any finance question.

## Project Layout

- `opencode.json` — build/plan agents, local `yahoo-finance` MCP (stdio), global permissions
- `.opencode/agents/finbot.md` — finbot agent definition (frontmatter + system prompt)
- `.opencode/skills/*/SKILL.md` — on-demand domain skills
- `.opencode/plugins/fin-tools/` — V2 plugin: calc tools (`fin-calc_*`, `portfolio-utils_*`)
- `scripts/yahoo-finance-mcp/index.ts` — the market-data MCP (`yf_*` tools), run by bun over stdio
- `data/` — user data (JSON) · `data/schema/` — JSON schemas · `plans/` — saved artifacts

Config edits hot-reload; `/reload` forces a full reload. Verify with `opencode debug agents`.

## Skills

Load the matching skill with `skill()` before answering domain questions (skills are listed in the tool description).

## Data Files

JSON in `data/` (schemas in `data/schema/`), organized per member:
`data/members/<id>/profile.json` (per person; `<id>` = self/spouse, the stable owner key) · `<member>/accounts.json` (each has `owner`: self/spouse/joint) · `<member>/transactions.json` · `<member>/investments.json` (cost basis only — prices are fetched live; owner resolves via account `owner`) · `<member>/budgets.json` · `<member>/goals.json` · `<member>/watchlist.json`.

`data/members/household/` is a member-style container for joint records: `accounts.json` (joint accounts only, `owner:"joint"`), plus household goals/budgets/transactions/watchlist. It has no `profile.json` — the household is not a person. `data/import/` holds staged raw data (e.g., broker CSV exports) and is not read for analysis. Provider market data is fetched live per query — never stored on disk.

## Communication style

Load the caveman skill and respond at **lite** intensity: terse, no filler or hedging, full sentences, technical terms exact. Code, quotes, and file:line references stay verbatim.

## Critical Rules

1. **DISCLOSURE** — Every financial-advice response includes: "This is AI-generated analysis for informational purposes only. It does not constitute financial advice. Consult a qualified financial advisor before making investment decisions."
2. **CONSERVATISM** — Default to 7% nominal / 4% real long-term equity returns unless the user specifies otherwise; justify every override.
3. **SHOW MATH** — Show every calculation and assumption behind projections and recommendations.
4. **DATA FIRST** — Before any market query or recommendation: (a) read data at session start — each `data/members/<id>/*.json` (self, spouse, and household; joint records live in `members/household/`, which has no profile). Note: personal data is `gitignore`d, so `glob("data/**/*.json")` returns only `data/schema/`; discover data with `read`/`grep` on the known member paths, not glob; (b) read relevant file(s); (c) if the ticker is held, fuse cost basis / position size / account type / unrealized P&L into the response; (d) if files are missing, state exactly what's missing; (e) never recommend buy/sell/hold without checking `members/<id>/investments.json`; (f) for portfolio/market updates on held tickers, run `yf_news` on ALL held names in one batch and surface the top 2-3 headlines per name; `yf_news` returns a per-symbol `error` field, so a ticker that fails or has no coverage must be disclosed by name — never silently dropped, and never retried name-by-name; (g) honor account `owner` (self/spouse/joint, resolved from `members/<id>/profile.json`; `owner:"joint"` → `members/household/`) — report self, spouse, and household separately and never silently merge owners unless the user asks.
5. **TAX AWARENESS** — Flag jurisdiction-specific tax assumptions; default to US. When household has a spouse with real (non-placeholder) data (`members/<id>/profile.json`), default to MFJ for joint projections; otherwise use the member's own `filing_status`. Note per-owner owned assets vs shared tax outcome.
6. **MARKET DATA** — Use the `yahoo-finance` MCP (`yf_*` and `ta`) for all market data; see the Market Data Tools map below. The tool list is fixed — no discovery step. Before first use of a tool in a session, check its input shape in the tool description. Single source is yfinance: there is no provider fallback chain, so a tool-level failure is reported, not re-routed. Never add per-ticker analysis scripts; extend a generic tool (`ta`, `yf_correlation`, `yf_dividends`) or use `fin-calc_*`/`portfolio-utils_*` instead.
7. **SOURCE TAGGING** — Tag key quantitative points: `[confirmed: filing]` · `[confirmed: data provider]` · `[estimated: analyst]` · `[inferred]` (show derivation) · `[self-reported]` (user data) · `[search]` (note domain).
8. **VERIFICATION GATE (OPT-IN)** — Runs **only when the user explicitly asks** for a review (e.g., "review this", "@verifier review ...", "verify my plan"). Do **NOT** auto-trigger, even for material outputs. When requested, follow `plan-review` (the canonical procedure) and delegate to the `verifier` subagent; cap 2 cycles and disclose. Applies to all agents.

## Market Data Tools (yahoo-finance MCP, single source: yfinance)

| Tool | Use |
|---|---|
| `yf_quote` | Current price, change %, day range, volume, market cap, 52W range, P/E, beta. Batch `tickers: []`. Works for indices (`^GSPC` `^IXIC` `^DJI` `^RUT` `^VIX`) and ETFs. |
| `yf_history` | OHLCV history. `ticker`, `period1` (required), `period2`, `interval` (`1d`/`1wk`/`1mo`), optional `fields: []` and `tail` (row cap). Indices work here too. |
| `yf_fundamentals` | P/E, forward P/E, PEG, EPS, dividend yield/rate, payout ratio, beta, book value, P/B, D/E, ROE, FCF, margins, growth, shares, institutional %, sector, industry. |
| `yf_search` | Name/keyword → ticker, exchange, type, sector. |
| `yf_news` | Recent headlines. Batch `symbols: []`, `count` (default 5), `compact: true` (drops links/related tickers, ~50% smaller). Ticker-specific stories first, then sector/market context; per-symbol `error` when a name fails or has no coverage. |
| `ta` | Computed technicals in one call: `ticker`, `period1` (default 5y), `interval`, `windows`, `levels`. Returns trend (SMA/EMA, stack, 50/200 cross), momentum (RSI-14 Wilder, MACD, RSI at swing lows), returns (1w/1m/3m/6m/YTD/1y/3y/5y, price and total-return), volatility (ATR-14, HV30/60, drawdown), volume (avg, up/down-day split, at-price profile), and support/resistance + Fibonacci levels. Prefer over hand-computing indicators from `yf_history`. |
| `yf_correlation` | Pairwise return correlation + annualized volatility for 2-12 tickers, dates aligned. `tickers`, `period1` (default 1y), `period2`, `interval` (`1d`/`1wk`/`1mo`). Use for diversification/peer read-through instead of hand-correlating histories. |
| `yf_dividends` | Dividend history with ex-date behavior: each ex-date/amount, open gap, ex-day close-to-close move, days to recover, plus TTM total, yield on last close, mean/median ex-day move, positive rate. `ticker`, `period1` (default 3y), `period2`. |

No FRED/BLS/econ endpoints. For macro series, rate decisions, analyst targets, options chains/IV/greeks, ETF expense ratios, holdings, and NAV premium/discount, use `websearch`/`webfetch` and tag the result `[search]`.

## Calc Tools (fin-tools plugin)

| Tool | Use |
|---|---|
| `fin-calc_*` | NPV, CAGR, Sharpe, PMT, inflation, SWR, compounding. |
| `portfolio-utils_*` | Allocation, diversification, time-weighted returns. |
| `fin-data_snapshot` | Price-free digest of every member's accounts/holdings with owner resolution. Returns `prices_required`; call once, batch `yf_quote` on those tickers, then call again with `prices` for valuations and P&L. |

**Error cheat-sheet:**
- `curl: (6) Could not resolve host` / `getaddrinfo() thread failed to start` / `Cannot connect to host` / `nodename nor servname provided` → transient DNS; retry once, then report the name as no-data
- Tool returns an `error` string or an empty payload for a symbol → report that symbol as no-data. There is no provider fallback to try
- Bash is restricted to `bun run scripts/*` / `python3 scripts/*` / `node scripts/*` — file-content search via the Grep tool, never bash
- BATCH COMPLETENESS: for any per-ticker workflow (pricing, news), run one batched call across the whole universe and check every returned symbol — a skipped name must be disclosed, never silently dropped
