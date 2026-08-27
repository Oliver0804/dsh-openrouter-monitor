/**
 * Browser half of dsh-openrouter-monitor.
 *
 * One row on the composer dock: OpenRouter balance, today/week spend, alert
 * state, and — hovering — account totals, balance & daily-spend trends, top
 * keys with remaining-limit bars, and the local Provisioning-key setup box.
 *
 * Configuration comes full-circle through the DSH settings surface: the host
 * half registers the namespace, this half mirrors it over the settingsScope
 * transport and hot-reloads (interval changes re-arm the poller, threshold
 * edits retint the row) with no restart.
 *
 * @module dsh-openrouter-monitor/client
 */

import { useSyncExternalStore } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-conversation SlotMap merge (conversation.composer.dock).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls Context.settingsScope (the settingsScope binder service).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the `settings.plugin.item` SlotMap merge (keyed card slot).
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { CONFIG_DEFAULTS, SETTINGS_NAMESPACE, type MonitorConfig } from '../shared/config.ts'
import { en, zh, type MonitorKey } from './locales.ts'
import { ensureRowCss } from './row-css.ts'
import { MonitorRow } from './row.tsx'
import { MonitorSettingsCard, MonitorSettingsCardController } from './settings-card.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** openrouter-monitor composer-dock copy. */
    'openrouter-monitor': MonitorKey
  }
}

/** Dictionary namespace owned by this plugin. */
const LOCALE_NS = 'openrouter-monitor'

/** Services required by this plugin (settingsScope is read softly below). */
export const inject = ['slots', 'locale']

/**
 * Stable empty snapshot for when the settings surface is absent entirely.
 * `getSnapshot` MUST hand back the same reference every call or
 * `useSyncExternalStore` loops forever.
 */
const NO_SCOPE_SNAPSHOT: MinimalSnapshot = Object.freeze({
  status: 'unavailable',
  value: undefined,
})

interface MinimalSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  value: unknown
}

/** The slice of `SettingsScope` this plugin consumes (structural on purpose). */
interface ScopeLike {
  getSnapshot(): MinimalSnapshot
  subscribe(listener: () => void): () => void
}

/**
 * Register the readout: dictionaries, row stylesheet, settings mirror, dock
 * row. Order 130 places it beneath the peak-pricing line (120), reading as
 * the last ambient line under the composer.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'openrouter-monitor: dictionaries')

  ensureRowCss()

  // Bind one scope; anything missing (surface not composed, memory-mode
  // browser, loopback-only connection) degrades to schema defaults.
  let subscribeScope: ScopeLike['subscribe'] = () => () => {}
  let getScopeSnapshot: ScopeLike['getSnapshot'] = () => NO_SCOPE_SNAPSHOT
  let cardController: MonitorSettingsCardController | undefined
  try {
    const binder = ctx.get('settingsScope')
    if (!binder) throw new Error('settingsScope absent')
    const bound = binder.bind<MonitorConfig>({ namespace: SETTINGS_NAMESPACE })
    getScopeSnapshot = () => {
      const snap = bound.getSnapshot()
      return snap.status === 'ready' ? snap : ({ status: snap.status, value: undefined } as MinimalSnapshot)
    }
    subscribeScope = bound.subscribe.bind(bound)
    cardController = new MonitorSettingsCardController(bound)
  } catch {
    // Defaults-only mode; the setup box keeps the key side working.
  }

  /**
   * The mounted component face: translate + live config section feeding the
   * pure {@link MonitorRow}.
   */
  function MonitorRowBridge({ t }: { t: Translate<MonitorKey> }) {
    const snapshot = useSyncExternalStore(subscribeScope, getScopeSnapshot)
    const config =
      snapshot.status === 'ready' && typeof snapshot.value === 'object' && snapshot.value !== null
        ? (snapshot.value as Partial<MonitorConfig>)
        : undefined
    return <MonitorRow config={{ ...CONFIG_DEFAULTS, ...(config ?? {}) }} t={t} />
  }

  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register(
      {
        name: 'conversation.composer.dock',
        id: 'openrouter-monitor',
        order: 130,
        locale: LOCALE_NS,
        inject: () => ({}),
      },
      MonitorRowBridge,
    ),
  )

  // The settings card. The Plugins tab renders only the INTERSECTION of the
  // namespaces this Host serves and the cards registered here — dispatched by
  // `key` — so both halves of that contract are required for the entry to
  // appear, and `key` MUST equal the namespace string exactly.
  if (cardController) {
    ctx.slots.inject('settings.plugin.item', function* () {
      yield ctx.slots.register(
        {
          name: 'settings.plugin.item',
          key: SETTINGS_NAMESPACE,
          locale: LOCALE_NS,
          inject: () => cardController!.inject(),
        },
        MonitorSettingsCard,
      )
    })
  }
}

export { MonitorRow } from './row.tsx'
export { Trend } from './trend.tsx'
export * as store from './store.ts'
