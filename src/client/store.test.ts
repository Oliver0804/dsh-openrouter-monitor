import { beforeEach, describe, expect, it } from 'vitest'
import * as store from './store.ts'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length(): number {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() })
})

describe('key row', () => {
  it('round-trips and clears', () => {
    expect(store.loadKey()).toBe('')
    store.saveKey('sk-or-v1-x')
    expect(store.loadKey()).toBe('sk-or-v1-x')
    store.saveKey('')
    expect(store.loadKey()).toBe('')
  })
})

describe('history', () => {
  it('throttles samples inside the gap but stores across it', () => {
    store.appendSample({ t: 1_000, balance: 9, today: 1 }, 60_000)
    expect(store.loadHistory()).toHaveLength(1)
    // Manual refresh click at +30s must not stack a point.
    store.appendSample({ t: 31_000, balance: 8.5, today: 1.2 }, 60_000)
    expect(store.loadHistory()).toHaveLength(1)
    store.appendSample({ t: 90_000, balance: 8, today: 2 }, 60_000)
    const history = store.loadHistory()
    expect(history).toHaveLength(2)
    expect(history[1]).toEqual({ t: 90_000, balance: 8, today: 2 })
  })

  it('caps the window at HISTORY_MAX and discards corrupt rows', () => {
    for (let i = 0; i < store.HISTORY_MAX + 40; i++) {
      store.appendSample({ t: i * 120_000, balance: i, today: i % 3 }, 0)
    }
    expect(store.loadHistory().length).toBe(store.HISTORY_MAX)

    localStorage.setItem('dsh-openrouter-monitor:history', '{"nope":true}')
    expect(store.loadHistory()).toEqual([])
  })

  it('discards samples whose today is non-finite (would poison the trend)', () => {
    // JSON has no Infinity literal, but 1e999 parses to Infinity.
    localStorage.setItem('dsh-openrouter-monitor:history', '[{"t":1,"balance":2,"today":1e999}]')
    expect(store.loadHistory()).toEqual([])
    localStorage.setItem('dsh-openrouter-monitor:history', '[{"t":1,"balance":2,"today":0.5}]')
    expect(store.loadHistory()).toHaveLength(1)
  })

  it('clears with the key removal path', () => {
    store.appendSample({ t: 0, balance: 1, today: 0 }, 0)
    store.clearHistory()
    expect(store.loadHistory()).toEqual([])
  })
})

describe('notification dedup', () => {
  it('is fresh until marked, then silent for the same UTC day', () => {
    const now = Date.UTC(2026, 8, 10, 12, 0, 0)
    expect(store.wasNotified('low-balance', now)).toBe(false)
    store.markNotified('low-balance', now)
    expect(store.wasNotified('low-balance', now)).toBe(true)
    expect(store.wasNotified('daily-spend', now)).toBe(false)
    // Tomorrow the alert re-arms by itself.
    expect(store.wasNotified('low-balance', now + 86_400_000)).toBe(false)
  })
})
