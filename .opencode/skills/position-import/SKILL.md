---
name: position-import
description: >
  Apply a broker position export (CSV) to a member's holdings: reconcile
  shares, cost basis, cash, and account balance; verify the deltas to the
  cent; report what changed. Use when the user says "update my holdings",
  "apply the import", "new import file", "reconcile my positions", or drops
  a broker CSV into data/import/.
---

# Position Import

Load this skill when the user wants holdings updated from a broker export.

## 0. Do not rediscover, this is known

- Broker exports live in `data/import/`. That path is **gitignored**, so
  `glob` and `grep` return nothing there. Use the **read tool on the
  directory** (`read("data/import")`) to list it. Same for
  `data/members/<id>/` — read the directory, do not glob.
- **Return types differ by provider.**
  - `fin-calc`, `portfolio-utils` (fin-tools plugin) → **JSON string** (bridge
    unwraps `{ content }`). Parse with the helper below.
  - `fin-data.snapshot` → **parsed object** (now an MCP tool; moved out of the
    plugin 2026-11-25 so it is no longer a string).
  - `yahoo-finance` (`yf_*`, `ta`) → **parsed objects/arrays** (MCP).

  Start every `execute` with:

  ```js
  const P = (x) => (typeof x === "string" ? JSON.parse(x) : x)
  ```

  Plugin history (do not repeat): returning the payload directly from a plugin
  tool yields the literal string `"undefined"`, and extra fields
  (`data`, `structuredContent`) are dropped. That is why `fin-data` moved to
  MCP instead of being "fixed" in place.
- Parse `prices_required` from the parsed snapshot, batch one `yf_quote`,
  then call `snapshot` again with the `prices` map. Three steps, two `execute`
  calls if you batch quote+snapshot inside the second.

## 1. Identify the file and the account

Swab exports begin with a header line:

```
"Positions for account Individual ...139 as of 01:23 PM ET, 2026/11/25"
```

1. Read the header. It gives **account type + last 3 digits + timestamp**.
2. Match it to `data/members/<id>/accounts.json` by institution and name
   (`Individual ...139` → the `Charles Schwab` `brokerage` account).
3. **If the match is not unique, ask.** Never guess between two same-institution
   accounts.
4. Record the timestamp. The export is a point-in-time snapshot, **not a close**.
   Never report export prices as closing prices; re-fetch live quotes.

## 2. Column map (Schwab "Positions" CSV)

| CSV column | Maps to |
|---|---|
| `Symbol` | `ticker` (`CASH` row → symbol `Cash & Cash Investments`) |
| `Qty (Quantity)` | `shares` |
| `Cost Basis` (dollars, total) | `cost_basis_per_share = Cost Basis / Qty` |
| `Mkt Val` | only for the sum check — **live price replaces it** |
| `% of Acct` | only for the sum check |

Footer rows `Cash & Cash Investments` and `Positions Total` are not holdings.
`Positions Total` cost basis **excludes** the cash row — do not add cash cost
into the equity sum.

## 3. Invariants — prove the file before writing

Run all four. If any fails, stop and show the arithmetic; do not write.

1. **Market value sum:** `Σ row Mkt Val` == `Positions Total` Mkt Val.
2. **Cost sum:** `Σ row Cost Basis` (equities only) == `Positions Total` Cost Basis.
3. **Per-row basis:** `round(Qty × cost_basis_per_share, 2)` == CSV `Cost Basis`
   for every row.
4. **Cash identity — the important one:**
   `Σ (new_cost_basis − old_cost_basis)` over *changed* tickers == `old_cash − new_cash`.

Invariant 4 is what catches an unrecorded trade, fee, dividend, or transfer.
If it does not balance, report the residual and stop.

## 4. Rules for writing

Apply to `data/members/<id>/investments.json` and `accounts.json` only.

- **Replace** `shares` and `cost_basis_per_share` per ticker from the CSV.
  Keep `id`, `asset_class`, `sector`, `description` — do not regenerate ids.
- **Cash row** → update the `CASH` position (`shares` = cash dollars) **and**
  `accounts.json` `balance` for that account = `Positions Total`.
- **Ticker in JSON but absent from the CSV** → likely a full liquidation, but
  **never auto-delete**. Flag it by name and ask. A missing row is also what a
  formatting change looks like.
- **Ticker in CSV but not in JSON** → new position. Add with
  `inv_<account>_<ticker>` id and infer `asset_class`/`sector` from the
  description; flag it as inferred.
- **Other accounts untouched.** Exports are per-account. Say explicitly which
  accounts the file did *not* cover.
- Cost basis is a weighted blend after a buy. Show the implied lot price:
  `Δbasis / Δshares`. A number far from the day range means the file or the
  prior basis is wrong — surface it.

## 5. Verify

1. Re-fetch live quotes, call `snapshot` with `prices`, confirm
   `Σ positions.market_value` for the account == the `balance` you wrote.
2. Run `python3 scripts/validate_data.py` — checks account_id referential
   integrity across `data/`.
3. Report realized events: buys/sells → tax note (no sell, no realized gain).
   Flag any new lot that changes a holding period.

## 6. Report format

```
### Reconciled against the previous file   (shares | cost/share | basis | change)
### Live marks                             (shares | price | mkt val | unrealized | %)
### Math that proves it                    (invariant 4 arithmetic, both lots)
### Notes                                  (coverage, tax, anomalies)
```

Every changed row carries the old → new value. Never say "updated" without
the numbers.
