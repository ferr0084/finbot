#!/usr/bin/env python3
"""Extract upcoming earnings dates for a peer universe from a saved OpenBB
nasdaq earnings-calendar JSON output file."""
import json
import sys

PATH = sys.argv[1] if len(sys.argv) > 1 else \
    "/Users/jeremy/.local/share/opencode/tool-output/tool_fd31f730f001SAxthavA4SXzhQ"

PEERS = [
    # SHOP e-commerce read-through
    "BIGC", "WIX", "SQSP", "GLBE", "MELI", "ETSY",
    # QLYS cybersecurity read-through
    "TENB", "RPD", "CRWD", "ZS", "S", "PANW", "FTNT",
    # MTRN specialty materials / defense supply chain
    "HWM", "CRS", "ATI", "TDG", "SPR", "HEI",
    # FTK / WTTR energy services
    "CHX", "SLB", "BKR", "HAL", "NOV",
    # ROCK building products
    "BLDR", "MAS", "O", "TREX", "POOL",
    # PRGO consumer healthcare
    "KVUE", "CHD", "PBH", "CLX",
    # BLMN casual dining
    "DRI", "TXRH", "EAT", "PLAY", "RRGB", "CAKE",
]

with open(PATH, "r") as f:
    data = json.load(f)

rows = data.get("results", [])
print(f"total rows in calendar: {len(rows)}")
by_sym = {}
for r in rows:
    sym = r.get("symbol")
    if sym in PEERS:
        by_sym.setdefault(sym, []).append(r)

for sym in sorted(by_sym):
    for r in by_sym[sym]:
        print(f"{r.get('symbol'):6s} {r.get('report_date')} "
              f"eps_c={r.get('eps_consensus')} rev_c={r.get('revenue_consensus')}")

missing = [s for s in PEERS if s not in by_sym]
print(f"\nnot in 8/5-8/21 calendar: {', '.join(missing) if missing else 'none'}")
