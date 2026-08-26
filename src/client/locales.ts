/**
 * The `openrouter-monitor` namespace dictionaries. Wording aligns with
 * openrouter_monitor (餘額 / 今日 / 告警) so the two surfaces read alike.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'row.balance': '餘額 {amount}',
  'row.today': '今日 {amount}',
  'row.week': '本週 {amount}',
  'row.disabled': 'OpenRouter 監控已停用',
  'row.noKey': 'OpenRouter：未設定 Key（懸浮設定）',
  'row.loading': 'OpenRouter：載入中…',
  'row.refresh': '重新整理',
  'alert.lowBalance': '餘額不足',
  'alert.dailySpend': '今日用量超標',
  'alert.keyRemaining': 'Key 額度將盡',
  'card.title': 'OpenRouter 監控',
  'card.account': '帳號',
  'card.credits': '總額度：{amount}',
  'card.used': '累計使用：{amount}',
  'card.month': '本月：{amount}',
  'card.trendBalance': '餘額走勢',
  'card.trendToday': '今日用量走勢',
  'card.trendEmpty': '樣本不足，等待下次輪詢。',
  'card.keys': 'Keys（今日用量前 6）',
  'card.keyUnlimited': '無上限',
  'card.alerts': '告警',
  'card.noAlerts': '目前無告警。',
  'card.setup': 'Provisioning Key（僅存本機瀏覽器，不會上傳 DSH 主機）',
  'card.save': '儲存並測試',
  'card.remove': '清除',
  'card.saveOk': '已儲存，抓取正常。',
  'card.saveBad': 'Key 無效或不完整。',
  'card.saveNet': '無法連線到 openrouter.ai。',
  'card.settingsHint': '輪詢間隔、告警閾值與顯示幣別在 DSH 設定 → OpenRouter 監控。',
  'status.updated': '{time}前更新',
} satisfies Record<string, string>

/** The key union. */
export type MonitorKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'row.balance': 'balance {amount}',
  'row.today': 'today {amount}',
  'row.week': 'week {amount}',
  'row.disabled': 'OpenRouter monitor off',
  'row.noKey': 'OpenRouter: no key (hover to set up)',
  'row.loading': 'OpenRouter: loading…',
  'row.refresh': 'refresh',
  'alert.lowBalance': 'low balance',
  'alert.dailySpend': 'daily spend over limit',
  'alert.keyRemaining': 'key nearly exhausted',
  'card.title': 'OpenRouter monitor',
  'card.account': 'Account',
  'card.credits': 'Credits: {amount}',
  'card.used': 'Used: {amount}',
  'card.month': 'Month: {amount}',
  'card.trendBalance': 'Balance trend',
  'card.trendToday': 'Daily-spend trend',
  'card.trendEmpty': 'Not enough samples yet.',
  'card.keys': 'Keys (top 6 by daily usage)',
  'card.keyUnlimited': 'unlimited',
  'card.alerts': 'Alerts',
  'card.noAlerts': 'No active alerts.',
  'card.setup': 'Provisioning key (stays in this browser only — never sent to the DSH host)',
  'card.save': 'Save & test',
  'card.remove': 'Clear',
  'card.saveOk': 'Saved; polling works.',
  'card.saveBad': 'Key invalid or insufficient.',
  'card.saveNet': 'Cannot reach openrouter.ai.',
  'card.settingsHint': 'Interval, thresholds and display currency live in DSH settings → OpenRouter monitor.',
  'status.updated': 'updated {time} ago',
} satisfies Record<MonitorKey, string>
