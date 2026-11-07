import type { Info as ToolInfo } from "@opencode/plugin/promise/tool"

type JsonResult = { content: string }

function json(payload: unknown): JsonResult {
  return { content: JSON.stringify(payload, null, 2) }
}

const NS = "fin-calc"

export const npv: ToolInfo = {
  name: "npv",
  description: "Calculate Net Present Value given a discount rate and series of cash flows",
  input: {
    type: "object",
    properties: {
      rate: { type: "number", description: "Annual discount rate (decimal, e.g. 0.08 for 8%)" },
      cashflows: {
        type: "array",
        items: { type: "number" },
        description: "Array of cash flows. Negative = investment, positive = return",
      },
    },
    required: ["rate", "cashflows"],
    additionalProperties: false,
  },
  options: { namespace: NS, codemode: true },
  execute: async (input) => {
    const { rate, cashflows } = input as { rate: number; cashflows: number[] }
    const value = cashflows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0)
    return json({
      tool: "npv",
      value,
      display: value < 0 ? `-$${Math.abs(value).toFixed(2)}` : `$${value.toFixed(2)}`,
      inputs: { rate, cashflows },
      assumptions: ["Cash flow at t=0 is undiscounted", "Discount rate is annual and constant"],
    })
  },
}

export const cagr: ToolInfo = {
  name: "cagr",
  description: "Calculate Compound Annual Growth Rate",
  input: {
    type: "object",
    properties: {
      beginValue: { type: "number", description: "Beginning value of the investment" },
      endValue: { type: "number", description: "Ending value of the investment" },
      years: { type: "number", description: "Number of years held" },
    },
    required: ["beginValue", "endValue", "years"],
    additionalProperties: false,
  },
  options: { namespace: NS, codemode: true },
  execute: async (input) => {
    const { beginValue, endValue, years } = input as {
      beginValue: number
      endValue: number
      years: number
    }
    const value = Math.pow(endValue / beginValue, 1 / years) - 1
    return json({
      tool: "cagr",
      value,
      display: `${(value * 100).toFixed(2)}%`,
      inputs: { beginValue, endValue, years },
      assumptions: ["Annual compounding", "Single beginning and ending value"],
    })
  },
}

export const sharpe: ToolInfo = {
  name: "sharpe",
  description: "Calculate Sharpe Ratio from a series of returns and a risk-free rate",
  input: {
    type: "object",
    properties: {
      returns: {
        type: "array",
        items: { type: "number" },
        description: "Array of periodic returns (decimal, e.g. [0.01, -0.02, 0.015])",
      },
      riskFreeRate: {
        type: "number",
        description: "Risk-free rate for the same period (decimal, e.g. 0.05 for 5% annual)",
      },
      periodsPerYear: {
        type: "number",
        description: "Number of periods per year (12 for monthly, 252 for daily, 1 for annual)",
      },
    },
    required: ["returns", "riskFreeRate", "periodsPerYear"],
    additionalProperties: false,
  },
  options: { namespace: NS, codemode: true },
  execute: async (input) => {
    const { returns, riskFreeRate, periodsPerYear } = input as {
      returns: number[]
      riskFreeRate: number
      periodsPerYear: number
    }
    const rfrPerPeriod = riskFreeRate / periodsPerYear
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length
    const excessReturns = returns.map((r) => r - rfrPerPeriod)
    const meanExcess = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length
    const variance = returns.reduce((a, r) => a + Math.pow(r - meanReturn, 2), 0) / returns.length
    const stdDev = Math.sqrt(variance)
    if (stdDev === 0) {
      return json({
        tool: "sharpe",
        value: null,
        display: "undefined (zero volatility)",
        inputs: { returns, riskFreeRate, periodsPerYear },
        assumptions: ["Population standard deviation of raw returns", "Excess return over per-period risk-free rate"],
      })
    }
    const value = (meanExcess / stdDev) * Math.sqrt(periodsPerYear)
    return json({
      tool: "sharpe",
      value,
      display: value.toFixed(3),
      inputs: { returns, riskFreeRate, periodsPerYear },
      assumptions: [
        "Population standard deviation of raw returns",
        "Excess return over per-period risk-free rate",
        `Annualized by sqrt(${periodsPerYear})`,
      ],
    })
  },
}

export const compound: ToolInfo = {
  name: "compound",
  description: "Calculate future value of an investment with periodic contributions",
  input: {
    type: "object",
    properties: {
      principal: { type: "number", description: "Initial investment amount" },
      rate: { type: "number", description: "Annual interest rate (decimal, e.g. 0.07 for 7%)" },
      years: { type: "number", description: "Number of years" },
      contribution: { type: "number", description: "Periodic contribution amount" },
      contributionsPerYear: {
        type: "number",
        description: "Number of contributions per year (12 monthly, 1 yearly)",
      },
    },
    required: ["principal", "rate", "years", "contribution", "contributionsPerYear"],
    additionalProperties: false,
  },
  options: { namespace: NS, codemode: true },
  execute: async (input) => {
    const { principal, rate, years, contribution, contributionsPerYear } = input as {
      principal: number
      rate: number
      years: number
      contribution: number
      contributionsPerYear: number
    }
    const n = contributionsPerYear
    const r = rate / n
    const periods = years * n
    const fvPrincipal = principal * Math.pow(1 + r, periods)
    const fvContributions = r === 0 ? contribution * periods : contribution * ((Math.pow(1 + r, periods) - 1) / r)
    const futureValue = fvPrincipal + fvContributions
    const totalContributions = principal + contribution * periods
    const totalGrowth = futureValue - totalContributions
    return json({
      tool: "compound",
      futureValue,
      totalContributions,
      totalGrowth,
      display: `$${futureValue.toFixed(2)}`,
      inputs: { principal, rate, years, contribution, contributionsPerYear },
      assumptions: [
        `${(rate * 100).toFixed(1)}% annual return compounded ${n} times per year`,
        `Contributions at end of each period, $${contribution} per ${n === 12 ? "month" : "year"}`,
      ],
    })
  },
}

export const inflation: ToolInfo = {
  name: "inflation",
  description: "Calculate inflation-adjusted value of an amount over time",
  input: {
    type: "object",
    properties: {
      amount: { type: "number", description: "Current dollar amount" },
      years: { type: "number", description: "Number of years in the future or past" },
      rate: { type: "number", description: "Annual inflation rate (decimal, e.g. 0.03 for 3%)" },
    },
    required: ["amount", "years", "rate"],
    additionalProperties: false,
  },
  options: { namespace: NS, codemode: true },
  execute: async (input) => {
    const { amount, years, rate } = input as { amount: number; years: number; rate: number }
    const value = amount * Math.pow(1 + rate, years)
    const display =
      years >= 0
        ? `$${amount.toFixed(2)} today ≈ $${value.toFixed(2)} in ${years} year(s) (${(rate * 100).toFixed(1)}% inflation)`
        : `$${amount.toFixed(2)} today ≈ $${value.toFixed(2)} was worth ${Math.abs(years)} year(s) ago (${(rate * 100).toFixed(1)}% inflation)`
    return json({
      tool: "inflation",
      value,
      display,
      inputs: { amount, years, rate },
      assumptions: ["Constant annual inflation rate", "Annual compounding"],
    })
  },
}

export const swr: ToolInfo = {
  name: "swr",
  description: "Analyze a sustainable withdrawal rate over a given retirement period",
  input: {
    type: "object",
    properties: {
      portfolioValue: { type: "number", description: "Total portfolio value at retirement" },
      withdrawalRate: { type: "number", description: "Annual withdrawal rate (decimal, e.g. 0.04 for 4%)" },
      years: { type: "number", description: "Number of years in retirement" },
      expectedReturn: { type: "number", description: "Expected annual portfolio return (decimal, e.g. 0.05 for 5%)" },
      inflationRate: { type: "number", description: "Expected annual inflation (decimal, e.g. 0.03 for 3%)" },
    },
    required: ["portfolioValue", "withdrawalRate", "years", "expectedReturn", "inflationRate"],
    additionalProperties: false,
  },
  options: { namespace: NS, codemode: true },
  execute: async (input) => {
    const { portfolioValue, withdrawalRate, years, expectedReturn, inflationRate } = input as {
      portfolioValue: number
      withdrawalRate: number
      years: number
      expectedReturn: number
      inflationRate: number
    }
    const annualWithdrawal = portfolioValue * withdrawalRate
    const realReturn = (1 + expectedReturn) / (1 + inflationRate) - 1
    const monthlyWithdrawal = annualWithdrawal / 12
    let remaining = portfolioValue
    let totalWithdrawn = 0
    const projection: { year: number; withdrawal: number; remaining: number }[] = []
    let depletionYear: number | null = null
    for (let y = 1; y <= years; y++) {
      const inflationAdjustedWithdrawal = annualWithdrawal * Math.pow(1 + inflationRate, y - 1)
      remaining = remaining * (1 + expectedReturn) - inflationAdjustedWithdrawal
      totalWithdrawn += inflationAdjustedWithdrawal
      if (remaining < 0 && depletionYear === null) depletionYear = y
      if (y % 5 === 0 || y === years) {
        projection.push({
          year: y,
          withdrawal: inflationAdjustedWithdrawal,
          remaining: Math.max(0, remaining),
        })
      }
    }
    const survives = remaining >= 0
    return json({
      tool: "swr",
      survives,
      depletionYear,
      initialPortfolio: portfolioValue,
      annualWithdrawalYear1: annualWithdrawal,
      monthlyWithdrawalYear1: monthlyWithdrawal,
      totalWithdrawn,
      remainingPortfolio: Math.max(0, remaining),
      realReturn,
      projection,
      display: survives ? "Portfolio survives" : `Portfolio depletes in year ${depletionYear}`,
      inputs: { portfolioValue, withdrawalRate, years, expectedReturn, inflationRate },
      assumptions: [
        "Withdrawals grow with inflation annually",
        "Returns applied before withdrawal each year",
        `Real return ${(realReturn * 100).toFixed(1)}% = (1 + ${(expectedReturn * 100).toFixed(1)}%) / (1 + ${(inflationRate * 100).toFixed(1)}%) - 1`,
      ],
    })
  },
}

export const pmt: ToolInfo = {
  name: "pmt",
  description: "Calculate loan payment (PMT) given principal, annual rate, and term in years",
  input: {
    type: "object",
    properties: {
      principal: { type: "number", description: "Loan principal amount" },
      annualRate: { type: "number", description: "Annual interest rate (decimal, e.g. 0.065 for 6.5%)" },
      years: { type: "number", description: "Loan term in years" },
      paymentsPerYear: { type: "number", description: "Number of payments per year (12 for monthly)" },
    },
    required: ["principal", "annualRate", "years", "paymentsPerYear"],
    additionalProperties: false,
  },
  options: { namespace: NS, codemode: true },
  execute: async (input) => {
    const { principal, annualRate, years, paymentsPerYear } = input as {
      principal: number
      annualRate: number
      years: number
      paymentsPerYear: number
    }
    const n = years * paymentsPerYear
    const r = annualRate / paymentsPerYear
    const payment = r === 0 ? principal / n : (principal * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1)
    const totalPaid = payment * n
    const totalInterest = totalPaid - principal
    return json({
      tool: "pmt",
      payment,
      totalPaid,
      totalInterest,
      display: `$${payment.toFixed(2)} per ${paymentsPerYear === 12 ? "month" : "period"}`,
      inputs: { principal, annualRate, years, paymentsPerYear },
      assumptions: ["Fixed rate", "Payments at end of each period", `${n} total payments`],
    })
  },
}

export const calcTools: ToolInfo[] = [npv, cagr, sharpe, compound, inflation, swr, pmt]
