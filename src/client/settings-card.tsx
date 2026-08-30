/**
 * The plugin's card on the DSH web settings surface (設定 → 外掛).
 *
 * How it appears at all: the Plugins tab renders the INTERSECTION of the
 * namespaces the Host serves (`settingsScope.describe()`) and the cards
 * plugins register into `settings.plugin.item`, dispatched by the card's
 * `options.key`. A host-side `register()` alone shows nothing without this
 * card — which is exactly why the first release lacked a settings entry.
 *
 * Editing is immediate-write: each scalar edit calls `scope.set(field, value)`
 * and a failed write reloads Host state. Fields marked overridden in the user
 * layer get a reset affordance via `scope.unset`.
 *
 * @module dsh-openrouter-monitor/client/settings-card
 */

import { memo, useState } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { MonitorKey } from './locales.ts'
import {
  CURRENCIES,
  clampIntervalMinutes,
  CONFIG_DEFAULTS,
  type CurrencyCode,
  type MonitorConfig,
} from '../shared/config.ts'

export interface ScopeLike {
  getSnapshot(): {
    status: 'loading' | 'ready' | 'unavailable'
    value: unknown
    user: unknown
    writable: boolean
  }
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
}

/** Props handed by the `settings.plugin.item` slot renderer. */
export interface MonitorSettingsCardProps {
  /** Namespace-bound translator (the slot's `locale` face). */
  t: Translate<MonitorKey>
  /** Sync snapshot selector over the controller's store. */
  useMonitorCard: (selector: (s: CardState) => CardState) => CardState
  /** Write one scalar field to the namespace's user layer. */
  save: (field: string, value: unknown) => Promise<void>
  /** Clear one field so it re-inherits schema defaults / composition base. */
  discard: (field: string) => Promise<void>
}

interface CardState {
  status: 'loading' | 'ready' | 'unavailable'
  config: MonitorConfig
  /** Raw user layer presence per field (what marks an override). */
  overridden: ReadonlySet<string>
  writable: boolean
}

const CARD_STYLE = {
  border: '1px solid rgba(240, 246, 252, 0.12)',
  borderRadius: '8px',
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const FIELD_ROW = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  justifyContent: 'space-between',
  flexWrap: 'wrap' as const,
} as const

const LABEL_STYLE = { color: 'var(--dsw-alias-label-secondary)', flex: '1 1 auto', minWidth: '120px' } as const

const INPUT_STYLE = {
  background: 'rgba(240, 246, 252, 0.08)',
  border: '1px solid rgba(240, 246, 252, 0.16)',
  borderRadius: '6px',
  boxSizing: 'border-box',
  color: 'inherit',
  fontSize: '12px',
  padding: '4px 8px',
  width: '110px',
} as const

const RESET_STYLE = {
  background: 'transparent',
  border: 'none',
  color: 'var(--dsw-alias-label-tertiary)',
  cursor: 'pointer',
  fontSize: '11px',
  padding: '0 2px',
  textDecoration: 'underline',
} as const

const HINT_STYLE = { color: 'var(--dsw-alias-label-tertiary)', fontSize: '11px' } as const

const ERROR_HINT_STYLE = { color: '#f85149', fontSize: '11px' } as const

/** The card body. Pure view: every mutation goes through {@link props.save}. */
export const MonitorSettingsCard = memo(function MonitorSettingsCard({
  t,
  useMonitorCard,
  save,
  discard,
}: MonitorSettingsCardProps) {
  const state = useMonitorCard((s) => s)
  const cfg = state.config
  // Transient hints: a write the host rejected, a non-positive FX rate.
  const [saveFailed, setSaveFailed] = useState(false)
  const [fxInvalid, setFxInvalid] = useState(false)

  type CardLabelKey = Extract<MonitorKey, `cfg.${string}`>

  // A rejected write must surface: an unnoticed failure silently reverts on
  // the next scope snapshot (e.g. the host's fxRate > 0 rule).
  const saveSafe = (field: string, value: unknown): void => {
    void Promise.resolve()
      .then(() => save(field, value))
      .then(
        () => setSaveFailed(false),
        () => setSaveFailed(true),
      )
  }
  const discardSafe = (field: string): void => {
    void Promise.resolve()
      .then(() => discard(field))
      .then(
        () => setSaveFailed(false),
        () => setSaveFailed(true),
      )
  }

  if (state.status !== 'ready') return null

  // A plain render helper, NOT an inline <Row> component: a component type
  // defined here would be a NEW identity every render, remounting (and
  // dropping the edits of) every uncontrolled input beneath it.
  const renderRow = (labelKey: CardLabelKey, field: string, children: React.ReactNode) => (
    <div style={FIELD_ROW}>
      <span style={LABEL_STYLE}>
        {t(labelKey)}
        {state.overridden.has(field) && (
          <button onClick={() => discardSafe(field)} style={RESET_STYLE} type="button">
            ({t('cfg.reset')})
          </button>
        )}
      </span>
      {children}
    </div>
  )

  return (
    <div style={CARD_STYLE}>
      {!cfg.enabled && <div style={HINT_STYLE}>{t('row.disabled')}</div>}
      {renderRow(
        'cfg.enabled',
        'enabled',
        <input
          checked={cfg.enabled}
          disabled={!state.writable}
          onChange={(e) => saveSafe('enabled', e.target.checked)}
          type="checkbox"
        />,
      )}

      {renderRow(
        'cfg.interval',
        'intervalMinutes',
        <input
          defaultValue={String(cfg.intervalMinutes)}
          disabled={!state.writable}
          key={`i${cfg.intervalMinutes}`}
          min={1}
          max={1440}
          onBlur={(e) => {
            const next = clampIntervalMinutes(Number(e.target.value))
            e.target.value = String(next)
            saveSafe('intervalMinutes', next)
          }}
          style={INPUT_STYLE}
          type="number"
        />,
      )}

      {renderRow(
        'cfg.lowBalance',
        'lowBalanceUsd',
        <input
          defaultValue={String(cfg.lowBalanceUsd)}
          disabled={!state.writable}
          key={`lb${cfg.lowBalanceUsd}`}
          min={0}
          step="any"
          onBlur={(e) => saveSafe('lowBalanceUsd', Math.max(0, Number(e.target.value) || 0))}
          style={INPUT_STYLE}
          type="number"
        />,
      )}

      {renderRow(
        'cfg.dailySpend',
        'dailySpendUsd',
        <input
          defaultValue={String(cfg.dailySpendUsd)}
          disabled={!state.writable}
          key={`ds${cfg.dailySpendUsd}`}
          min={0}
          step="any"
          onBlur={(e) => saveSafe('dailySpendUsd', Math.max(0, Number(e.target.value) || 0))}
          style={INPUT_STYLE}
          type="number"
        />,
      )}

      {renderRow(
        'cfg.keyRemaining',
        'keyRemainingUsd',
        <input
          defaultValue={String(cfg.keyRemainingUsd)}
          disabled={!state.writable}
          key={`kr${cfg.keyRemainingUsd}`}
          min={0}
          step="any"
          onBlur={(e) => saveSafe('keyRemainingUsd', Math.max(0, Number(e.target.value) || 0))}
          style={INPUT_STYLE}
          type="number"
        />,
      )}

      {renderRow(
        'cfg.notify',
        'notify',
        <input
          checked={cfg.notify}
          disabled={!state.writable}
          onChange={(e) => saveSafe('notify', e.target.checked)}
          type="checkbox"
        />,
      )}

      {renderRow(
        'cfg.currency',
        'currency',
        <select
          disabled={!state.writable}
          onChange={(e) => {
            setFxInvalid(false)
            saveSafe('currency', e.target.value)
          }}
          style={INPUT_STYLE}
          value={cfg.currency}
        >
          {(CURRENCIES as readonly string[]).map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>,
      )}

      {renderRow(
        'cfg.fxRate',
        'fxRate',
        <input
          defaultValue={String(cfg.fxRate)}
          disabled={!state.writable || cfg.currency === 'USD'}
          key={`fx${cfg.fxRate}`}
          min={0}
          step="any"
          onBlur={(e) => {
            const next = Math.max(0, Number(e.target.value) || 0)
            // Mirror the host's validate hook locally: never send a write
            // that would be rejected, and say why instead.
            if (cfg.currency !== 'USD' && !(next > 0)) {
              e.target.value = String(cfg.fxRate)
              setFxInvalid(true)
              return
            }
            setFxInvalid(false)
            saveSafe('fxRate', next)
          }}
          style={{ ...INPUT_STYLE, opacity: cfg.currency === 'USD' ? 0.5 : undefined }}
          type="number"
        />,
      )}

      {fxInvalid && <div style={ERROR_HINT_STYLE}>{t('cfg.fxRateInvalid')}</div>}
      {saveFailed && <div style={ERROR_HINT_STYLE}>{t('cfg.saveError')}</div>}
      <div style={HINT_STYLE}>{t('cfg.saveHint')}</div>
    </div>
  )
})

/**
 * Minimal un-staged card controller: mirrors scope snapshots and routes
 * edits straight through. Field-level shape is trivially scalar, so the
 * generic CardForm machinery is unnecessary here.
 */
export class MonitorSettingsCardController {
  private listeners = new Set<() => void>()
  private cached!: CardState
  private snapLike: ScopeLike

  constructor(scope: ScopeLike) {
    this.snapLike = scope
    // Seed before subscribe publishes deltas.
    this.cached = this.derive()
    scope.subscribe(() => {
      const next = this.derive()
      this.cached = next
      for (const listener of this.listeners) listener()
    })
  }

  private derive(): CardState {
    const snap = this.snapLike.getSnapshot()
    const userRaw = typeof snap.user === 'object' && snap.user !== null ? (snap.user as Record<string, unknown>) : {}
    return {
      status: snap.status,
      config: { ...CONFIG_DEFAULTS, ...(typeof snap.value === 'object' && snap.value !== null ? (snap.value as Partial<MonitorConfig>) : {}) },
      overridden: new Set(Object.keys(userRaw)),
      writable: snap.writable,
    }
  }

  getSnapshot = (): CardState => this.cached

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  save = async (field: string, value: unknown): Promise<void> => {
    await this.snapLike.set(field, value)
  }

  discard = async (field: string): Promise<void> => {
    await this.snapLike.unset(field)
  }

  inject = () => ({
    hooks: { monitorCard: { getSnapshot: this.getSnapshot, subscribe: this.subscribe } },
    save: this.save,
    discard: this.discard,
  })
}
