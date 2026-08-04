---
name: plan-review
description: >
  Independent verification gate for financial outputs. Use ONLY when the user explicitly asks
  to have work reviewed (e.g., "review this", "@verifier review ...", "verify my plan").
  Do not load on your own, even for material outputs. Delegates a draft to the verifier
  subagent and enforces the review loop.
---

# Plan Review — Verification Gate

Load this skill **when the user asks to have work reviewed** — never on your own. It runs an independent reviewer (the `verifier` subagent) over your draft and enforces a bounded review loop. This exists because unverified plans have shipped with serious errors (e.g., a $65,933 projection error and a self-contradictory table).

## When to Trigger (opt-in only)

Run the gate **only** when the user explicitly asks for a review:

- The user asks to have work reviewed ("have the verifier review this", "@verifier review ...", "verify my plan")

Do **NOT** auto-trigger on your own. No output, however material (saved plans, buy/sell/rebalance/convert/harvest recommendations, figures ≥ $10K, multi-year projections), triggers this gate without the user asking. If unsure, ask the user rather than loading the skill.

## How It Works

1. **Draft to a file.** If the output is a plan/artifact, save it to `plans/` first — the verifier reviews the saved file, not an inline paste. Apply the `SHOW MATH` rule: state every assumption in the draft (return rates, inflation, valuation basis, underlying fund equity content). An undocumented assumption cannot be caught.
2. **Delegate to the verifier.** Call `task(subagent_type: "verifier", ...)` with the template below.
3. **Incorporate findings.** Apply every blocker/major finding to the file. For minor/nit findings, apply or consciously dismiss.
4. **One targeted re-review.** After blocker fixes, re-review only the changed numbers (a fresh verifier run scoped to the diff). Cap at **2 review cycles total**.
5. **Escalate.** If a blocker survives 2 cycles, do NOT present the output. Surface the verifier's report verbatim to the user with a clear statement of what's unresolved.
6. **Disclose accurately.** Present with: "independently reviewed by the verifier subagent" plus a one-line summary of findings. Do NOT claim unqualified "verified" — the final output is never fully re-reviewed.

## Verifier Task Template

Pass the draft **inline for chat outputs** (the verifier gets a fresh context with no memory of this conversation) or a **file path + claims summary for artifacts**. Always include: data file paths, the assumptions used, and the checklist requirements.

```
You are the verifier. Independently review the financial work below for accuracy,
sound reasoning, and consistency with the user's actual data. Do NOT write files.

[For artifacts] Draft file: <path to plan>
[For chat] Draft content:
<paste the draft>

User data to cross-check (read these yourself):
- /Users/jeremy/work/finbot/data/accounts.json
- /Users/jeremy/work/finbot/data/investments.json
- /Users/jeremy/work/finbot/data/budgets.json
- /Users/jeremy/work/finbot/data/goals.json
- /Users/jeremy/work/finbot/data/transactions.json
- /Users/jeremy/work/finbot/data/watchlist.json

Assumptions used: <state every assumption: return rates, inflation, valuation basis, fund equity content, etc.>

Checklist:
1. Recompute EVERY number with fin-calc_* / portfolio-utils_* (note the hyphenated tool names) — flag any figure that doesn't match
2. Cross-check every figure against the data files above; flag stale cost basis or balances that don't reconcile
3. Source-tag every key claim using the project tags: [confirmed: filing], [confirmed: data provider], [estimated: analyst], [inferred], [self-reported], [search]
4. Verify the mandatory disclosure line is present and the 7%/4% conservatism defaults are used — flag ANY assumption drift from house defaults unless explicitly justified
5. Quantify downside scenarios for any lump-sum / large-concentration move (e.g., -30%/-50% equity drawdowns)
6. Flag jurisdiction-specific tax assumptions (default US)

Output the structured format: Verdict / Findings (severity: blocker|major|minor|nit, with claim, evidence, counter-example) / Unverified claims / Open questions / Bottom line.
```

## Review-Loop Checklist for the Final Pass

Before presenting, verify with your own eyes:

- [ ] Every figure recomputed and matching (use `fin-calc_*` — hyphenated)
- [ ] No self-contradictory tables (compare columns against their own actions)
- [ ] Every assumption stated in the document (nothing silent)
- [ ] Downside/sequence-of-returns risk quantified for large moves
- [ ] Mandatory disclosure line present
- [ ] No tax consequences claimed without jurisdiction caveats
