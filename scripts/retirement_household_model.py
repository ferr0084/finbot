#!/usr/bin/env python3
"""Household retirement projection: Jeremy (self) + Wai (spouse).

Assumptions (user-confirmed 2026-08-05):
- Combined annual contributions: $0/yr
- Social Security: default $1,800/mo each ($21,600/yr) at FRA
  (spouse FRA 2035, Jeremy FRA 2039)
- Airbnb stops in retirement; home sold at spouse retirement (end-2027),
  +$900k net equity added to portfolio (no appreciation assumed)
- Target: spouse retires end-2027 (age 60), Jeremy end-2031 (age 60)
- Expenses $60,000/yr (2026 dollars), inflation 3%/yr
- 2026-2027: spouse income covers living costs, no withdrawals (user: $0 savings)
- Return scenarios: pessimistic 4%, base 5.5%, optimistic 7% nominal
  (blended portfolio: heavy stable-value/bond/target-date/cash mix)
"""

P0 = 2527307.60          # liquid portfolio, mid-2026 (self 1,307,307.60 + spouse 1,220,000.00)
HOME = 900000.0          # net home equity added end-2027
E0 = 60000.0             # annual expenses, 2026 dollars
INFL = 0.03
SS_SPOUSE = 21600.0      # from 2035 (FRA Dec-2034)
SS_JEREMY = 21600.0      # from 2039 (FRA May-2038)
START = 2026
HORIZON = 2066           # Jeremy age 95; spouse 99 (tail beyond 95 flagged)

def project(r_nom, e_mult=1.0, ss_mult=1.0):
    port = P0
    rows = []
    for y in range(START + 1, HORIZON + 1):
        if y == 2028:
            port += HOME  # proceeds from home sale (retired end-2027)
        E = E0 * e_mult * (1 + INFL) ** (y - START)
        SS = 0.0
        if y >= 2035:
            SS += SS_SPOUSE * ss_mult
        if y >= 2039:
            SS += SS_JEREMY * ss_mult
        net = E - SS
        if y >= 2028 and net > 0:   # no withdrawals 2026-2027: spouse income covers living
            port -= net
        port *= (1 + r_nom)
        rows.append((y, E, SS, net, port))
    return rows

def fmt(v):
    return f"${v:,.0f}"

for name, r in (("Pessimistic (4%)", 0.04), ("Base (5.5%)", 0.055), ("Optimistic (7%)", 0.07)):
    rows = project(r)
    print(f"=== {name} ===")
    for y, E, SS, net, port in rows:
        if y in (2027, 2029, 2032, 2035, 2039, 2045, 2055, 2062, 2066):
            print(f"{y}: port={fmt(port):>12}  exp={fmt(E):>9}  SS={fmt(SS):>8}  net_wd={fmt(net):>9}")
    print()

# Depletion check + peak/through details for each scenario
print("=== Detail checks ===")
for name, r in (("Pessimistic (4%)", 0.04), ("Base (5.5%)", 0.055), ("Optimistic (7%)", 0.07)):
    rows = project(r)
    min_port = min(p for _, _, _, _, p in rows)
    end_port = rows[-1][4]
    print(f"{name}: min_port={fmt(min_port):>12} end(2066)={fmt(end_port):>12}  survived={end_port > 0}")

# Retirement-start portfolio (base): end-2027 growth + home proceeds, pre-withdrawal
start_2028 = P0 * (1.055) ** 1 + HOME
print("\n=== Retirement-start (base) ===")
print(f"Liquid at retirement (start 2028, incl. home): {fmt(start_2028)}")
print(f"$60k real = {60e3/start_2028*100:.2f}% of portfolio at retirement")
rows = project(0.055)
for y in (2028, 2031):
    row = next(r for r in rows if r[0] == y)
    print(f"End {y}: {fmt(row[4])}")

# Sensitivity: pessimistic 4% nominal, stress expenses and SS
print("\n=== Sensitivity (pessimistic 4% nominal, end-2066) ===")
for e_mult, label in ((1.25, "exp +25% ($60k)"), (1.5, "exp +50% ($72k)"), (2.0, "exp 2x ($96k)")):
    rows = project(0.04, e_mult=e_mult)
    print(f"{label}: end={fmt(rows[-1][4]):>12}  min={fmt(min(p for _,_,_,_,p in rows)):>12}  survived={rows[-1][4]>0}")
# SS excluded (worst case)
rows = project(0.04, ss_mult=0.0)
print(f"  No Social Security:  end={fmt(rows[-1][4]):>12}  min={fmt(min(p for _,_,_,_,p in rows)):>12}  survived={rows[-1][4]>0}")
# No home sale (worst case: keep home, mortgage paid by Airbnb, no $900k)
def project_nohome(r_nom):
    port = P0
    for y in range(START + 1, HORIZON + 1):
        E = E0 * (1 + INFL) ** (y - START)
        SS = 0.0
        if y >= 2035: SS += SS_SPOUSE
        if y >= 2039: SS += SS_JEREMY
        net = E - SS
        if y >= 2028 and net > 0:
            port -= net
        port *= (1 + r_nom)
    return port
print(f"  No home sale (4%):    end={fmt(project_nohome(0.04)):>12}  survived={project_nohome(0.04)>0}")
