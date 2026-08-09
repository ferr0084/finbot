#!/usr/bin/env python3
"""QYLD sell-planning levels: MAs, swing support/resistance, 52w range position, TR."""
import json, datetime as dt
from statistics import mean

SRC = "/Users/jeremy/.local/share/opencode/tool-output/tool_fd7d55ba1001DLCHot24F4XIaz"
rows = json.load(open(SRC))
for r in rows:
    r["date"] = dt.date.fromisoformat(r["date"][:10])
rows.sort(key=lambda r: r["date"])
closes = [r["close"] for r in rows]

def ma(n, i):
    return mean(closes[i-n+1:i+1])

last = len(rows)-1
print(f"last row: {rows[last]['date']}  close ${closes[last]:.2f}")

# moving averages
for n in (20, 50, 100, 200):
    print(f"MA{n:<4}= ${ma(n, last):.2f}")

# 1y window
oney = [r for r in rows if r["date"] >= rows[last]["date"] - dt.timedelta(days=365)]
hi = max(r["close"] for r in oney); lo = min(r["close"] for r in oney)
hid = [r["date"] for r in oney if r["close"] == hi][0]; lod = [r["date"] for r in oney if r["close"] == lo][0]
print(f"\n1y high ${hi:.2f} ({hid})  low ${lo:.2f} ({lod})")
print(f"current vs 1y high: {(closes[last]/hi-1)*100:+.1f}%   vs 1y low: {(closes[last]/lo-1)*100:+.1f}%")
print(f"52w range position: {(closes[last]-lo)/(hi-lo)*100:.0f}%")

# swing highs/lows in last ~6 months (local extrema, 5-day window)
sw = [r for r in rows if r["date"] >= rows[last]["date"] - dt.timedelta(days=180)]
swings = []
for i in range(2, len(sw)-2):
    if sw[i]["close"] == max(sw[j]["close"] for j in range(i-2, i+3)):
        swings.append(("H", sw[i]["date"], sw[i]["close"]))
    if sw[i]["close"] == min(sw[j]["close"] for j in range(i-2, i+3)):
        swings.append(("L", sw[i]["date"], sw[i]["close"]))
print("\nrecent swing points (6mo):")
for t, d, p in swings:
    print(f"  {t} {d} ${p:.2f}")

# recent closes to see consolidation zone
print("\nlast 15 closes:")
for r in rows[-15:]:
    print(f"  {r['date']}  ${r['close']:.2f}")

# total return incl dividends 2024-01-22..2026-07-20 (price + divs / start px)
divs = [0.179,0.177,0.178,0.172,0.163,0.169,0.177,0.179,0.181,0.183,0.18,0.339,
        0.188,0.165,0.17,0.16,0.165,0.166,0.165,0.168,0.17,0.173,0.173,0.178,
        0.179,0.177,0.172,0.179,0.179,0.185,0.178]
start_px = closes[0]; end_px = closes[-1]
cum_div = sum(divs)
print(f"\nTR 2024-01-02..2026-08-05: px {start_px:.2f}->{end_px:.2f} ({(end_px/start_px-1)*100:+.1f}%), "
      f"cum div ${cum_div:.2f}, TR={(end_px-start_px+cum_div)/start_px*100:+.1f}% over 2.59y "
      f"= {(1+(end_px-start_px+cum_div)/start_px)**(1/2.59)-1:.1%} CAGR")
