const canvas = document.getElementById("chartCanvas");
const ctx = canvas.getContext("2d");
const appShell = document.getElementById("appShell");
const loginGate = document.getElementById("loginGate");
const loginForm = document.getElementById("loginForm");
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const rememberLogin = document.getElementById("rememberLogin");
const loginStatus = document.getElementById("loginStatus");
const logoutButton = document.getElementById("logoutButton");
const chartTitle = document.getElementById("chartTitle");
const closeInfo = document.getElementById("closeInfo");
const watchlistEl = document.getElementById("watchlist");
const stockForm = document.getElementById("stockForm");
const codeInput = document.getElementById("codeInput");
const nameInput = document.getElementById("nameInput");
const searchInput = document.getElementById("searchInput");
const statusText = document.getElementById("statusText");
const watchlistFileInput = document.getElementById("watchlistFileInput");
const priceFileInput = document.getElementById("priceFileInput");
const timeframeSelect = document.getElementById("timeframeSelect");
const authorCard = document.querySelector(".author-card");
const authorBubbles = [...document.querySelectorAll(".author-bubble")];

const settings = {
  st_period: 6,
  st_multiplier: 0.686,
  cci_len: 20,
  cci_ma_len: 14,
};

const AUTH_CONFIG = {
  usernames: ["frica", "jimmy"],
  password: "stock2026",
};

const AUTH_STORAGE_KEY = "stock-k-chat-auth";

const timeframeHours = { "1h": 1, "2h": 2, "3h": 3, "4h": 4, "1d": 24 };
const timeframeLabels = { "1h": "1小時", "2h": "2小時", "3h": "3小時", "4h": "4小時", "1d": "1日" };

const state = {
  stocks: [],
  rawCandlesByCode: new Map(),
  selectedCode: null,
  loadingCodes: new Set(),
  chartView: { visibleCount: 36, priceScale: 1, hoverZone: "", hoverX: null, hoverIndex: null, barOffset: 0, panX: 0, panY: 0 },
  chartLayout: null,
  timeframe: "1d",
  dragState: null,
};

function setStatus(message, type = "") {
  statusText.textContent = message;
  statusText.className = `status-text${type ? ` ${type}` : ""}`;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function rand(min, max) { return Math.random() * (max - min) + min; }
function getAuthStorage(remember) { return remember ? window.localStorage : window.sessionStorage; }
function hasStoredAuth() {
  return window.localStorage.getItem(AUTH_STORAGE_KEY) === "1" || window.sessionStorage.getItem(AUTH_STORAGE_KEY) === "1";
}
function persistAuth(remember) {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  getAuthStorage(remember).setItem(AUTH_STORAGE_KEY, "1");
}
function clearAuth() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
}
function setGateLocked(locked) {
  document.body.classList.toggle("auth-locked", locked);
  appShell.classList.toggle("app-shell--hidden", locked);
  appShell.setAttribute("aria-hidden", locked ? "true" : "false");
  loginGate.classList.toggle("login-gate--hidden", !locked);
}
function setLoginStatus(message, type = "") {
  loginStatus.textContent = message;
  loginStatus.className = `login-status${type ? ` ${type}` : ""}`;
}
function getDefaultVisibleCount(timeframe, candleCount = 0) {
  if (timeframe === "1d") return clamp(candleCount || 240, 20, 260);
  return 36;
}
function resetChartView(code = state.selectedCode) {
  const { candles } = aggregateCandles(state.rawCandlesByCode.get(code) || [], state.timeframe);
  state.chartView.visibleCount = getDefaultVisibleCount(state.timeframe, candles.length);
  state.chartView.priceScale = 1;
  state.chartView.barOffset = 0;
  state.chartView.panX = 0;
  state.chartView.panY = 0;
}
function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
function formatCompactVolume(value) {
  if (!Number.isFinite(value)) return "--";
  if (Math.abs(value) >= 10000) return `${round(value / 10000, 2)}萬`;
  return `${Math.round(value)}`;
}
function drawValueTag(x, y, text, bg = "rgba(101, 112, 145, 0.95)", color = "#f3f6ff", minWidth = 58) {
  ctx.font = `12px "Segoe UI", "Noto Sans TC", sans-serif`;
  const paddingX = 10;
  const width = Math.max(minWidth, ctx.measureText(text).width + paddingX * 2);
  drawRoundRect(x, y - 12, width, 24, 10, bg, null);
  drawText(text, x + width / 2, y + 5, color, 12, "center");
  return width;
}
function getAuthorBorderPoint(width, height) {
  const margin = 10;
  const side = Math.floor(Math.random() * 4);
  if (side === 0) return { x: rand(12, width - 12), y: -margin };
  if (side === 1) return { x: width + margin, y: rand(10, height - 10) };
  if (side === 2) return { x: rand(12, width - 12), y: height + margin };
  return { x: -margin, y: rand(10, height - 10) };
}
function randomBubbleGradient() {
  const palettes = [
    ["#fff8bd", "#ff91d9"],
    ["#fff6b8", "#ffc989"],
    ["#f8ffff", "#9adfff"],
    ["#fff6d8", "#cda6ff"],
    ["#fff4ad", "#ff94c9"],
  ];
  const [a, b] = palettes[Math.floor(Math.random() * palettes.length)];
  return `radial-gradient(circle at 34% 34%, ${a}, ${b} 56%, rgba(255,255,255,0.08) 78%, transparent 80%)`;
}
function animateAuthorBubble(bubble) {
  if (!authorCard || !bubble) return;
  const width = authorCard.offsetWidth;
  const height = authorCard.offsetHeight;
  if (!width || !height) return;
  const start = getAuthorBorderPoint(width, height);
  const end = getAuthorBorderPoint(width, height);
  const size = rand(4, 12);
  const duration = rand(2200, 7600);
  const driftX = rand(-8, 8);
  const driftY = rand(-8, 8);
  bubble.style.width = `${size}px`;
  bubble.style.height = `${size}px`;
  bubble.style.background = randomBubbleGradient();
  bubble.style.boxShadow = `0 0 ${Math.round(size + 4)}px rgba(255,255,255,0.42)`;
  bubble.style.transform = `translate(${start.x}px, ${start.y}px)`;
  bubble.getAnimations().forEach((anim) => anim.cancel());
  const animation = bubble.animate(
    [
      { transform: `translate(${start.x}px, ${start.y}px) scale(${rand(0.7, 1.1)})`, opacity: rand(0.35, 0.9) },
      { transform: `translate(${(start.x + end.x) / 2 + driftX}px, ${(start.y + end.y) / 2 + driftY}px) scale(${rand(0.9, 1.35)})`, opacity: rand(0.45, 1) },
      { transform: `translate(${end.x}px, ${end.y}px) scale(${rand(0.55, 1.05)})`, opacity: rand(0.2, 0.75) },
    ],
    { duration, easing: "ease-in-out", fill: "forwards" },
  );
  animation.onfinish = () => {
    setTimeout(() => animateAuthorBubble(bubble), rand(120, 900));
  };
}
function initAuthorCardEffects() {
  if (!authorCard || !authorBubbles.length) return;
  authorBubbles.forEach((bubble, index) => {
    setTimeout(() => animateAuthorBubble(bubble), index * 180);
  });
}
function sma(values, length) {
  const result = Array(values.length).fill(null);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] != null) { sum += values[i]; count += 1; }
    if (i >= length && values[i - length] != null) { sum -= values[i - length]; count -= 1; }
    if (i >= length - 1 && count > 0) result[i] = sum / count;
  }
  return result;
}
function ema(values, length) {
  const result = Array(values.length).fill(null);
  const alpha = 2 / (length + 1);
  let prev = null;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value == null) continue;
    prev = prev == null ? value : value * alpha + prev * (1 - alpha);
    result[i] = prev;
  }
  return result;
}
function cci(candles, length) {
  const typical = candles.map((c) => (c.high + c.low + c.close) / 3);
  const result = Array(candles.length).fill(null);
  for (let i = length - 1; i < candles.length; i += 1) {
    const slice = typical.slice(i - length + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / length;
    const md = slice.reduce((acc, val) => acc + Math.abs(val - mean), 0) / length || 0.0001;
    result[i] = (typical[i] - mean) / (0.015 * md);
  }
  return result;
}
function trueRange(candles) {
  return candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const prevClose = candles[index - 1].close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - prevClose), Math.abs(candle.low - prevClose));
  });
}
function atr(candles, length) { return sma(trueRange(candles), length); }
function supertrend(candles, multiplier, period) {
  const atrValues = atr(candles, period);
  const upperBand = Array(candles.length).fill(null);
  const lowerBand = Array(candles.length).fill(null);
  const finalUpper = Array(candles.length).fill(null);
  const finalLower = Array(candles.length).fill(null);
  const trend = Array(candles.length).fill(null);
  const stValue = Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i += 1) {
    if (atrValues[i] == null) continue;
    const hl2 = (candles[i].high + candles[i].low) / 2;
    upperBand[i] = hl2 + multiplier * atrValues[i];
    lowerBand[i] = hl2 - multiplier * atrValues[i];
    if (i === 0 || finalUpper[i - 1] == null) {
      finalUpper[i] = upperBand[i]; finalLower[i] = lowerBand[i]; trend[i] = -1; stValue[i] = lowerBand[i]; continue;
    }
    finalUpper[i] = upperBand[i] < finalUpper[i - 1] || candles[i - 1].close > finalUpper[i - 1] ? upperBand[i] : finalUpper[i - 1];
    finalLower[i] = lowerBand[i] > finalLower[i - 1] || candles[i - 1].close < finalLower[i - 1] ? lowerBand[i] : finalLower[i - 1];
    trend[i] = stValue[i - 1] === finalUpper[i - 1] ? (candles[i].close <= finalUpper[i] ? 1 : -1) : (candles[i].close >= finalLower[i] ? -1 : 1);
    stValue[i] = trend[i] === -1 ? finalLower[i] : finalUpper[i];
  }
  return { stValue, trend };
}
function computeMacd(candles) {
  const closes = candles.map((c) => c.close);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const dif = closes.map((_, i) => (ema12[i] != null && ema26[i] != null ? ema12[i] - ema26[i] : null));
  const dea = ema(dif, 9);
  const hist = dif.map((value, i) => (value != null && dea[i] != null ? (value - dea[i]) * 2 : null));
  return { dif, dea, hist };
}
function computeKdj(candles) {
  const k = Array(candles.length).fill(null);
  const d = Array(candles.length).fill(null);
  const j = Array(candles.length).fill(null);
  let prevK = 50;
  let prevD = 50;
  for (let i = 0; i < candles.length; i += 1) {
    const start = Math.max(0, i - 8);
    const slice = candles.slice(start, i + 1);
    const highest = Math.max(...slice.map((c) => c.high));
    const lowest = Math.min(...slice.map((c) => c.low));
    const rsv = highest === lowest ? 50 : ((candles[i].close - lowest) / (highest - lowest)) * 100;
    const currentK = (2 / 3) * prevK + (1 / 3) * rsv;
    const currentD = (2 / 3) * prevD + (1 / 3) * currentK;
    const currentJ = 3 * currentK - 2 * currentD;
    k[i] = currentK; d[i] = currentD; j[i] = currentJ; prevK = currentK; prevD = currentD;
  }
  return { k, d, j };
}
function crossover(a1, a2, prev1, prev2) { return prev1 != null && prev2 != null && a1 != null && a2 != null && prev1 <= prev2 && a1 > a2; }
function crossunder(a1, a2, prev1, prev2) { return prev1 != null && prev2 != null && a1 != null && a2 != null && prev1 >= prev2 && a1 < a2; }
function computeIndicator(candles) {
  const { stValue, trend } = supertrend(candles, settings.st_multiplier, settings.st_period);
  const cciVal = cci(candles, settings.cci_len);
  const cciMa = sma(cciVal, settings.cci_ma_len);
  const buySignals = [];
  const sellSignals = [];
  let lastBuyPrice = null;
  let positionState = null;
  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i];
    if (cciVal[i] == null || cciMa[i] == null) continue;
    const prevCci = cciVal[i - 1];
    const prevCciMa = cciMa[i - 1];
    const condCciBuy = crossover(cciVal[i], cciMa[i], prevCci, prevCciMa);
    const condCciSell = crossunder(cciVal[i], cciMa[i], prevCci, prevCciMa);
    const canBuy = positionState !== "long";
    const canSell = positionState !== "flat";
    const triggerNewBuy = condCciBuy && canBuy;
    const triggerSellHold = condCciSell && canSell;
    if (triggerSellHold) {
      const execSell = candle.close;
      const pnl = lastBuyPrice == null ? null : ((execSell - lastBuyPrice) / lastBuyPrice) * 100;
      sellSignals.push({ index: i, price: execSell, pnl, reason: "死亡交叉" });
      lastBuyPrice = null;
      positionState = "flat";
    }
    if (triggerNewBuy) {
      const execBuy = candle.close;
      buySignals.push({ index: i, price: execBuy, reason: "黃金交叉" });
      lastBuyPrice = execBuy;
      positionState = "long";
    }
  }
  return { stValue, trend, cciVal, cciMa, cciAtr: Array(candles.length).fill(null), buySignals, sellSignals };
}
function drawText(text, x, y, color = "#f5f6fa", size = 14, align = "left") {
  ctx.fillStyle = color;
  ctx.font = `${size}px "Segoe UI", "Noto Sans TC", sans-serif`;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}
function drawRoundRect(x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatMonthAxisDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getAxisLabelIndices(candles) {
  const groups = new Map();
  candles.forEach((candle, index) => {
    const d = new Date(candle.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const list = groups.get(key) ?? [];
    list.push({ index, day: d.getDate(), date: candle.date });
    groups.set(key, list);
  });
  const picked = [];
  for (const list of groups.values()) {
    if (!list.length) continue;
    picked.push(list[0].index);
    let mid = list.find((item) => item.day >= 13 && item.day <= 17);
    if (!mid) {
      mid = list.reduce((best, item) => {
        if (!best) return item;
        return Math.abs(item.day - 15) < Math.abs(best.day - 15) ? item : best;
      }, null);
    }
    if (mid && mid.index !== list[0].index) picked.push(mid.index);
  }
  return picked.sort((a, b) => a - b);
}
function getNativeIntervalHours(candles) {
  if (candles.length < 2) return 24;
  let minDiff = Number.POSITIVE_INFINITY;
  for (let i = 1; i < candles.length; i += 1) {
    const diff = (new Date(candles[i].date) - new Date(candles[i - 1].date)) / 3600000;
    if (diff > 0 && diff < minDiff) minDiff = diff;
  }
  return Number.isFinite(minDiff) ? minDiff : 24;
}
function aggregateCandles(rawCandles, timeframe) {
  if (!rawCandles.length) return { candles: [], effectiveTimeframe: timeframe, fallback: false };
  const targetHours = timeframeHours[timeframe] ?? 4;
  const nativeHours = getNativeIntervalHours(rawCandles);
  if (nativeHours > targetHours) return { candles: rawCandles, effectiveTimeframe: nativeHours >= 24 ? "1d" : timeframe, fallback: true };
  if (nativeHours === targetHours) return { candles: rawCandles, effectiveTimeframe: timeframe, fallback: false };
  const buckets = [];
  let current = null;
  rawCandles.forEach((candle) => {
    const date = new Date(candle.date);
    const bucketHour = targetHours >= 24 ? 0 : Math.floor(date.getHours() / targetHours) * targetHours;
    const bucketKey = targetHours >= 24 ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${bucketHour}`;
    if (!current || current.key !== bucketKey) {
      current = { key: bucketKey, date: candle.date, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume };
      buckets.push(current);
    } else {
      current.high = Math.max(current.high, candle.high);
      current.low = Math.min(current.low, candle.low);
      current.close = candle.close;
      current.volume += candle.volume;
    }
  });
  return { candles: buckets.map(({ key, ...rest }) => rest), effectiveTimeframe: timeframe, fallback: false };
}
function getDisplayCandles(code) {
  return aggregateCandles(state.rawCandlesByCode.get(code) || [], state.timeframe);
}
function renderChart(stock) {
  const { candles, effectiveTimeframe, fallback } = getDisplayCandles(stock.code);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawRoundRect(0, 0, canvas.width, canvas.height, 18, "#0b0c10", "#1f2330");
  if (!candles.length) {
    drawText("尚未載入這支股票的 K 線資料", 60, 120, "#f5f6fa", 28);
    drawText("請匯入 `code,name,date,open,high,low,close,volume` 格式 CSV", 60, 160, "#97a0af", 18);
    state.chartLayout = null;
    return { effectiveTimeframe, fallback, lastClose: null, summaryLine: "尚未載入資料" };
  }
  const computed = computeIndicator(candles);
  const macd = computeMacd(candles);
  const kdj = computeKdj(candles);
  const closes = candles.map((candle) => candle.close);
  const sma5 = sma(closes, 5);
  const sma20 = sma(closes, 20);
  const sma60 = sma(closes, 60);
  const lastCandle = candles[candles.length - 1];
  const lastCci = computed.cciVal[candles.length - 1];
  const lastCciMa = computed.cciMa[candles.length - 1];
  const isUnderMa = (lastCciMa ?? 0) - (lastCci ?? 0) > 0;
  const isGreenTrend = computed.trend[candles.length - 1] === -1;
  const lastBuyPrice = computed.buySignals.length ? computed.buySignals[computed.buySignals.length - 1].price : null;
  const livePnl = lastBuyPrice == null ? null : ((lastCandle.close - lastBuyPrice) / lastBuyPrice) * 100;
  const liveKChange = ((lastCandle.close - lastCandle.open) / lastCandle.open) * 100;
  const prevClose = candles[candles.length - 2]?.close ?? lastCandle.close;
  const changeValue = lastCandle.close - prevClose;
  const changePct = prevClose === 0 ? 0 : ((lastCandle.close / prevClose) - 1) * 100;
  const holdingState = computed.buySignals.length > computed.sellSignals.length ? "持有中" : "未持倉";
  const cciLabel = isUnderMa ? "藍在下" : "藍在上";
  const cumulativePnl = lastBuyPrice == null ? null : ((lastCandle.close - lastBuyPrice) / lastBuyPrice) * 100;
  const priceArea = { x: 46, y: 46, w: 1168, h: 392 };
  const xAxisArea = { x: 46, y: 446, w: 1168, h: 38 };
  const priceScaleArea = { x: 1214, y: 46, w: 64, h: 392 };
  const cciArea = { x: 46, y: 518, w: 1232, h: 104 };
  const kdjArea = { x: 46, y: 648, w: 1232, h: 104 };
  const macdArea = { x: 46, y: 778, w: 1232, h: 104 };
  const volumeArea = { x: 46, y: 908, w: 1232, h: 100 };
  state.chartLayout = { priceArea, xAxisArea, priceScaleArea, cciArea, kdjArea, macdArea, volumeArea };
  drawRoundRect(xAxisArea.x, xAxisArea.y, xAxisArea.w, xAxisArea.h, 8, state.chartView.hoverZone === "xAxis" ? "rgba(247,200,67,0.08)" : "rgba(255,255,255,0.03)", state.chartView.hoverZone === "xAxis" ? "rgba(247,200,67,0.4)" : null);
  drawRoundRect(priceScaleArea.x, priceScaleArea.y, priceScaleArea.w, priceScaleArea.h, 8, state.chartView.hoverZone === "priceScale" ? "rgba(41,105,255,0.08)" : "rgba(255,255,255,0.03)", state.chartView.hoverZone === "priceScale" ? "rgba(41,105,255,0.45)" : null);
  drawRoundRect(cciArea.x, cciArea.y - 6, cciArea.w, cciArea.h + 12, 10, "rgba(255,255,255,0.015)", null);
  drawRoundRect(kdjArea.x, kdjArea.y - 6, kdjArea.w, kdjArea.h + 12, 10, "rgba(255,255,255,0.015)", null);
  drawRoundRect(macdArea.x, macdArea.y - 6, macdArea.w, macdArea.h + 12, 10, "rgba(255,255,255,0.015)", null);
  drawRoundRect(volumeArea.x, volumeArea.y - 6, volumeArea.w, volumeArea.h + 12, 10, "rgba(255,255,255,0.015)", null);
  const visibleCount = clamp(state.chartView.visibleCount, 20, Math.min(220, candles.length));
  state.chartView.visibleCount = visibleCount;
  const maxBarOffset = Math.max(0, candles.length - visibleCount);
  state.chartView.barOffset = clamp(state.chartView.barOffset, 0, maxBarOffset);
  const startIndex = Math.max(0, candles.length - visibleCount - state.chartView.barOffset);
  const endIndex = startIndex + visibleCount;
  const visible = candles.slice(startIndex, endIndex);
  const offset = startIndex;
  const visibleSt = computed.stValue.slice(startIndex, endIndex);
  const visibleCci = computed.cciVal.slice(startIndex, endIndex);
  const visibleCciMa = computed.cciMa.slice(startIndex, endIndex);
  const visibleMacdHist = macd.hist.slice(startIndex, endIndex);
  const visibleMacdDif = macd.dif.slice(startIndex, endIndex);
  const visibleMacdDea = macd.dea.slice(startIndex, endIndex);
  const visibleK = kdj.k.slice(startIndex, endIndex);
  const visibleD = kdj.d.slice(startIndex, endIndex);
  const visibleSma5 = sma5.slice(startIndex, endIndex);
  const visibleSma20 = sma20.slice(startIndex, endIndex);
  const visibleSma60 = sma60.slice(startIndex, endIndex);
  const visibleVolume = visible.map((c) => c.volume ?? 0);
  const rawMinPrice = Math.min(
    ...visible.map((c) => c.low),
    ...visibleSt.filter((v) => v != null),
    ...visibleSma5.filter((v) => v != null),
    ...visibleSma20.filter((v) => v != null),
    ...visibleSma60.filter((v) => v != null),
  );
  const rawMaxPrice = Math.max(
    ...visible.map((c) => c.high),
    ...visibleSt.filter((v) => v != null),
    ...visibleSma5.filter((v) => v != null),
    ...visibleSma20.filter((v) => v != null),
    ...visibleSma60.filter((v) => v != null),
  );
  const rawMidBase = (rawMinPrice + rawMaxPrice) / 2;
  const rawHalfRange = Math.max((rawMaxPrice - rawMinPrice) / 2, rawMidBase * 0.01);
  const scaledHalfRange = rawHalfRange * state.chartView.priceScale;
  const baseMinPrice = rawMidBase - scaledHalfRange;
  const baseMaxPrice = rawMidBase + scaledHalfRange;
  const visiblePriceRange = baseMaxPrice - baseMinPrice || 1;
  const verticalPriceShift = (state.chartView.panY / priceArea.h) * visiblePriceRange;
  const minPrice = baseMinPrice + verticalPriceShift;
  const maxPrice = baseMaxPrice + verticalPriceShift;
  const mapPriceY = (price) => priceArea.y + ((maxPrice - price) / (maxPrice - minPrice || 1)) * priceArea.h;
  for (let i = 0; i <= 6; i += 1) {
    const y = priceArea.y + (priceArea.h / 6) * i;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath(); ctx.moveTo(priceArea.x, y); ctx.lineTo(priceScaleArea.x + priceScaleArea.w, y); ctx.stroke();
  }
  for (let i = 0; i <= 5; i += 1) {
    const price = maxPrice - ((maxPrice - minPrice) / 5) * i;
    const y = priceArea.y + (priceArea.h / 5) * i;
    drawText((round(price, 2) ?? price).toFixed(2), priceScaleArea.x + priceScaleArea.w - 8, y + 4, "#c8d0dd", 12, "right");
  }
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath(); ctx.moveTo(priceScaleArea.x, priceArea.y); ctx.lineTo(priceScaleArea.x, priceArea.y + priceArea.h); ctx.stroke();
  const candleWidth = priceArea.w / visible.length;
  const panX = state.chartView.panX;
  const leftBound = priceArea.x + panX;
  const rightBound = priceArea.x + priceArea.w + panX;
  let hoverLocalIndex = null;
  let hoverCandleX = null;
  let hoveredCandle = null;
  if (state.chartView.hoverX != null && state.chartView.hoverX >= leftBound && state.chartView.hoverX <= rightBound) {
    const rawIndex = Math.round((state.chartView.hoverX - priceArea.x - panX - candleWidth / 2) / candleWidth);
    hoverLocalIndex = clamp(rawIndex, 0, visible.length - 1);
    hoverCandleX = priceArea.x + hoverLocalIndex * candleWidth + candleWidth / 2 + panX;
    hoveredCandle = visible[hoverLocalIndex];
    state.chartView.hoverIndex = offset + hoverLocalIndex;
  } else {
    state.chartView.hoverIndex = null;
  }
  const labelCallouts = [];
  ctx.save();
  ctx.beginPath();
  ctx.rect(priceArea.x, priceArea.y, priceArea.w, priceArea.h);
  ctx.clip();

  [
    { series: visibleSma5, color: "#2fb6ff", width: 2.4 },
    { series: visibleSma20, color: "#f7c843", width: 2.4 },
    { series: visibleSma60, color: "#ff6278", width: 2.4 },
  ].forEach(({ series, color, width }) => {
    series.forEach((value, i) => {
      if (value == null || i === 0 || series[i - 1] == null) return;
      const prevX = priceArea.x + (i - 1) * candleWidth + candleWidth / 2 + panX;
      const x = priceArea.x + i * candleWidth + candleWidth / 2 + panX;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(prevX, mapPriceY(series[i - 1]));
      ctx.lineTo(x, mapPriceY(value));
      ctx.stroke();
    });
  });

  visible.forEach((candle, i) => {
    const x = priceArea.x + i * candleWidth + candleWidth / 2 + panX;
    const openY = mapPriceY(candle.open); const closeY = mapPriceY(candle.close); const highY = mapPriceY(candle.high); const lowY = mapPriceY(candle.low);
    const color = candle.close >= candle.open ? "#ff3b30" : "#00c853";
    ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, highY); ctx.lineTo(x, lowY); ctx.stroke();
    ctx.fillStyle = color; ctx.fillRect(x - candleWidth * 0.3, Math.min(openY, closeY), candleWidth * 0.6, Math.max(2, Math.abs(closeY - openY)));
    const st = visibleSt[i];
    if (st != null && i > 0 && visibleSt[i - 1] != null) {
      const prevX = priceArea.x + (i - 1) * candleWidth + candleWidth / 2 + panX;
      ctx.strokeStyle = computed.trend[offset + i] === -1 ? "#00e08a" : "#ff5e67";
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(prevX, mapPriceY(visibleSt[i - 1])); ctx.lineTo(x, mapPriceY(st)); ctx.stroke();
    }
  });
  [...computed.buySignals, ...computed.sellSignals].filter((signal) => signal.index >= offset && signal.index < endIndex).forEach((signal) => {
    const localIndex = signal.index - offset;
    const x = priceArea.x + localIndex * candleWidth + candleWidth / 2 + panX;
    const y = mapPriceY(signal.price);
    const isBuy = !Object.prototype.hasOwnProperty.call(signal, "pnl");
    const bg = "rgba(255, 152, 17, 0.96)";
    const fg = "#26190c";
    const dateText = formatDate(visible[localIndex].date).slice(5);
    const metricText = isBuy ? `價 ${round(signal.price, 2)}` : `${signal.pnl == null ? "-" : `${round(signal.pnl, 2)}%`}`;
    const label = `${dateText} ${isBuy ? "買點" : "賣點"} ${metricText}`;
    ctx.font = `12px "Segoe UI", "Noto Sans TC", sans-serif`;
    const boxW = Math.max(116, ctx.measureText(label).width + 22);
    const boxH = 28;
    const desiredBoxY = isBuy ? y + 82 : y - boxH - 82;
    const boxY = desiredBoxY;
    const boxX = clamp(x - boxW / 2, priceArea.x + 8, priceArea.x + priceArea.w - boxW - 8);
    labelCallouts.push({ boxX, boxY, boxW, boxH, label, fg, bg, targetX: x, targetY: y, isBuy });
  });
  const occupiedBoxes = [];
  labelCallouts
    .sort((a, b) => (a.isBuy === b.isBuy ? a.targetX - b.targetX : a.isBuy ? 1 : -1))
    .forEach((callout) => {
    const direction = callout.isBuy ? 1 : -1;
    let adjustedY = callout.boxY;
    for (let attempts = 0; attempts < 8; attempts += 1) {
      const overlaps = occupiedBoxes.some((box) => !(
        callout.boxX + callout.boxW < box.x ||
        callout.boxX > box.x + box.w ||
        adjustedY + callout.boxH < box.y ||
        adjustedY > box.y + box.h
      ));
      if (!overlaps) break;
      adjustedY += direction * 34;
    }
    if (callout.isBuy) {
      adjustedY = Math.min(adjustedY, priceArea.y + priceArea.h - callout.boxH - 10);
    } else {
      adjustedY = Math.max(adjustedY, priceArea.y + 10);
    }
    callout.boxY = adjustedY;
    occupiedBoxes.push({ x: callout.boxX, y: callout.boxY, w: callout.boxW, h: callout.boxH });

    const anchorX = clamp(callout.targetX, callout.boxX + 18, callout.boxX + callout.boxW - 18);
    const startY = callout.isBuy ? callout.boxY : callout.boxY + callout.boxH;
    const endY = callout.isBuy ? callout.targetY + 18 : callout.targetY - 18;
    ctx.strokeStyle = callout.bg;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(anchorX, startY);
    ctx.lineTo(anchorX, endY);
    ctx.stroke();
    drawRoundRect(callout.boxX, callout.boxY, callout.boxW, callout.boxH, 14, callout.bg, null);
    drawText(callout.label, callout.boxX + callout.boxW / 2, callout.boxY + 19, callout.fg, 12, "center");
  });
  ctx.restore();
  drawText("SMA5", priceArea.x + 10, priceArea.y + 18, "#62c8ff", 12);
  drawText("SMA20", priceArea.x + 76, priceArea.y + 18, "#f7c843", 12);
  drawText("SMA60", priceArea.x + 154, priceArea.y + 18, "#ff7b8a", 12);

  const cciMin = Math.min(-100, ...visibleCci.filter((v) => v != null), ...visibleCciMa.filter((v) => v != null));
  const cciMax = Math.max(100, ...visibleCci.filter((v) => v != null), ...visibleCciMa.filter((v) => v != null));
  const mapCciY = (v) => cciArea.y + ((cciMax - v) / (cciMax - cciMin || 1)) * cciArea.h;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cciArea.x, cciArea.y, cciArea.w, cciArea.h);
  ctx.clip();
  [-100, 0, 100].forEach((level) => {
    const y = mapCciY(level);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(cciArea.x, y);
    ctx.lineTo(cciArea.x + cciArea.w, y);
    ctx.stroke();
    ctx.setLineDash([]);
  });
  [visibleCci, visibleCciMa].forEach((series, idx) => {
    series.forEach((value, i) => {
      if (value == null) return;
      if (i > 0 && series[i - 1] != null) {
        const prevX = cciArea.x + (i - 1) * candleWidth + candleWidth / 2 + panX;
        const x = cciArea.x + i * candleWidth + candleWidth / 2 + panX;
        ctx.strokeStyle = idx === 0 ? "#2d73ff" : "#f7c843";
        ctx.lineWidth = idx === 0 ? 2.5 : 2;
        ctx.beginPath();
        ctx.moveTo(prevX, mapCciY(series[i - 1]));
        ctx.lineTo(x, mapCciY(value));
        ctx.stroke();
      }
    });
  });
  ctx.restore();
  const kdjMin = Math.min(0, ...visibleK.filter((v) => v != null), ...visibleD.filter((v) => v != null));
  const kdjMax = Math.max(100, ...visibleK.filter((v) => v != null), ...visibleD.filter((v) => v != null));
  const mapKdjY = (v) => kdjArea.y + ((kdjMax - v) / (kdjMax - kdjMin || 1)) * kdjArea.h;
  ctx.save();
  ctx.beginPath();
  ctx.rect(kdjArea.x, kdjArea.y, kdjArea.w, kdjArea.h);
  ctx.clip();
  [20, 50, 80].forEach((level) => {
    const y = mapKdjY(level);
    ctx.strokeStyle = level === 50 ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.42)";
    ctx.lineWidth = level === 50 ? 1 : 1.35;
    ctx.setLineDash(level === 50 ? [5, 7] : [8, 6]);
    ctx.beginPath();
    ctx.moveTo(kdjArea.x, y);
    ctx.lineTo(kdjArea.x + kdjArea.w, y);
    ctx.stroke();
    ctx.setLineDash([]);
  });
  [visibleK, visibleD].forEach((series, idx) => {
    const color = idx === 0 ? "#36b4ff" : "#f7c843";
    series.forEach((value, i) => {
      if (value == null) return;
      if (i > 0 && series[i - 1] != null) {
        const prevX = kdjArea.x + (i - 1) * candleWidth + candleWidth / 2 + panX;
        const x = kdjArea.x + i * candleWidth + candleWidth / 2 + panX;
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(prevX, mapKdjY(series[i - 1])); ctx.lineTo(x, mapKdjY(value)); ctx.stroke();
      }
    });
  });
  ctx.restore();
  const macdMin = Math.min(-1, ...visibleMacdHist.filter((v) => v != null), ...visibleMacdDif.filter((v) => v != null), ...visibleMacdDea.filter((v) => v != null));
  const macdMax = Math.max(1, ...visibleMacdHist.filter((v) => v != null), ...visibleMacdDif.filter((v) => v != null), ...visibleMacdDea.filter((v) => v != null));
  const mapMacdY = (v) => macdArea.y + ((macdMax - v) / (macdMax - macdMin || 1)) * macdArea.h;
  const macdZeroY = mapMacdY(0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(macdArea.x, macdArea.y, macdArea.w, macdArea.h);
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath(); ctx.moveTo(macdArea.x, macdZeroY); ctx.lineTo(macdArea.x + macdArea.w, macdZeroY); ctx.stroke();
  visibleMacdHist.forEach((value, i) => {
    if (value == null) return;
    const x = macdArea.x + i * candleWidth + candleWidth / 2 + panX;
    const y = mapMacdY(value);
    ctx.fillStyle = value >= 0 ? "rgba(255,59,48,0.82)" : "rgba(0,200,83,0.82)";
    ctx.fillRect(x - candleWidth * 0.32, Math.min(y, macdZeroY), candleWidth * 0.64, Math.abs(macdZeroY - y));
  });
  [visibleMacdDif, visibleMacdDea].forEach((series, idx) => {
    series.forEach((value, i) => {
      if (value == null) return;
      if (i > 0 && series[i - 1] != null) {
        const prevX = macdArea.x + (i - 1) * candleWidth + candleWidth / 2 + panX;
        const x = macdArea.x + i * candleWidth + candleWidth / 2 + panX;
        ctx.strokeStyle = idx === 0 ? "#2d73ff" : "#ff9f1a";
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(prevX, mapMacdY(series[i - 1])); ctx.lineTo(x, mapMacdY(value)); ctx.stroke();
      }
    });
  });
  ctx.restore();
  const volumeMax = Math.max(1, ...visibleVolume);
  const mapVolumeY = (v) => volumeArea.y + volumeArea.h - (v / volumeMax) * volumeArea.h;
  ctx.save();
  ctx.beginPath();
  ctx.rect(volumeArea.x, volumeArea.y, volumeArea.w, volumeArea.h);
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  for (let i = 0; i <= 2; i += 1) {
    const y = volumeArea.y + (volumeArea.h / 2) * i;
    ctx.beginPath();
    ctx.moveTo(volumeArea.x, y);
    ctx.lineTo(volumeArea.x + volumeArea.w, y);
    ctx.stroke();
  }
  visible.forEach((candle, i) => {
    const x = volumeArea.x + i * candleWidth + candleWidth / 2 + panX;
    const y = mapVolumeY(candle.volume ?? 0);
    ctx.fillStyle = candle.close >= candle.open ? "rgba(255,59,48,0.8)" : "rgba(0,200,83,0.8)";
    ctx.fillRect(x - candleWidth * 0.32, y, candleWidth * 0.64, volumeArea.y + volumeArea.h - y);
  });
  ctx.restore();
  const infoIndex = hoverLocalIndex ?? (visible.length - 1);
  const infoCci = visibleCci[infoIndex];
  const infoCciMa = visibleCciMa[infoIndex];
  const infoK = visibleK[infoIndex];
  const infoD = visibleD[infoIndex];
  const infoDif = visibleMacdDif[infoIndex];
  const infoDea = visibleMacdDea[infoIndex];
  const infoHist = visibleMacdHist[infoIndex];
  const infoVolume = visibleVolume[infoIndex];
  drawText(`CCI ${round(infoCci ?? 0, 2)} MA ${round(infoCciMa ?? 0, 2)}`, cciArea.x, cciArea.y - 12, "#97a0af", 14);
  drawText(`KD K ${round(infoK ?? 0, 2)} D ${round(infoD ?? 0, 2)}`, kdjArea.x, kdjArea.y - 12, "#97a0af", 14);
  drawText(`MACD DIF ${round(infoDif ?? 0, 2)} DEA ${round(infoDea ?? 0, 2)} HIST ${round(infoHist ?? 0, 2)}`, macdArea.x, macdArea.y - 12, "#97a0af", 14);
  drawText(`成交量 ${formatCompactVolume(infoVolume)}`, volumeArea.x, volumeArea.y - 12, "#97a0af", 14);
  if (hoverCandleX != null && hoveredCandle) {
    const lineLeft = priceArea.x;
    const lineRight = xAxisArea.x + xAxisArea.w;
    const lineX = clamp(hoverCandleX, lineLeft, lineRight);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(lineX, priceArea.y);
    ctx.lineTo(lineX, volumeArea.y + volumeArea.h);
    ctx.stroke();
    ctx.setLineDash([]);

    const closeY = mapPriceY(hoveredCandle.close);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(priceArea.x, closeY);
    ctx.lineTo(priceScaleArea.x + priceScaleArea.w, closeY);
    ctx.stroke();
    ctx.setLineDash([]);

    const priceTag = (round(hoveredCandle.close, 2) ?? hoveredCandle.close).toFixed(2);
    drawValueTag(priceScaleArea.x + 4, closeY, priceTag);

    const xTagText = formatDate(hoveredCandle.date);
    const tagX = clamp(lineX - 52, xAxisArea.x + 4, xAxisArea.x + xAxisArea.w - 108);
    drawValueTag(tagX, xAxisArea.y + 18, xTagText, "rgba(95,108,160,0.92)", "#f3f6ff", 104);

    drawValueTag(cciArea.x + cciArea.w - 58, mapCciY(infoCci ?? 0), `${round(infoCci ?? 0, 2)}`, "rgba(45,115,255,0.96)");
    drawValueTag(cciArea.x + cciArea.w - 126, mapCciY(infoCciMa ?? 0), `${round(infoCciMa ?? 0, 2)}`, "rgba(247,200,67,0.96)", "#111317");
    drawValueTag(kdjArea.x + kdjArea.w - 58, mapKdjY(infoK ?? 0), `${round(infoK ?? 0, 2)}`, "rgba(54,180,255,0.96)");
    drawValueTag(kdjArea.x + kdjArea.w - 126, mapKdjY(infoD ?? 0), `${round(infoD ?? 0, 2)}`, "rgba(247,200,67,0.96)", "#111317");
    drawValueTag(macdArea.x + macdArea.w - 58, mapMacdY(infoDif ?? 0), `${round(infoDif ?? 0, 2)}`, "rgba(45,115,255,0.96)");
    drawValueTag(macdArea.x + macdArea.w - 126, mapMacdY(infoDea ?? 0), `${round(infoDea ?? 0, 2)}`, "rgba(255,159,26,0.96)", "#111317");
    drawValueTag(volumeArea.x + volumeArea.w - 82, mapVolumeY(infoVolume), formatCompactVolume(infoVolume), "rgba(115,125,160,0.96)", "#f3f6ff", 78);
  }
  const axisIndices = getAxisLabelIndices(visible);
  axisIndices.forEach((idx) => {
    const candle = visible[idx];
    const x = xAxisArea.x + idx * candleWidth + candleWidth / 2 + panX;
    if (x < xAxisArea.x + 28 || x > xAxisArea.x + xAxisArea.w - 28) return;
    drawText(formatMonthAxisDate(candle.date), x, xAxisArea.y + 24, "#97a0af", 12, "center");
  });

  return {
    effectiveTimeframe,
    fallback,
    lastClose: lastCandle.close,
    summaryPrefix: `收盤價：${round(lastCandle.close, 2)} | ${round(changeValue, 2)} (${round(changePct, 2)}%) | 買點：藍線下往上穿黃線 | 賣點：藍線上往下穿黃線`,
    summaryHighlight: `${holdingState} | 累計損益 ${cumulativePnl == null ? "--" : `${round(cumulativePnl, 2)}%`} | CCI：${cciLabel}`,
  };
}
function renderWatchlist() {
  const keyword = searchInput.value.trim().toLowerCase();
  watchlistEl.innerHTML = "";
  state.stocks.filter((stock) => !keyword || stock.code.toLowerCase().includes(keyword) || stock.name.toLowerCase().includes(keyword)).forEach((stock) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `watch-item ${stock.code === state.selectedCode ? "active" : ""}`;
    item.innerHTML = `<span class="watch-code">${stock.code}</span><span class="watch-name">${stock.name}</span>`;
    item.addEventListener("click", async () => {
      state.selectedCode = stock.code; resetChartView(stock.code); renderAll();
      if (!state.rawCandlesByCode.has(stock.code)) await ensureStockData(stock.code, stock.name);
    });
    watchlistEl.appendChild(item);
  });
}
function renderAll() {
  const stock = state.stocks.find((entry) => entry.code === state.selectedCode) || state.stocks[0];
  if (!stock) return;
  state.selectedCode = stock.code;
  renderWatchlist();
  const chartResult = renderChart(stock);
  chartTitle.textContent = `${stock.code} ${stock.name}`;
  closeInfo.innerHTML = chartResult.summaryPrefix
    ? `${chartResult.summaryPrefix} <span class="close-info-highlight">${chartResult.summaryHighlight}</span>`
    : `今日收盤價：${chartResult.lastClose != null ? round(chartResult.lastClose, 2) : "--"}`;
  if (chartResult.fallback && state.timeframe !== "1d") {
    setStatus(`目前官方 TWSE 資料只有日 K，${stock.code} 已自動改用 1日顯示。`, "error");
  }
}
function upsertStock(stock) {
  const existing = state.stocks.find((entry) => entry.code === stock.code);
  if (existing) existing.name = stock.name; else state.stocks.push(stock);
  if (!state.selectedCode) state.selectedCode = stock.code;
}
function parseCsv(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(",").map((cell) => cell.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((cell) => cell.trim());
    return Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""]));
  });
}
function getRecentMonthKeysSince(startDateString = "2020-01-01") {
  const keys = [];
  const cursor = new Date();
  cursor.setDate(1);
  const start = new Date(startDateString);
  start.setDate(1);
  while (cursor >= start) {
    keys.push(`${cursor.getFullYear()}${String(cursor.getMonth() + 1).padStart(2, "0")}01`);
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return keys;
}
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
async function fetchTwseMonth(code, dateKey) {
  const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateKey}&stockNo=${encodeURIComponent(code)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.stat !== "OK") return { title: payload.title || "", rows: [] };
  const rows = (payload.data || []).map((row) => ({ date: parseTwseDate(row[0]), open: parseNumber(row[3]), high: parseNumber(row[4]), low: parseNumber(row[5]), close: parseNumber(row[6]), volume: parseNumber(row[1]) ?? 0 })).filter((row) => row.date && [row.open, row.high, row.low, row.close].every(Number.isFinite));
  return { title: payload.title || "", rows };
}
async function fetchTwseStockData(code) {
  const results = await Promise.all(getRecentMonthKeysSince("2020-01-01").map((key) => fetchTwseMonth(code, key)));
  const nameSource = results.find((item) => item.title)?.title || "";
  const candles = results.flatMap((item) => item.rows).sort((a, b) => new Date(a.date) - new Date(b.date));
  const deduped = candles.filter((candle, index, array) => index === 0 || candle.date !== array[index - 1].date);
  if (!deduped.length) throw new Error("No official daily data");
  return { code, name: extractNameFromTitle(nameSource, code), candles: deduped };
}
async function ensureStockData(code, preferredName = "") {
  if (state.loadingCodes.has(code)) return false;
  state.loadingCodes.add(code);
  setStatus(`正在抓取 ${code} 的 TWSE 官方資料...`);
  try {
    const result = await fetchTwseStockData(code);
    upsertStock({ code: result.code, name: preferredName || result.name });
    state.rawCandlesByCode.set(code, result.candles);
    state.selectedCode = code;
    resetChartView(code);
    renderAll();
    if (state.timeframe === "1d") setStatus(`已載入 ${result.code} ${preferredName || result.name} 的官方日 K 資料。`, "success");
    return true;
  } catch (error) {
    if (preferredName) { upsertStock({ code, name: preferredName }); renderAll(); }
    setStatus(`${code} 載入失敗：${error.message}`, "error");
    return false;
  } finally {
    state.loadingCodes.delete(code);
  }
}
async function loadWatchlistRows(rows) {
  rows.forEach((row) => { if (!row.code) return; upsertStock({ code: row.code, name: row.name || row.code }); });
  renderAll();
  for (const row of rows) {
    if (!row.code) continue;
    if (!state.rawCandlesByCode.has(row.code)) await ensureStockData(row.code, row.name || "");
  }
}
function loadPriceRows(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    if (!row.code || !row.date) return;
    const code = row.code;
    const list = grouped.get(code) ?? [];
    list.push({ date: row.date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume || 0) });
    grouped.set(code, list);
    if (row.name) upsertStock({ code, name: row.name });
  });
  grouped.forEach((candles, code) => {
    candles.sort((a, b) => new Date(a.date) - new Date(b.date));
    state.rawCandlesByCode.set(code, candles.filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite)));
  });
  if (!state.selectedCode && grouped.size) state.selectedCode = [...grouped.keys()][0];
  renderAll();
}
function readFile(file, callback) {
  const reader = new FileReader();
  reader.onload = () => callback(String(reader.result));
  reader.readAsText(file, "utf-8");
}
function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => { value = (value * 16807) % 2147483647; return (value - 1) / 2147483646; };
}
function generateDemoCandles(code, name, seed, startPrice) {
  const rand = seededRandom(seed);
  const candles = [];
  let price = startPrice;
  const startDate = new Date("2020-01-01T00:00:00");
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);
  let index = 0;
  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    const day = date.getDay();
    if (day === 0 || day === 6) continue;
    const candleDate = new Date(date);
    const drift = Math.sin(index / 7) * 1.4 + (rand() - 0.5) * 4.2;
    const open = price; const close = Math.max(10, open + drift);
    const high = Math.max(open, close) + rand() * 2.2; const low = Math.min(open, close) - rand() * 2.2;
    candles.push({ date: candleDate.toISOString(), open: round(open, 2), high: round(high, 2), low: round(Math.max(1, low), 2), close: round(close, 2), volume: Math.round(3000 + rand() * 6000) });
    price = close + (rand() - 0.5) * 0.9;
    index += 1;
  }
  upsertStock({ code, name });
  state.rawCandlesByCode.set(code, candles);
}
function loadDemoData() {
  state.stocks = [];
  state.rawCandlesByCode.clear();
  state.timeframe = "1d";
  timeframeSelect.value = "1d";
  generateDemoCandles("2330", "台積電", 101, 912);
  generateDemoCandles("1319", "東陽", 207, 96);
  generateDemoCandles("2313", "華通", 509, 225);
  generateDemoCandles("2603", "長榮", 803, 228);
  state.selectedCode = "2330";
  resetChartView("2330");
  renderAll();
  setStatus("官方資料載入失敗，已改用從 2020-01-01 開始的示範日 K 資料。", "success");
}
function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: ((event.clientX - rect.left) / rect.width) * canvas.width, y: ((event.clientY - rect.top) / rect.height) * canvas.height };
}
function detectChartZone(point) {
  const layout = state.chartLayout;
  if (!layout) return "";
  const inBox = (box) => point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
  if (inBox(layout.priceArea)) return "priceArea";
  if (inBox(layout.xAxisArea)) return "xAxis";
  if (inBox(layout.priceScaleArea)) return "priceScale";
  if (inBox(layout.cciArea) || inBox(layout.kdjArea) || inBox(layout.macdArea) || inBox(layout.volumeArea)) return "indicatorArea";
  return "";
}
function updateHoverCrosshair(point) {
  const layout = state.chartLayout;
  if (!layout) {
    state.chartView.hoverX = null;
    state.chartView.hoverIndex = null;
    return;
  }
  const left = layout.priceArea.x;
  const right = layout.xAxisArea.x + layout.xAxisArea.w;
  const top = layout.priceArea.y;
  const bottom = layout.volumeArea.y + layout.volumeArea.h;
  if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) {
    state.chartView.hoverX = point.x;
  } else {
    state.chartView.hoverX = null;
    state.chartView.hoverIndex = null;
  }
}
canvas.addEventListener("wheel", (event) => {
  const zone = detectChartZone(getCanvasPoint(event));
  if (!zone) return;
  event.preventDefault();
  const zoomIn = event.deltaY < 0;
  if (zone === "xAxis") state.chartView.visibleCount = clamp(state.chartView.visibleCount + (zoomIn ? -8 : 8), 20, 220);
  if (zone === "priceScale") state.chartView.priceScale = clamp(state.chartView.priceScale + (zoomIn ? -0.1 : 0.1), 0.5, 3);
  renderAll();
}, { passive: false });
canvas.addEventListener("pointermove", (event) => {
  const point = getCanvasPoint(event);
  if (state.dragState) {
    event.preventDefault();
    updateHoverCrosshair(point);
    const dx = point.x - state.dragState.startX;
    const dy = point.y - state.dragState.startY;
    const step = Math.max(6, state.dragState.candleWidth);
    let nextBarOffset = state.dragState.startBarOffset;
    let nextPanX = state.dragState.startPanX + dx;
    while (nextPanX >= step && nextBarOffset < state.dragState.maxBarOffset) {
      nextBarOffset += 1;
      nextPanX -= step;
    }
    while (nextPanX <= -step && nextBarOffset > 0) {
      nextBarOffset -= 1;
      nextPanX += step;
    }
    if (nextBarOffset === 0) nextPanX = Math.max(nextPanX, -step * 0.35);
    if (nextBarOffset === state.dragState.maxBarOffset) nextPanX = Math.min(nextPanX, step * 0.35);
    state.chartView.barOffset = clamp(nextBarOffset, 0, state.dragState.maxBarOffset);
    state.chartView.panX = clamp(nextPanX, -step * 0.95, step * 0.95);
    state.chartView.panY = clamp(state.dragState.startPanY + dy, -state.dragState.priceAreaHeight * 2.2, state.dragState.priceAreaHeight * 2.2);
    canvas.style.cursor = "grabbing";
    renderAll();
    return;
  }
  const zone = detectChartZone(point);
  state.chartView.hoverZone = zone;
  updateHoverCrosshair(point);
  canvas.style.cursor = zone === "xAxis" ? "ew-resize" : zone === "priceScale" ? "ns-resize" : zone === "priceArea" ? "grab" : zone === "indicatorArea" ? "crosshair" : "default";
  renderAll();
});
canvas.addEventListener("pointerleave", () => { if (!state.dragState) { state.chartView.hoverZone = ""; state.chartView.hoverX = null; canvas.style.cursor = "default"; renderAll(); } });
canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const point = getCanvasPoint(event);
  const zone = detectChartZone(point);
  if (zone !== "priceArea" || !state.chartLayout) return;
  event.preventDefault();
  const { candles } = getDisplayCandles(state.selectedCode);
  const visibleCount = clamp(state.chartView.visibleCount, 20, Math.min(220, candles.length));
  state.dragState = {
    pointerId: event.pointerId,
    startX: point.x,
    startY: point.y,
    startBarOffset: state.chartView.barOffset,
    startPanX: state.chartView.panX,
    startPanY: state.chartView.panY,
    candleWidth: state.chartLayout.priceArea.w / visibleCount,
    maxBarOffset: Math.max(0, candles.length - visibleCount),
    priceAreaHeight: state.chartLayout.priceArea.h,
  };
  state.chartView.hoverZone = "priceArea";
  canvas.setPointerCapture(event.pointerId);
  canvas.style.cursor = "grabbing";
});
const clearDragState = (event) => {
  if (state.dragState && event?.pointerId != null && state.dragState.pointerId !== event.pointerId) return;
  if (state.dragState && event?.pointerId != null && canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  state.dragState = null;
  canvas.style.cursor = state.chartView.hoverZone === "priceArea" ? "grab" : "default";
};
canvas.addEventListener("pointerup", clearDragState);
canvas.addEventListener("pointercancel", clearDragState);
timeframeSelect.addEventListener("change", () => { state.timeframe = timeframeSelect.value; resetChartView(state.selectedCode); renderAll(); });
stockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = codeInput.value.trim();
  const name = nameInput.value.trim();
  if (!code) return setStatus("請先輸入股票代號。", "error");
  upsertStock({ code, name: name || code }); codeInput.value = ""; nameInput.value = ""; renderAll(); await ensureStockData(code, name);
});
searchInput.addEventListener("input", renderWatchlist);
watchlistFileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0]; if (!file) return;
  readFile(file, (text) => loadWatchlistRows(parseCsv(text))); event.target.value = "";
});
priceFileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0]; if (!file) return;
  readFile(file, (text) => { loadPriceRows(parseCsv(text)); setStatus("已匯入本地 K 線 CSV。", "success"); }); event.target.value = "";
});
window.addEventListener("resize", () => renderAll());
async function bootstrap() {
  if (bootstrap.started) return;
  bootstrap.started = true;
  initAuthorCardEffects();
  upsertStock({ code: "2330", name: "台積電" });
  state.selectedCode = "2330";
  renderAll();
  const ok = await ensureStockData("2330", "");
  if (!ok) loadDemoData();
}
bootstrap.started = false;

function handleLoginSubmit(event) {
  event.preventDefault();
  const username = loginUsername.value.trim();
  const password = loginPassword.value;
  if (!AUTH_CONFIG.usernames.includes(username) || password !== AUTH_CONFIG.password) {
    setLoginStatus("帳號或密碼錯誤。", "error");
    loginPassword.value = "";
    loginPassword.focus();
    return;
  }
  persistAuth(rememberLogin.checked);
  setLoginStatus("登入成功。");
  setGateLocked(false);
  bootstrap();
}

function handleLogout() {
  clearAuth();
  bootstrap.started = false;
  setGateLocked(true);
  setLoginStatus("請先登入後再進入面板。");
  loginPassword.value = "";
  loginUsername.focus();
}

loginForm.addEventListener("submit", handleLoginSubmit);
logoutButton.addEventListener("click", handleLogout);

if (hasStoredAuth()) {
  setGateLocked(false);
  bootstrap();
} else {
  setGateLocked(true);
  setLoginStatus("請先登入後再進入面板。");
}
