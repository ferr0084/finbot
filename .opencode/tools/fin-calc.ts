import { tool } from "@opencode-ai/plugin"

export const npv = tool({
  description: "Calculate Net Present Value given a discount rate and series of cash flows",
  args: {
    rate: tool.schema.number().describe("Annual discount rate (decimal, e.g. 0.08 for 8%)"),
    cashflows: tool.schema.array(tool.schema.number()).describe("Array of cash flows. Negative = investment, positive = return"),
  },
  async execute(args) {
    const { rate, cashflows } = args
    const npv = cashflows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0)
    return `NPV: $${npv.toFixed(2)}`
  },
})

export const cagr = tool({
  description: "Calculate Compound Annual Growth Rate",
  args: {
    beginValue: tool.schema.number().describe("Beginning value of the investment"),
    endValue: tool.schema.number().describe("Ending value of the investment"),
    years: tool.schema.number().describe("Number of years held"),
  },
  async execute(args) {
    const { beginValue, endValue, years } = args
    const cagr = Math.pow(endValue / beginValue, 1 / years) - 1
    return `CAGR: ${(cagr * 100).toFixed(2)}%`
  },
})

export const sharpe = tool({
  description: "Calculate Sharpe Ratio from a series of returns and a risk-free rate",
  args: {
    returns: tool.schema.array(tool.schema.number()).describe("Array of periodic returns (decimal, e.g. [0.01, -0.02, 0.015])"),
    riskFreeRate: tool.schema.number().describe("Risk-free rate for the same period (decimal, e.g. 0.05 for 5% annual)"),
    periodsPerYear: tool.schema.number().describe("Number of periods per year (12 for monthly, 252 for daily, 1 for annual)"),
  },
  async execute(args) {
    const { returns, riskFreeRate, periodsPerYear } = args
    const rfrPerPeriod = riskFreeRate / periodsPerYear
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length
    const excessReturns = returns.map(r => r - rfrPerPeriod)
    const meanExcess = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length
    const variance = returns.reduce((a, r) => a + Math.pow(r - meanReturn, 2), 0) / returns.length
    const stdDev = Math.sqrt(variance)
    if (stdDev === 0) return "Sharpe Ratio: undefined (zero volatility)"
    const sharpe = (meanExcess / stdDev) * Math.sqrt(periodsPerYear)
    return `Sharpe Ratio: ${sharpe.toFixed(3)}`
  },
})

export const compound = tool({
  description: "Calculate future value of an investment with periodic contributions",
  args: {
    principal: tool.schema.number().describe("Initial investment amount"),
    rate: tool.schema.number().describe("Annual interest rate (decimal, e.g. 0.07 for 7%)"),
    years: tool.schema.number().describe("Number of years"),
    contribution: tool.schema.number().describe("Periodic contribution amount"),
    contributionsPerYear: tool.schema.number().describe("Number of contributions per year (12 monthly, 1 yearly)"),
  },
  async execute(args) {
    const { principal, rate, years, contribution, contributionsPerYear } = args
    const n = contributionsPerYear
    const r = rate / n
    const periods = years * n
    const fvPrincipal = principal * Math.pow(1 + r, periods)
    const fvContributions = contribution * ((Math.pow(1 + r, periods) - 1) / r)
    const total = fvPrincipal + fvContributions
    const totalContributions = principal + contribution * periods
    return [
      `Future Value: $${total.toFixed(2)}`,
      `Total Contributions: $${totalContributions.toFixed(2)}`,
      `Total Growth: $${(total - totalContributions).toFixed(2)}`,
      `Assumptions: ${(rate * 100).toFixed(1)}% annual return, ${years} years, $${contribution} per ${contributionsPerYear === 12 ? "month" : "year"}`,
    ].join("\n")
  },
})

export const inflation = tool({
  description: "Calculate inflation-adjusted value of an amount over time",
  args: {
    amount: tool.schema.number().describe("Current dollar amount"),
    years: tool.schema.number().describe("Number of years in the future or past"),
    rate: tool.schema.number().describe("Annual inflation rate (decimal, e.g. 0.03 for 3%)"),
  },
  async execute(args) {
    const { amount, years, rate } = args
    const futureValue = amount * Math.pow(1 + rate, years)
    return years >= 0
      ? `$${amount.toFixed(2)} today ≈ $${futureValue.toFixed(2)} in ${years} year(s) (${(rate * 100).toFixed(1)}% inflation)`
      : `$${amount.toFixed(2)} today ≈ $${futureValue.toFixed(2)} was worth ${Math.abs(years)} year(s) ago (${(rate * 100).toFixed(1)}% inflation)`
  },
})

export const swr = tool({
  description: "Analyze a sustainable withdrawal rate over a given retirement period",
  args: {
    portfolioValue: tool.schema.number().describe("Total portfolio value at retirement"),
    withdrawalRate: tool.schema.number().describe("Annual withdrawal rate (decimal, e.g. 0.04 for 4%)"),
    years: tool.schema.number().describe("Number of years in retirement"),
    expectedReturn: tool.schema.number().describe("Expected annual portfolio return (decimal, e.g. 0.05 for 5%)"),
    inflationRate: tool.schema.number().describe("Expected annual inflation (decimal, e.g. 0.03 for 3%)"),
  },
  async execute(args) {
    const { portfolioValue, withdrawalRate, years, expectedReturn, inflationRate } = args
    const annualWithdrawal = portfolioValue * withdrawalRate
    const realReturn = (1 + expectedReturn) / (1 + inflationRate) - 1
    const monthlyWithdrawal = annualWithdrawal / 12
    let remaining = portfolioValue
    let totalWithdrawn = 0
    const yearlyData: { year: number; withdrawal: number; remaining: number }[] = []
    for (let y = 1; y <= years; y++) {
      const inflationAdjustedWithdrawal = annualWithdrawal * Math.pow(1 + inflationRate, y - 1)
      remaining = remaining * (1 + expectedReturn) - inflationAdjustedWithdrawal
      totalWithdrawn += inflationAdjustedWithdrawal
      if (y % 5 === 0 || y === years) {
        yearlyData.push({ year: y, withdrawal: inflationAdjustedWithdrawal, remaining: Math.max(0, remaining) })
      }
    }
    const success = remaining >= 0
    const lines = [
      `Initial Portfolio: $${portfolioValue.toFixed(2)}`,
      `Annual Withdrawal (Year 1): $${annualWithdrawal.toFixed(2)} (${(withdrawalRate * 100).toFixed(1)}%)`,
      `Monthly Withdrawal (Year 1): $${monthlyWithdrawal.toFixed(2)}`,
      `Total Withdrawn (${years} years): $${totalWithdrawn.toFixed(2)}`,
      `Remaining Portfolio: $${Math.max(0, remaining).toFixed(2)}`,
      `Status: ${success ? "Portfolio survives" : "Portfolio depletes in year ${years}"}`,
      ``,
      `Projection (5-year increments):`,
      `Year | Withdrawal | Remaining`,
      `-----|------------|----------`,
    ]
    for (const d of yearlyData) {
      lines.push(`${String(d.year).padStart(4)} | $${d.withdrawal.toFixed(0).padStart(9)} | $${d.remaining.toFixed(0).padStart(9)}`)
    }
    lines.push("")
    lines.push(`Real return assumption: ${(realReturn * 100).toFixed(1)}% (${(expectedReturn * 100).toFixed(1)}% nominal - ${(inflationRate * 100).toFixed(1)}% inflation)`)
    return lines.join("\n")
  },
})

export const pmt = tool({
  description: "Calculate loan payment (PMT) given principal, annual rate, and term in years",
  args: {
    principal: tool.schema.number().describe("Loan principal amount"),
    annualRate: tool.schema.number().describe("Annual interest rate (decimal, e.g. 0.065 for 6.5%)"),
    years: tool.schema.number().describe("Loan term in years"),
    paymentsPerYear: tool.schema.number().describe("Number of payments per year (12 for monthly)"),
  },
  async execute(args) {
    const { principal, annualRate, years, paymentsPerYear } = args
    const n = years * paymentsPerYear
    const r = annualRate / paymentsPerYear
    if (r === 0) {
      const payment = principal / n
      return `Monthly Payment: $${payment.toFixed(2)}\nTotal Interest: $0.00`
    }
    const payment = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
    const totalPaid = payment * n
    const totalInterest = totalPaid - principal
    return [
      `Payment (${paymentsPerYear === 12 ? "Monthly" : "Periodic"}): $${payment.toFixed(2)}`,
      `Total Payments (${n} periods): $${totalPaid.toFixed(2)}`,
      `Total Interest: $${totalInterest.toFixed(2)}`,
    ].join("\n")
  },
})
