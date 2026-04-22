# Stock Lookup Reuse Guide

這份文件整理的是：

- 右側輸入股票代號
- 按 `加入 / 抓取`
- 讀取對應股票名稱與價格資料
- 成功後加入觀察清單

適合直接套用到其他純前端專案。

## 1. 目標行為

UI 流程：

1. 使用者輸入股票代號，例如 `2330`
2. 按 `加入 / 抓取`
3. 系統抓取資料來源
4. 取得：
   - 股票代號
   - 股票名稱
   - K 線資料
5. 成功後加入右側清單
6. 切換左側主圖到該商品

## 2. HTML 結構

```html
<form id="stockForm" class="stock-form">
  <input id="codeInput" type="text" maxlength="12" placeholder="股票代號，例如 2330" />
  <input id="nameInput" type="text" maxlength="30" placeholder="股票名稱可留空，自動抓取" />
  <button type="submit">加入 / 抓取</button>
</form>

<p id="statusText" class="status-text"></p>
<div id="watchlist" class="watchlist"></div>
```

## 3. 必要狀態

```js
const state = {
  stocks: [],
  rawCandlesByCode: new Map(),
  selectedCode: null,
  loadingCodes: new Set(),
};
```

## 4. 基本 helper

### 4.1 訊息顯示

```js
function setStatus(message, type = "") {
  statusText.textContent = message;
  statusText.className = `status-text${type ? ` ${type}` : ""}`;
}
```

### 4.2 加入或更新股票

```js
function upsertStock(stock) {
  const existing = state.stocks.find((entry) => entry.code === stock.code);
  if (existing) {
    existing.name = stock.name;
  } else {
    state.stocks.push(stock);
  }
  if (!state.selectedCode) state.selectedCode = stock.code;
}
```

## 5. 從 TWSE 取得資料

這個專案目前的做法是：

- 優先走 Cloudflare Worker proxy
- 沒設定 proxy 才退回直連 TWSE

### 5.1 前端設定

```html
<script>
  window.APP_CONFIG = {
    twseProxyBase: "https://your-worker.your-subdomain.workers.dev",
  };
</script>
```

### 5.2 JS 設定

```js
const APP_CONFIG = window.APP_CONFIG || {};
const TWSE_PROXY_BASE =
  typeof APP_CONFIG.twseProxyBase === "string"
    ? APP_CONFIG.twseProxyBase.trim().replace(/\/+$/, "")
    : "";
```

### 5.3 取得月份清單

```js
function getRecentMonthKeysSince(startDateString = "2020-01-01") {
  const keys = [];
  const cursor = new Date();
  cursor.setDate(1);
  const start = new Date(startDateString);
  start.setDate(1);

  while (cursor >= start) {
    keys.push(
      `${cursor.getFullYear()}${String(cursor.getMonth() + 1).padStart(2, "0")}01`,
    );
    cursor.setMonth(cursor.getMonth() - 1);
  }

  return keys;
}
```

### 5.4 資料轉換

```js
function parseTwseDate(value) {
  const [rocYear, month, day] = value.split("/").map(Number);
  if (!rocYear || !month || !day) return null;
  return new Date(rocYear + 1911, month - 1, day).toISOString();
}

function parseNumber(value) {
  if (value == null) return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (!cleaned || cleaned === "--" || cleaned === "---") return null;
  return Number(cleaned);
}

function extractNameFromTitle(title, code) {
  if (!title) return code;
  const cleaned = title.replace(/\s+/g, " ").trim();
  const afterCode = cleaned.split(`${code} `)[1] || "";
  return afterCode.split(" ").find(Boolean) || code;
}
```

### 5.5 取得單月資料

```js
async function fetchTwseMonth(code, dateKey) {
  const directUrl =
    `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateKey}&stockNo=${encodeURIComponent(code)}`;

  const url = TWSE_PROXY_BASE
    ? `${TWSE_PROXY_BASE}/api/twse-stock-day?date=${dateKey}&stockNo=${encodeURIComponent(code)}`
    : directUrl;

  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      if (payload.stat !== "OK") return { title: payload.title || "", rows: [] };

      const rows = (payload.data || [])
        .map((row) => ({
          date: parseTwseDate(row[0]),
          open: parseNumber(row[3]),
          high: parseNumber(row[4]),
          low: parseNumber(row[5]),
          close: parseNumber(row[6]),
          volume: parseNumber(row[1]) ?? 0,
        }))
        .filter((row) =>
          row.date && [row.open, row.high, row.low, row.close].every(Number.isFinite),
        );

      return { title: payload.title || "", rows };
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
    }
  }

  throw lastError ?? new Error("Fetch failed");
}
```

### 5.6 取得整段歷史資料

```js
async function fetchTwseStockData(code) {
  const results = await Promise.all(
    getRecentMonthKeysSince("2020-01-01").map((key) => fetchTwseMonth(code, key)),
  );

  const nameSource = results.find((item) => item.title)?.title || "";
  const candles = results
    .flatMap((item) => item.rows)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const deduped = candles.filter(
    (candle, index, array) => index === 0 || candle.date !== array[index - 1].date,
  );

  if (!deduped.length) throw new Error("No official daily data");

  return {
    code,
    name: extractNameFromTitle(nameSource, code),
    candles: deduped,
  };
}
```

## 6. 加入/抓取的主流程

```js
async function ensureStockData(code, preferredName = "") {
  if (state.loadingCodes.has(code)) return false;

  state.loadingCodes.add(code);
  setStatus(`正在抓取 ${code} 的 TWSE 官方資料...`);

  try {
    const result = await fetchTwseStockData(code);

    upsertStock({
      code: result.code,
      name: preferredName || result.name,
    });

    state.rawCandlesByCode.set(code, result.candles);
    state.selectedCode = code;

    renderWatchlist();
    renderChart();
    setStatus(`已載入 ${result.code} ${preferredName || result.name} 的官方日 K 資料。`, "success");

    return true;
  } catch (error) {
    const suffix = TWSE_PROXY_BASE
      ? "proxy 或官方資料暫時無法取得"
      : "官方資料暫時無法取得，建議設定 proxy";

    setStatus(`${code} 載入失敗：${suffix}。`, "error");
    return false;
  } finally {
    state.loadingCodes.delete(code);
  }
}
```

## 7. 綁定按鈕事件

這是最關鍵的可複用部分：

```js
stockForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const code = codeInput.value.trim();
  const name = nameInput.value.trim();

  if (!code) {
    setStatus("請先輸入股票代號。", "error");
    return;
  }

  const ok = await ensureStockData(code, name);

  if (ok) {
    codeInput.value = "";
    nameInput.value = "";
  }
});
```

這樣就能做到：

- 按下 `加入 / 抓取`
- 成功才加入清單
- 失敗不把錯誤代號殘留在觀察清單

## 8. 清單渲染

```js
function renderWatchlist() {
  watchlistEl.innerHTML = "";

  state.stocks.forEach((stock) => {
    const item = document.createElement("button");
    item.type = "button";
    item.textContent = `${stock.code} ${stock.name}`;

    item.addEventListener("click", async () => {
      state.selectedCode = stock.code;
      renderWatchlist();
      renderChart();

      if (!state.rawCandlesByCode.has(stock.code)) {
        await ensureStockData(stock.code, stock.name);
      }
    });

    watchlistEl.appendChild(item);
  });
}
```

## 9. 套用到其他專案時至少要改的地方

你只需要替換：

1. `renderWatchlist()`
2. `renderChart()`
3. `setStatus()`
4. `stockForm / codeInput / nameInput / watchlistEl` 的 DOM 選取

抓資料核心可直接沿用：

- `getRecentMonthKeysSince()`
- `parseTwseDate()`
- `parseNumber()`
- `extractNameFromTitle()`
- `fetchTwseMonth()`
- `fetchTwseStockData()`
- `ensureStockData()`

## 10. 這個專案對應位置

- 前端輸入表單：
  [index.html](/D:/USB_Data/個人研究/實用分析分類/ChatGPT_個人累積/ChatGPT_Codex_專案資料夾/股票交易策略/Stock_K-chat/index.html)

- 抓取邏輯：
  [app.js](/D:/USB_Data/個人研究/實用分析分類/ChatGPT_個人累積/ChatGPT_Codex_專案資料夾/股票交易策略/Stock_K-chat/app.js)

- Proxy 說明：
  [TWSE_PROXY_REUSE.md](/D:/USB_Data/個人研究/實用分析分類/ChatGPT_個人累積/ChatGPT_Codex_專案資料夾/股票交易策略/Stock_K-chat/TWSE_PROXY_REUSE.md)
