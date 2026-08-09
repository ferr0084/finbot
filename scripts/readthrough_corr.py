#!/usr/bin/env python3
"""Daily-return correlations between today's earnings winners and their
peer/supply-chain read-through candidates (1yr daily closes, OpenBB yfinance)."""
import json
import math

PATH = "/Users/jeremy/.local/share/opencode/tool-output/tool_fd3202bcf0018cAap5y3TNFe3w"

PAIRS = {
    "SHOP": ["GLBE", "ETSY", "MELI"],
    "QLYS": ["RPD", "CRWD", "S", "PANW", "ZS"],
    "MTRN": ["HWM", "ATI", "HEI"],
    "BLMN": ["TXRH", "EAT", "RRGB"],
    "PRGO": ["KVUE", "PBH"],
}

with open(PATH) as f:
    data = json.load(f)

series = {}
for r in data.get("results", []):
    sym = r.get("symbol")
    series.setdefault(sym, {})[r["date"][:10]] = r["close"]

rets = {}
for sym, closes in series.items():
    dates = sorted(closes)
    rs = {}
    prev = None
    for d in dates:
        if prev is not None and prev > 0 and closes[d] > 0:
            rs[d] = closes[d] / prev - 1
        prev = closes[d]
    rets[sym] = rs


def pearson(x, y):
    n = len(x)
    if n < 20:
        return float("nan"), n
    mx, my = sum(x) / n, sum(y) / n
    cov = sum((a - mx) * (b - my) for a, b in zip(x, y))
    vx = sum((a - mx) ** 2 for a in x)
    vy = sum((b - my) ** 2 for b in y)
    if vx == 0 or vy == 0:
        return float("nan"), n
    return cov / math.sqrt(vx * vy), n


print("DAILY-RETURN CORRELATION, 1yr (winner vs read-through candidate)")
print(f"{'winner':>6} {'peer':>6} {'corr':>7} {'n':>4}")
for win, peers in PAIRS.items():
    if win not in rets:
        print(f"  {win}: no data")
        continue
    for p in peers:
        if p not in rets:
            print(f"{win:>6} {p:>6}     --  no data")
            continue
        common = sorted(set(rets[win]) & set(rets[p]))
        x = [rets[win][d] for d in common]
        y = [rets[p][d] for d in common]
        c, n = pearson(x, y)
        print(f"{win:>6} {p:>6} {c:7.2f} {n:>4}")

# context: avg market beta proxy — show each winner's own realized vol
print("\nREALIZED DAILY VOL (annualized, %):")
for sym in list(PAIRS) + [p for ps in PAIRS.values() for p in ps]:
    if sym in rets and rets[sym]:
        vs = list(rets[sym].values())
        m = sum(vs) / len(vs)
        sd = math.sqrt(sum((v - m) ** 2 for v in vs) / len(vs))
        print(f"{sym:>6} {sd * math.sqrt(252) * 100:6.1f}")
