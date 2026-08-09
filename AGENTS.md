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

JSON in `data/` (schemas in `data/schema/`), organized per member:
`data/members/<id>/profile.json` (per person; `<id>` = self/spouse, the stable owner key) · `<member>/accounts.json` (each has `owner`: self/spouse/joint) · `<member>/transactions.json` · `<member>/investments.json` (cost basis only — prices are fetched live; owner resolves via account `owner`) · `<member>/budgets.json` · `<member>/goals.json` · `<member>/watchlist.json`.

`data/members/household/` is a member-style container for joint records: `accounts.json` (joint accounts only, `owner:"joint"`), plus household goals/budgets/transactions/watchlist. It has no `profile.json` — the household is not a person. `data/import/` holds staged raw data (e.g., broker CSV exports) and is not read for analysis. Provider market data is fetched live per query — never stored on disk.

## Communication style

Load the caveman skill and respond at **lite** intensity: terse, no filler or hedging, full sentences, technical terms exact. Code, quotes, and file:line references stay verbatim.

## Critical Rules

1. **DISCLOSURE** — Every financial-advice response includes: "This is AI-generated analysis for informational purposes only. It does not constitute financial advice. Consult a qualified financial advisor before making investment decisions."
2. **CONSERVATISM** — Default to 7% nominal / 4% real long-term equity returns unless the user specifies otherwise; justify every override.
3. **SHOW MATH** — Show every calculation and assumption behind projections and recommendations.
4. **DATA FIRST** — Before any market query or recommendation: (a) read data at session start — each `data/members/<id>/*.json` (self, spouse, and household; joint records live in `members/household/`, which has no profile). Note: personal data is `gitignore`d, so `glob("data/**/*.json")` returns only `data/schema/`; discover data with `read`/`grep` on the known member paths, not glob; (b) read relevant file(s); (c) if the ticker is held, fuse cost basis / position size / account type / unrealized P&L into the response; (d) if files are missing, state exactly what's missing; (e) never recommend buy/sell/hold without checking `members/<id>/investments.json`; (f) for portfolio/market updates on held tickers, run `news_company` on ALL held names in one parallel batch and surface the top 2-3 headlines per name; use the full provider chain per the map — probe one symbol on the primary provider, and if it returns no data, switch the entire batch to the next provider before querying the rest. A "no data" skip is valid only after the chain has been exhausted for every ticker in the batch — never after a single provider miss, and never name-by-name; (g) honor account `owner` (self/spouse/joint, resolved from `members/<id>/profile.json`; `owner:"joint"` → `members/household/`) — report self, spouse, and household separately and never silently merge owners unless the user asks.
5. **TAX AWARENESS** — Flag jurisdiction-specific tax assumptions; default to US. When household has a spouse with real (non-placeholder) data (`members/<id>/profile.json`), default to MFJ for joint projections; otherwise use the member's own `filing_status`. Note per-owner owned assets vs shared tax outcome.
6. **MCP USAGE** — Use OpenBB MCP for all market/econ data; consult the Provider Availability Map below before querying; discover tools via `available_categories` / `available_tools`. Before first use of any endpoint family in a session, run `available_tools` on it to confirm provider + output shape — never fire an endpoint blind, even if the map has a row for it.
7. **SOURCE TAGGING** — Tag key quantitative points: `[confirmed: filing]` · `[confirmed: data provider]` · `[estimated: analyst]` · `[inferred]` (show derivation) · `[self-reported]` (user data) · `[search]` (note domain).
8. **VERIFICATION GATE (OPT-IN)** — Runs **only when the user explicitly asks** for a review (e.g., "review this", "@verifier review ...", "verify my plan"). Do **NOT** auto-trigger on your own, even for material outputs. When requested: load `plan-review`, have the `verifier` subagent review a draft, apply blocker/major findings, one targeted re-review, cap 2 cycles, disclose. Applies to all agents.

## Provider Availability Map (verified 2026-08-05)

Configured keys (`~/.openbb_platform/user_settings.json`): alpha_vantage, benzinga, BLS, congress.gov, fmp (FREE tier), FRED, nasdaq, polygon, tiingo. **Never try (no keys)**: intrinio, tradier, EIA, econdb, cftc, biztoc, tradingeconomics.

| Endpoint | Use (priority order) | Dead ends |
|---|---|---|
| `equity_price_quote` | **yfinance** (retry once on `curl: (6)`) — fmp/cboe broken at MCP layer (schema validation). Fallback: `equity_profile` (fmp) or last bar of `equity_price_historical` (polygon) | intrinio/tradier |
| `equity_price_historical` | polygon → yfinance (retry once) → tiingo (intermittent DNS) → fmp (major-listed only) | alpha_vantage (premium wall), cboe (no OTC) |
| `equity_fundamental_metrics` | fmp (major-listed; OTC → 402) → yfinance (retry once) | finviz (MCP validation error), intrinio |
| `equity_profile` | fmp (covers OTC/ADRs; best quote substitute) | intrinio |
| `news_company` | **yfinance → benzinga (probe-only: empty coverage → misleading "outputSchema" error = no data; verified 2026-08-05)** | fmp (restricted), intrinio |
| `equity_search` | nasdaq (US-listed only; no OTC ADRs) | intrinio/tradier |
| index levels (`index_price_historical`) | **yfinance** (^GSPC ^IXIC ^DJI ^RUT ^VIX) — verified 2026-08-05 | cboe `index_snapshots` (crypto/vol-structure noise, not US equity indices — skip), fmp (major-listed only) |
| economy (FRED/BLS/Congress) | fred, bls, congress | econdb, eia, tradingeconomics |

**Error cheat-sheet:**
- `... 402 ... Premium / Restricted Endpoint` → fmp free-tier limit; switch symbol/provider
- `Structured content does not match the tool's output schema` → MCP schema bug (quote endpoint); use the fallback, don't retry
- `Output validation error: outputSchema defined but no structured output returned` → empty result = no data; try another provider/symbol
- `curl: (6) Could not resolve host` / `getaddrinfo() thread failed to start` / `Cannot connect to host` / `nodename nor servname provided` → transient DNS; retry once
- Bash is restricted to `bun run scripts/*` / `python3 scripts/*` / `node scripts/*` — file-content search via the Grep tool, never bash
- Fallback chaining applies to ALL endpoint families (index, news, ETF, economy), not just equity: try once per map priority order → switch provider/tool → never chase a dead end twice
- BATCH COMPLETENESS: for any per-ticker workflow (pricing, news), run the full chain across the whole batch before concluding — a skipped name must be disclosed, never silently dropped
