# dsh-openrouter-monitor

[English](README.md) | 繁體中文

一個 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 外掛，
在輸入框下加一行：

```
● 餘額 $12.40 · 今日 $0.85 · 本週 $3.20 · 4m
              ⚠ 餘額不足
```

- 即時的 OpenRouter 帳號餘額與今日／本週用量（跨所有 Key 合計）。
- 三種告警閾值——餘額過低、單日花費、單一 Key 額度將盡——讓整行轉橘，並可發送
  瀏覽器通知（邊緣觸發，每個 UTC 日至多一次）。
- 懸浮卡片：帳號總覽、餘額與今日用量的走勢圖、用量前幾名 Key 的剩餘額度條，
  以及本機設定盒。
- 設定整合在 DSH 的設定面板「OpenRouter 監控」：輪詢間隔、告警閾值、顯示幣別
  （含手動匯率）——全部即時生效，不用重啟。

## 安裝

```bash
dsh plugin --profile web add dsh-openrouter-monitor
```

重啟 `dsh web`；確認兩個半邊都掛上：

```bash
dsh --profile web --dump-config | grep openrouter-monitor
```

## 設定

1. 滑鼠停在該行 → 貼上 OpenRouter 的 **Provisioning／Management Key**
   （openrouter.ai/keys 開啟 provisioning 後建立的 `sk-or-v1-…`）。它只存在
   **本機瀏覽器**（localStorage），也只送往 **openrouter.ai**，不會經手 DSH 主機。
   這是刻意的：DSH 的設定通道在瀏覽器端會遮蔽 secret 欄位，把 Key 放進設定文件
   也讀不到。
2. 到 **DSH 設定 → OpenRouter 監控** 調整間隔、閾值與顯示幣別。

一般推理 Key 能通過認證但打 `/keys` 會吃 403，設定盒會標記為不足。沒有 Key 時
該行以暗色提示；輪詢失敗時紅點與最後一次成功數字並存。

## 備註

- 幣別換算是**手動匯率**（`fxRate`）；USD 直通不需設定。主機 schema 會在寫入時
  拒絕「非 USD 但匯率 ≤ 0」，未知幣別代碼一律退回 `$`。
- 走勢歷史在本機保留最近 240 點；重新整理是接著畫，不是從零開始。
- 要讓 AI 分析帳單不必另外寫碼——把懸浮卡片的文字貼進任何 DSH 會話即可。

MIT
