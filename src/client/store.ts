/**
 * Local persistence for the browser half. Three small localStorage rows per
 * origin, all namespaced under `dsh-openrouter-monitor`:
 *
 * - the Provisioning/Management key (a local secret, same trust zone as the
 *   Flutter app's secure storage — DSH's settings wire deliberately strips
 *   secret-role fields before they reach a browser, so the key CANNOT live in
 *   the settings document and still be usable for client-side polling);
 * - the trend history, capped rolling samples `{t, balance, today}`;
 * - which alert ids have already fired their notification today (so the
 *   edge-triggered path stays edge-triggered across reloads).
 *
 * @module dsh-openrouter-monitor/client/store
 */

/** One trend sample; USD values, no currency conversion applied here. */
export interface TrendSample {
  readonly t: number
  readonly balance: number
  readonly today: number
}

const PREFIX = 'dsh-openrouter-monitor'
const KEY_ROW = `${PREFIX}:key`
const HISTORY_ROW = `${PREFIX}:history`
const NOTIFIED_ROW = `${PREFIX}:notified`
/** ~24h of samples at a 5-minute cadence, less at slower intervals. */
export const HISTORY_MAX = 240

/** Best-effort `localStorage`; absent in non-browser and blocked-storage cases. */
function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

function readJson<T>(row: string): T | undefined {
  const raw = storage()?.getItem(row)
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

function writeJson(row: string, value: unknown): void {
  try {
    storage()?.setItem(row, JSON.stringify(value))
  } catch {
    // Quota or blocked storage: degrade to in-memory-only accounting.
  }
}

// ---------------------------------------------------------------------------
// Key

export function loadKey(): string {
  return storage()?.getItem(KEY_ROW) ?? ''
}

export function saveKey(key: string): void {
  try {
    if (key) storage()?.setItem(KEY_ROW, key)
    else storage()?.removeItem(KEY_ROW)
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// History

function isSample(value: unknown): value is TrendSample {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  // `today` too: a non-finite value would turn the trend geometry into NaN.
  return (
    typeof s.t === 'number' &&
    Number.isFinite(s.t) &&
    typeof s.balance === 'number' &&
    Number.isFinite(s.balance) &&
    typeof s.today === 'number' &&
    Number.isFinite(s.today)
  )
}

/** Oldest-first history; corrupt rows are discarded wholesale, not repaired. */
export function loadHistory(): readonly TrendSample[] {
  const parsed = readJson<unknown>(HISTORY_ROW)
  if (!Array.isArray(parsed) || !parsed.every(isSample)) return []
  // Every stored row predates this call, so cut anything off the front that
  // exceeds the cap (a settings downgrade could have left a longer row).
  return (parsed as readonly TrendSample[]).slice(-HISTORY_MAX)
}

/**
 * Append one sample unless the previous one is younger than {@link minGapMs} —
 * a manual refresh click should not stack points onto the trend.
 */
export function appendSample(sample: TrendSample, minGapMs = 60_000): readonly TrendSample[] {
  const history = loadHistory()
  const last = history[history.length - 1]
  if (last && sample.t - last.t < minGapMs) return history
  const next = [...history, sample].slice(-HISTORY_MAX)
  writeJson(HISTORY_ROW, next)
  return next
}

export function clearHistory(): void {
  try {
    storage()?.removeItem(HISTORY_ROW)
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Notification dedup

type NotifiedMap = Readonly<Partial<Record<string, string>>>

/** Day stamp (UTC) so an alert re-arms naturally tomorrow. */
function dayStamp(t = Date.now()): string {
  return new Date(t).toISOString().slice(0, 10)
}

/**
 * Whether this alert id was already notified TODAY — the cross-reload half of
 * edge-triggering. An id never seen, or last notified on an earlier day,
 * counts as fresh.
 */
export function wasNotified(id: string, now = Date.now()): boolean {
  return readJson<NotifiedMap>(NOTIFIED_ROW)?.[id] === dayStamp(now)
}

/** Mark an id as notified today; prunes stale days on write. */
export function markNotified(id: string, now = Date.now()): void {
  const current = { ...(readJson<NotifiedMap>(NOTIFIED_ROW) ?? {}) }
  delete current[id]
  for (const [key, day] of Object.entries(current)) {
    if (day !== dayStamp(now)) delete current[key]
  }
  current[id] = dayStamp(now)
  writeJson(NOTIFIED_ROW, current as NotifiedMap)
}
