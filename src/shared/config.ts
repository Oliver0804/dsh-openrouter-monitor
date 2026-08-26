/**
 * Configuration shape and pure money helpers shared by the host half (which
 * registers the settings namespace) and the browser half (which polls with
 * it). No imports — both bundles inline this file verbatim.
 *
 * @module dsh-openrouter-monitor/shared/config
 */

/** The settings namespace this plugin owns in the DSH settings surface. */
export const SETTINGS_NAMESPACE = 'openrouter-monitor'

/** Display currencies, mirroring openrouter_monitor's list. USD is the wire unit. */
export const CURRENCIES = ['USD', 'TWD', 'JPY', 'EUR', 'GBP', 'CNY', 'KRW', 'HKD', 'SGD', 'AUD'] as const

export type CurrencyCode = (typeof CURRENCIES)[number]

/** Everything the web settings surface edits for this plugin. */
export interface MonitorConfig {
  /** Master switch; when false the browser row renders nothing at all. */
  enabled: boolean
  /** Poll interval in minutes, clamped to `[1, 1440]`. */
  intervalMinutes: number
  /**
   * Low-balance alert threshold in USD; `0` disables the alert.
   */
  lowBalanceUsd: number
  /** Daily-spend alert threshold in USD; `0` disables the alert. */
  dailySpendUsd: number
  /**
   * Per-key remaining-credit alert threshold in USD, checked against every
   * ENABLED key that has a limit set; `0` disables the alert.
   */
  keyRemainingUsd: number
  /** Fire a browser notification when an alert newly fires (edge-triggered). */
  notify: boolean
  /** Display currency for every readout on the row and card. */
  currency: CurrencyCode
  /** Units of {@link MonitorConfig.currency} per 1 USD; ignored for USD itself. */
  fxRate: number
}

export const CONFIG_DEFAULTS: Readonly<MonitorConfig> = Object.freeze({
  enabled: true,
  intervalMinutes: 10,
  lowBalanceUsd: 5,
  dailySpendUsd: 0,
  keyRemainingUsd: 0,
  notify: false,
  currency: 'USD',
  fxRate: 0,
})

const SYMBOLS: Readonly<Record<CurrencyCode, string>> = Object.freeze({
  USD: '$',
  TWD: 'NT$',
  JPY: '¥',
  EUR: '€',
  GBP: '£',
  CNY: '¥',
  KRW: '₩',
  HKD: 'HK$',
  SGD: 'S$',
  AUD: 'A$',
})

/** Symbol for a known code; unknown codes (hand-edited YAML) read as USD. */
function symbolOf(code: CurrencyCode | string): string {
  return SYMBOLS[(code as CurrencyCode)] ?? SYMBOLS.USD
}

/**
 * Convert a USD amount into the configured display currency. USD displays as
 * itself; any other currency needs a positive `fxRate` and converts as
 * `usd * fxRate`. An unrecognized currency code falls back to plain USD.
 */
export function convertFromUsd(usd: number, cfg: Pick<MonitorConfig, 'currency' | 'fxRate'>): number {
  if (!(CURRENCIES as readonly string[]).includes(cfg.currency)) return usd
  if (cfg.currency === 'USD') return usd
  return cfg.fxRate > 0 ? usd * cfg.fxRate : usd
}

/** Two decimals above one unit, four below (fractions of a cent stay readable). */
function amountText(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0
  return safe < 1 ? safe.toFixed(4) : safe.toFixed(2)
}

/**
 * Format a USD amount IN THE CONFIGURED DISPLAY CURRENCY, symbol included:
 * `$12.40`, `¥87.30`, `NT$391.2500`.
 */
export function formatMoney(usd: number, cfg: Pick<MonitorConfig, 'currency' | 'fxRate'>): string {
  const usable = (CURRENCIES as readonly string[]).includes(cfg.currency) && cfg.fxRate > 0 ? cfg.currency : 'USD'
  const amount = convertFromUsd(usd, { currency: usable as CurrencyCode, fxRate: cfg.fxRate })
  return `${symbolOf(usable)}${amountText(amount)}`
}

/**
 * Clamp the poll interval the way the host schema documents it.
 * Non-finite inputs fall back to the default rather than disabling polling.
 */
export function clampIntervalMinutes(minutes: unknown): number {
  const n = typeof minutes === 'number' && Number.isFinite(minutes) ? Math.floor(minutes) : CONFIG_DEFAULTS.intervalMinutes
  return Math.min(1440, Math.max(1, n))
}
