#!/usr/bin/env python3
"""BOTT technical analysis: RSI(14), MACD(12,26,9), volume profile, MAs.
Reads a JSON array of daily bars from a file path arg.
"""
import json, sys, statistics

path = sys.argv[1]
with open(path) as f:
    bars = json.load(f)

# sort by date ascending
bars.sort(key=lambda b: b["date"])
dates = [b["date"][:10] for b in bars]
close = [b["close"] for b in bars]
high = [b["high"] for b in bars]
low = [b["low"] for b in bars]
vol = [b["volume"] for b in bars]
n = len(close)

def ema(vals, period):
    k = 2 / (period + 1)
    out = [vals[0]]
    for v in vals[1:]:
        out.append(v * k + out[-1] * (1 - k))
    return out

def rsi_wilder(vals, period=14):
    gains, losses = [], []
    for i in range(1, len(vals)):
        ch = vals[i] - vals[i-1]
        gains.append(max(ch, 0))
        losses.append(max(-ch, 0))
    # Wilder smoothing
    ag = sum(gains[:period]) / period
    al = sum(losses[:period]) / period
    rsi = [100.0 if al == 0 else 100 - 100 / (1 + ag / al)]
    for i in range(period, len(gains)):
        ag = (ag * (period - 1) + gains[i]) / period
        al = (al * (period - 1) + losses[i]) / period
        rsi.append(100.0 if al == 0 else 100 - 100 / (1 + ag / al))
    # pad front with None
    return [None] * period + rsi

# MACD
ema12 = ema(close, 12)
ema26 = ema(close, 26)
macd = [a - b for a, b in zip(ema12, ema26)]
signal = ema(macd, 9)
hist = [m - s for m, s in zip(macd, signal)]

# RSI
rsi = rsi_wilder(close, 14)

# MAs
ma50 = [None] * 49 + [statistics.mean(close[i-49:i+1]) for i in range(49, n)]
ma200 = [None] * 199 + [statistics.mean(close[i-199:i+1]) for i in range(199, n)]

# Volume profile: bucket price into 1.0 bins over 52W range
lo, hi = min(low), max(high)
step = 1.0
buckets = {}
for i in range(n):
    p = close[i]
    b = round(p / step) * step
    buckets[b] = buckets.get(b, 0) + vol[i]
profile = sorted(buckets.items(), key=lambda x: -x[1])

# volume stats
avg20 = statistics.mean(vol[-20:])
avg5 = statistics.mean(vol[-5:])
last = close[-1]

print(f"bars={n}  last_date={dates[-1]}  last_close={last:.2f}")
print(f"RSI(14) last={rsi[-1]:.1f}  prev={rsi[-2]:.1f}  prev5={[round(x,1) if x else None for x in rsi[-6:-1]]}")
print(f"MACD last={macd[-1]:.3f}  signal={signal[-1]:.3f}  hist={hist[-1]:.3f}")
print(f"MACD prev5 hist={[round(x,3) for x in hist[-6:-1]]}")
print(f"MA50={ma50[-1]:.2f}  MA200={ma200[-1]:.2f}  price_vs_MA50={(last/ma50[-1]-1)*100:.1f}%  vs_MA200={(last/ma200[-1]-1)*100:.1f}%")
print(f"avg_vol_5d={avg5:.0f}  avg_vol_20d={avg20:.0f}  ratio={avg5/avg20:.2f}")
print(f"52w_high={hi:.2f}  52w_low={lo:.2f}")
print("Top volume-price nodes (price: vol):")
for p, v in profile[:8]:
    print(f"  ${p:.0f}: {v:.0f}")
# recent 20d volume on down vs up days
down_vol = [vol[i] for i in range(n-20, n) if close[i] < close[i-1]]
up_vol = [vol[i] for i in range(n-20, n) if close[i] >= close[i-1]]
print(f"last20d down-day avg vol={statistics.mean(down_vol):.0f}  up-day avg vol={statistics.mean(up_vol):.0f}")