# Intra-Day Market Update — [DATE] [TIME] ET

<!--
  Standardized intra-day market update template for held positions.
  SCHEMA: reusable template — copy/fill on each update request, or save filled version to plans/intra-day-update-YYYY-MM-DD.md.
  Workflow:
    1. User requests "intra-day update" (or similar).
    2. Run the data pipeline:
       a. yf_quote on ^GSPC ^IXIC ^DJI ^VIX (market context)
       b. yf_quote on all held tickers (batched)
       c. ta on each held ticker (parallel)
       d. yf_news on all held tickers (batched, compact)
       e. fin-data_snapshot with prices → allocation + diversification
    3. Fill every [PLACEHOLDER], source-tag every key number per AGENTS.md Rule 7.
    4. Save filled version to plans/intra-day-update-YYYY-MM-DD.md if user wants a record.
  See AGENTS.md Critical Rules 4 (DATA FIRST), 6 (Market Data), 7 (Source Tagging).
-->

**As of:** [HH:MM] ET · [Weekday, Month D, YYYY]
**Scope:** [Self / Spouse / Household] — [N] held equity positions, $XX,XXX.XX equity book, $XX,XXX.XX cash

---

## 1. Market Context [confirmed: data provider]

| Index | Price | Day Chg | % | 52W Range |
|---|---|---|---|---|
| S&P 500 | $X,XXX.XX | ±$XX.XX | ±X.XX% | $X,XXX.XX – $X,XXX.XX |
| NASDAQ | $XX,XXX.XX | ±$XXX.XX | ±X.XX% | $XX,XXX.XX – $XX,XXX.XX |
| Dow | $XX,XXX.XX | ±$XXX.XX | ±X.XX% | $XX,XXX.XX – $XX,XXX.XX |
| VIX | XX.XX | ±X.XX | ±X.XX% | XX.XX – XX.XX |

**Read:** [1-2 sentence macro read — risk-on/risk-off, sector rotation, fear level, whether moves are macro-driven or stock-specific]. [inferred]

---

## 2. Held Stocks — Intra-Day Snapshot [confirmed: data provider]

| Ticker | Price | Day Chg | % | Vol vs 20d Avg | RSI-14 | Trend | 52W Pos |
|---|---|---|---|---|---|---|---|
| [TKR] | $X.XX | ±$X.XX | ±X.XX% | X.XXx (heavy/normal/light) | XX.X | Bullish/Bearish/Mixed | At 52W low / X% from low |
| ... | | | | | | | |
| **Total** | | | | | | | **±$X,XXX.XX (±X.XX%)** |

**Portfolio impact today:** ±$X,XXX.XX on $XX,XXX.XX equity book (±X.XX%). [inferred]

---

## 3. Why They're Moving — Catalyst & Read-Through

### [TKR] (±X.XX%) — [one-line driver summary]
- **Driver:** [macro/sector/stock-specific cause] [confirmed: data provider, news]
- **Catalyst (positive/negative):** [earnings, product, partnership, regulatory] [confirmed: data provider, news/search]
- **Technical:** RSI XX.X (oversold/neutral/overbought), [bullish/bearish/mixed] trend, [golden/death] crosses. [At 52W low / X% from 52W high]. Volume X.XXx avg. Support: $X.XX, $X.XX. Resistance: $X.XX, $X.XX. [confirmed: data provider, ta]
- **Decision read:** [1-2 sentence actionable interpretation — is the move justified, is there a disconnect, what to watch]. [inferred]

*(Repeat for each held ticker)*

---

## 4. Technical Decision Points — Support/Resistance Map

| Ticker | Price | Nearest Support | Nearest Resistance | RSI | MACD Hist | Vol Ratio |
|---|---|---|---|---|---|---|
| [TKR] | $X.XX | $X.XX, $X.XX | $X.XX, $X.XX | XX.X | ±X.XXX (improving/deteriorating) | X.XXx |
| ... | | | | | | |

**Key observations:** [inferred]
- [MACD histogram direction — improving/deteriorating per name]
- [RSI extremes — oversold bounce candidates, overbought risk]
- [Volume anomalies — accumulation vs distribution]
- [Names at 52-week lows/highs]

---

## 5. Portfolio Impact & Concentration

| Metric | Value |
|---|---|
| Equity book MV | $XX,XXX.XX |
| Equity cost basis | $XX,XXX.XX |
| Unrealized P&L | ±$X,XXX.XX (±X.XX%) |
| Today's P&L | ±$X,XXX.XX (±X.XX%) |
| Cash (brokerage) | $XX,XXX.XX (XX.X%) |
| Diversification score | XX/100 (assessment) |
| Top equity holding | [TKR] = XX.X% of equity book |

**Concentration risk:** [1-2 sentences on single-name/sector risk, cash drag, what a break of key levels means for the portfolio]. [inferred]

---

## 6. Intra-Day Decision Framework

### If considering action today:

| Scenario | Trigger | Consideration |
|---|---|---|
| **Buy [TKR] dip** | [support level holds on light volume] | [valuation context]. But [trend caveat]; scale in, don't lump-sum. [inferred] |
| **Exit [TKR] losses** | [any bounce to RSI > 40] | Harvest tax losses (±$X,XXX combined unrealized). Wash-sale: wait 31 days or buy similar (not identical) ETF. [inferred] |
| **Hold [TKR]** | [sector sentiment stabilizes] | [fundamental vs price disconnect]. No bottoming signal yet — [RSI/MACD status]. [inferred] |
| **Deploy cash** | [VIX > 30 or index breaks key level] | $XX,XXX earning ~X-X% in MM. A X-X% equity allocation from cash would reduce drag. But trend is [bullish/bearish] — dollar-cost average, don't time. [inferred] |

### Key levels to watch (close of day):
- **[TKR]**: $X.XX (52W low / cluster support) — break below = [next target]; hold above = [stabilization case]
- *(Repeat for each held ticker)*

---

## 7. Data Quality Notes
- **401(k) balances** are self-reported placeholders — no daily pricing available. [self-reported]
- **Spouse data** is placeholder — no holdings detail. [self-reported] *(remove if no spouse data)*
- **News coverage:** [TKR] returned no ticker-specific headlines — all were macro/sector context. [confirmed: data provider] *(list any)*
- **Price discrepancy:** `ta` quote shows $X.XXXX vs yf_quote $X.XXXX — minor timestamp difference, immaterial. [confirmed: data provider] *(if any)*
- **Unpriced positions:** [list any non-market tickers excluded from totals] [self-reported]

---

*This is AI-generated analysis for informational purposes only. It does not constitute financial advice. Consult a qualified financial advisor before making investment decisions.*

---

### Data Pipeline (for repeat use)

| Step | Tool | Input | Output |
|---|---|---|---|
| Market context | `yf_quote` | `["^GSPC","^IXIC","^DJI","^VIX"]` | Index prices, day changes, VIX |
| Held stock quotes | `yf_quote` | All held tickers (batched) | Price, change, volume, 52W range |
| Technicals | `ta` | One call per held ticker (parallel) | RSI, MACD, SMA stack, support/resistance, vol |
| News | `yf_news` | All held tickers (batched, compact) | Top 3 headlines per name |
| Portfolio | `fin-data_snapshot` | Price map from step 2 | Valuations, P&L, allocation, diversification |

**Trigger phrase:** "intra-day update" → runs full pipeline, fills this template, presents Sections 1-7.

**Save option:** "Save this update" → writes filled version to `plans/intra-day-update-YYYY-MM-DD.md`.
