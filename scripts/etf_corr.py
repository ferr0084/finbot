#!/usr/bin/env python3
"""Correlation matrix + drawdown detail for the six watchlist ETFs (monthly bars)."""
import json
import math

TOOL_OUTPUT = "/Users/jeremy/.local/share/opencode/tool-output/tool_fce46338e0012TWPdCtlPt0qT2"
SYMS = ["VTI", "ITOT", "SCHB", "VXUS", "IXUS", "AVUV"]

with open(TOOL_OUTPUT) as f:
    data = json.load(f)

series = {s: {} for s in SYMS}
for r in data["results"]:
    if r["symbol"] in SYMS:
        series[r["symbol"]][r["date"][:10]] = r["close"]

# ---- monthly returns ----
rets = {}
for s in SYMS:
    dates = sorted(series[s])
    rs = {}
    prev = None
    for d in dates:
        if prev is not None:
            rs[d] = series[s][d] / prev - 1
        prev = series[s][d]
    rets[s] = rs

common = sorted(set.intersection(*(set(rets[s]) for s in SYMS)))

def pearson(x, y):
    n = len(x)
    mx, my = sum(x) / n, sum(y) / n
    cov = sum((a - mx) * (b - my) for a, b in zip(x, y))
    vx = sum((a - mx) ** 2 for a in x)
    vy = sum((b - my) ** 2 for b in y)
    return cov / math.sqrt(vx * vy)

print("CORRELATION (monthly returns, n=%d, %s->%s)" % (len(common), common[0], common[-1]))
hdr = "        " + "".join(f"{s:>7}" for s in SYMS)
print(hdr)
for s in SYMS:
    row = [pearson([rets[s][d] for d in common], [rets[t][d] for d in common]) for t in SYMS]
    print(f"{s:>7} " + "".join(f"{v:7.2f}" for v in row))

# ---- annual returns ----
print("\nANNUAL RETURNS (price-only, %):")
years = ["2022", "2023", "2024", "2025"]
print(f"{'fund':>7} " + "".join(f"{y:>8}" for y in years) + f"{'YTD26':>8}")
for s in SYMS:
    closes = series[s]
    def yr_ret(y):
        return (closes[f"{y}-12-01"] / closes[f"{int(y)-1}-12-01"] - 1) * 100
    ytd = (closes[sorted(closes)[-1]] / closes["2025-12-01"] - 1) * 100
    print(f"{s:>7} " + "".join(f"{yr_ret(y):8.1f}" for y in years) + f"{ytd:8.1f}")

# ---- drawdown episodes ----
print("\nDRAWDOWN DETAIL (monthly closes, peak-to-trough):")
for s in SYMS:
    dates = sorted(series[s])
    peak = series[s][dates[0]]
    in_dd = False
    dd_start = dd_trough = None
    dd_depth = 0.0
    episodes = []  # (depth, start, trough, end, months)
    months_since = {d: i for i, d in enumerate(dates)}
    for d in dates:
        c = series[s][d]
        if c >= peak:
            if in_dd:
                months = months_since[d] - months_since[dd_start]
                episodes.append((dd_depth, dd_start, dd_trough, d, months))
            peak = c
            in_dd = False
        else:
            dd = c / peak - 1
            if not in_dd:
                in_dd = True
                dd_start = d
                dd_trough = d
                dd_depth = dd
            elif dd < dd_depth:
                dd_depth = dd
                dd_trough = d
    if in_dd:
        episodes.append((dd_depth, dd_start, dd_trough, None, None))
    latest = series[s][dates[-1]]
    current_dd = (latest / peak - 1) * 100
    top = sorted(episodes, key=lambda e: e[0])[:3]
    print(f"--- {s} ---")
    for depth, start, trough, end, months in top:
        end_s = end if end else "OPEN"
        m_s = f"{months}m" if months is not None else "open"
        print(f"  {depth*100:6.1f}%  {start} -> {trough}  recovered {end_s} ({m_s})")
    print(f"  current drawdown from peak: {current_dd:.1f}%  (peak {peak:.2f}, latest {latest:.2f})")
