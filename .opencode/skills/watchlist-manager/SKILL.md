---
name: watchlist-manager
description: >
  Track and manage a watch list of stocks and ETFs. Add/remove tickers,
  set price targets and alerts, scan for catalysts, view live prices
  across all watched securities. Use when the user asks about their watch
  list, stocks they're monitoring, price alerts, or investment ideas.
---

# Watch List Manager

Load this skill when the user wants to manage their watch list, check prices on watched stocks, or get alerted to opportunities.

## Data

Entries are stored in `data/watchlist.json`. Each entry has:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (e.g. `wl_1`) |
| `ticker` | Yes | Ticker symbol |
| `added_date` | Yes | ISO date added |
| `reason` | No | Why this ticker is being watched |
| `target_buy_price` | No | Price at which to consider buying |
| `target_sell_price` | No | Price at which to consider selling |
| `notes` | No | Freeform notes |
| `priority` | No | `high`, `medium`, or `low` |
| `tags` | No | Array of category tags (e.g. `["tech", "growth"]`) |

## Workflows

### 1. View Watch List with Live Prices

1. Read `data/watchlist.json`; if empty, suggest adding tickers.
2. Query `equity_price_quote` per unique ticker for price, change %, day range, volume — batch all queries before presenting.
3. Display a table:

```
| Ticker | Price     | Change    | Target Buy | Target Sell | Priority | Notes             |
|--------|-----------|-----------|------------|-------------|----------|-------------------|
| AAPL   | $234.50   | +1.2%     | $220.00    | —           | high     | Waiting for pullback |
| MSFT   | $445.00   | -0.3%     | —          | —           | medium   | Earnings next week   |
```

4. Add a summary row (count, total potential investment, targets hit); flag tickers within 5% of any target.

### 2. Add Ticker to Watch List

1. Collect ticker plus optional reason, target prices, notes, priority, tags.
2. Validate with `equity_price_quote` (returning data = valid).
3. Warn if already on the watchlist.
4. Generate `id` as highest existing numeric suffix + 1 (e.g. `wl_5`), append to `data/watchlist.json`.
5. Confirm: "Added AAPL to your watchlist. Current price: $234.50. You'll be alerted when it approaches $220.00."

### 3. Remove Ticker from Watch List

1. Identify entry by ticker or ID.
2. Remove it from `data/watchlist.json`.
3. Confirm: "Removed AAPL from your watchlist."

### 4. Update Watch List Entry

1. Identify entry by ticker or ID.
2. Update requested fields (target prices, notes, priority, tags, reason) in `data/watchlist.json`.
3. Confirm with the updated entry.

### 5. Scan Watch List for Catalysts

1. Read all tickers from `data/watchlist.json`.
2. Run `equity_price_quote` per ticker to find moves >3% daily.
3. Run `news_company` across all tickers for recent headlines.
4. For each ticker with a >3% move or notable news, run a targeted `websearch` for the catalyst.
5. Present findings and highlight tickers near their targets:

```
## Watch List Scan — Notable Activity

| Ticker | Move     | Catalyst | Action? |
|--------|----------|----------|---------|
| AAPL   | +3.2%    | New iPhone order from China supplier | Consider adding? |
| MSFT   | -0.1%    | No significant news | No action needed |

## Recent News
- **AAPL**: "Apple secures major iPhone component deal" (Bloomberg, today)
- **TSLA**: "Tesla deliveries miss estimates" (Reuters, yesterday)
```

### 6. Check for Target Hits

1. Read entries with `target_buy_price` or `target_sell_price`.
2. Query current prices for those tickers.
3. Compute distance: `(current - target) / target * 100`.
4. Flag any within 5% of a target:

```
## Target Price Alerts

| Ticker | Current  | Target   | Type | Distance | Alert |
|--------|----------|----------|------|----------|-------|
| AAPL   | $223.50  | $220.00  | Buy  | +1.6%    | Near target! |
| TSLA   | $310.00  | $350.00  | Sell | -11.4%   | —     |
```

### 7. Suggest What to Watch

If the user asks "what should I watch?" or wants ideas:

1. Use `equity_discovery_gainers` or `equity_screener` to find interesting securities.
2. Cross-reference `data/investments.json` — suggest tickers already held for monitoring.
3. Consider the user's risk profile if available (from risk-profiler).
4. Present 3-5 suggestions with brief reasoning.

## Presentation Format

Use a table with columns appropriate to the action. Always show current prices when viewing the watch list. Include the mandatory disclosure on any analysis or recommendation response.

## Important Notes

- Current prices are fetched live — do not cache them across sessions.
- Batch OpenBB queries where possible to minimize latency.
- Always validate a ticker with `equity_price_quote` before adding.
- Target prices are user-defined, not financial advice.
