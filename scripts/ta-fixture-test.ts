import { readFileSync } from "node:fs"
import { computeTa, type Bar } from "./yahoo-finance-mcp/ta"

const bars = JSON.parse(readFileSync(new URL("./__fixtures__/PL-2026-11-05.json", import.meta.url), "utf8")) as Bar[]
const result = computeTa(bars, { windows: [20, 50, 100, 200], levels: true, interval: "1d" }) as any

const checks: { name: string; actual: number | string | null | undefined; expected: number | string; tolerance?: number }[] = [
  { name: "SMA20", actual: result.trend.movingAverages.sma20.sma, expected: 13.94, tolerance: 0.02 },
  { name: "SMA50", actual: result.trend.movingAverages.sma50.sma, expected: 16.09, tolerance: 0.02 },
  { name: "SMA100", actual: result.trend.movingAverages.sma100.sma, expected: 20.41, tolerance: 0.02 },
  { name: "SMA200", actual: result.trend.movingAverages.sma200.sma, expected: 26.43, tolerance: 0.02 },
  { name: "RSI-14", actual: result.momentum.rsi14, expected: 29.5, tolerance: 1.0 },
  { name: "ATR-14", actual: result.volatility.atr14, expected: 0.97, tolerance: 0.02 },
  { name: "52W high", actual: result.range52w.high, expected: 51.76, tolerance: 0.02 },
  { name: "52W low", actual: result.range52w.low, expected: 10.52, tolerance: 0.02 },
  {
    name: "up-leg 78.6% fib",
    actual: result.upLeg?.fib.find((level: { ratio: number; level: number }) => level.ratio === 0.786)?.level,
    expected: 12.81,
    tolerance: 0.02,
  },
  { name: "50/200 death cross", actual: result.trend.goldenDeathCross?.date, expected: "2026-08-17" },
]

let failed = 0
for (const check of checks) {
  const ok =
    typeof check.expected === "string"
      ? check.actual === check.expected
      : typeof check.actual === "number" && Math.abs(check.actual - check.expected) <= (check.tolerance ?? 0)
  if (!ok) failed++
  console.log(`${ok ? "PASS" : "FAIL"} ${check.name}: actual=${check.actual} expected=${check.expected}${check.tolerance ? ` ±${check.tolerance}` : ""}`)
}

if (failed > 0) {
  console.error(`${failed} fixture check(s) failed`)
  process.exit(1)
}
console.log("All ta fixture checks passed")
