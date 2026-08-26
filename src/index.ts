/**
 * Host half of dsh-openrouter-monitor.
 *
 * The row, the polling, and the notifications all live in the browser (the
 * OpenRouter management API allows cross-origin GETs), so the host does
 * exactly one thing: register this plugin's settings namespace. That single
 * registration is what makes 「OpenRouter 監控」 appear in the DSH web settings
 * surface with live-apply semantics — the browser reads the same namespace
 * back through its `settingsScope` transport and re-arms itself without a
 * restart.
 *
 * @module dsh-openrouter-monitor
 */

import type { Context } from '@deepseek-ai/cordis'
import z from 'schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { CURRENCIES, CONFIG_DEFAULTS, SETTINGS_NAMESPACE, type MonitorConfig } from './shared/config.ts'

/** Plugin name in the cordis registry. */
export const name = 'openrouter-monitor'

/**
 * Runtime schema for the settings section. Deliberately NOT annotated with
 * `z<MonitorConfig>`: schemastery infers `currency` as `string` (the wire
 * carries a plain string; membership in `CURRENCIES` is enforced by the
 * validate hook below), and forcing the union annotation makes the schema's
 * inferred default meta structurally reject `MonitorConfig`.
 */
export const Config = z.object({
  enabled: z.boolean().default(CONFIG_DEFAULTS.enabled),
  intervalMinutes: z.number().step(1).min(1).max(1440).default(CONFIG_DEFAULTS.intervalMinutes),
  lowBalanceUsd: z.number().min(0).default(CONFIG_DEFAULTS.lowBalanceUsd),
  dailySpendUsd: z.number().min(0).default(CONFIG_DEFAULTS.dailySpendUsd),
  keyRemainingUsd: z.number().min(0).default(CONFIG_DEFAULTS.keyRemainingUsd),
  notify: z.boolean().default(CONFIG_DEFAULTS.notify),
  currency: z.string().default(CONFIG_DEFAULTS.currency),
  fxRate: z.number().min(0).default(CONFIG_DEFAULTS.fxRate),
})

/**
 * Register the settings namespace. Everything is best-effort: without a
 * settings provider the browser falls back to the schema defaults (plus the
 * locally stored key), which keeps the plugin usable on bare compositions.
 * @param ctx - host context.
 * @param config - composition entry config, installed as the `base` layer.
 */
export function apply(ctx: Context, config: Partial<MonitorConfig> = {}): void {
  const entry: MonitorConfig = {
    ...CONFIG_DEFAULTS,
    ...config,
  }
  try {
    installSettingsSection(ctx, settingsNamespace(SETTINGS_NAMESPACE), Config, entry, {
      setSource: () => {},
      onChange: () => {},
      // A non-USD display without a conversion rate would silently show the
      // wrong unit; an unrecognized code would fall back to '$' in every
      // readout — refuse both at the settings surface.
      validate: (value) => {
        if (!(CURRENCIES as readonly string[]).includes(value.currency)) {
          throw new Error(`currency must be one of: ${CURRENCIES.join(', ')}`)
        }
        if (value.currency !== 'USD' && !(value.fxRate > 0)) {
          throw new Error('fxRate must be > 0 when currency is not USD')
        }
      },
    })
  } catch {
    // A composition without settings must not take the host down for a
    // readout plugin; defaults keep everything working.
  }
}

export { CONFIG_DEFAULTS, SETTINGS_NAMESPACE, CURRENCIES } from './shared/config.ts'
export type { CurrencyCode, MonitorConfig } from './shared/config.ts'
export type { AccountSnapshot, Alert, AlertId, KeySummary } from './shared/thresholds.ts'
