---
name: market-research
description: >
  Research stocks, ETFs, and other securities using OpenBB MCP data.
  Provides fundamental analysis, technical indicators, peer comparison, and
  valuation assessment. Use when the user asks about a specific ticker, market
  conditions, investment opportunities, or wants to research a company or fund.
---

# Market Research
Load this skill when the user wants to research a specific security, market sector, or investment opportunity.

## Workflow

### 1. Identify the Ticker

- If the user provides a company name, use `equity_search` to find the ticker
- Validate the ticker with `equity_price_quote` before proceeding
- For ETFs, use `etf_search` / `etf_info` for details (expense ratio, holdings, strategy)
- **For ADRs** (exchange contains "OQX", "PNK", or symbol ends in "Y"): note the OTC/ADR status and lower liquidity risk. Use `equity_search` on the company name to find the primary listing ticker. Compute the ADR ratio: `ADR price ÷ primary listing price ÷ FX rate`. Analyst targets and options are on the primary listing, not the ADR — always note which ticker targets refer to.

### 2. Gather Data from OpenBB MCP

All tools are from the `openbb` MCP server — no prefix needed.
**Step 1 — Quote**: `equity_price_quote` for current price, day range, volume, market cap. Pass `symbol`, optionally `provider="yfinance"`.
**Step 2 — Catalyst Check**: If the security moved >5% in one day (check change percent from quote), immediately `websearch` the catalyst: `"[company name] [ticker] stock move [date]"`.
**Step 3 — News & Earnings**: `news_company` for recent news, plus `websearch` for earnings dates and major developments: `"[ticker] [company name] earnings news [current year]"`. Always check — the most important context often comes from web search, not fundamentals.
**Step 4 — Fundamentals**: `equity_fundamental_metrics` for PE, EPS, dividend yield, beta, ratios. `equity_profile` for sector, industry, description. If more detail is needed, try `equity_fundamental_latest_attributes` or `equity_fundamental_ratios`.
**Step 5 — History**: `equity_price_historical` for 1Y and 5Y history. Pass `symbol`, `start_date`, `end_date`, optionally `interval` ("1d" recent, "1mo" multi-year) and `provider="yfinance"`. OpenBB handles date defaults if unspecified.
**Tiered Search Rule** (multiple securities): one broad search for overarching context (sector rotation, earnings season, macro event, fed decision) that could explain moves across all tickers; only run targeted per-ticker follow-ups if the broad context doesn't fully explain the move or key questions remain (revenue breakdowns, product-level detail). 70%+ of correlated moves share one macro/sector driver — fewer tokens, clearer analysis. Do NOT run parallel searches per ticker.

### 3. Analyze

#### For Individual Stocks
| Metric | What to Evaluate |
|--------|-----------------|
| **Valuation** | PE relative to sector. PEG ratio. Price/Book. EV/EBITDA (if available) |
| **Growth** | Revenue/EPS trends (use history as proxy). Analyst consensus |
| **Dividends** | Yield, payout ratio, dividend growth history, payout consistency |
| **Risk** | Beta, 52-week volatility, max drawdown (from history) |
| **Quality** | Market cap tier (large/mid/small). Institutional ownership. Insider activity |
| **Technical** | Trend (above/below MA50, MA200). RSI proxy (recent return velocity) |
| **Analyst Consensus** | Number of analysts covering, consensus rating (Buy/Hold/Sell), average price target, target range (high/low). Use `websearch`/`webfetch` on aggregators (StockAnalysis, MarketScreener, TipRanks); break down by individual analysts where possible. |

#### For ETFs

| Metric | What to Evaluate |
|--------|-----------------|
| **Expense Ratio** | Cost efficiency vs peers |
| **Tracking** | Tracking error, premium/discount to NAV |
| **Holdings** | Top holdings concentration. Sector exposure (infer from price correlation) |
| **Yield** | Distribution yield vs benchmark |
| **Liquidity** | Volume, bid-ask spread proxy |

#### For Options Analysis (when user asks about selling/buying options)

Add this after the standard research. First check `available_tools("derivatives")`: if `derivatives_options_chains` / `derivatives_options_snapshots` is available (CBOE/Polygon installed and keyed), use it for IV, greeks, OI; otherwise fall back to `websearch` for IV/chain data.

| Metric | Data Source | What to Evaluate |
|--------|-------------|-----------------|
| **Open Interest / Volume** | `derivatives_options_chains` / `derivatives_options_snapshots` (if available) | OI, greeks, IV; data accuracy depends on provider |
| **Historical Volatility (30d)** | `equity_price_historical` daily closes | Annualized σ of daily returns over 30 trading days: `σ_daily × √252` (see template below) |
| **Historical Volatility (60d)** | Same, over 60 trading days | Longer window smooths outliers; compare vs 30d to detect vol regime changes |
| **Implied Volatility** | `derivatives_options_chains` or `websearch`: `"[ticker] implied volatility options chain"` | IV above HV = options expensive (good for sellers); IV below HV = cheap (good for buyers) |
| **IV Rank / IV Percentile** | `derivatives_options_chains` or `websearch` | IV Rank = current IV in its 52-week range. >70% = expensive; <30% = cheap |
| **Post-Earnings IV Crush** | Earnings date from Step 3 | IV typically drops 30-50% after earnings; selling puts just after captures the IV crush tailwind |
| **Key Support/Resistance Levels** | 52W range + recent price action | Selling puts BELONG below strong support levels where the stock has bounced multiple times |

**HV Calculation Template** (from `equity_price_historical` daily closes):
```
1. Collect 31 consecutive daily closes → compute 30 daily returns: r_i = (close_i / close_{i-1}) - 1
2. σ_daily = stddev(r_1 ... r_30)
3. Annualized HV = σ_daily × √252
```

**Risk warning**: Options strategies carry significant risk — selling puts has unlimited/obligation risk. Include a clear risk disclosure with any options recommendation.

### 4. Compare

- Benchmark against relevant indices (S&P 500 for stocks, AGG for bonds, sector ETF for sector plays) via `equity_price_historical` or `index_price_historical` / `index_snapshots`
- Present a comparison table of the security vs 1-2 benchmarks

### 4.5 Deep-Dive Research Note (saved to `plans/`)

For single-ticker deep dives (research-only, no rec), save a note to `plans/<ticker>-deep-dive-<YYYY-MM-DD>.md`. **Start from the fillable skeleton** at `.opencode/skills/market-research/templates/deep-dive-note.md` — copy it to `plans/`, fill the placeholders, delete the HTML comments. The structure below documents what the skeleton contains (modeled on `plans/nvda-deep-dive-2026-07-31.md`, which resolved what worked; do not re-derive the structure each time).

**Header block** (frontmatter-style):
- `Prepared:` date + time snapshot + latest intraday bar used
- `Status:` held-in-portfolio or watchlist status; explicitly state if position owned
- `Nature:` research note for reference — **no buy/sell/rebalance recommendation**
- **Anchor policy** line: state the price used for valuation math vs. the price used for returns/technicals (they may differ by intraday bar)

**Body sections:**

1. **Snapshot** — table: price, day range, 52W range, market cap, fwd P/E & EPS, P/B, dividend, next earnings date. Tag every row. If not held, say so here.
2. **Business at a Glance** — segments/reporting lines, what changed recently in reporting structure.
3. **Latest Quarter & Earnings Catalyst** — actuals table (revenue, EPS, segment detail, GM, FCF, capital return) vs consensus + **next-quarter guide**; catalysts/product roadmap; price-action divergence vs the print (stock up/down since earnings and why).
4. **Fundamentals** — table of quality (ROIC, ROE, ROA, net debt/EBITDA, current ratio, SBC/revenue, cash cycle) and valuation (EV/Sales, EV/EBITDA, EV/FCF, FCF yield, earnings yield) metrics.
5. **Valuation vs Peers** — peer table (fwd P/E, PEG, EV/EBITDA, growth, 1Y return) + a one-line "Read". Flag any extraordinary peer move and require independent verification.
6. **Analyst Targets** — consensus rating, avg PT, PT range with **show-math** implied upside vs the anchor price (`PT ÷ anchor − 1`). Label targets as analyst sentiment, not a forecast.
7. **Performance vs Benchmarks** — table (YTD / 1Y / 5Y CAGR) vs benchmark + peers, with show-math lines and split-adjusted basis note.
8. **Risk & Technicals** — MA50/MA200 + distance, RSI, drawdown from 52W closing high, max drawdown, 52W range utilization, HV 30d/60d; then structural risks (concentration, policy, transition risk). Include the **correction-notes convention** when a number changed across review cycles (see below).
9. **Assessment & Portfolio Context** — quality/growth/value read + explicit portfolio-angle sentence (what the user holds or doesn't, concentration implications). **No rec.**
10. **Method & Verification Notes** — provider status table (which provider supplied what, failures per the cheat-sheet), verification-gate note (if a review was requested), tax-jurisdiction note.

**Conventions:**
- Source-tag every key quantitative point per AGENTS.md Rule 7.
- **Correction-notes convention**: if a figure changes across review cycles (e.g., wrong fiscal quarter, wrong anchor date), keep a `> ⚠️ Correction note:` in the relevant section documenting what changed and why — do not silently fix.
- Do not extrapolate historical CAGRs forward; house planning defaults remain 7% nominal / 4% real (Rule 2).
- Save to `plans/` directly; the verification gate (Rule 8) runs **only if the user requests a review** — then load `plan-review`, delegate to the `verifier` subagent, apply findings, disclose cycles.
- End with the mandatory disclosure (Rule 1).

### 5. Present

Structure the response:

```
## [TICKER] — [Company/ETF Name]
Current Price: $XXX.XX | Day Range: $X.XX - $X.XX | Volume: X,XXX,XXX
### Fundamentals
Market Cap: $X.XB | PE (TTM): XX.X | EPS (TTM): $X.XX | Div Yield: X.X% | Beta: X.XX | 52W Range: $X.XX - $X.XX
### Performance vs Benchmark
| Period | [TICKER] | [Benchmark] |
|--------|----------|-------------|
| 1 Month | X.X% | X.X% |
| 6 Months | X.X% | X.X% |
| 1 Year | X.X% | X.X% |
| 5 Years (CAGR) | X.X% | X.X% |

### Risk & Volatility (options queries)
30D HV: X.X% (annualized) | 52W Range Utilization: X% | Max Drawdown (1Y): X.X% | Beta: X.XX
### Assessment
[Your analysis — valuation, risk, quality assessment]

### Source Reliability
Tag every key quantitative point per AGENTS.md Rule 7.

### Disclosure Required
```

## Important Notes

- **Task Tracking**: For research with 3+ sub-topics (e.g., compare 3 tickers across fundamentals, technicals, options) or 5+ data source queries, use `todowrite` to track the workflow.
- OpenBB sources data from multiple providers (yfinance, FRED, FMP, Polygon, etc.); data freshness depends on the upstream provider. Fundamentals may be quarterly/annual — check the date context.
- Do NOT provide price targets or guaranteed future returns. For OTC/pink sheets, flag the low liquidity risk.
