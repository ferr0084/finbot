---
name: risk-profiler
description: >
  Assess a user's risk tolerance through a structured questionnaire and recommend
  asset allocation models. Covers conservative, moderate, and aggressive profiles
  with rebalancing triggers. Use when the user asks about risk tolerance, asset
  allocation, the right portfolio mix, or investment personality.
---

# Risk Profiler

Load this skill when the user wants to assess risk tolerance or find the right asset allocation.

## 1. Risk Assessment Questionnaire

Ask one question at a time. Score each response.

| # | Question | Options (Score) |
|---|----------|----------------|
| 1 | What is your primary investment goal? | Capital preservation (1) — Income (2) — Growth (3) — Aggressive growth (4) |
| 2 | What is your investment time horizon? | < 3 years (1) — 3-5 years (2) — 5-10 years (3) — 10+ years (4) |
| 3 | If your portfolio dropped 20% in a year, what would you do? | Sell everything (1) — Sell some (2) — Do nothing (3) — Buy more (4) |
| 4 | How would you describe your investment knowledge? | None (1) — Basic (2) — Intermediate (3) — Advanced (4) |
| 5 | What percentage of your income are you willing to risk? | 0-2% (1) — 2-5% (2) — 5-10% (3) — 10%+ (4) |
| 6 | How important is portfolio stability vs returns? | Stability much more (1) — Stability slightly more (2) — Returns slightly more (3) — Returns much more (4) |
| 7 | You have $100k to invest. What split sounds best? | 100% bonds/CDs (1) — 75/25 bonds/stocks (2) — 50/50 stocks/bonds (3) — 75/25 stocks/bonds (4) — 100% stocks (5) |

## 2. Score Calculation

- Sum all scores
- **Conservative**: 7-14 points
- **Moderate**: 15-22 points
- **Aggressive**: 23-30 points

## 3. Recommended Asset Allocation

#### Conservative (Score 7-14)
```
Stocks:     20%    (US 15%, Intl 5%)
Bonds:      55%    (US Treasuries 35%, IG Corps 15%, TIPS 5%)
Cash:       20%
Alternatives: 5%   (REITs, gold)
Expected Nominal Return: 4-5%
Expected Volatility: 6-8%
Max Drawdown: ~10-15%
```

#### Moderate (Score 15-22)
```
Stocks:     60%    (US 40%, Intl 15%, EM 5%)
Bonds:      30%    (US Treasuries 15%, IG Corps 10%, HY 5%)
Cash:       5%
Alternatives: 5%   (REITs, commodities)
Expected Nominal Return: 6-7%
Expected Volatility: 10-13%
Max Drawdown: ~20-25%
```

#### Aggressive (Score 23-30)
```
Stocks:     85%    (US 55%, Intl 20%, EM 10%)
Bonds:      10%    (US Treasuries 5%, TIPS 5%)
Cash:       0%
Alternatives: 5%   (REITs, crypto-optional)
Expected Nominal Return: 7-9%
Expected Volatility: 15-20%
Max Drawdown: ~35-45%
```

## 4. Compare to Current Portfolio

If holdings exist in `data/members/<id>/investments.json`:

- Resolve ownership per account from `data/members/<id>/profile.json` / `accounts.json` (`self`/`spouse`/`joint`); evaluate allocation per person and household by default.
- Calculate current allocation with `portfolio-utils_alloc`
- Identify gaps between current and target
- Use `portfolio-utils_rebalance` to generate a transition plan

## 5. Rebalancing Triggers

| Profile | Absolute Band | Relative Band | Check Frequency |
|---------|--------------|---------------|-----------------|
| Conservative | ±3% | ±10% | Monthly |
| Moderate | ±5% | ±15% | Quarterly |
| Aggressive | ±7% | ±20% | Semi-annually |

## 6. Present

```
## Risk Profile Assessment

**Your Score**: XX/XX → **[Profile Name]**

### Your Allocation
| Asset Class | Current | Recommended | Difference | Action |
|-------------|---------|-------------|------------|--------|
| US Stocks | XX% | XX% | ±X% | Buy/Sell X |
| Intl Stocks | XX% | XX% | ±X% | Buy/Sell X |
| Bonds | XX% | XX% | ±X% | Buy/Sell X |
| ... | ... | ... | ... | ... |

### Rebalancing Thresholds
- Trigger: When any asset class deviates by ±X% from target
- Recommended review frequency: [X]
```

## 7. Save

Offer to save the risk profile to the owning member's `data/members/<id>/goals.json` or a new file `data/risk-profile.json`.

## Notes

- Simplified assessment; real risk profiling also considers net worth, income stability, and dependents.
- Recommend consulting a real financial advisor for a comprehensive risk assessment.
- Re-evaluate annually or after major life events (marriage, kids, job change, retirement).
