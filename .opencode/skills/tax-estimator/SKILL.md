---
name: tax-estimator
description: >
  Estimate tax implications of investment decisions including capital gains,
  tax-loss harvesting opportunities, Roth conversion analysis, and asset
  location optimization. Uses US tax rules by default. Use when the user asks
  about taxes, capital gains, tax-loss harvesting, Roth conversions, or
  tax-efficient investing.
---

# Tax Estimator

Load this skill when the user asks about tax implications of investment decisions, tax-loss harvesting, Roth conversions, or tax-efficient portfolio strategies.

## Workflow

### 1. Gather Data

Read `data/investments.json` (holdings, cost basis, current prices) and `data/accounts.json` (account types: taxable vs tax-advantaged). Ask for missing info: filing status (single / MFJ / HOH), taxable income range, state of residence, unrealized gains/losses by lot.

### 2. US Tax Bracket Reference

Use these brackets (2025-2026 tax year) for estimation:

#### Ordinary Income (Marginal Rates)
| Rate | Single | Married Filing Jointly |
|------|--------|----------------------|
| 10%  | $0 - $11,925 | $0 - $23,850 |
| 12%  | $11,926 - $48,475 | $23,851 - $96,950 |
| 22%  | $48,476 - $103,350 | $96,951 - $206,700 |
| 24%  | $103,351 - $197,300 | $206,701 - $394,600 |
| 32%  | $197,301 - $250,525 | $394,601 - $501,050 |
| 35%  | $250,526 - $626,350 | $501,051 - $751,600 |
| 37%  | $626,351+ | $751,601+ |

#### Long-Term Capital Gains / Qualified Dividends
| Rate | Single | Married Filing Jointly |
|------|--------|----------------------|
| 0%   | $0 - $47,025 | $0 - $94,050 |
| 15%  | $47,026 - $518,900 | $94,051 - $583,750 |
| 20%  | $518,901+ | $583,751+ |

**Key rule**: LTCG rate depends on total taxable income including the gains themselves.

### 3. Analysis Types

#### Capital Gains Estimation

For taxable accounts:
- Identify holdings with current_price > cost_basis_per_share (unrealized gains)
- Separate short-term (< 1 year, taxed as ordinary income) from long-term (≥ 1 year)
- Calculate total unrealized gain: sum of (current_price - cost_basis) * shares
- Estimate tax at LTCG rate (long-term) or marginal rate (short-term)
- Add 3.8% NIIT if MAGI > $200k (single) / $250k (MFJ)

#### Tax-Loss Harvesting Opportunity

For taxable accounts:
- Identify holdings with current_price < cost_basis_per_share (unrealized losses)
- Calculate total unrealized loss
- Determine how much can offset gains: losses first offset gains, then up to $3,000 of ordinary income
- Flag wash sale rules: can't buy "substantially identical" security within 30 days before/after
- Suggest replacement ETFs/funds (e.g., VTI → ITOT, VOO → SPY)
- Calculate tax benefit: loss * marginal_rate

#### Roth Conversion Analysis

Analyze converting Traditional IRA/401k to Roth:
- Conversion amount and tax cost: conversion_amount * marginal_rate
- Long-term benefit: tax-free growth vs tax-deferred
- Break-even analysis: years for tax-free benefit to exceed conversion cost
- Consider: remaining years until RMDs, current vs expected future tax bracket
- Strategy: fill lower brackets with conversion (e.g., convert up to top of 12% or 24% bracket)

#### Asset Location Optimization

Analyze which assets should go in which account type:

| Asset Type | Best Location | Reason |
|------------|--------------|--------|
| US Stocks (VTI) | Taxable or Roth | Qualified dividends, LTCG treatment |
| Intl Stocks (VXUS) | Taxable | Foreign tax credit |
| REITs | Roth or Traditional | Non-qualified dividends (ordinary income) |
| Bonds | Traditional / 401k | Interest taxed as ordinary income |
| TIPS | Traditional | Ordinary income treatment |
| Crypto | Taxable | Taxed as property, collectibles rate |
| High-turnover strategies | Roth | Frequent trading = STCG |

### 4. Present Results

Use one compact report template covering the relevant analysis types. Show all math.

```
## Tax Analysis

### Capital Gains
Total Unrealized Gain: $XX,XXX
  Short-term: $X,XXX (taxed at XX% marginal rate)
  Long-term:  $XX,XXX (taxed at XX% LTCG rate)
Federal:     $X,XXX
NIIT (3.8%): $X,XXX (if applicable)
State:       $X,XXX (estimate at 5%)

### Tax-Loss Harvesting
Total Unrealized Loss: $X,XXX
Offset gains:  $X,XXX (saves $XXX in taxes)
Offset income: $X,XXX (saves $XXX at XX% bracket)
Total Savings: $XXX
Wash sale check: [30-day window, positions in window / none]
Replacement ETFs: [e.g., VTI → ITOT]

### Roth Conversion
Scenario: Convert $XX,000
Tax Cost:           $X,XXX (XX% effective rate)
Years to Breakeven: X years
Lifetime Benefit:   $XX,XXX (estimated)

### Recommendation
[Specific actionable strategy]
```

Omit sections not relevant to the request. Required fields by type:
- **Capital gains**: ST/LT split, federal tax, NIIT if applicable, state, total
- **TLH**: available losses, savings from gain offset and income offset, wash-sale check, replacements
- **Roth conversion**: amount, tax cost, years to breakeven, lifetime benefit, recommendation

### 5. Recommendations

Provide specific, actionable tax strategies:
1. **Immediate**: Tax-loss harvesting opportunities before year-end
2. **Year-end**: Bracket management (Roth conversion up to bracket limit, gain harvesting in 0% bracket)
3. **Ongoing**: Asset location optimization, tax-efficient fund placement
4. **Planning**: Required Minimum Distribution (RMD) strategies, qualified charitable distributions

### 6. Save

Offer to track harvested losses in `data/investments.json` notes field, or create a file `data/tax-notes.json`.

## Important Disclaimers

- **This is NOT professional tax advice.** Tax laws are complex and change frequently.
- US tax rules are assumed by default. If the user is in another jurisdiction, note the difference.
- State taxes vary widely. Use 5% as a rough state tax estimate for estimation purposes.
- The Net Investment Income Tax (NIIT) of 3.8% applies above $200k/$250k MAGI thresholds.
- Wash sale rules apply to substantially identical securities within 30-day windows.
- Cost basis method (FIFO, specific ID, average cost) affects realized gains. Default to specific ID for optimal TLH.

## Edge Cases

- **ESPP/ISO/RSU**: Complex tax treatment. Flag for specialized advice.
- **Crypto**: Treated as property. Each trade/disposal is a taxable event. Wash sale rules currently do NOT apply to crypto (but may in future).
- **Collectibles**: Taxed at 28% max rate (art, antiques, certain precious metals).
- **Foreign accounts**: FBAR filing requirements for accounts > $10k aggregate.
- **Backdoor Roth**: Pro-rata rule if traditional IRA has pre-tax balance.
- **Mega Backdoor Roth**: After-tax 401k conversions — check plan allows in-plan Roth rollovers.
