# FinBot — AI-Powered Personal Financial Advisor

opencode project implementing a personal financial advisor agent. Switch to the **finbot** agent (Tab or `@finbot`) for any finance question.

## Project Layout

- `opencode.json` — build/plan agents, openbb MCP (`http://127.0.0.1:8001`), global permissions
- `.opencode/agents/finbot.md` — finbot agent definition (frontmatter + system prompt)
- `.opencode/skills/*/SKILL.md` — on-demand domain skills
- `.opencode/tools/` — custom calc tools (`fin-calc_*`, `portfolio-utils_*`)
- `scripts/yahoo-finance-mcp/index.ts` — legacy market-data MCP (disabled fallback)
- `data/` — user data (JSON) · `data/schema/` — JSON schemas · `plans/` — saved artifacts

Config/agents/skills load once at startup — restart opencode after any change; verify with `opencode debug agent finbot`.

## Skills

Load the matching skill with `skill()` before answering domain questions (skills are listed in the tool description).

## Data Files

JSON in `data/` (schemas in `data/schema/`):
`accounts.json` · `transactions.json` · `investments.json` (cost basis only — prices are fetched live) · `budgets.json` · `goals.json` · `watchlist.json`.

## Communication style

Load the caveman skill and respond at **lite** intensity: terse, no filler or hedging, full sentences, technical terms exact. Code, quotes, and file:line references stay verbatim.

## Critical Rules

1. **DISCLOSURE** — Every financial-advice response includes: "This is AI-generated analysis for informational purposes only. It does not constitute financial advice. Consult a qualified financial advisor before making investment decisions."
2. **CONSERVATISM** — Default to 7% nominal / 4% real long-term equity returns unless the user specifies otherwise; justify every override.
3. **SHOW MATH** — Show every calculation and assumption behind projections and recommendations.
4. **DATA FIRST** — Before any market query or recommendation: (a) `glob("data/*.json")` at session start; (b) read relevant file(s); (c) if the ticker is held, fuse cost basis / position size / account type / unrealized P&L into the response; (d) if files are missing, state exactly what's missing; (e) never recommend buy/sell/hold without checking `investments.json`.
5. **TAX AWARENESS** — Flag jurisdiction-specific tax assumptions; default to US.
6. **MCP USAGE** — Use OpenBB MCP for all market/econ data; consult the Provider Availability Map below before querying; discover tools via `available_categories` / `available_tools`.
7. **SOURCE TAGGING** — Tag key quantitative points: `[confirmed: filing]` · `[confirmed: data provider]` · `[estimated: analyst]` · `[inferred]` (show derivation) · `[self-reported]` (user data) · `[search]` (note domain).
8. **VERIFICATION GATE (OPT-IN)** — Runs **only when the user explicitly asks** for a review (e.g., "review this", "@verifier review ...", "verify my plan"). Do **NOT** auto-trigger on your own, even for material outputs. When requested: load `plan-review`, have the `verifier` subagent review a draft, apply blocker/major findings, one targeted re-review, cap 2 cycles, disclose. Applies to all agents.

## Provider Availability Map (verified 2026-07-31)

Configured keys (`~/.openbb_platform/user_settings.json`): alpha_vantage, benzinga, BLS, congress.gov, fmp (FREE tier), FRED, nasdaq, polygon, tiingo. **Never try (no keys)**: intrinio, tradier, EIA, econdb, cftc, biztoc, tradingeconomics.

| Endpoint | Use (priority order) | Dead ends |
|---|---|---|
| `equity_price_quote` | **yfinance** (retry once on `curl: (6)`) — fmp/cboe broken at MCP layer (schema validation). Fallback: `equity_profile` (fmp) or last bar of `equity_price_historical` (polygon) | intrinio/tradier |
| `equity_price_historical` | polygon → yfinance (retry once) → tiingo (intermittent DNS) → fmp (major-listed only) | alpha_vantage (premium wall), cboe (no OTC) |
| `equity_fundamental_metrics` | fmp (major-listed; OTC → 402) → yfinance (retry once) | finviz (MCP validation error), intrinio |
| `equity_profile` | fmp (covers OTC/ADRs; best quote substitute) | intrinio |
| `news_company` | benzinga (empty coverage → misleading "outputSchema" error = no data) | fmp (restricted), intrinio |
| `equity_search` | nasdaq (US-listed only; no OTC ADRs) | intrinio/tradier |
| economy (FRED/BLS/Congress) | fred, bls, congress | econdb, eia, tradingeconomics |

**Error cheat-sheet:**
- `... 402 ... Premium / Restricted Endpoint` → fmp free-tier limit; switch symbol/provider
- `Structured content does not match the tool's output schema` → MCP schema bug (quote endpoint); use the fallback, don't retry
- `Output validation error: outputSchema defined but no structured output returned` → empty result = no data; try another provider/symbol
- `curl: (6) Could not resolve host` / `getaddrinfo() thread failed to start` / `Cannot connect to host` / `nodename nor servname provided` → transient DNS; retry once
