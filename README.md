# dsh-openrouter-monitor

[English](README.md) | [繁體中文](README.zh.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web plugin that puts
one line under the composer:

```
● 餘額 $12.40 · 今日 $0.85 · 本週 $3.20 · 4m
              ⚠ 餘額不足
```

- **Live OpenRouter account balance** and today/week spend, summed across every key.
- **Alert thresholds** — low balance, daily spend, per-key remaining — tint the row
  orange and can fire browser notifications (edge-triggered, once per UTC day).
- **Hover card**: account totals, balance & daily-spend trend charts, top keys with
  remaining-limit bars, and a local setup box.
- **Configured in DSH settings** under 「OpenRouter 監控」— interval, thresholds,
  display currency with manual FX rate — all live-applied without a restart.

## Install

```bash
dsh plugin --profile web add dsh-openrouter-monitor
```

Restart `dsh web`; confirm both halves:

```bash
dsh --profile web --dump-config | grep openrouter-monitor
```

## Setup

1. Hover the row → paste an **OpenRouter Provisioning/Management key**
   (`sk-or-v1-…`, created on openrouter.ai/keys with provisioning enabled).
   It is stored **in this browser only** (`localStorage`) and sent **only to
   openrouter.ai** — never to the DSH host. This is deliberate: DSH's settings
   wire redacts secret-role fields before they reach any browser, so the key
   could not be usable from settings even if it were stored there.
2. Tune interval / thresholds / currency in **DSH settings → OpenRouter 監控**.

A plain inference key authenticates but gets HTTP 403 on `/keys` — the setup box
labels it insufficient. Without any key the row stays dim with a hint; poll
failures keep the last good numbers alongside a red dot.

## Notes

- Display conversion is by **manual rate only** (`fxRate`); USD passthrough needs
  none. The host schema rejects non-USD currencies with `fxRate ≤ 0` at write time,
  and unknown codes degrade to plain `$`.
- Trend history keeps the latest 240 samples in `localStorage`; reloads continue
  the chart rather than restarting it.
- AI analysis of your bill needs no extra code here — paste the hover card's text
  into any DSH session.

MIT
