#!/usr/bin/env python3
"""Validate the finbot per-member data layout.

Checks:
- Every JSON file under data/ parses.
- members/<id>/profile.json (self/spouse only): profile.id == <id>.
- members/<id>/accounts.json: accounts must be unique; for self/spouse, account owner == <id>;
  for household, account owner == "joint".
- members/<id>/investments.json: every investment.account_id resolves to an account in that dir.
- Member dirs are symmetric (all 7 domain files for self/spouse; household has no profile.json).

Exit 0 on success, 1 on any error.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DOMAINS = ["profile", "accounts", "investments", "transactions", "budgets", "goals", "watchlist"]
MEMBER_IDS = ["self", "spouse", "household"]
PROFILE_LESS = ["household"]

errors = []
warnings = []


def parse(path):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception as e:
        errors.append(f"{path}: not valid JSON ({e})")
        return None


def expected_owner(mid):
    return "joint" if mid == "household" else mid


def main():
    if not DATA.is_dir():
        errors.append(f"missing data dir: {DATA}")

    for p in sorted(DATA.rglob("*.json")):
        parse(p)

    members_dir = DATA / "members"
    member_dirs = sorted(d for d in members_dir.iterdir() if d.is_dir()) if members_dir.is_dir() else []
    if not member_dirs:
        errors.append("data/members/ has no member directories")

    for d in member_dirs:
        mid = d.name
        if mid not in MEMBER_IDS:
            warnings.append(f"{d}: unknown member dir (not in {MEMBER_IDS})")
            continue

        if mid not in PROFILE_LESS:
            prof = parse(d / "profile.json")
            if prof is not None and prof.get("id") != mid:
                errors.append(f"{d}/profile.json: profile.id {prof.get('id')!r} != dir id {mid!r}")

        accts = parse(d / "accounts.json") or []
        acct_ids = set()
        want = expected_owner(mid)
        for a in accts:
            aid, owner = a.get("id"), a.get("owner")
            if aid in acct_ids:
                errors.append(f"{d}/accounts.json: duplicate account id {aid}")
            acct_ids.add(aid)
            if owner != want:
                errors.append(f"{d}/accounts.json: account {aid} owner {owner!r} != expected {want!r}")

        for inv in parse(d / "investments.json") or []:
            if inv.get("account_id") not in acct_ids:
                errors.append(f"{d}/investments.json: {inv.get('id')} account_id {inv.get('account_id')} not found in {d}/accounts.json")

        for dom in DOMAINS:
            if dom == "profile" and mid in PROFILE_LESS:
                continue
            if not (d / f"{dom}.json").exists():
                warnings.append(f"{d}: missing {dom}.json (member dirs should be symmetric)")

    for w in warnings:
        print(f"[warn] {w}")
    if errors:
        for e in errors:
            print(f"[error] {e}")
        print(f"FAIL: {len(errors)} error(s)")
        sys.exit(1)
    print("OK: data layout valid")


if __name__ == "__main__":
    main()
