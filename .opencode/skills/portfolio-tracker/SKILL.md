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

Read `data/investments.json` and `data/accounts.json`. If either is missing or empty, ask the user to populate it.

For current prices, query OpenBB MCP:
- Use `equity_price_quote` for each unique ticker, batching queries and caching results
- For ETFs, use `etf_info` for NAV and premium/discount

### 2. Calculate Metrics

Use the custom tools:

- `portfolio-utils_alloc` — Allocation breakdown by asset class, sector, geography
- `portfolio-utils_diversify` — HHI and diversification score
- `portfolio-utils_returns` — Time-weighted and money-weighted returns
- `fin-calc_cagr` — CAGR for portfolio and individual holdings
- `fin-calc_inflation` — Inflation-adjusted (real) returns

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

If the user provides updated holdings or positions, write to `data/investments.json`.

## Presentation Format

Present the portfolio summary as a table:

| Metric | Value |
|--------|-------|
| Total Value | $XXX,XXX |
| Total Cost Basis | $XXX,XXX |
| Unrealized Gain/Loss | $XX,XXX (X.X%) |
| # of Holdings | XX |
| TWR (1Y) | X.X% |
| CAGR (Since Inception) | X.X% |
| Dividend Yield | X.X% |
| Diversification Score | X.X/100 |
| Cash Drag | X.X% |

Include an allocation breakdown by asset class.
