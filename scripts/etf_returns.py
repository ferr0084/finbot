#!/usr/bin/env python3
"""Compute period returns / CAGRs / max drawdown for watchlist ETFs from saved monthly bars."""
import json

TOOL_OUTPUT = "/Users/jeremy/.local/share/opencode/tool-output/tool_fce46338e0012TWPdCtlPt0qT2"

with open(TOOL_OUTPUT) as f:
    data = json.load(f)

by_sym = {}
for r in data["results"]:
    by_sym.setdefault(r["symbol"], {})[r["date"][:10]] = r["close"]

# SPY monthly closes from the inline response (2021-2026)
spy = {
    "2021-07-01": 438.51, "2021-12-01": 474.96, "2022-12-01": 382.43,
    "2023-07-01": 457.79, "2025-07-01": 632.08, "2025-12-01": 681.92,
    "2026-08-01": 772.45,
}
by_sym["SPY"] = spy

for sym in ["VTI", "ITOT", "SCHB", "VXUS", "IXUS", "AVUV", "SPY"]:
    closes = by_sym[sym]
    dates = sorted(closes)
    latest = closes[dates[-1]]
    last_date = dates[-1]

    def pct(d):
        return (latest / closes[d] - 1) * 100 if d in closes else None

    def cagr(d, n):
        return ((latest / closes[d]) ** (1 / n) - 1) * 100 if d in closes else None

    ret_2022 = None
    if "2021-12-01" in closes and "2022-12-01" in closes:
        ret_2022 = (closes["2022-12-01"] / closes["2021-12-01"] - 1) * 100

    peak = -1e18
    mdd = 0.0
    mdd_from = mdd_to = None
    for d in dates:
        c = closes[d]
        if c > peak:
            peak = c
            pdate = d
        dd = (c / peak - 1) * 100
        if dd < mdd:
            mdd = dd
            mdd_to, mdd_from = d, pdate

    print(
        f"{sym}: latest={latest:.2f} ({last_date}) | "
        f"1Y={pct('2025-07-01'):.2f}% | YTD={pct('2025-12-01'):.2f}% | "
        f"3Y={cagr('2023-07-01', 3):.2f}% | 5Y={cagr('2021-07-01', 5):.2f}% | "
        f"2022={ret_2022:.2f}% | MaxDD(5Y mth)={mdd:.2f}% ({mdd_from}->{mdd_to})"
    )
