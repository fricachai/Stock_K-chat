# TWSE Proxy Reuse Guide

這份文件整理的是：

- GitHub Pages / 純前端專案
- 需要抓取 TWSE 官方日 K
- 但不想直接在瀏覽器打 TWSE，避免 `Failed to fetch` / CORS 問題

可直接複用到其他專案。

## 1. 架構

不要這樣做：

```js
fetch("https://www.twse.com.tw/exchangeReport/STOCK_DAY?...") 
```

改成：

```text
前端網站 -> Cloudflare Worker Proxy -> TWSE 官方 API
```

## 2. 前端設定

在 HTML 頁首放一段設定：

```html
<script>
  window.APP_CONFIG = {
    twseProxyBase: "https://your-worker.your-subdomain.workers.dev",
  };
</script>
```

如果還沒部署 Worker，可以先留空：

```html
<script>
  window.APP_CONFIG = {
    twseProxyBase: "",
  };
</script>
```

## 3. 前端 JS 寫法

前端讀設定：

```js
const APP_CONFIG = window.APP_CONFIG || {};
const TWSE_PROXY_BASE =
  typeof APP_CONFIG.twseProxyBase === "string"
    ? APP_CONFIG.twseProxyBase.trim().replace(/\/+$/, "")
    : "";
```

抓單月資料時：

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
      return payload;
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

## 4. Cloudflare Worker 程式

其他專案可直接複用這份：

- [cloudflare-worker.js](/D:/USB_Data/個人研究/實用分析分類/ChatGPT_個人累積/ChatGPT_Codex_專案資料夾/股票交易策略/Stock_K-chat/cloudflare-worker.js)

核心版本如下：

```js
export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname !== "/api/twse-stock-day") {
      return new Response("Not Found", { status: 404 });
    }

    const date = url.searchParams.get("date");
    const stockNo = url.searchParams.get("stockNo");

    if (!date || !stockNo) {
      return json({ stat: "ERROR", message: "Missing date or stockNo" }, 400);
    }

    const upstream = new URL("https://www.twse.com.tw/exchangeReport/STOCK_DAY");
    upstream.searchParams.set("response", "json");
    upstream.searchParams.set("date", date);
    upstream.searchParams.set("stockNo", stockNo);

    try {
      const response = await fetch(upstream.toString(), {
        headers: {
          "accept": "application/json,text/plain,*/*",
          "user-agent": "Mozilla/5.0",
          "referer": "https://www.twse.com.tw/",
          "origin": "https://www.twse.com.tw",
        },
        cf: {
          cacheTtl: 300,
          cacheEverything: false,
        },
      });

      const text = await response.text();

      return new Response(text, {
        status: response.status,
        headers: corsJsonHeaders(),
      });
    } catch (error) {
      return json(
        {
          stat: "ERROR",
          message: error instanceof Error ? error.message : "Proxy fetch failed",
        },
        502,
      );
    }
  },
};

function corsJsonHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "*",
    "cache-control": "public, max-age=300",
  };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsJsonHeaders(),
  });
}
```

## 5. 部署步驟

1. 到 Cloudflare `Workers & Pages`
2. `Create application`
3. `Start with Hello World!`
4. 命名 Worker
5. 先 `Deploy`
6. 進 `Edit code`
7. 把預設程式刪掉
8. 貼上 `cloudflare-worker.js`
9. `Deploy`

部署成功後會得到：

```text
https://your-worker.your-subdomain.workers.dev
```

## 6. 驗證方式

直接開這個測試：

```text
https://your-worker.your-subdomain.workers.dev/api/twse-stock-day?date=20260401&stockNo=2330
```

如果看到：

```json
"stat":"OK"
```

就代表 proxy 正常。

## 7. 建議的前端行為

其他專案也建議保留這幾個行為：

- 抓成功才把股票加入清單
- 請求自動重試一次
- proxy 有設定時優先走 proxy
- proxy 沒設定時才退回直連 TWSE
- 抓失敗時顯示：
  - `官方資料暫時無法取得，建議設定 proxy`

## 8. 這個專案目前的對應位置

- 前端設定：
  [index.html](/D:/USB_Data/個人研究/實用分析分類/ChatGPT_個人累積/ChatGPT_Codex_專案資料夾/股票交易策略/Stock_K-chat/index.html)

- 前端抓取邏輯：
  [app.js](/D:/USB_Data/個人研究/實用分析分類/ChatGPT_個人累積/ChatGPT_Codex_專案資料夾/股票交易策略/Stock_K-chat/app.js)

- Worker：
  [cloudflare-worker.js](/D:/USB_Data/個人研究/實用分析分類/ChatGPT_個人累積/ChatGPT_Codex_專案資料夾/股票交易策略/Stock_K-chat/cloudflare-worker.js)
