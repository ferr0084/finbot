#!/usr/bin/env python3
"""QYLD price behavior around ex-dividend dates (official ex-dates from yfinance)."""
import json, datetime as dt
from statistics import mean, median
from collections import Counter

SRC = "/Users/jeremy/.local/share/opencode/tool-output/tool_fd7d55ba1001DLCHot24F4XIaz"
EX = [
("2024-01-22",0.179),("2024-02-20",0.177),("2024-03-18",0.178),("2024-04-22",0.172),
("2024-05-20",0.163),("2024-06-24",0.169),("2024-07-22",0.177),("2024-08-19",0.179),
("2024-09-23",0.181),("2024-10-21",0.183),("2024-11-18",0.18),("2024-12-30",0.339),
("2025-01-21",0.188),("2025-02-24",0.165),("2025-03-24",0.17),("2025-04-21",0.16),
("2025-05-19",0.165),("2025-06-23",0.166),("2025-07-21",0.165),("2025-08-18",0.168),
("2025-09-22",0.17),("2025-10-20",0.173),("2025-11-24",0.173),("2025-12-22",0.178),
("2026-01-20",0.179),("2026-02-23",0.177),("2026-03-23",0.172),("2026-04-20",0.179),
("2026-05-18",0.179),("2026-06-22",0.185),("2026-07-20",0.178),
]

rows = json.load(open(SRC))
for r in rows:
    r["date"] = dt.date.fromisoformat(r["date"][:10])
rows.sort(key=lambda r: r["date"])
by_date = {r["date"]: r for r in rows}

def idx_of(d):
    return next(i for i, r in enumerate(rows) if r["date"] == d)

def ret(i, j):
    return rows[j]["close"] / rows[i]["close"] - 1.0

events = []
for dstr, div in EX:
    d = dt.date.fromisoformat(dstr)
    if d not in by_date:
        print("MISSING price row for ex-date", dstr); continue
    i = idx_of(d)
    e = {"date": d, "div": div, "idx": i}
    e["gap"] = rows[i]["open"] / rows[i-1]["close"] - 1.0
    e["exday"] = ret(i-1, i)                       # close-to-close on ex-date
    e["exday_open_to_close"] = rows[i]["close"]/rows[i]["open"] - 1.0
    e["prev5"] = ret(i-6, i-1) if i >= 6 else None
    e["prev10"] = ret(i-11, i-1) if i >= 11 else None
    e["next5"] = ret(i, i+5) if i+5 < len(rows) else None
    e["next10"] = ret(i, i+10) if i+10 < len(rows) else None
    e["next20"] = ret(i, i+20) if i+20 < len(rows) else None
    vol_avg = mean(rows[k]["volume"] for k in range(max(0, i-21), i-1))
    e["vol_ratio"] = rows[i]["volume"] / vol_avg
    # days to recover: close back above prev close (pre-ex price)
    e["recover"] = None
    for k in range(i, min(len(rows), i+45)):
        if rows[k]["close"] >= rows[i-1]["close"]:
            e["recover"] = k - i + 1; break
    events.append(e)

# link to next ex-date
for a, b in zip(events, events[1:]):
    a["to_next"] = ret(a["idx"], b["idx"]-1)   # ex-date close to day before next ex
    a["days_next"] = (b["date"] - a["date"]).days

print(f"events: {len(events)}  price rows: {len(rows)}  ({rows[0]['date']}..{rows[-1]['date']})")
print(f"\n{'ex-date':<11}{'div':>6}{'gap':>8}{'exday':>8}{'exdayOC':>9}{'prev5':>9}{'next5':>9}{'next10':>9}{'toNext':>9}{'volx':>6}{'rec':>5}")
for e in events:
    f = lambda x: "  n/a" if x is None else f"{x*100:+.2f}%"
    print(f"{str(e['date']):<11}{e['div']:>6.3f}{f(e['gap']):>8}{f(e['exday']):>8}{f(e['exday_open_to_close']):>9}"
          f"{f(e['prev5']):>9}{f(e['next5']):>9}{f(e['next10']):>9}{f(e.get('next')):>9}"
          f"{e['vol_ratio']:>5.1f}x{e['recover'] if e['recover'] is not None else '-':>5}")

def agg(name, key):
    vals = [e[key] for e in events if e.get(key) is not None]
    if vals:
        print(f"{name:<26} n={len(vals):>2}  mean={mean(vals)*100:+.2f}%  median={median(vals)*100:+.2f}%")
    return vals

print("\n=== aggregates ===")
agg("ex-day close-to-close", "exday")
agg("ex-day open-to-close", "exday_open_to_close")
agg("gap (open vs prev close)", "gap")
agg("prev 5d cumulative", "prev5")
agg("prev 10d cumulative", "prev10")
agg("next 5d cumulative", "next5")
agg("next 10d cumulative", "next10")
agg("next 20d cumulative", "next20")
agg("ex-date to next ex-date", "next")

vols = [e["vol_ratio"] for e in events]
recs = [e["recover"] for e in events if e["recover"] is not None]
print(f"{'vol on ex-day (x 20d avg)':<30} mean={mean(vols):.2f}x  median={median(vols):.2f}x")
print(f"{'days to recover pre-ex close':<30} n={len(recs)} mean={mean(recs):.1f}  median={median(recs):.0f}")

pos = sum(1 for e in events if e["exday"] > 0)
print(f"\nex-day close-to-close positive: {pos}/{len(events)} = {pos/len(events)*100:.0f}%")
pos5 = sum(1 for e in events if (e.get("next5") or 0) > 0)
print(f"next-5d positive: {pos5}/{len(events)} = {pos5/len(events)*100:.0f}%")
posn = sum(1 for e in events if (e.get("next") or 0) > 0)
print(f"ex-date to next ex-date positive: {posn}/{sum(1 for e in events if e.get('next') is not None)}")

# correlation div size vs ex-day drop
import statistics
x = [e["div"] for e in events]; y = [e["exday"] for e in events]
print(f"\ncorr(div $, ex-day close return) = {statistics.correlation(x, y):+.3f}")
x2 = [e["div"] for e in events]; y2 = [e["gap"] for e in events]
print(f"corr(div $, ex-day open gap)     = {statistics.correlation(x2, y2):+.3f}")

# day-of-month distribution
dow = [e["date"].day for e in events]
print("ex-date day-of-month:", dict(sorted(Counter(dow).items())))
# weekday
wd = [e["date"].weekday() for e in events]
print("ex-date weekday (0=Mon):", dict(sorted(Counter(wd).items())))

# avg monthly yield
print(f"\nmean div ${mean([e['div'] for e in events]):.3f}; mean monthly yield vs prev close "
      f"{mean([e['div']/rows[e['idx']-1]['close'] for e in events])*100:.2f}% "
      f"(annualized ~{mean([e['div']/rows[e['idx']-1]['close'] for e in events])*12*100:.1f}%)")