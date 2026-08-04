# FinBot — AI-Powered Personal Financial Advisor

An [opencode](https://opencode.ai) agent that acts as a personal financial advisor: portfolio analysis, market research, risk profiling, budgeting, retirement planning, and tax-aware strategies.

This is a clean template — **no personal data is included**. Add your own finances in `data/`.

## Prerequisites

- [opencode](https://opencode.ai) CLI
- [bun](https://bun.sh)

## Setup

```sh
git clone <repo-url> finbot
cd finbot
bun install --cwd scripts/yahoo-finance-mcp
opencode
```

In opencode, switch to the **finbot** agent (Tab or `@finbot`).

## Add your data

Create these files in `data/` (schemas live in `data/schema/`):

- `accounts.json` — brokerage/retirement/checking accounts
- `investments.json` — holdings (cost basis only; prices are fetched live)
- `transactions.json` — cash flow
- `budgets.json` — spending budgets
- `goals.json` — savings/retirement goals
- `watchlist.json` — tickers you track

Ask FinBot to save a fact and it will write the file for you.

## Market data providers

**Default: yahoo-finance MCP (zero config).** Built in, needs only bun, covers quotes, historical prices, and fundamentals.

**Optional: OpenBB Platform.** For richer multi-provider data (FRED, polygon, fmp, etc.):

1. Install [OpenBB Platform](https://docs.openbb.co/platform) and start the REST server on `127.0.0.1:8001`.
2. Add API keys to `~/.openbb_platform/user_settings.json`.
3. `opencode.json` already points the `openbb` MCP at `http://127.0.0.1:8001/mcp`.

The finbot agent consults a provider availability map in `AGENTS.md`; update it if your key set differs.

## Layout

- `.opencode/agents/finbot.md` — the finbot agent
- `.opencode/skills/` — domain skills (retirement, portfolio, tax, budget, watchlist, risk, market research)
- `.opencode/tools/` — calc and portfolio tools
- `data/schema/` — JSON schemas for your data files
- `scripts/yahoo-finance-mcp/` — bundled market-data MCP

## Notes

- Default assumptions: 7% nominal / 4% real equity returns, 3% inflation, 4% SWR (3-3.5% early retirement), US tax jurisdiction. FinBot justifies every override.
- All advice is AI-generated for informational purposes only and is not financial advice.
