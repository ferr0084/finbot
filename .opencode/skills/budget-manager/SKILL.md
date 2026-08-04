---
name: budget-manager
description: >
  Track spending against budgets, categorize transactions, analyze cash flow,
  and identify savings opportunities. Provides month-over-month comparisons,
  category-level variance analysis, and actionable recommendations to optimize
  spending. Use when the user asks about their budget, spending, expenses,
  income, cash flow, or saving money.
---

# Budget Manager

Load this skill when the user asks about budgeting, spending, expenses, income, cash flow, or saving money.

## Workflow

### 1. Gather Data

Read `data/transactions.json` and `data/budgets.json` (plus `data/accounts.json` for context). If either file is missing, ask the user to create it. If there are no transactions, ask the user to:
- Manually enter recent transactions
- Import from a CSV/OFX file
- Start tracking going forward

### 2. Determine Time Period

Default to the current month to date; otherwise use last month, last 3 months, year to date, custom range, or a single category.

### 3. Run Analysis

#### Spending vs Budget

For each budget category, compare actual spending to the budget limit:

| Category | Budget | Actual | Remaining | Status |
|----------|--------|--------|-----------|--------|
| Food | $600 | $520 | $80 | On track |
| Dining | $200 | $240 | -$40 | Overspent |
| ... | ... | ... | ... | ... |

**Status indicators:**
- **On track**: Under budget or within 10% of budget
- **At risk**: 50-90% of budget used with time remaining
- **Overspent**: Exceeded budget limit
- **Under budget**: Significantly under (highlight savings)

#### Cash Flow Analysis

- Total income, total expenses, net cash flow (income - expenses)
- Savings rate (net / income * 100)
- Top 3 expense categories by amount
- Fixed vs variable expense breakdown

#### Category Deep Dive

- Frequency of spending, average transaction size, trend over time
- Same period last year comparison (if data available)

#### Month-over-Month Trend

- Spending by category trend (table), savings rate trend, income stability
- Anomaly detection (months with unusually high/low spending)

### 4. Identify Savings Opportunities

| Opportunity | Potential Savings | Effort |
|-------------|-------------------|--------|
| Subscription consolidation | $30-50/mo | Low |
| Dining out reduction | $100-200/mo | Medium |
| Grocery optimization | $50-100/mo | Low |
| Utility/insurance comparison | $20-50/mo | High |
| Transportation alternatives | $50-150/mo | Medium |

### 5. Recommendations

1. **Immediate**: Categories where spending can be reduced right now
2. **Short-term**: Subscriptions to cancel, habits to change
3. **Medium-term**: Refinancing, insurance comparison, bill negotiation
4. **Goal-aligned**: How savings could be redirected to financial goals

### 6. Save Changes

If the user provides new transactions or budget updates, write to the appropriate data files.

## Presentation Format

```
## Budget Report — [Month] [Year]
Income: $X | Expenses: $X | Net: $X | Savings Rate: XX.X%
Budget vs Actual: [table]
Top Categories: 1. [Cat] — $X (XX%)  2. [Cat] — $X (XX%)  3. [Cat] — $X (XX%)
Insights: [bullets]
Recommendations: [bullets]
```

## Edge Cases

- **No budgets defined**: Analyze spending patterns only, suggest budget categories based on spending data
- **Partial month**: Show projected spending vs budget (actual + projected for remaining days)
- **Categories without budgets**: Flag as "uncategorized" and suggest creating a budget
- **Negative categories (refunds)**: Account for refunds as negative expenses in their category
- **Currency conversion**: Default to account currency, flag if multiple currencies exist
- **Large one-time expenses**: Flag for separate treatment (e.g., "this includes a $2,000 medical bill")
