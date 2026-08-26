/**
 * Account snapshot shape and the alert rules, both pure. The browser fetches
 * and stores snapshots; thresholds evaluates them; neither touches React,
 * localStorage, or the wire — so both are unit-testable without a DOM.
 *
 * @module dsh-openrouter-monitor/shared/thresholds
 */

/** One OpenRouter API key, narrowed to what this plugin shows and checks. */
export interface KeySummary {
  /** Opaque key hash (never the secret itself). */
  readonly hash: string
  /** User-assigned name; `(unnamed)` when empty. */
  readonly name: string
  readonly disabled: boolean
  /** Spend limit in USD; `undefined` when the key has no limit set. */
  readonly limit: number | undefined
  /** Remaining spend under the limit; `undefined` with no limit. */
  readonly remaining: number | undefined
  readonly usage: number
  readonly usageDaily: number
  readonly usageWeekly: number
  readonly usageMonthly: number
}

/** One polling result: account totals plus the keys that produced them. */
export interface AccountSnapshot {
  /** `Date#getTime` of the fetch. */
  readonly t: number
  /** Total credits ever provisioned on the account (USD). */
  readonly credits: number
  /** Total usage against those credits (USD). */
  readonly used: number
  /** `credits - used`, clamped at zero against rounding noise. */
  readonly balance: number
  /** Sum of every key's `usage_daily` (USD). */
  readonly today: number
  readonly week: number
  readonly month: number
  readonly keys: readonly KeySummary[]
}

export const ALERT_IDS = ['low-balance', 'daily-spend', 'key-remaining'] as const

export type AlertId = (typeof ALERT_IDS)[number]

/** One active threshold violation. */
export interface Alert {
  readonly id: AlertId
  /**
   * zh/en-neutral payload text: USD amounts formatted later through
   * {@link formatMoney}-style helpers by the row, so alerts stay currency-
   * agnostic here.
   */
  readonly detail: string
}

type Thresholds = Pick<
  import('./config.ts').MonitorConfig,
  'lowBalanceUsd' | 'dailySpendUsd' | 'keyRemainingUsd'
>

/**
 * Evaluate every threshold against one snapshot. A threshold of `0` (or less)
 * disables its rule. `key-remaining` only fires for enabled keys WITH a
 * limit — an unlimited key has no "remaining" to run out of.
 * @param cfg - the three alert thresholds in USD.
 * @param snap - the latest snapshot; `undefined` yields no alerts.
 * @returns active violations, stable order.
 */
export function evaluateAlerts(cfg: Thresholds, snap: AccountSnapshot | undefined): Alert[] {
  if (!snap) return []
  const alerts: Alert[] = []
  if (cfg.lowBalanceUsd > 0 && snap.balance <= cfg.lowBalanceUsd) {
    alerts.push({ id: 'low-balance', detail: `balance $${snap.balance.toFixed(2)} ≤ $${cfg.lowBalanceUsd.toFixed(2)}` })
  }
  if (cfg.dailySpendUsd > 0 && snap.today >= cfg.dailySpendUsd) {
    alerts.push({ id: 'daily-spend', detail: `today $${snap.today.toFixed(2)} ≥ $${cfg.dailySpendUsd.toFixed(2)}` })
  }
  if (cfg.keyRemainingUsd > 0) {
    const broke = snap.keys.filter(
      (k) => !k.disabled && k.remaining !== undefined && k.remaining <= cfg.keyRemainingUsd,
    )
    if (broke.length > 0) {
      const names = broke
        .slice(0, 3)
        .map((k) => k.name)
        .join(', ')
      alerts.push({
        id: 'key-remaining',
        detail:
          broke.length > 3 ? `${names} +${broke.length - 3}` : `${names} ($${cfg.keyRemainingUsd.toFixed(2)})`,
      })
    }
  }
  return alerts
}

/**
 * Edge detection between two evaluations: which alerts NEWLY fired (for
 * notifications — an already-active alert must not re-ping every poll) and
 * which cleared. Comparison is by id only; a changing `detail` on an id that
 * stayed active is a refresh, not an edge.
 */
export function diffAlerts(current: readonly Alert[], previous: readonly Alert[]): {
  fired: readonly Alert[]
  cleared: readonly AlertId[]
} {
  const prevIds = new Set(previous.map((a) => a.id))
  const currIds = new Set(current.map((a) => a.id))
  return {
    fired: current.filter((a) => !prevIds.has(a.id)),
    cleared: [...prevIds].filter((id) => !currIds.has(id)) as AlertId[],
  }
}

/** Top offenders for the hover card, highest daily usage first, capped. */
export function topKeys(keys: readonly KeySummary[], cap = 6): KeySummary[] {
  return [...keys].sort((a, b) => b.usageDaily - a.usageDaily).slice(0, cap)
}
