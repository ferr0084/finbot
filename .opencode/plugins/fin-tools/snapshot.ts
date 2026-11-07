import type { Info as ToolInfo } from "@opencode/plugin/promise/tool"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

type JsonResult = { content: string }

function json(payload: unknown): JsonResult {
  return { content: JSON.stringify(payload, null, 2) }
}

const NS = "fin-data"
const OWNERS = new Set(["self", "spouse", "joint"])
const CASH_ACCOUNT_TYPES = new Set(["checking", "savings", "money_market"])

interface Profile {
  id?: string
  name?: string
  role?: string
  birth_date?: string
  filing_status?: string
  notes?: string
}

interface Account {
  id: string
  name: string
  type: string
  owner: string
  institution?: string
  balance?: number
  currency?: string
  notes?: string
}

interface Investment {
  id: string
  account_id: string
  ticker: string
  description?: string
  shares: number
  cost_basis_per_share: number
  asset_class: string
  sector?: string
  notes?: string
}

interface Position {
  id: string
  ticker: string
  description?: string
  account_id: string
  account_name: string | null
  account_type: string | null
  owner: string
  shares: number
  cost_basis_per_share: number
  cost_basis_value: number
  price: number | null
  price_source: "market" | "cash" | "unpriced"
  market_value: number | null
  unrealized_pnl: number | null
  pct_of_owner: number | null
  pct_of_portfolio: number | null
}

function readJson<T>(path: string): { value: T | null; error: string | null } {
  try {
    return { value: JSON.parse(readFileSync(path, "utf8")) as T, error: null }
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : String(error) }
  }
}

function isMarketTicker(ticker: string): boolean {
  // Custom 401(k) funds use underscores (IBM_CONSERVATIVE, NORD_TD2030) and are
  // not quotable on Yahoo. Cash-equivalent tickers are handled separately.
  return /^[A-Z][A-Z0-9.-]*$/.test(ticker)
}

export function makeSnapshotTool(dataDirectory: string): ToolInfo {
  const membersDirectory = join(dataDirectory, "data", "members")

  return {
    name: "snapshot",
    description:
      "Digest all member data (profiles, accounts, holdings) with deterministic owner resolution. Price-free: returns prices_required for one batched yf_quote, then call again with prices. Never fetches quotes itself.",
    input: {
      type: "object",
      properties: {
        prices: {
          type: "object",
          description: "Optional map of ticker to current price, e.g. {\"PL\": 12.34}. Use one batched yf_quote to build it.",
          additionalProperties: { type: "number" },
        },
        include: {
          type: "string",
          enum: ["all", "positions", "cash"],
          description: "all (default): accounts + positions + totals; positions: positions and totals only; cash: cash accounts and cash-class positions only",
        },
      },
      additionalProperties: false,
    },
    options: { namespace: NS, codemode: true },
    execute: async (input) => {
      const { prices, include } = input as {
        prices?: Record<string, number>
        include?: "all" | "positions" | "cash"
      }
      const scope = include ?? "all"

      if (!existsSync(membersDirectory)) {
        throw new Error(`No data/members directory at ${membersDirectory}`)
      }

      const memberIds = readdirSync(membersDirectory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()

      const missingFiles: string[] = []
      const accountsWithoutHoldings: string[] = []
      const placeholderAccounts: { id: string; name: string; institution: string; notes?: string }[] = []
      const unresolvedAccounts: { investment_id: string; account_id: string; member: string }[] = []
      const unpricedPositions: { ticker: string; member: string; account_id: string; reason: string }[] = []
      const warnings: string[] = []

      const members: any[] = []
      const allPositions: (Position & { member: string })[] = []

      for (const memberId of memberIds) {
        const memberDir = join(membersDirectory, memberId)
        const profilePath = join(memberDir, "profile.json")
        const accountsPath = join(memberDir, "accounts.json")
        const investmentsPath = join(memberDir, "investments.json")

        let profile: Profile | null = null
        if (existsSync(profilePath)) {
          const result = readJson<Profile>(profilePath)
          if (result.error) throw new Error(`Invalid profile.json for ${memberId}: ${result.error}`)
          profile = result.value
        } else if (memberId !== "household") {
          missingFiles.push(`data/members/${memberId}/profile.json`)
        }

        let accounts: Account[] = []
        if (existsSync(accountsPath)) {
          const result = readJson<Account[]>(accountsPath)
          if (result.error) throw new Error(`Invalid accounts.json for ${memberId}: ${result.error}`)
          accounts = result.value ?? []
        } else {
          missingFiles.push(`data/members/${memberId}/accounts.json`)
        }

        let investments: Investment[] = []
        if (existsSync(investmentsPath)) {
          const result = readJson<Investment[]>(investmentsPath)
          if (result.error) throw new Error(`Invalid investments.json for ${memberId}: ${result.error}`)
          investments = result.value ?? []
        } else {
          missingFiles.push(`data/members/${memberId}/investments.json`)
        }

        for (const account of accounts) {
          if (!OWNERS.has(account.owner)) {
            throw new Error(`Unknown owner "${account.owner}" on account ${account.id} (member ${memberId}). Expected self, spouse, or joint.`)
          }
          if (account.institution === "TBD") {
            placeholderAccounts.push({
              id: account.id,
              name: account.name,
              institution: account.institution,
              notes: account.notes,
            })
          }
        }

        const accountById = new Map(accounts.map((account) => [account.id, account]))
        const holdingsByAccount = new Map<string, Investment[]>()
        for (const investment of investments) {
          const bucket = holdingsByAccount.get(investment.account_id) ?? []
          bucket.push(investment)
          holdingsByAccount.set(investment.account_id, bucket)
        }
        for (const account of accounts) {
          if (!holdingsByAccount.has(account.id)) accountsWithoutHoldings.push(account.id)
        }

        const positions: Position[] = []
        for (const investment of investments) {
          const account = accountById.get(investment.account_id)
          if (!account) {
            unresolvedAccounts.push({ investment_id: investment.id, account_id: investment.account_id, member: memberId })
          }
          const owner = account?.owner ?? "unknown"
          const isCash = investment.asset_class === "cash"
          const price = isCash ? 1 : prices?.[investment.ticker] ?? null
          let priceSource: Position["price_source"] = isCash ? "cash" : "market"
          if (!isCash && price === null) {
            priceSource = "unpriced"
            unpricedPositions.push({
              ticker: investment.ticker,
              member: memberId,
              account_id: investment.account_id,
              reason: isMarketTicker(investment.ticker)
                ? "no price supplied"
                : "non-market ticker (custom 401(k) fund); use the account balance",
            })
          }
          const costBasisValue = investment.shares * investment.cost_basis_per_share
          const marketValue = price === null ? null : investment.shares * price
          positions.push({
            id: investment.id,
            ticker: investment.ticker,
            description: investment.description,
            account_id: investment.account_id,
            account_name: account?.name ?? null,
            account_type: account?.type ?? null,
            owner,
            shares: investment.shares,
            cost_basis_per_share: investment.cost_basis_per_share,
            cost_basis_value: costBasisValue,
            price,
            price_source: priceSource,
            market_value: marketValue,
            unrealized_pnl: marketValue === null ? null : marketValue - costBasisValue,
            pct_of_owner: null,
            pct_of_portfolio: null,
          })
        }

        allPositions.push(...positions.map((position) => ({ ...position, member: memberId })))

        const memberRecord: any = {
          id: memberId,
          name: profile?.name ?? null,
          role: profile?.role ?? (memberId === "household" ? "joint" : null),
          filing_status: profile?.filing_status ?? null,
          has_profile: profile !== null,
          accounts: accounts.map((account) => ({
            id: account.id,
            name: account.name,
            type: account.type,
            owner: account.owner,
            institution: account.institution ?? null,
            balance: account.balance ?? null,
            currency: account.currency ?? null,
            holdings_count: holdingsByAccount.get(account.id)?.length ?? 0,
            notes: account.notes,
          })),
          positions,
        }
        if (scope === "cash") {
          memberRecord.accounts = memberRecord.accounts.filter((account: any) => CASH_ACCOUNT_TYPES.has(account.type))
          memberRecord.positions = positions.filter((position) => position.price_source === "cash")
        }
        members.push(memberRecord)
      }

      const visiblePositions = scope === "cash" ? allPositions.filter((position) => position.price_source === "cash") : allPositions
      const priced = visiblePositions.filter((position) => position.market_value !== null)
      const totalMarketValue = priced.reduce((sum, position) => sum + (position.market_value ?? 0), 0)
      const totalCostBasis = priced.reduce((sum, position) => sum + position.cost_basis_value, 0)

      const owners: Record<string, any> = {}
      for (const position of priced) {
        const owner = position.owner
        if (!owners[owner]) {
          owners[owner] = { market_value: 0, cost_basis: 0, unrealized_pnl: 0, positions: 0 }
        }
        owners[owner].market_value += position.market_value ?? 0
        owners[owner].cost_basis += position.cost_basis_value
        owners[owner].unrealized_pnl += position.unrealized_pnl ?? 0
        owners[owner].positions += 1
      }
      for (const owner of Object.values(owners)) {
        owner.unrealized_pct = owner.cost_basis > 0 ? owner.unrealized_pnl / owner.cost_basis : null
        owner.pct_of_portfolio = totalMarketValue > 0 ? owner.market_value / totalMarketValue : null
      }

      for (const position of priced) {
        const ownerTotal = owners[position.owner]?.market_value ?? 0
        position.pct_of_owner = ownerTotal > 0 ? (position.market_value ?? 0) / ownerTotal : null
        position.pct_of_portfolio = totalMarketValue > 0 ? (position.market_value ?? 0) / totalMarketValue : null
      }
      for (const member of members) {
        for (const position of member.positions as Position[]) {
          if (position.market_value === null) continue
          const ownerTotal = owners[position.owner]?.market_value ?? 0
          position.pct_of_owner = ownerTotal > 0 ? position.market_value / ownerTotal : null
          position.pct_of_portfolio = totalMarketValue > 0 ? position.market_value / totalMarketValue : null
        }
      }

      const pricesRequired = [
        ...new Set(
          visiblePositions
            .filter((position) => position.price_source === "unpriced" && isMarketTicker(position.ticker))
            .map((position) => position.ticker),
        ),
      ].sort()

      const result: any = {
        tool: "snapshot",
        as_of: new Date().toISOString(),
        scope,
        members,
        owners,
        totals: {
          market_value: totalMarketValue,
          cost_basis: totalCostBasis,
          unrealized_pnl: totalMarketValue - totalCostBasis,
          unrealized_pct: totalCostBasis > 0 ? (totalMarketValue - totalCostBasis) / totalCostBasis : null,
          priced_positions: priced.length,
          unpriced_positions: visiblePositions.length - priced.length,
        },
        prices_required: pricesRequired,
        unpriced_positions: scope === "cash" ? [] : unpricedPositions,
        missing_files: missingFiles,
        accounts_without_holdings: accountsWithoutHoldings,
        placeholder_accounts: placeholderAccounts,
        unresolved_accounts: unresolvedAccounts,
        warnings,
      }

      if (scope === "positions") {
        delete result.members
        result.members = memberIds.map((memberId) => ({
          id: memberId,
          positions: members.find((member) => member.id === memberId)?.positions ?? [],
        }))
      }

      if (pricesRequired.length > 0 && !prices) {
        warnings.push(`Call yf_quote once for all ${pricesRequired.length} prices_required tickers, then call snapshot again with prices.`)
      }
      if (unpricedPositions.length > 0 && scope !== "cash") {
        warnings.push("Unpriced positions are excluded from market-value totals; use their account balance for those 401(k) funds.")
      }

      return json(result)
    },
  }
}
