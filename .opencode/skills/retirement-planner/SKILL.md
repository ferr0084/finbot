---
name: retirement-planner
description: >
  Retirement planning: FIRE calculations, Monte Carlo-style projections,
  contribution rate analysis, goal tracking. Supports traditional
  retirement, FIRE, Coast FIRE, Barista FIRE, Lean/Fat FIRE. Use when
  the user asks about retirement, FIRE, when they can retire, savings
  projections, or retirement readiness.
---

# Retirement Planner

Load this skill when the user asks about retirement planning, FIRE calculations, savings projections, or when they can afford to retire.

## Workflow

### 1. Gather Data

Read `data/goals.json` (existing retirement goals) and `data/investments.json` (portfolio). Ask for any missing inputs: current age or target retirement year, portfolio value, annual savings, desired retirement income or annual expenses (for FIRE), and account balances (401k/IRA/taxable).

### 2. Scenarios

Offer one or more based on user interest:

#### Traditional Retirement
- Target age 60-67 (or user-specified); full Social Security (estimate $1,500-3,000/mo by earnings history); 4% SWR.

#### FIRE / Fat FIRE
- Target: 25x annual expenses (4% rule). Use `fin-calc_compound` for growth, `fin-calc_inflation` for inflation-adjusted expenses.
- Years to FI: `Years = log((FV + PMT*r) / (PMT*r)) / log(1 + r)` iterative approach.

#### Coast FIRE
- Amount needed at retirement age, back-computed to today with no further contributions via `fin-calc_cagr` in reverse: `PV = FV / (1 + r)^n`.

#### Barista FIRE
- Part-time income covers 30-50% of expenses; portfolio covers the gap. Reduced SWR (3-3.5%) since semi-retirement lasts longer.

#### Lean FIRE
- Minimalist expenses (e.g., $30-40k/year) and/or geographic arbitrage; standard FIRE calc with lower expense target.

### 3. Run Calculations

Custom tools: `fin-calc_compound` (growth with contributions), `fin-calc_inflation` (real value of future expenses), `fin-calc_swr` (withdrawal analysis).

Key metrics: years to FI (when portfolio hits 25x expenses), FI number (25x annual expenses or user-specified multiple), savings rate (% of income), and Monte Carlo confidence via 3 scenarios — pessimistic (5% returns), base (7%), optimistic (9%).

### 4. Projection Table

```
## Retirement Projection — [Scenario Name]

### Assumptions
Current Portfolio:    $XXX,XXX
Annual Contributions: $XX,XXX
Annual Expenses:     $XX,XXX
Expected Return:     X.X% nominal (X.X% real)
Inflation:           X.X%
Retirement Age:      XX
Life Expectancy:     XX

### Projection (Base Case)
Age | Portfolio Value | Annual Withdrawal | Notes
----|----------------|-------------------|------
XX  | $XXX,XXX       | —                 | Current age
XX  | $XXX,XXX       | —                 |
XX  | $XXX,XXX       | —                 | FI reached ✓
XX  | $XXX,XXX       | $XX,XXX           | Retirement start
XX  | $XXX,XXX       | $XX,XXX           |
XX  | $XXX,XXX       | $XX,XXX           | End of projection

### Scenarios
Scenario     | Return | Final Portfolio | Outcome
-------------|--------|-----------------|--------
Pessimistic  | X.X%   | $XXX,XXX        | Depletes at age XX / Survives
Base         | X.X%   | $XXX,XXX        | Survives
Optimistic   | X.X%   | $XXX,XXX        | Survives with surplus
```

### 5. FIRE-Specific Metrics

| Metric | Value |
|--------|-------|
| Annual Expenses | $XX,XXX |
| FI Number (25x) | $X,XXX,XXX |
| Current Portfolio | $XXX,XXX |
| Annual Savings | $XX,XXX |
| Savings Rate | XX% |
| Years to FI | XX years |
| Age at FI | XX |
| Coast FI Number | $XXX,XXX |
| Coast FI Age | XX |

### 6. Recommendations

- **On track**: What to maintain; rebalance focus on tax optimization.
- **Slightly behind**: Increase savings rate by X%, extend retirement by Y years, or adjust lifestyle expectations.
- **Significantly behind**: Levers to pull — save more, work longer, reduce expenses in retirement, relocate.
- **Ahead of schedule**: Consider Coast FIRE, Barista FIRE, or Fat FIRE options.

### 7. Sensitivity Analysis

Show how changing one variable affects the outcome:

| Variable | Change | Impact on Retirement Age |
|----------|--------|-------------------------|
| Savings rate | +5% | -2.5 years |
| Return | +1% | -3 years |
| Expenses | -10% | -3.5 years |
| Retirement age | +3 years | +25% portfolio value |

### 8. Save

Offer to save the retirement plan to `data/goals.json`.

## Edge Cases

- **Late starters (40+ with little saved)**: Aggressive savings, Social Security optimization, relocation strategies
- **Already retired**: Withdrawal sustainability, sequence-of-return risk
- **High income, high expenses**: The lifestyle trap — show how expenses drive the FI timeline
- **Inheritance expected**: Upside scenario only; don't count on it for the base case
- **Social Security**: US ssa.gov formula: 35 years of indexed earnings; default conservative estimate $1,800/mo if unknown
- **Pension**: Fixed income stream; discount for company health if private sector
- **Sequence of Return Risk**: Early-retirement withdrawals matter most; flag the 5 years before and after retirement

## Conservative Defaults

| Parameter | Default |
|-----------|---------|
| Equity return | 7% nominal / 4% real |
| Bond return | 3% nominal |
| Inflation | 3% |
| SWR (traditional) | 4% |
| SWR (50+ year retirement) | 3.5% |
| Life expectancy | 90-95 |
| Social Security (estimated) | $1,800/mo at FRA |
