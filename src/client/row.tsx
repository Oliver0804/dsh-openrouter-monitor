/**
 * The composer-dock readout: OpenRouter balance, today's spend, alert state —
 * and on hover, the account card with trend charts, key breakdown and the
 * local key setup box.
 *
 * Polling lives here (not in a global effect): the interval re-arms whenever
 * the settings section changes, pauses while the tab is hidden, refreshes on
 * focus after a long sleep, and never stacks concurrent fetches.
 *
 * @module dsh-openrouter-monitor/client/row
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import {
  CONFIG_DEFAULTS,
  clampIntervalMinutes,
  formatMoney,
  type MonitorConfig,
} from '../shared/config.ts'
import {
  diffAlerts,
  evaluateAlerts,
  topKeys,
  type AccountSnapshot,
  type Alert,
  type AlertId,
} from '../shared/thresholds.ts'
import type { MonitorKey } from './locales.ts'
import { fetchAccount, OpenRouterError, probeKey } from './api.ts'
import * as store from './store.ts'
import { Trend } from './trend.tsx'

export interface RowProps {
  /** Namespace-bound translator (the `locale:` seat). */
  t: Translate<MonitorKey>
  /** Live settings section; `undefined` while the scope syncs. */
  config: MonitorConfig | undefined
}

/** Why the last poll failed; `unknown` covers non-OpenRouterError throws. */
type ErrorKind = OpenRouterError['kind'] | 'unknown'

type FetchState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  /** `errorKind` keeps the last failure visible beside the last good numbers. */
  | { phase: 'ok'; snapshot: AccountSnapshot; at: number; errorKind?: ErrorKind }
  | { phase: 'error'; kind: ErrorKind }

/** Alert ids → dictionary keys; a new AlertId fails to compile until mapped. */
const ALERT_KEYS: Record<AlertId, MonitorKey> = {
  'low-balance': 'alert.lowBalance',
  'daily-spend': 'alert.dailySpend',
  'key-remaining': 'alert.keyRemaining',
}

/** Error kinds → dictionary keys, so failures read in the UI language. */
const ERROR_KEYS: Record<ErrorKind, MonitorKey> = {
  network: 'error.network',
  timeout: 'error.timeout',
  unauthorized: 'error.unauthorized',
  forbidden: 'error.forbidden',
  'rate-limit': 'error.rateLimit',
  server: 'error.server',
  http: 'error.http',
  'bad-shape': 'error.badShape',
  unknown: 'error.unknown',
}

/** OpenRouter keys are `sk-or-…`; anything else cannot possibly poll. */
const KEY_PREFIX = 'sk-or-'

const ROW_STYLE = {
  alignItems: 'center',
  boxSizing: 'border-box',
  color: 'var(--dsw-alias-label-tertiary)',
  display: 'flex',
  overflow: 'visible',
  position: 'relative',
  fontSize: '12px',
  fontVariantNumeric: 'tabular-nums',
  gap: '6px',
  lineHeight: '20px',
  padding: '2px 0 0',
} as const

const LINE_STYLE = {
  alignItems: 'center',
  boxSizing: 'border-box',
  color: 'var(--dsw-alias-label-tertiary)',
  display: 'flex',
  fontSize: '12px',
  fontVariantNumeric: 'tabular-nums',
  gap: '6px',
  lineHeight: '20px',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const DOT_BASE = {
  borderRadius: '50%',
  display: 'inline-block',
  flex: '0 0 auto',
  height: '6px',
  width: '6px',
} as const

const COLOR_OK = '#3fb950'
const COLOR_WARN = '#f0883e'
const COLOR_ERR = '#f85149'
const COLOR_OFF = '#8b949e'
const GOOD_BLUE = '#58a6ff'

/** Dark, theme-independent hover card, opening UPWARD off the dock. */
const CARD_STYLE = {
  background: 'rgba(22, 27, 34, 0.96)',
  borderRadius: '8px',
  bottom: 'calc(100% + 6px)',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
  boxSizing: 'border-box',
  color: '#d0d7de',
  fontSize: '12px',
  left: '50%',
  lineHeight: '18px',
  maxWidth: 'min(320px, calc(100vw - 32px))',
  padding: '10px 12px',
  pointerEvents: 'none',
  position: 'absolute',
  transform: 'translateX(-50%)',
  whiteSpace: 'normal',
  zIndex: 40,
} as const

const SECTION_STYLE = { color: '#8b949e', fontSize: '11px', margin: '8px 0 2px' } as const

/** Interactive island inside the non-interactive card. */
const SETUP_STYLE = { pointerEvents: 'auto', marginTop: '8px' } as const

const INPUT_STYLE = {
  background: 'rgba(240, 246, 252, 0.08)',
  border: '1px solid rgba(240, 246, 252, 0.16)',
  borderRadius: '6px',
  boxSizing: 'border-box',
  color: '#d0d7de',
  fontSize: '11px',
  padding: '4px 8px',
  width: '100%',
} as const

const BUTTON_STYLE = {
  background: 'rgba(240, 246, 252, 0.12)',
  border: 'none',
  borderRadius: '6px',
  color: '#d0d7de',
  cursor: 'pointer',
  fontSize: '11px',
  padding: '3px 10px',
} as const

const KEY_ROW_STYLE = {
  alignItems: 'center',
  display: 'flex',
  fontSize: '11px',
  gap: '6px',
  justifyContent: 'space-between',
  whiteSpace: 'nowrap',
} as const

/** Ellipsize mid-name so hash-ish prefixes stay recognizable. */
function clampName(name: string): string {
  return name.length > 22 ? `${name.slice(0, 14)}…${name.slice(-5)}` : name
}

function agoText(msAgo: number): string {
  const minutes = Math.floor(msAgo / 60_000)
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`
}

/**
 * The composer-dock row. All server talk happens here; {@link props.config}
 * is the live settings section and may be `undefined` for the first few
 * frames while the settings scope syncs.
 */
export function MonitorRow({ t, config }: RowProps) {
  const cfg = config ?? CONFIG_DEFAULTS
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<FetchState>({ phase: 'idle' })
  // Started from localStorage once; kept in state afterwards.
  const [hasKey, setHasKey] = useState<boolean>(() => store.loadKey().length > 0)
  const [history, setHistory] = useState<readonly store.TrendSample[]>(() => store.loadHistory())
  const [draftKey, setDraftKey] = useState('')
  const [saveNote, setSaveNote] = useState<string | null>(null)
  /** Alerts that were already active at the previous evaluation. */
  const prevAlertsRef = useRef<readonly Alert[]>([])
  const inFlightRef = useRef(false)
  /** `Date.now()` of the last good fetch; read by the visibility handler. */
  const lastOkAtRef = useRef(0)

  const poll = useCallback(async () => {
    const key = store.loadKey()
    if (!key || inFlightRef.current) return
    inFlightRef.current = true
    setState((current) => (current.phase === 'ok' ? current : { phase: 'loading' }))
    try {
      const snapshot = await fetchAccount(key)
      lastOkAtRef.current = Date.now()
      setHistory(store.appendSample({ t: snapshot.t, balance: snapshot.balance, today: snapshot.today }))
      setState({ phase: 'ok', snapshot, at: Date.now() })
    } catch (error) {
      const kind: ErrorKind = error instanceof OpenRouterError ? error.kind : 'unknown'
      // Keep showing the last good numbers alongside the error dot instead of
      // discarding the failure silently.
      setState((current) =>
        current.phase === 'ok' ? { ...current, errorKind: kind } : { phase: 'error', kind },
      )
    } finally {
      inFlightRef.current = false
    }
  }, [])

  const enabled = cfg.enabled !== false
  const intervalMinutes = clampIntervalMinutes(cfg.intervalMinutes)

  useEffect(() => {
    if (!enabled) return
    // First load lands immediately; later ones ride the interval.
    void poll()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void poll()
    }, intervalMinutes * 60_000)
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return
      // Freshness via ref: the effect closure would hold a stale `state` from
      // the render that armed this listener, not the latest snapshot.
      if (Date.now() - lastOkAtRef.current < 30_000) return
      void poll()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // Re-arms when either the master switch or the cadence changes.
  }, [enabled, intervalMinutes, poll])

  const alerts = useMemo(
    () => evaluateAlerts(cfg, state.phase === 'ok' ? state.snapshot : undefined),
    [cfg, state],
  )

  // Edge-triggered notifications: only ids NEW since the last evaluation fire,
  // and each stays silent for the rest of its UTC day (cross-reload, via the
  // notified-map). Toggling `notify` on may prompt for permission lazily.
  useEffect(() => {
    if (!cfg.notify) {
      prevAlertsRef.current = alerts
      return
    }
    if (typeof Notification === 'undefined') return
    const { fired } = diffAlerts(alerts, prevAlertsRef.current)
    prevAlertsRef.current = alerts
    if (fired.length === 0) return
    const announce = (): void => {
      for (const alert of fired) {
        if (store.wasNotified(alert.id)) continue
        try {
          new Notification(`OpenRouter · ${t(ALERT_KEYS[alert.id])}`, {
            body: alert.detail,
          })
          store.markNotified(alert.id)
        } catch {
          // Best effort only; the row's warn color still carries the signal.
        }
      }
    }
    if (Notification.permission === 'granted') announce()
    else if (Notification.permission === 'default') {
      void Notification.requestPermission().then((permission) => {
        if (permission === 'granted') announce()
      })
    }
  }, [alerts, cfg.notify, t])

  // ---- derived readouts -------------------------------------------------

  const money = useMemo(() => {
    if (state.phase !== 'ok') return undefined
    const fmt = (usd: number): string => formatMoney(usd, cfg)
    return {
      balance: fmt(state.snapshot.balance),
      today: fmt(state.snapshot.today),
      week: fmt(state.snapshot.week),
      credits: fmt(state.snapshot.credits),
      used: fmt(state.snapshot.used),
      month: fmt(state.snapshot.month),
    }
  }, [cfg, state])

  // The failing kind, whether there is no good snapshot at all ('error') or
  // it arrived after the last good one ('ok' + errorKind).
  const errorKind =
    state.phase === 'error' ? state.kind : state.phase === 'ok' ? state.errorKind : undefined

  const dotColor =
    !hasKey ? COLOR_OFF
    : errorKind ? COLOR_ERR
    : alerts.length > 0 ? COLOR_WARN
    : COLOR_OK

  const saveDraft = async (): Promise<void> => {
    const trimmed = draftKey.trim()
    if (!trimmed) return
    // Cheap shape check first: probing a non-OpenRouter string would just
    // come back 401 and read as "invalid key", which misleads.
    if (!trimmed.startsWith(KEY_PREFIX)) {
      setSaveNote(t('card.saveFormat'))
      return
    }
    setSaveNote('…')
    const result = await probeKey(trimmed).catch(() => 'network' as const)
    if (result === 'ok') {
      store.saveKey(trimmed)
      setHasKey(true)
      setDraftKey('')
      setSaveNote(t('card.saveOk'))
      const fresh = await fetchAccount(trimmed).catch(() => undefined)
      if (fresh) {
        lastOkAtRef.current = Date.now()
        setHistory(store.appendSample({ t: fresh.t, balance: fresh.balance, today: fresh.today }, 0))
        setState({ phase: 'ok', snapshot: fresh, at: Date.now() })
      }
    } else {
      // A probe that never reached OpenRouter must not read as a bad key.
      setSaveNote(result === 'network' || result === 'timeout' ? t('card.saveNet') : t('card.saveBad'))
    }
  }

  const removeKey = (): void => {
    store.saveKey('')
    setHasKey(false)
    setState({ phase: 'idle' })
    store.clearHistory()
    setHistory([])
    setSaveNote(null)
  }

  if (!enabled) return null

  const lineMain =
    !hasKey ? t('row.noKey')
    : state.phase === 'loading' || state.phase === 'idle' ? t('row.loading')
    : state.phase === 'error' ? t('row.error', { message: t(ERROR_KEYS[state.kind]) })
    : `${t('row.balance', { amount: money!.balance })} · ${t('row.today', { amount: money!.today })}`

  return (
    <div
      data-dsh-openrouter-monitor={alerts.length > 0 ? 'warn' : 'ok'}
      onBlur={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={ROW_STYLE}
      tabIndex={0}
    >
      <div style={LINE_STYLE}>
        <span style={{ ...DOT_BASE, background: dotColor }} />
        <span>{lineMain}</span>
        {state.phase === 'ok' && (
          <>
            <span>·</span>
            <span>{t('row.week', { amount: money!.week })}</span>
            <span>·</span>
            <span>{agoText(Date.now() - state.at)}</span>
          </>
        )}
        {alerts.length > 0 && (
          <span style={{ color: COLOR_WARN }}>
            ⚠ {alerts.map((a) => t(ALERT_KEYS[a.id])).join(' / ')}
          </span>
        )}
        {hasKey && (
          <button
            onClick={(event) => {
              event.stopPropagation()
              void poll()
            }}
            style={{ ...BUTTON_STYLE, marginLeft: '4px', padding: '1px 8px' }}
            title={t('row.refresh')}
            type="button"
          >
            ↻
          </button>
        )}
      </div>

      {open && (
        <div style={CARD_STYLE}>
          <div style={{ fontWeight: 600 }}>{t('card.title')}</div>
          {state.phase === 'ok' && (
            <div style={{ color: '#8b949e', fontSize: '11px' }}>
              {t('status.updated', { time: agoText(Date.now() - state.at) })}
            </div>
          )}

          {state.phase === 'ok' && money ? (
            <>
              <div style={SECTION_STYLE}>{t('card.account')}</div>
              <div style={{ fontSize: '11px' }}>
                {t('card.credits', { amount: money.credits })} · {t('card.used', { amount: money.used })} ·{' '}
                {t('card.month', { amount: money.month })}
              </div>
              <div style={SECTION_STYLE}>{t('card.trendBalance')}</div>
              <Trend color={GOOD_BLUE} label={(v) => formatMoney(v, cfg)} values={history.map((h) => h.balance)} />
              <div style={SECTION_STYLE}>{t('card.trendToday')}</div>
              <Trend color={COLOR_OK} label={(v) => formatMoney(v, cfg)} values={history.map((h) => h.today)} />
              {history.length < 2 && <div style={{ color: '#8b949e', fontSize: '11px' }}>{t('card.trendEmpty')}</div>}

              <div style={SECTION_STYLE}>{t('card.keys')}</div>
              {topKeys(state.snapshot.keys).map((k) => {
                const barPct =
                  k.limit !== undefined && k.limit > 0 ? Math.max(0, Math.min(1, k.remaining! / k.limit)) : undefined
                const hot = k.remaining !== undefined && cfg.keyRemainingUsd > 0 && k.remaining <= cfg.keyRemainingUsd
                return (
                  <div key={k.hash} style={KEY_ROW_STYLE}>
                    <span style={{ color: k.disabled ? '#6e7681' : hot ? COLOR_WARN : undefined }}>
                      {k.disabled ? '⏸ ' : ''}
                      {clampName(k.name)}
                    </span>
                    <span style={{ color: '#8b949e' }}>
                      {formatMoney(k.usageDaily, cfg)}
                      {' · '}
                      {k.limit !== undefined ? formatMoney(Math.max(0, k.remaining!), cfg) : t('card.keyUnlimited')}
                      {barPct !== undefined && (
                        <span
                          style={{
                            background: 'rgba(240,246,252,0.18)',
                            borderRadius: '3px',
                            display: 'inline-block',
                            height: '4px',
                            marginLeft: '4px',
                            verticalAlign: 'middle',
                            width: '36px',
                          }}
                        >
                          <span
                            style={{
                              background: hot ? COLOR_WARN : COLOR_OK,
                              borderRadius: '3px',
                              display: 'inline-block',
                              height: '4px',
                              width: `${barPct * 100}%`,
                            }}
                          />
                        </span>
                      )}
                    </span>
                  </div>
                )
              })}

              <div style={SECTION_STYLE}>{t('card.alerts')}</div>
              {alerts.length === 0 ? (
                <div style={{ color: '#8b949e', fontSize: '11px' }}>{t('card.noAlerts')}</div>
              ) : (
                alerts.map((a) => (
                  <div key={a.id} style={{ color: COLOR_WARN, fontSize: '11px' }}>
                    ⚠ {t(ALERT_KEYS[a.id])} — {a.detail}
                  </div>
                ))
              )}
            </>
          ) : (state.phase === 'idle' || state.phase === 'loading') && hasKey ? (
            <div style={{ marginTop: '6px' }}>{t('row.loading')}</div>
          ) : null}

          {errorKind && (
            <div style={{ color: COLOR_ERR, fontSize: '11px', marginTop: '6px' }}>
              {t(ERROR_KEYS[errorKind])}
            </div>
          )}

          <div style={{ ...SECTION_STYLE, ...SETUP_STYLE }}>{t('card.setup')}</div>
          <div style={SETUP_STYLE}>
            <input
              onChange={(e) => setDraftKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveDraft()
                e.stopPropagation()
              }}
              placeholder="sk-or-v1-…"
              style={INPUT_STYLE}
              type="password"
              value={draftKey}
            />
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
              <button disabled={!draftKey.trim()} onClick={() => void saveDraft()} style={BUTTON_STYLE} type="button">
                {t('card.save')}
              </button>
              {hasKey && (
                <button onClick={removeKey} style={BUTTON_STYLE} type="button">
                  {t('card.remove')}
                </button>
              )}
              {saveNote && <span style={{ color: '#8b949e', alignSelf: 'center', fontSize: '11px' }}>{saveNote}</span>}
            </div>
          </div>
          <div style={{ color: '#8b949e', fontSize: '11px', marginTop: '8px' }}>{t('card.settingsHint')}</div>
        </div>
      )}
    </div>
  )
}
