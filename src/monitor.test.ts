import { describe, expect, it } from 'vitest'
import { convertFromUsd, clampIntervalMinutes, formatMoney } from './shared/config.ts'
import { diffAlerts, evaluateAlerts, topKeys, type AccountSnapshot } from './shared/thresholds.ts'
import { parseAccount, probeKeyLabel } from './client/api.test-helpers.ts'

const snap: AccountSnapshot = {
  t: 1_790_000_000_000,
  credits: 100,
  used: 97.5,
  balance: 2.5,
  today: 3.2,
  week: 9.4,
  month: 21.7,
  keys: [
    { hash: 'a', name: 'main', disabled: false, limit: 10, remaining: 0.4, usage: 9.6, usageDaily: 2, usageWeekly: 5, usageMonthly: 9 },
    { hash: 'b', name: 'scratch', disabled: false, limit: undefined, remaining: undefined, usage: 0.1, usageDaily: 0.05, usageWeekly: 0.1, usageMonthly: 0.1 },
    { hash: 'c', name: 'retired', disabled: true, limit: 5, remaining: 0, usage: 5, usageDaily: 1, usageWeekly: 1, usageMonthly: 5 },
  ],
}

describe('thresholds', () => {
  it('fires low-balance and key-remaining but not disabled keys', () => {
    const alerts = evaluateAlerts({ lowBalanceUsd: 5, dailySpendUsd: 0, keyRemainingUsd: 1 }, snap)
    expect(alerts.map((a) => a.id)).toEqual(['low-balance', 'key-remaining'])
    expect(alerts[1]!.detail).toContain('main')
    expect(alerts[1]!.detail).not.toContain('retired')
  })

  it('treats zero as off and unlimited keys as un-firable', () => {
    expect(evaluateAlerts({ lowBalanceUsd: 0, dailySpendUsd: 0, keyRemainingUsd: 0 }, snap)).toEqual([])
    expect(
      evaluateAlerts({ lowBalanceUsd: 0, dailySpendUsd: 0, keyRemainingUsd: 999 }, snap).map((a) => a.id),
    ).toEqual(['key-remaining']) // only `main` (has a limit)
  })

  it('caps the key-remaining name list at three', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      hash: String(i), name: `k${i}`, disabled: false, limit: 1, remaining: 0,
      usage: 1, usageDaily: 0, usageWeekly: 0, usageMonthly: 0,
    }))
    const alert = evaluateAlerts(
      { lowBalanceUsd: 0, dailySpendUsd: 0, keyRemainingUsd: 0.5 },
      { ...snap, keys: many },
    )
    expect(alert[0]!.detail).toMatch(/\+2$/)
  })

  it('diffs alerts by id for edge-triggered notifications', () => {
    const before = evaluateAlerts({ lowBalanceUsd: 5, dailySpendUsd: 0, keyRemainingUsd: 1 }, snap)
    // Today's spend is $3.20: a $3 threshold newly trips it.
    const after = evaluateAlerts(
      { lowBalanceUsd: 5, dailySpendUsd: 3, keyRemainingUsd: 1 },
      snap,
    )
    expect(diffAlerts(after, before).fired.map((a) => a.id)).toEqual(['daily-spend'])
    expect(diffAlerts(before, after).cleared).toEqual(['daily-spend'])
  })

  it('orders topKeys by daily usage and caps the list', () => {
    expect(topKeys(snap.keys, 2).map((k) => k.name)).toEqual(['main', 'retired'])
  })
})

describe('money display', () => {
  it('passes USD through untouched', () => {
    expect(formatMoney(12.4, { currency: 'USD', fxRate: 0 })).toBe('$12.40')
    expect(formatMoney(0.075, { currency: 'USD', fxRate: 0 })).toBe('$0.0750')
    expect(convertFromUsd(3, { currency: 'USD', fxRate: 0 })).toBe(3)
  })

  it('converts with the configured rate when positive', () => {
    expect(formatMoney(3, { currency: 'TWD', fxRate: 31 })).toBe('NT$93.00')
    // A zero rate must never collapse readouts to ¤0 silently.
    expect(convertFromUsd(3, { currency: 'CNY', fxRate: 0 })).toBe(3)
  })

  it('clamps intervals into [1,1440] and survives junk', () => {
    expect(clampIntervalMinutes(0)).toBe(1)
    expect(clampIntervalMinutes(5000)).toBe(1440)
    expect(clampIntervalMinutes(Number.NaN)).toBe(10)
  })
})

describe('api parsing', () => {
  it('merges credits and keys into one snapshot', () => {
    const parsed = parseAccount(123, { data: { total_credits: 50, total_usage: '17.25' } }, {
      data: [
        { hash: 'h', name: 'n', usage_daily: 1.5, limit: null, limit_remaining: null },
        { hash: 'x', name: '', disabled: true, usage_daily: 0.25, limit: 3, limit_remaining: '2' },
      ],
    })
    expect(parsed.balance).toBeCloseTo(32.75, 10)
    expect(parsed.today).toBeCloseTo(1.75, 10)
    expect(parsed.keys[0]!.limit).toBeUndefined()
    expect(parsed.keys[1]).toMatchObject({ name: '(unnamed)', remaining: 2, limit: 3 })
  })

  it('classifies probe outcomes from statuses (fetch stubbed via label)', () => {
    expect(probeKeyLabel(200)).toBe('ok')
    expect(probeKeyLabel(403)).toBe('insufficient')
    expect(probeKeyLabel(401)).toBe('invalid')
  })
})
