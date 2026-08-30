/**
 * OpenRouter management API client — the narrow slice this plugin reads:
 * `/credits` for the balance and `/keys` for per-key usage. Both are plain
 * CORS-open GETs, so the BROWSER calls them directly with the user's
 * Provisioning/Management key; no host proxy is involved.
 *
 * The key never leaves the browser except to openrouter.ai itself.
 *
 * @module dsh-openrouter-monitor/client/api
 */

import type { AccountSnapshot, KeySummary } from '../shared/thresholds.ts'

const BASE = 'https://openrouter.ai/api/v1'

/** Hard cap per request so a hung connection cannot wedge the poller. */
const FETCH_TIMEOUT_MS = 15_000

/** Anything that can go wrong with a poll, with a SHORT user-facing label. */
export class OpenRouterError extends Error {
  /**
   * `network` (fetch threw), `timeout` (the cap above aborted it),
   * `unauthorized` (401), `forbidden` (403), `rate-limit` (429),
   * `server` (5xx), `http`, or `bad-shape`.
   */
  readonly kind: 'network' | 'timeout' | 'unauthorized' | 'forbidden' | 'rate-limit' | 'server' | 'http' | 'bad-shape'
  constructor(kind: OpenRouterError['kind'], message: string) {
    super(message)
    this.name = 'OpenRouterError'
    this.kind = kind
  }
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(n) ? n : 0
}

/** Parse one `/keys` entry; tolerant of missing optional fields. */
export function parseKey(raw: unknown): KeySummary {
  const j = (raw ?? {}) as Record<string, unknown>
  return {
    hash: String(j.hash ?? ''),
    name: String(j.name ?? '') || '(unnamed)',
    disabled: j.disabled === true,
    limit: j.limit === null || j.limit === undefined ? undefined : asNumber(j.limit),
    remaining: j.limit_remaining === null || j.limit_remaining === undefined ? undefined : asNumber(j.limit_remaining),
    usage: asNumber(j.usage),
    usageDaily: asNumber(j.usage_daily),
    usageWeekly: asNumber(j.usage_weekly),
    usageMonthly: asNumber(j.usage_monthly),
  }
}

async function getJson(path: string, key: string): Promise<unknown> {
  // `AbortSignal.timeout` is missing on very old browsers; then the fetch
  // simply runs uncapped (the `?.` keeps that a plain call, not a crash).
  const signal = AbortSignal.timeout?.(FETCH_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal,
    })
  } catch {
    // TypeError from fetch: DNS, offline, or an extension blocking the call —
    // or the timeout above fired and aborted it.
    if (signal?.aborted) throw new OpenRouterError('timeout', 'timed out')
    throw new OpenRouterError('network', 'network error')
  }
  if (response.status === 401) throw new OpenRouterError('unauthorized', 'key rejected (401)')
  if (response.status === 403) {
    // A plain inference key CAN authenticate but cannot list keys.
    throw new OpenRouterError('forbidden', 'not a Provisioning/Management key (403)')
  }
  if (response.status === 429) throw new OpenRouterError('rate-limit', 'rate limited (429)')
  if (response.status >= 500) throw new OpenRouterError('server', `server error (${response.status})`)
  if (!response.ok) throw new OpenRouterError('http', `HTTP ${response.status}`)
  try {
    return await response.json()
  } catch {
    throw new OpenRouterError('bad-shape', 'non-JSON response')
  }
}

/**
 * Parse the two endpoint payloads into one snapshot. Exported separately so
 * tests can drive it without stubbing `fetch`.
 * @param now - fetch timestamp stamped onto the snapshot.
 */
export function parseAccount(now: number, creditsBody: unknown, keysBody: unknown): AccountSnapshot {
  const credits = ((creditsBody ?? {}) as Record<string, unknown>).data ?? {}
  const keysRaw = (((keysBody ?? {}) as Record<string, unknown>).data ?? []) as unknown[]
  const keys = Array.isArray(keysRaw) ? keysRaw.map(parseKey) : []
  const totalCredits = asNumber((credits as Record<string, unknown>).total_credits)
  const totalUsage = asNumber((credits as Record<string, unknown>).total_usage)
  const sum = (pick: (k: KeySummary) => number): number => keys.reduce((acc, k) => acc + pick(k), 0)
  return {
    t: now,
    credits: totalCredits,
    used: totalUsage,
    balance: Math.max(0, totalCredits - totalUsage),
    today: sum((k) => k.usageDaily),
    week: sum((k) => k.usageWeekly),
    month: sum((k) => k.usageMonthly),
    keys,
  }
}

/**
 * Fetch credits + keys in parallel and merge them into one snapshot.
 * @param key - Provisioning/Management key, stored locally in the browser.
 */
export async function fetchAccount(key: string, now: Date = new Date()): Promise<AccountSnapshot> {
  if (!key) throw new OpenRouterError('unauthorized', 'no key')
  const [creditsBody, keysBody] = await Promise.all([
    getJson('/credits', key),
    getJson('/keys', key),
  ])
  return parseAccount(now.getTime(), creditsBody, keysBody)
}

/**
 * Lightweight credential check for the setup box: a valid key that CANNOT
 * list keys answers `insufficient` (plain inference key); a request that
 * never got a real verdict (offline, timed out, OpenRouter 5xx) answers
 * `network` / `timeout` so the setup box can say so instead of blaming the
 * key; anything else is `invalid` per HTTP status.
 */
export async function probeKey(
  key: string,
): Promise<'ok' | 'invalid' | 'insufficient' | 'network' | 'timeout'> {
  try {
    await getJson('/keys', key)
    return 'ok'
  } catch (error) {
    if (error instanceof OpenRouterError) {
      if (error.kind === 'forbidden') return 'insufficient'
      if (error.kind === 'network' || error.kind === 'timeout') return error.kind
    }
    return 'invalid'
  }
}
