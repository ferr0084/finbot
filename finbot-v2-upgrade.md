# FinBot V2 Upgrade — Phase 0 & 1

**Scope:** Phase 0 (make the tool layer real, fix V2 config/docs) + Phase 1 (ta tool, snapshot tool, MCP payload/caching).
**Out of scope:** Phase 2 (commands, contract test, rulebook de-duplication, plans index) and Phase 3 (model variants, step caps) — captured at the end as deferred work.
**Runtime:** OpenCode v2.2.5. Config hot-reloads; no restart ritual needed.

---

## Root cause

FinBot is V1-shaped on a V2 runtime. Two consequences:

1. `.opencode/tools/*.ts` is a V1 custom-tool mechanism. V2 exposes tools only through plugin `ctx.tool.transform` or MCP. Empirically confirmed: `fin-calc_*` and `portfolio-utils_*` are absent from the tool catalog, and `search("fin-calc")` returns only MCP tools.
2. Six files instruct the agent to use those tools, so the agent substitutes ad-hoc math in `execute`. That is the consistency leak: different formulas, different rounding, every session. `scripts/` shows the same drift in code form — `pltr_indicators.py`, `skhy_technicals.py`, `bott_ta.py`, `sofi_tech.py`, `sofi_probe.py`, `qyld_sell_levels.py`, `qyld_div_pattern.py`, `avuv_chain.py`, `avuv_csp.py`, `nvda_analysis_tmp.py`, `_tmp_*.py` are eleven re-implementations of the same indicator set.

Fixing the tool layer fixes both problems at once.

---

## Phase 0 — Make the plumbing real

### P0-1  Port the calc tools to a V2 plugin

**Create** `.opencode/plugins/fin-tools/index.ts`

```ts
import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "fin-tools",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      editor.namespace({ name: "fin-calc", description: "Financial math: NPV, CAGR, Sharpe, compounding, inflation, SWR, loan PMT" })
      editor.namespace({ name: "portfolio-utils", description: "Portfolio allocation, diversification, rebalancing, returns" })
      editor.add({ name: "cagr", description: "...", input: {...}, options: { namespace: "fin-calc", codemode: true }, execute: async (i) => ({ content: ... }) })
      // ... one editor.add per export
    })
  },
})
```

Port all 12 exports from `.opencode/tools/`:

| File | Exports |
|---|---|
| `fin-calc.ts` | `npv`, `cagr`, `sharpe`, `compound`, `inflation`, `swr`, `pmt` |
| `portfolio-utils.ts` | `alloc`, `diversify`, `rebalance`, `returns` |

Naming must stay `fin-calc_<export>` and `portfolio-utils_<export>` so every existing doc reference (`AGENTS.md:10`, `finbot.md:56`, `retirement-planner:29,43`, `portfolio-tracker:30-34`, `risk-profiler:75-77`, `plan-review:62,76`) remains valid.

**Risk to check first:** V2 normalizes "unsupported characters in tool names" to `_`. Hyphens may be allowed or may be normalized to `fin_calc_cagr`. Verify with `ctx.tool.list()` immediately after the plugin loads:
- If effective names are `fin-calc_cagr` → keep docs as-is.
- If they become `fin_calc_cagr` → register both names (add an alias per tool) so docs keep working, and note the canonical name in README.

**Return structured JSON, not prose.** Each tool returns
```json
{ "tool": "cagr", "value": 0.0812, "display": "8.12%", "inputs": {...}, "assumptions": [...] }
```
Model renders the table; formatting bugs stop living in code. This also fixes `fin-calc.ts:126`, which emits the literal string `"Portfolio depletes in year ${years}"` because it is inside a plain string rather than a template literal.

**Dependencies:** `.opencode/package.json` — remove `@opencode-ai/plugin@1.18.5` (V1 package, V1 plugin API does not run in V2), add `@opencode/plugin` at the version matching OpenCode 2.2.5. Run `bun install` in `.opencode/`.

**Delete** `.opencode/tools/fin-calc.ts` and `.opencode/tools/portfolio-utils.ts` after the port is verified — otherwise two sources of truth exist.

**Acceptance:** `fin-calc_cagr(1000, 2000, 10)` → 7.18%; `portfolio-utils_alloc` on a 3-holding fixture returns the same class totals as before, in JSON.

### P0-2  Rebuild `finbot.md` frontmatter in V2 form

`.opencode/agents/finbot.md` currently mixes formats: V1 `permission:` map with `bash`/`task` action names, and `temperature`, which V2 ignores (and `request.body` is not yet sent to providers). A file that uses `permissions` is read wholly as V2, so convert all at once.

```yaml
---
description: >
  Personal financial advisor agent. Portfolio analysis, market research, risk
  profiling, budgeting, retirement planning, tax estimation.
mode: primary
color: "#22c55e"
permissions:
  - action: "*"
    resource: "*"
    effect: allow
  - action: edit
    resource: "data/**"
    effect: allow
  - action: edit
    resource: "plans/**"
    effect: allow
  - action: edit
    resource: "*"
    effect: ask
  - action: shell
    resource: "*"
    effect: deny
  - action: shell
    resource: "bun run scripts/*"
    effect: allow
  - action: shell
    resource: "python3 scripts/*"
    effect: allow
  - action: shell
    resource: "node scripts/*"
    effect: allow
  - action: subagent
    resource: "verifier"
    effect: allow
  - action: subagent
    resource: "*"
    effect: deny
  - action: external_directory
    resource: "*"
    effect: ask
---
```

Notes:
- `subagent: verifier → allow` is the fix for the dead verification gate. Today `finbot.md:21` sets `task: deny` while `finbot.md:62` instructs a call to the verifier subagent; the gate can never run.
- `external_directory: ask` restores the V1 "outside project" prompt that V2 removed by default.
- Drop `temperature`. If determinism is wanted, add a model variant in `opencode.json` (`variants: [{ id: "report", body: { temperature: 0.2 } }]`) and reference `provider/model#report` — deferred to Phase 3.
- `question: ask` is already the default; keep only if you want it explicit.

### P0-3  Migrate `opencode.json` to V2 shapes

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agents": {
    "build": { "mode": "primary" },
    "plan": { "mode": "primary" }
  },
  "permissions": [
    { "action": "skill", "resource": "*", "effect": "allow" }
  ],
  "mcp": {
    "servers": {
      "yahoo-finance": {
        "type": "local",
        "command": ["bun", "run", "scripts/yahoo-finance-mcp/index.ts"],
        "disabled": false,
        "timeout": { "catalog": 15000, "execution": 30000 }
      }
    }
  }
}
```

Changes: `agent` → `agents`; V1 `permission` map → `permissions` array; `mcp.<name>` → `mcp.servers.<name>`; `enabled: true` → `disabled: false`; scalar `timeout` → `{ catalog, execution }`. Execution timeout raised to 30s because `ta` on a 5-year history pull will exceed 15s occasionally.

Note: `permission` (singular) at top level and agent `permission:` maps are V1; they still normalize, but mixing formats in one file is where silent breakage comes from.

### P0-4  Delete stale artifacts

| Path | Why |
|---|---|
| `openbb-refactor.md` | Describes a `market-mcp` server that does not exist, and a provider/fallback design that `AGENTS.md:38` explicitly forbids. Contradicts the live setup. |
| `scripts/check_openbb_providers.py` | OpenBB is gone. |
| `scripts/check_openbb_config.py` | OpenBB is gone. |
| `scripts/verify_all_providers.py` | Implements the multi-provider fallback chain that no longer exists. |

If you want the OpenBB history preserved, move `openbb-refactor.md` to `plans/archive/openbb-refactor.md` instead of deleting. Do not leave it at repo root, where it reads as current direction.

### P0-5  Fix wrong instructions

| File:line | Current | Change |
|---|---|---|
| `AGENTS.md:14` | "Config/agents/skills load once at startup — restart opencode after any change" | V2 watches and reloads config, agents, skills, MCP. Replace with: "Config edits hot-reload; `/reload` forces a full reload. Verify with `opencode debug agents`." |
| `.opencode/skills/market-research/SKILL.md:143` | "use `todowrite` to track the workflow" | No such tool. Either enable `experimental.todo: true` in `opencode.json` and keep it, or delete the line. Recommend delete — the agent loop does not need a todo list for 5 queries. |
| `finbot.md:55` | "use websearch for catalysts/news" | Contradicts `AGENTS.md:4f` (batch `yf_news` on all held names). Replace with: "`yf_news` batched for all held names; `websearch` only for macro/analyst/options data the MCP does not carry." |
| `finbot.md:66-67` | "try another provider/symbol" | Contradicts `AGENTS.md:38` (single source, no fallback chain). Replace with the actual policy: retry once on transient DNS, then report the symbol as no-data by name. |
| `AGENTS.md:52-56` cheat-sheet | `curl: (6)`, `getaddrinfo()`, "no provider fallback to try" duplicated in three bullets | Collapse to two bullets: transient → retry once; error/empty → report by name, no fallback. |
| `README.md:43` | "Exposes five tools" | Becomes seven after Phase 1 (`ta` added). Update with the tool table. |

### P0-6  Remove the duplicate rulebook drift

Not a full Phase 2 de-duplication, just the contradictions that cause wrong behavior now:

- `AGENTS.md` Rule 5 says "default to MFJ when spouse has real data"; `finbot.md` Default Assumptions table does not mention filing status. Add one row.
- `AGENTS.md` Rule 8 (verification gate) and `finbot.md` "Verification Gate" section and `plan-review/SKILL.md` all restate the same 5-step loop with different wording. Keep `plan-review` as the canonical procedure; make the two others one-line pointers.
- `plan-review/SKILL.md:44-55` hardcodes `/Users/jeremy/work/finbot/data/members/...` absolute paths. Replace with "discover `data/members/*/` and read every JSON present" so the gate survives a move or a rename.

**Acceptance for Phase 0:** `opencode debug agents` shows finbot with a subagent permission for `verifier`; `ctx.tool.list()` shows 12 tools under the two namespaces; a grep for `fin-calc_` still resolves to a registered tool; grep finds no reference to `openbb`, `todowrite`, or `available_tools`.

---

## Phase 1 — The efficiency lever

### P1-1  `ta` tool in the yahoo-finance MCP

**Why:** one ticker technical question today costs 3 MCP calls and roughly 12–15k tokens of raw OHLCV (527 daily bars × 6 fields, pulled twice because nothing caches). A computed-indicator tool is 1 call and ~1.5k tokens, with identical definitions every time.

**Add to** `scripts/yahoo-finance-mcp/index.ts`:

```
ta({
  ticker: string,
  period1?: string,        // default: 5y back
  interval?: "1d" | "1wk", // default "1d"
  windows?: number[],      // default [20, 50, 100, 200]
  levels?: boolean         // default true: pivots, clustering, fib
})
```

Returns JSON:
- `quote`: price, prev close, day range, 52W range, volume, market cap, PE/beta where available
- `trend`: SMA/EMA per window, distance from price in %, MA stack order, death/golden cross date if within window
- `momentum`: RSI-14 (Wilder), MACD (12/26/9) + signal + histogram, and RSI values at the last three swing lows (for divergence checks)
- `volatility`: ATR-14 absolute and % of price, annualized HV 30d/60d, max drawdown, drawdown from 52W high
- `volume`: last, 20d avg, 50d avg, ratio
- `levels` (when `levels: true`): swing highs/lows (pivot window 4), clustered support/resistance with tolerance 1.5%, Fibonacci retracements of the 52W range and of the last major up-leg
- `notes`: data gaps (insufficient bars for a 200d MA, etc.)

**Fixed definitions, written once in code:**
- SMA simple mean; EMA `k = 2/(n+1)`
- RSI Wilder smoothing (not simple average) — this is the difference that made today's numbers differ from a naive implementation
- ATR Wilder; TR = max(H−L, |H−Cprev|, |L−Cprev|)
- Pivot = local extreme over ±4 bars, both sides strictly non-exceeding
- Fib anchored to 52W high/low; a second set anchored to the largest up-leg in the window, with the anchor dates reported so the model can cite them

**Acceptance:** a stored fixture (`scripts/__fixtures__/PL-2026-11-05.json`, captured from today's history) must reproduce, within tolerance: SMA20 13.94, SMA50 16.09, SMA100 20.41, SMA200 26.43, RSI-14 29.5 (±1.0), ATR-14 0.97 (±0.02), 52W range 10.52–51.76, 78.6% fib of the 2.20→51.76 advance = 12.81 (±0.02), death cross date 2026-08-17. Fixture-based, not live, so the test does not rot.

### P1-2  `snapshot` tool (plugin)

**Why:** DATA FIRST currently means reading 15+ JSON files per session — roughly 8–10k tokens before any analysis. A digest tool makes it ~1.5k and makes owner resolution deterministic instead of recalled.

**Add to** `.opencode/plugins/fin-tools/index.ts`, namespace `portfolio-utils` or its own `fin-data`:

```
snapshot({ prices?: Record<string, number>, include?: "all" | "positions" | "cash" })
```

Behavior:
- Enumerate `data/members/*/` directories; read `profile.json` (may be absent for `household`), `accounts.json`, `investments.json`.
- Resolve each investment's owner through `account_id` → account `owner` (`self`/`spouse`/`joint`); `joint` → household.
- If `prices` is supplied, compute market value, weight, unrealized P&L per position and per owner; else return `prices_required: [tickers]` so the agent does one batched `yf_quote` and calls again.
- Report `missing_files`, `accounts_without_holdings`, and placeholder balances (e.g. spouse 401(k) `institution: "TBD"`) explicitly — never silently.
- Return JSON, no prose.

**Design note:** deliberately does not fetch prices itself. Keeping exactly one data-fetch path (`yf_quote`) avoids a second Yahoo integration that can drift in field handling. If you later want it self-contained, import `yahoo-finance2` directly — but then the MCP cache in P1-3 must be shared, not duplicated.

**Acceptance:** on current data, returns 3 members, 13 accounts, 10 self positions, flags spouse `investments.json` as empty and household as having no `profile.json`; with a price map, owner subtotals match a hand calculation.

### P1-3  MCP payload and cache hygiene

In `scripts/yahoo-finance-mcp/index.ts`:

1. **TTL cache** (in-process): quotes 15s, history 60s, fundamentals 1h, news 5min. Key = tool + normalized args. Bounds: max 200 entries, LRU eviction. Today the same PL history was fetched twice in one session for no reason.
2. **`yf_history` gains `fields?: string[]` and `tail?: number`** (default: all fields, all rows, to preserve behavior). The 2-year daily pull is ~527 rows × 6 fields; most questions need `close` for the last 60 bars plus a summary.
3. **`yf_news` gains `compact?: boolean`** — drops `link` and `relatedTickers`, caps title at 120 chars, keeps `title`/`publisher`/`published`/`relevant`. Current 5×6-ticker payload is ~6k chars for ~2k of signal.
4. **Keep** the per-symbol `error` field and the "tickers first, then sector context" ordering — both are load-bearing for the batch-completeness rule.

**Acceptance:** identical results on a repeated call inside the TTL; `yf_history(tail: 5)` returns 5 rows; `yf_news(compact: true)` payload is at least 50% smaller with no loss of headline identity.

### P1-4  Document the new tools

Update the tool table in `AGENTS.md` (Market Data Tools) and `README.md` with `ta`, `snapshot`, and the new optional params. One line each — do not restate the skill's workflow.

---

## Verification plan

Run in this order; each gate blocks the next.

1. `opencode debug agents` → finbot present, `verifier` subagent allowed.
2. `ctx.tool.list()` (via a throwaway script or `/reload` + debug) → 12 namespaced tools + `snapshot`.
3. `bun run typecheck` at repo root and inside `scripts/yahoo-finance-mcp`.
4. `ta` fixture test against the PL numbers above.
5. End-to-end replay of today's two questions:
   - "market is crashing, what's going on" → 1 batched `yf_quote`, 1 batched `yf_news`, indices + held names, no missing ticker.
   - "technical analysis on PL" → 1 `ta` call; compare S/R and fib output to the delivered answer; numbers must match within tolerance.
6. Count tool calls and rough tokens for both; expect ≥60% reduction on the PL question.
7. Grep gate: no `fin-calc_` reference resolves to nothing; no `openbb`/`todowrite`/`available_tools` left.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| Hyphen in namespace normalized away, breaking 6 doc references | Check `ctx.tool.list()` first; register aliases if needed. This is the only item that can silently invalidate the port. |
| `@opencode/plugin` version mismatch with 2.2.5 | Pin explicitly; verify by loading a trivial plugin before porting all 12 tools. |
| Plugin load failure kills all custom tools | Port in two commits: scaffold + 1 tool, then the rest. |
| `ta` definition disagreement with prior answers | Fixture test with tolerances; document Wilder vs simple clearly in the tool description so the model does not "correct" it. |
| Snapshot tool mis-resolves owners | Assert on the current dataset (13 accounts, joint → household); fail loudly on unknown `owner` values. |
| MCP cache serves stale intraday prices | 15s TTL on quotes; never cache across a `ta` call that is used for a trade decision without surfacing the bar timestamp. |

Rollback: everything is additive except the four deletions and the frontmatter rewrite. `git revert` those two commits independently.

## Deferred (Phase 2–3)

- `.opencode/commands/` for `market-update`, `deep-dive`, `portfolio-review`, `verify` — fixed section order per output type.
- `scripts/check_contracts.ts` + `bun run check`: parse docs for tool references, assert registration; validate `data/members/**/*.json` against `data/schema/`.
- `plans/INDEX.md` + rule: read an existing deep dive from the last 30 days before re-deriving (the Nov 2 PL note was not read on Nov 5; a full technical re-derivation followed).
- Model variant with `temperature` for report writing; `steps` caps; `compaction.keep.tokens` tuning.
- Rename `fin-calc_*` → `calc_*` once docs are stable.
