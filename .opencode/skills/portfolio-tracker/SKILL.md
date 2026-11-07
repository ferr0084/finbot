---
name: portfolio-tracker
description: >
  Analyze investment portfolio performance, diversification, and rebalancing needs.
  Calculates returns (CAGR, TWR, MWR), allocation breakdowns by asset class, sector,
  and geography, and recommends rebalancing trades. Use when the user asks about their
  portfolio, investments, holdings, returns, diversification, or rebalancing.
---

# Portfolio Tracker

Load this skill when the user asks about portfolio analysis, performance, diversification, or rebalancing.

## Workflow

### 1. Gather Data

Read `data/members/<id>/investments.json` and `data/members/<id>/accounts.json` for each member, plus `data/members/household/accounts.json` for joint accounts. If any is missing or empty, ask the user to populate it. Read each member's `data/members/<id>/profile.json` to resolve account ownership.

Prefer `fin-data_snapshot` for the first pass: it returns accounts, holdings, owner resolution, and `prices_required` in one call. Then batch `yf_quote` on those tickers and call `snapshot` again with `prices` for valuations and unrealized P&L. Fall back to reading the JSON files directly only when you need a field the digest omits.

Ownership is derived: each investment inherits `owner` from its `account_id`'s account in the owning member's `accounts.json` (`self` / `spouse` / `joint`). Default to **per-person views** — self, spouse, and household — never silently merge `self` and `spouse`. Household totals = self + joint + spouse (a `joint` account counts toward the household but toward neither individual unless the user says so).

For current prices, query the `yahoo-finance` MCP:
- Use `yf_quote` for each unique ticker, batching all tickers in one call
- For ETFs, `yf_quote` gives price/volume; get NAV premium/discount and holdings via `websearch`

### 2. Calculate Metrics

Use the custom tools:

- `portfolio-utils_alloc` — Allocation breakdown by asset class, sector, geography
- `portfolio-utils_diversify` — HHI and diversification score
- `portfolio-utils_returns` — Time-weighted and money-weighted returns
- `fin-calc_cagr` — CAGR for portfolio and individual holdings
- `fin-calc_inflation` — Inflation-adjusted (real) returns
- `yf_correlation` — Pairwise return correlation and annualized vol across held tickers; use for the concentration/diversification read instead of eyeballing sectors
- `ta` — Per-holding returns, drawdown, and volatility in one call per ticker

### 3. Analyze

| Dimension | What to Look For |
|-----------|-----------------|
| **Allocation** | % stocks vs bonds vs cash. Compare to target |
| **Concentration** | Top 5 holdings % of total. Sector concentration. Single-stock risk |
| **Cost Basis** | Unrealized gains/losses. Tax implications of selling |
| **Performance** | Return vs benchmarks (S&P 500, AGG, ACWI). Risk-adjusted (Sharpe) |
| **Dividend Yield** | Portfolio yield vs income needs |
| **Cash Drag** | Excess cash earning low/near-zero return |
| **Rebalancing** | Over/under-target positions. Tax-efficient rebalancing |

### 4. Recommend

1. **Rebalancing trades** — What to buy/sell to hit target allocation
2. **Tax-efficient moves** — TLH opportunities, asset location optimization
3. **Concentration risks** — Too much in one stock/sector/asset class
4. **Cost optimization** — High expense ratios, commission-heavy strategies

### 5. Save

If the user provides updated holdings or positions, write to the owning member's `data/members/<id>/investments.json` (or `data/members/household/investments.json` for joint accounts).

## Presentation Format

Present the portfolio summary showing self, spouse, and household separately (per-person default per AGENTS rule g):

| Metric | Self | Spouse | Household |
|--------|------|--------|-----------|
| Total Value | $XXX | $XXX | $XXX |
| Total Cost Basis | $XXX | $XXX | $XXX |
| Unrealized Gain/Loss | $X (X%) | $X (X%) | $X (X%) |
| # of Holdings | XX | XX | XX |

Then list each scope's allocation breakdown by asset class.

Additional benchmark/metrics for any single scope:

| Metric | Value |
|--------|-------|
| TWR (1Y) | X.X% |
| CAGR (Since Inception) | X.X% |
| Dividend Yield | X.X% |
| Diversification Score | X.X/100 |
| Cash Drag | X.X% |

Include an allocation breakdown by asset class.
