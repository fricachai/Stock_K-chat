# Stock_K-chat

GitHub Pages 靜態股票觀察面板。

網站：
- [https://fricachai.github.io/Stock_K-chat/](https://fricachai.github.io/Stock_K-chat/)

主要檔案：
- [index.html](/D:/USB_Data/個人研究/實用分析分類/ChatGPT_個人累積/ChatGPT_Codex_專案資料夾/股票交易策略/Stock_K-chat/index.html)
- [styles.css](/D:/USB_Data/個人研究/實用分析分類/ChatGPT_個人累積/ChatGPT_Codex_專案資料夾/股票交易策略/Stock_K-chat/styles.css)
- [app.js](/D:/USB_Data/個人研究/實用分析分類/ChatGPT_個人累積/ChatGPT_Codex_專案資料夾/股票交易策略/Stock_K-chat/app.js)

## 功能

- 左側 K 線主圖
- 下方副圖：`CCI / KD / MACD / 成交量`
- 右側觀察清單
- 匯入觀察清單 CSV
- 匯入 K 線 CSV
- 以 TWSE 官方日 K 為主

## CSV 格式

觀察清單：

```csv
code,name
2330,台積電
2317,鴻海
```

或：

```csv
code
2330
2317
```

K 線：

```csv
code,name,date,open,high,low,close,volume
2330,台積電,2026-04-01T09:00:00,912,918,906,916,12543
2330,台積電,2026-04-01T13:00:00,916,921,910,919,10211
```

## GitHub Pages 部署

1. GitHub repo 進入 `Settings` -> `Pages`
2. `Source` 選 `GitHub Actions`
3. push 到 `main` 後自動部署

## Cloudflare Worker Proxy

GitHub Pages 前端直接抓 TWSE 官方 API，常會遇到：

- `Failed to fetch`
- 某些代號載入失敗
- 瀏覽器跨站限制

專案已提供 Worker 範本：

- [cloudflare-worker.js](/D:/USB_Data/個人研究/實用分析分類/ChatGPT_個人累積/ChatGPT_Codex_專案資料夾/股票交易策略/Stock_K-chat/cloudflare-worker.js)

### 部署步驟

1. 到 Cloudflare Workers 建立一個 Worker
2. 把 `cloudflare-worker.js` 內容貼上
3. 部署後取得網址，例如：

```text
https://your-worker.your-subdomain.workers.dev
```

4. 打開 [index.html](/D:/USB_Data/個人研究/實用分析分類/ChatGPT_個人累積/ChatGPT_Codex_專案資料夾/股票交易策略/Stock_K-chat/index.html)
5. 把頁首這段設定改成你的 Worker 網址：

```html
<script>
  window.APP_CONFIG = {
    twseProxyBase: "https://your-worker.your-subdomain.workers.dev",
  };
</script>
```

設定後，前端會優先呼叫：

```text
https://your-worker.your-subdomain.workers.dev/api/twse-stock-day?date=YYYYMM01&stockNo=2330
```

而不是瀏覽器直接打 TWSE。

## 備註

- 日線優先使用 TWSE 官方資料
- 小時級資料仍以你匯入的 CSV 或聚合資料為主
- 如果 proxy 沒設定，前端會退回直連 TWSE
