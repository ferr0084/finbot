import { describe, expect, test } from "bun:test"
import { parseDateStrict, roundTo, extractQuoteSummary, extractFundamentals } from "./index"

describe("parseDateStrict", () => {
  test("accepts valid date", () => {
    expect(parseDateStrict("2026-02-28", "date")).toBe("2026-02-28")
  })
  test("rejects rollover", () => {
    expect(() => parseDateStrict("2026-02-30", "date")).toThrow()
  })
  test("rejects bad format", () => {
    expect(() => parseDateStrict("2026-2-3", "date")).toThrow()
  })
})

describe("roundTo", () => {
  test("rounds", () => {
    expect(roundTo(1.23456, 2)).toBe(1.23)
    expect(roundTo(null, 2)).toBeNull()
  })
})

describe("extractQuoteSummary", () => {
  test("includes marketState", () => {
    const q = extractQuoteSummary({ symbol: "AAPL", regularMarketPrice: 100, marketState: "REGULAR" })
    expect(q.symbol).toBe("AAPL")
    expect(q.marketState).toBe("REGULAR")
  })
})

describe("extractFundamentals", () => {
  test("extracts fields", () => {
    const f = extractFundamentals({ symbol: "AAPL", marketCap: 1e12, sector: "Tech" })
    expect(f.symbol).toBe("AAPL")
    expect(f.marketCap).toBe(1e12)
    expect(f.sector).toBe("Tech")
  })
})