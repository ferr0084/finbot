---
name: market-research
description: >
  Research stocks, ETFs, and other securities using yahoo-finance MCP data.
  Provides fundamental analysis, technical indicators, peer comparison, and
  valuation assessment. Use when the user asks about a specific ticker, market
  conditions, investment opportunities, or wants to research a company or fund.
---

# Market Research
Load this skill when the user wants to research a specific security, market sector, or investment opportunity.

## Workflow

### 1. Identify the Ticker

- If the user provides a company name, use `yf_search` to find the ticker
- Validate the ticker with `yf_quote` before proceeding
- For ETFs, use `yf_search` / `yf_fundamentals` for type and sector; get expense ratio, holdings, and strategy via `websearch` (`"[ticker] ETF expense ratio holdings"`)
- **For ADRs** (exchange contains "OQX", "PNK", or symbol ends in "Y"): note the OTC/ADR status and lower liquidity risk. Use `yf_search` on the company name to find the primary listing ticker. Compute the ADR ratio: `ADR price ÷ primary listing price ÷ FX rate`. Analyst targets and options are on the primary listing, not the ADR — always note which ticker targets refer to.

### 2. Gather Data from yahoo-finance MCP

All tools are from the `yahoo-finance` MCP server.
**Step 1 — Quote**: `yf_quote` for current price, day range, volume, market cap. Batch `tickers: []` for multiple names.
**Step 2 — Catalyst Check**: If the security moved >5% in one day (check change percent from quote), immediately `websearch` the catalyst: `"[company name] [ticker] stock move [date]"`.
**Step 3 — News & Earnings**: `yf_news` for recent headlines; `yf_earnings` for earnings dates, surprise history, and estimate trend; `websearch` for major developments: `"[ticker] [company name] earnings news [current year]"`. Always check — the most important context often comes from web search, not fundamentals.
**Step 4 — Fundamentals**: `yf_fundamentals` for PE, EPS, dividend yield, beta, ratios, sector, industry, profile, margins, targets; `yf_financials` for income/cash-flow/balance-sheet; `yf_recommendations` for analyst recommendation trend. For a business description or segment breakdown, use `websearch`/`webfetch`.
**Step 5 — Technicals**: call `ta` once (`ticker`, optional `period1` default 5y, `interval`, `levels`). It returns trend (SMA/EMA + stack + 50/200 cross), momentum (RSI-14 Wilder, MACD), returns (1w/1m/3m/6m/YTD/1y/3y/5y, price and total-return), volatility (ATR, HV30/60, drawdown), volume (avg, up/down-day split, at-price profile), and support/resistance + Fibonacci levels. Do not re-derive these from `yf_history`. Use `yf_history` only for raw bars a specific question needs.
**Step 6 — Peers / correlation**: `yf_correlation` with the subject plus peers or the benchmark (`^GSPC`, sector ETF) for a return-correlation matrix and annualized vol. Use it for read-through and diversification questions instead of hand-computing correlations.
**Step 7 — Income**: for dividend payers, `yf_dividends` for ex-dates, TTM total, yield on last close, and ex-day behavior (gap, recovery days).
**Tiered Search Rule** (multiple securities): one broad search for overarching context (sector rotation, earnings season, macro event, fed decision) that could explain moves across all tickers; only run targeted per-ticker follow-ups if the broad context doesn't fully explain the move or key questions remain (revenue breakdowns, product-level detail). 70%+ of correlated moves share one macro/sector driver — fewer tokens, clearer analysis. Do NOT run parallel searches per ticker.

### 3. Analyze

#### For Individual Stocks
| Metric | What to Evaluate |
|--------|-----------------|
| **Valuation** | PE relative to sector. PEG ratio. Price/Book. EV/EBITDA (if available) |
| **Growth** | Revenue/EPS trends (use history as proxy). Analyst consensus |
| **Dividends** | `yf_dividends`: TTM total, yield on last close, payout ratio, growth and consistency, ex-day recovery |
| **Risk** | Beta, HV30/60, max drawdown, drawdown from 52W high (all from `ta`) |
| **Quality** | Market cap tier (large/mid/small). Institutional ownership. Insider activity |
| **Technical** | `ta`: MA stack, 50/200 cross, RSI-14, MACD, swing levels, Fibonacci |
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

Add this after the standard research. Use `yf_options` for the chain (strikes, expirations, IV, open interest, volume, bid/ask); greeks (delta/gamma/theta/vega) and IV rank/percentile still come from `websearch`/`webfetch`. Historical volatility comes from `ta` (`volatility.hv30`/`hv60`); do not recompute it. IV from `yf_options` is a decimal fraction; `impliedVolatilityPct` is the percent form for direct comparison with HV.

| Metric | Data Source | What to Evaluate |
|--------|-------------|-----------------|
| **Open Interest / Volume** | `yf_options` | OI, volume, bid/ask per strike; cross-check web sources when the decision is material |
| **Historical Volatility (30d)** | `ta` → `volatility.hv30` | Annualized, Wilder-comparable; compare against IV |
| **Historical Volatility (60d)** | `ta` → `volatility.hv60` | Longer window smooths outliers; compare vs 30d to detect vol regime changes |
| **Implied Volatility** | `yf_options` → `impliedVolatilityPct` | IV above HV = options expensive (good for sellers); IV below HV = cheap (good for buyers) |
| **IV Rank / IV Percentile** | `websearch` | IV Rank = current IV in its 52-week range. >70% = expensive; <30% = cheap |
| **Post-Earnings IV Crush** | Earnings date from Step 3 | IV typically drops 30-50% after earnings; selling puts just after captures the IV crush tailwind |
| **Key Support/Resistance Levels** | `ta` → `levels.clusters` + `range52w` | Selling puts BELONG below strong support levels where the stock has bounced multiple times |

**Risk warning**: Options strategies carry significant risk — selling puts has unlimited/obligation risk. Include a clear risk disclosure with any options recommendation.

### 4. Compare

- Benchmark against relevant indices (S&P 500 for stocks, AGG for bonds, sector ETF for sector plays). Use `ta` for the subject's returns and `yf_correlation` with `^GSPC` (or the sector ETF) for the correlation matrix; add `yf_quote` for the benchmark price.
- Present a comparison table of the security vs 1-2 benchmarks

### 4.5 Per-Ticker Research Data File (saved to `plans/<TICKER>.md`)

For single-ticker deep dives (research-only, no rec), maintain ONE persistent data file per ticker at `plans/<TICKER>.md` — **no date in the filename**. **Start from the fillable skeleton** at `.opencode/skills/market-research/templates/deep-dive-note.md` — copy it to `plans/<TICKER>.md` only if no file exists yet; otherwise **read the existing file first** and update it in place. Fill the placeholders, delete the HTML comments. The structure below documents what the skeleton contains (modeled on `plans/nvda-deep-dive-2026-07-31.md`, which resolved what worked; do not re-derive the structure each time).

**Workflow (read-first, then update):**
1. Before researching a ticker, `read plans/<TICKER>.md` if it exists — use it as the baseline (prior data, prior quarters, prior assessment).
2. If it does not exist, create it from the skeleton.
3. Refresh every section with current MCP/search data; **append** new quarters, earnings, and events rather than deleting history.
4. Bump the `Last updated:` line to the current snapshot date/time.
5. When a figure changes across passes, add a `> ⚠️ Correction note:` in the relevant section documenting what changed and why — do not silently fix.

**Header block** (frontmatter-style):
- `Last updated:` date + time snapshot + latest intraday bar used
- `Created:` date the file was first created
- `Status:` held-in-portfolio or watchlist status; explicitly state if position owned
- `Nature:` research data file for reference — **no buy/sell/rebalance recommendation**
- **Anchor policy** line: state the price used for valuation math vs. the price used for returns/technicals (they may differ by intraday bar)

**Body sections:**

1. **Snapshot** — table: price, day range, 52W range, market cap, fwd P/E & EPS, P/B, dividend, next earnings date. Tag every row. If not held, say so here.
2. **Business at a Glance** — segments/reporting lines, what changed recently in reporting structure.
3. **Latest Quarter & Earnings Catalyst** — actuals table (revenue, EPS, segment detail, GM, FCF, capital return) vs consensus + **next-quarter guide**; catalysts/product roadmap; price-action divergence vs the print (stock up/down since earnings and why).
4. **Fundamentals** — table of quality (ROIC, ROE, ROA, net debt/EBITDA, current ratio, SBC/revenue, cash cycle) and valuation (EV/Sales, EV/EBITDA, EV/FCF, FCF yield, earnings yield) metrics.
5. **Valuation vs Peers** — peer table (fwd P/E, PEG, EV/EBITDA, growth, 1Y return) + a one-line "Read". Flag any extraordinary peer move and require independent verification.
6. **Analyst Targets** — consensus rating, avg PT, PT range with **show-math** implied upside vs the anchor price (`PT ÷ anchor − 1`). Label targets as analyst sentiment, not a forecast.
7. **Performance vs Benchmarks** — table (YTD / 1Y / 5Y CAGR) vs benchmark + peers, with show-math lines and split-adjusted basis note. Returns come from `ta`; correlation from `yf_correlation`.
8. **Risk & Technicals** — one `ta` call supplies MA50/MA200 + distance, RSI, drawdown from 52W high, max drawdown, 52W range utilization, HV 30d/60d; then structural risks (concentration, policy, transition risk). Include the **correction-notes convention** when a number changed across review cycles (see below).
9. **Assessment & Portfolio Context** — quality/growth/value read + explicit portfolio-angle sentence (what the user holds or doesn't, concentration implications). **No rec.**
10. **Method & Verification Notes** — provider status table (which provider supplied what, failures per the cheat-sheet), verification-gate note (if a review was requested), tax-jurisdiction note.

**Conventions:**
- Source-tag every key quantitative point per AGENTS.md Rule 7.
- **Correction-notes convention**: if a figure changes across review cycles (e.g., wrong fiscal quarter, wrong anchor date), keep a `> ⚠️ Correction note:` in the relevant section documenting what changed and why — do not silently fix.
- Do not extrapolate historical CAGRs forward; house planning defaults remain 7% nominal / 4% real (Rule 2).
- Save/update to `plans/<TICKER>.md` in place; the verification gate (Rule 8) runs **only if the user requests a review** — then load `plan-review`, delegate to the `verifier` subagent, apply findings, disclose cycles.
- **Refresh log:** in §9 (Method & Verification Notes), record what was added/changed this pass (new quarter, refreshed prices, corrected figure) so staleness is visible.
- End with the mandatory disclosure (Rule 1).

### 4.6 Intra-Day Market Update (saved to `plans/intra-day-update-YYYY-MM-DD.md`)

For portfolio-level intra-day updates on held positions, use the standardized template at `.opencode/skills/market-research/templates/intra-day-update.md`. Copy it to `plans/intra-day-update-YYYY-MM-DD.md` when the user wants a saved record; otherwise present inline.

**Trigger phrase:** "intra-day update" (or "how are my stocks doing today").

**Data pipeline (run in parallel where possible):**
1. `yf_quote` on `["^GSPC","^IXIC","^DJI","^VIX"]` → market context
2. `yf_quote` on all held tickers (batched) → prices, day changes, volume
3. `ta` on each held ticker (parallel) → RSI, MACD, SMA stack, support/resistance, vol
4. `yf_news` on all held tickers (batched, `compact: true`) → top headlines per name
5. `fin-data_snapshot` with price map → valuations, P&L, allocation, diversification

**Output:** Fill the template's 7 sections (Market Context → Held Stocks → Why They're Moving → Technical Decision Points → Portfolio Impact → Decision Framework → Data Quality Notes). Every key number source-tagged per Rule 7. End with the mandatory disclosure (Rule 1).

**Conventions:**
- Keep the same section structure every time so the user can diff day-over-day.
- The decision framework (Section 6) must be keyed to the user's actual positions, cost basis, and unrealized P&L — not generic advice.
- Note any ticker that returns no news (per-symbol `error` field) or no price data — never silently drop a held name.
- Cash drag, concentration, and diversification metrics come from `fin-data_snapshot` + `portfolio-utils_alloc`/`diversify`.
- Save to `plans/intra-day-update-YYYY-MM-DD.md` only if the user requests a record."

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

- All market data comes from yfinance via the `yahoo-finance` MCP; data freshness depends on Yahoo. Fundamentals may be quarterly/annual — check the date context. Options chains/IV/OI come from `yf_options`; greeks, IV rank/percentile, macro series, analyst targets, and ETF expense ratios come from `websearch` — tag them `[search]`.
- Do NOT provide price targets or guaranteed future returns. For OTC/pink sheets, flag the low liquidity risk.
