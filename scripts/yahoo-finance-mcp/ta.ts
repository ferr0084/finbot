export interface Bar {
  date: string
  open: number
  high: number
  low: number
  close: number
  adjClose?: number
  volume: number
}

export interface TaOptions {
  windows: number[]
  levels: boolean
  interval: "1d" | "1wk"
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function round(value: number | null, digits = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function pct(value: number | null, digits = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null
  return round(value * 100, digits)
}

function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null)
  if (values.length < period) return out
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  let previous = mean(values.slice(0, period))
  out[period - 1] = previous
  for (let i = period; i < values.length; i++) {
    previous = values[i] * k + previous * (1 - k)
    out[i] = previous
  }
  return out
}

// Wilder smoothing, not a simple average. This is the definition that keeps
// RSI/ATR comparable with prior delivered answers.
function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null)
  if (values.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1]
    if (change >= 0) gain += change
    else loss -= change
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1]
    const up = change > 0 ? change : 0
    const down = change < 0 ? -change : 0
    avgGain = (avgGain * (period - 1) + up) / period
    avgLoss = (avgLoss * (period - 1) + down) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

function atr(bars: Bar[], period = 14): (number | null)[] {
  const trueRange = bars.map((bar, i) => {
    if (i === 0) return bar.high - bar.low
    const previousClose = bars[i - 1].close
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose))
  })
  const out: (number | null)[] = Array(bars.length).fill(null)
  if (bars.length < period) return out
  let previous = mean(trueRange.slice(0, period))
  out[period - 1] = previous
  for (let i = period; i < trueRange.length; i++) {
    previous = (previous * (period - 1) + trueRange[i]) / period
    out[i] = previous
  }
  return out
}

function macd(values: number[]) {
  const fast = ema(values, 12)
  const slow = ema(values, 26)
  const macdValues: number[] = []
  const macdIndices: number[] = []
  for (let i = 0; i < values.length; i++) {
    if (fast[i] !== null && slow[i] !== null) {
      macdValues.push((fast[i] as number) - (slow[i] as number))
      macdIndices.push(i)
    }
  }
  const signalCompact = ema(macdValues, 9)
  const signal: (number | null)[] = Array(values.length).fill(null)
  for (let i = 0; i < macdIndices.length; i++) signal[macdIndices[i]] = signalCompact[i]
  const line: (number | null)[] = Array(values.length).fill(null)
  for (let i = 0; i < macdIndices.length; i++) line[macdIndices[i]] = macdValues[i]
  const histogram: (number | null)[] = line.map((value, i) =>
    value === null || signal[i] === null ? null : value - (signal[i] as number),
  )
  return { line, signal, histogram }
}

function annualizedVolatility(closes: number[], window: number, periodsPerYear: number): number | null {
  if (closes.length < window + 1) return null
  const returns: number[] = []
  for (let i = closes.length - window; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]))
  }
  const average = mean(returns)
  const variance = returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / (returns.length - 1)
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear)
}

function maxDrawdown(closes: number[]): number {
  let peak = closes[0]
  let worst = 0
  for (const close of closes) {
    if (close > peak) peak = close
    const drawdown = (close - peak) / peak
    if (drawdown < worst) worst = drawdown
  }
  return worst
}

function pivots(bars: Bar[], wing = 4) {
  const highs: number[] = []
  const lows: number[] = []
  for (let i = wing; i < bars.length - wing; i++) {
    let isHigh = true
    let isLow = true
    for (let j = i - wing; j <= i + wing; j++) {
      if (j === i) continue
      if (bars[j].high > bars[i].high) isHigh = false
      if (bars[j].low < bars[i].low) isLow = false
    }
    if (isHigh) highs.push(i)
    if (isLow) lows.push(i)
  }
  return { highs, lows }
}

function clusterLevels(levels: number[], tolerance = 0.015): { level: number; touches: number }[] {
  const sorted = [...levels].sort((a, b) => a - b)
  const clusters: { values: number[]; level: number }[] = []
  for (const level of sorted) {
    const current = clusters[clusters.length - 1]
    if (current && Math.abs(level - current.level) / current.level <= tolerance) {
      current.values.push(level)
      current.level = mean(current.values)
    } else {
      clusters.push({ values: [level], level })
    }
  }
  return clusters.map((cluster) => ({ level: round(cluster.level, 2) as number, touches: cluster.values.length }))
}

const FIB_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786]

function fibonacci(high: number, low: number): { ratio: number; level: number }[] {
  return FIB_RATIOS.map((ratio) => ({ ratio, level: round(high - (high - low) * ratio, 2) as number }))
}

// Trailing-return lookbacks in calendar days. YTD is anchored to the last bar
// of the prior calendar year instead of a fixed offset.
const RETURN_LOOKBACKS: Array<[string, number]> = [
  ["1w", 7],
  ["1m", 30],
  ["3m", 91],
  ["6m", 182],
  ["1y", 365],
  ["3y", 1095],
  ["5y", 1825],
]

function periodReturns(
  bars: Bar[],
  field: "close" | "adjClose",
): Record<string, number | null> | null {
  const values = bars.map((bar) => (field === "adjClose" ? bar.adjClose : bar.close))
  if (values.some((value) => value === undefined || value === null || !Number.isFinite(value))) return null
  const last = values[values.length - 1] as number
  const lastDate = new Date(bars[bars.length - 1].date).getTime()
  const out: Record<string, number | null> = {}
  for (const [label, days] of RETURN_LOOKBACKS) {
    const cutoff = lastDate - days * 24 * 60 * 60 * 1000
    let index = -1
    for (let i = bars.length - 1; i >= 0; i--) {
      if (new Date(bars[i].date).getTime() <= cutoff) {
        index = i
        break
      }
    }
    out[label] = index >= 0 ? pct(last / (values[index] as number) - 1) : null
  }
  const lastYear = Number(bars[bars.length - 1].date.slice(0, 4))
  let ytdIndex = -1
  for (let i = bars.length - 1; i >= 0; i--) {
    if (Number(bars[i].date.slice(0, 4)) === lastYear - 1) {
      ytdIndex = i
      break
    }
  }
  out.ytd = ytdIndex >= 0 ? pct(last / (values[ytdIndex] as number) - 1) : null
  return out
}

// Volume at price: bucket typical price into equal bins across the window and
// return the highest-volume nodes. Replaces per-ticker volume-profile scripts.
function volumeProfile(bars: Bar[], bins = 20, top = 5) {
  const typical = bars.map((bar) => (bar.high + bar.low + bar.close) / 3)
  const min = Math.min(...typical)
  const max = Math.max(...typical)
  if (!(max > min)) return []
  const step = (max - min) / bins
  const totals = Array<number>(bins).fill(0)
  for (let i = 0; i < bars.length; i++) {
    const index = Math.min(bins - 1, Math.floor((typical[i] - min) / step))
    totals[index] += bars[i].volume
  }
  const total = totals.reduce((sum, value) => sum + value, 0)
  return totals
    .map((volume, index) => ({
      priceLow: round(min + index * step, 2) as number,
      priceHigh: round(min + (index + 1) * step, 2) as number,
      volume: Math.round(volume),
      sharePct: total > 0 ? round((volume / total) * 100, 1) : null,
    }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, top)
}

function upDownVolume(bars: Bar[], window = 20) {
  const slice = bars.slice(-(window + 1))
  const up: number[] = []
  const down: number[] = []
  for (let i = 1; i < slice.length; i++) {
    if (slice[i].close >= slice[i - 1].close) up.push(slice[i].volume)
    else down.push(slice[i].volume)
  }
  return {
    upDays: up.length,
    downDays: down.length,
    upAvg: up.length ? Math.round(mean(up)) : null,
    downAvg: down.length ? Math.round(mean(down)) : null,
  }
}

function lastCross(
  fast: (number | null)[],
  slow: (number | null)[],
  bars: Bar[],
): { type: "golden" | "death"; date: string } | null {
  for (let i = fast.length - 1; i > 0; i--) {
    if (fast[i] === null || slow[i] === null || fast[i - 1] === null || slow[i - 1] === null) continue
    const now = (fast[i] as number) - (slow[i] as number)
    const previous = (fast[i - 1] as number) - (slow[i - 1] as number)
    if (previous > 0 && now <= 0) return { type: "death", date: bars[i].date.slice(0, 10) }
    if (previous < 0 && now >= 0) return { type: "golden", date: bars[i].date.slice(0, 10) }
  }
  return null
}

export function computeTa(bars: Bar[], options: TaOptions, quote?: Record<string, unknown>) {
  if (bars.length < 30) throw new Error(`Need at least 30 bars for technical analysis, got ${bars.length}`)

  const notes: string[] = []
  const closes = bars.map((bar) => bar.close)
  const price = closes[closes.length - 1]
  const periodsPerYear = options.interval === "1wk" ? 52 : 252

  const maByWindow: Record<string, { sma: number | null; ema: number | null; distancePct: number | null }> = {}
  const smaSeries: Record<number, (number | null)[]> = {}
  const emaSeries: Record<number, (number | null)[]> = {}
  for (const window of options.windows) {
    const smaValues = sma(closes, window)
    const emaValues = ema(closes, window)
    smaSeries[window] = smaValues
    emaSeries[window] = emaValues
    const smaLast = smaValues[smaValues.length - 1]
    const emaLast = emaValues[emaValues.length - 1]
    if (smaLast === null) notes.push(`Only ${bars.length} bars: SMA${window} unavailable`)
    maByWindow[`sma${window}`] = {
      sma: round(smaLast, 2),
      ema: round(emaLast, 2),
      distancePct: pct(smaLast === null ? null : (price - smaLast) / smaLast),
    }
  }

  const stackByWindow = options.windows
    .map((window) => ({ window, value: smaSeries[window][smaSeries[window].length - 1] }))
    .filter((entry): entry is { window: number; value: number } => entry.value !== null)
  const stack = [...stackByWindow].sort((a, b) => b.value - a.value)
  const stackOrder = stack.map((entry) => `SMA${entry.window}`)
  const bullishStack = stackByWindow.length > 1 && stackByWindow.every((entry, i) => i === 0 || entry.value < stackByWindow[i - 1].value)
  const bearishStack = stackByWindow.length > 1 && stackByWindow.every((entry, i) => i === 0 || entry.value > stackByWindow[i - 1].value)
  const stackLabel =
    stackByWindow.length < 2
      ? "insufficient data"
      : price > stack[0].value && bullishStack
        ? "bullish (price above, fast > slow)"
        : price < stack[stack.length - 1].value && bearishStack
          ? "bearish (price below, slow > fast)"
          : "mixed"

  const crosses: Record<string, { type: string; date: string } | null> = {}
  for (let i = 0; i < options.windows.length - 1; i++) {
    const fastWindow = options.windows[i]
    const slowWindow = options.windows[i + 1]
    crosses[`sma${fastWindow}_sma${slowWindow}`] = lastCross(smaSeries[fastWindow], smaSeries[slowWindow], bars)
  }
  if (smaSeries[50] && smaSeries[200]) {
    crosses["sma50_sma200"] = lastCross(smaSeries[50], smaSeries[200], bars)
  }
  const goldenDeath = crosses["sma50_sma200"] ?? null

  const rsiValues = rsi(closes, 14)
  const macdResult = macd(closes)
  const lastIndex = bars.length - 1
  const lastRsi = rsiValues[lastIndex]
  const lastMacd = macdResult.line[lastIndex]
  const lastSignal = macdResult.signal[lastIndex]
  const lastHistogram = macdResult.histogram[lastIndex]

  const atrValues = atr(bars, 14)
  const lastAtr = atrValues[lastIndex]

  const recent = bars.slice(-252)
  const high52 = Math.max(...recent.map((bar) => bar.high))
  const low52 = Math.min(...recent.map((bar) => bar.low))
  const high52Date = recent[recent.findIndex((bar) => bar.high === high52)]?.date.slice(0, 10) ?? null
  const low52Date = recent[recent.findIndex((bar) => bar.low === low52)]?.date.slice(0, 10) ?? null

  const volumes = bars.map((bar) => bar.volume)
  const lastVolume = volumes[lastIndex]
  const avgVolume20 = volumes.length >= 20 ? mean(volumes.slice(-20)) : null
  const avgVolume50 = volumes.length >= 50 ? mean(volumes.slice(-50)) : null

  const swing = pivots(bars, 4)
  const lastSwingLows = swing.lows.slice(-3).map((index) => ({
    date: bars[index].date.slice(0, 10),
    price: round(bars[index].low, 2),
    rsi: round(rsiValues[index], 1),
  }))

  // Last major up-leg: over the last two years, the lowest close then the
  // highest high after it. Two years keeps the leg current instead of anchoring
  // to a multi-year bottom that is no longer the relevant advance. The low uses
  // close (not the intraday wick) so a one-day spike does not move the anchor.
  const legBars = bars.slice(-504)
  let legLowIndex = 0
  for (let i = 1; i < legBars.length; i++) if (legBars[i].close < legBars[legLowIndex].close) legLowIndex = i
  let legHighIndex = legLowIndex
  for (let i = legLowIndex + 1; i < legBars.length; i++) if (legBars[i].high > legBars[legHighIndex].high) legHighIndex = i
  const legLow = legBars[legLowIndex].close
  const legHigh = legBars[legHighIndex].high
  const upLeg =
    legHighIndex > legLowIndex && legHigh > legLow
      ? {
          lookbackBars: legBars.length,
          low: round(legLow, 2),
          lowDate: legBars[legLowIndex].date.slice(0, 10),
          high: round(legHigh, 2),
          highDate: legBars[legHighIndex].date.slice(0, 10),
          gainPct: pct((legHigh - legLow) / legLow),
          fib: fibonacci(legHigh, legLow),
        }
      : null

  const result: Record<string, unknown> = {
    ticker: null,
    asOf: bars[lastIndex].date.slice(0, 10),
    bars: bars.length,
    interval: options.interval,
    quote: quote ?? null,
    trend: {
      price: round(price, 2),
      movingAverages: maByWindow,
      stackOrder,
      stack: stackLabel,
      crosses,
      goldenDeathCross: goldenDeath,
    },
    momentum: {
      rsi14: round(lastRsi, 1),
      rsiSwingLows: lastSwingLows,
      macd: round(lastMacd, 3),
      macdSignal: round(lastSignal, 3),
      macdHistogram: round(lastHistogram, 3),
    },
    returns: {
      price: periodReturns(bars, "close"),
      total: periodReturns(bars, "adjClose"),
    },
    volatility: {
      atr14: round(lastAtr, 2),
      atrPctOfPrice: pct(lastAtr === null ? null : lastAtr / price),
      hv30: pct(annualizedVolatility(closes, 30, periodsPerYear)),
      hv60: pct(annualizedVolatility(closes, 60, periodsPerYear)),
      maxDrawdown: pct(maxDrawdown(closes)),
      drawdownFrom52wHigh: pct((price - high52) / high52),
    },
    volume: {
      last: lastVolume,
      avg20: avgVolume20 === null ? null : Math.round(avgVolume20),
      avg50: avgVolume50 === null ? null : Math.round(avgVolume50),
      ratio20: avgVolume20 === null ? null : round(lastVolume / avgVolume20, 2),
      upDown20: upDownVolume(bars),
      profileWindowBars: Math.min(bars.length, 252),
      profile: volumeProfile(bars.slice(-252)),
    },
    range52w: {
      high: round(high52, 2),
      highDate: high52Date,
      low: round(low52, 2),
      lowDate: low52Date,
      fib: fibonacci(high52, low52),
    },
    upLeg,
    notes,
  }

  if (options.levels) {
    // Only levels near the current price are actionable; a 5y window otherwise
    // returns ~90 clusters spanning the whole historical range.
    const band = 0.3
    const clusters = clusterLevels([...swing.highs.map((i) => bars[i].high), ...swing.lows.map((i) => bars[i].low)])
      .filter((cluster) => cluster.level >= price * (1 - band) && cluster.level <= price * (1 + band))
      .sort((a, b) => b.touches - a.touches)
      .slice(0, 12)
      .sort((a, b) => a.level - b.level)
    result.levels = {
      swingHighs: swing.highs.slice(-10).map((i) => ({ date: bars[i].date.slice(0, 10), price: round(bars[i].high, 2) })),
      swingLows: swing.lows.slice(-10).map((i) => ({ date: bars[i].date.slice(0, 10), price: round(bars[i].low, 2) })),
      clustersBandPct: band * 100,
      clusters: clusters.map((cluster) => ({
        ...cluster,
        kind: cluster.level > price ? "resistance" : "support",
      })),
    }
  }

  return result
}
