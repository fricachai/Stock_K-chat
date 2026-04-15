const canvas = document.getElementById("chartCanvas");
const ctx = canvas.getContext("2d");
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
const loadDemoBtn = document.getElementById("loadDemoBtn");
const timeframeSelect = document.getElementById("timeframeSelect");

const settings = {
  st_period: 6,
  st_multiplier: 0.686,
  cci_len: 20,
  cci_ma_len: 14,
  strict_trend: true,
  enable_early: false,
  use_dynamic: true,
  sens_mult: 1.5,
  early_mult: 0.5,
  static_sens: 30,
  static_early: 10,
  instant_surge: 2,
  instant_drop: 2,
};

const timeframeHours = { "1h": 1, "2h": 2, "3h": 3, "4h": 4, "1d": 24 };
const timeframeLabels = { "1h": "1小時", "2h": "2小時", "3h": "3小時", "4h": "4小時", "1d": "1日" };

const state = {
  stocks: [],
  rawCandlesByCode: new Map(),
  selectedCode: null,
  loadingCodes: new Set(),
  chartView: { visibleCount: 36, priceScale: 1, hoverZone: "", barOffset: 0, panX: 0, panY: 0 },
  chartLayout: null,
  timeframe: "4h",
  dragState: null,
};

function setStatus(message, type = "") {
  statusText.textContent = message;
  statusText.className = `status-text${type ? ` ${type}` : ""}`;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
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
  const cciTr = cciVal.map((value, i) => value == null ? null : Math.abs(value - (cciVal[i - 1] ?? value)));
  const cciAtr = sma(cciTr, 14);
  const buySignals = [];
  const sellSignals = [];
  let lastBuyPrice = null;
  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i];
    if (cciVal[i] == null || cciMa[i] == null) continue;
    const greenTrend = trend[i] === -1;
    const finalSens = settings.use_dynamic ? (cciAtr[i] ?? 0) * settings.sens_mult : settings.static_sens;
    const finalEarly = settings.use_dynamic ? (cciAtr[i] ?? 0) * settings.early_mult : settings.static_early;
    const maxSurge = ((candle.high - candle.open) / candle.open) * 100;
    const maxDrop = ((candle.open - candle.low) / candle.open) * 100;
    const gapUp = cciMa[i] - cciVal[i];
    const gapDown = cciVal[i] - cciMa[i];
    const isUnderMa = gapUp > 0;
    const isOverMa = gapDown > 0;
    const prevCci = cciVal[i - 1];
    const prevCciMa = cciMa[i - 1];
    const prevClose = candles[i - 1]?.close ?? candle.close;
    const isCciRising = cciVal[i] > (prevCci ?? Number.NEGATIVE_INFINITY);
    const isCciFalling = cciVal[i] < (prevCci ?? Number.POSITIVE_INFINITY);
    const gapPrevBuy = (prevCciMa ?? cciMa[i]) - (prevCci ?? cciVal[i]);
    const gapCurrBuy = cciVal[i] - cciMa[i];
    const exactBuyPrice = candle.open + clamp(gapPrevBuy / Math.max(0.0001, gapPrevBuy + gapCurrBuy), 0, 1) * (candle.close - candle.open);
    const gapUpPrev = (prevCciMa ?? cciMa[i]) - (prevCci ?? cciVal[i]);
    const exactEarlyPrice = candle.open + clamp((gapUpPrev - finalEarly) / Math.max(0.0001, gapUpPrev - gapUp), 0, 1) * (candle.close - candle.open);
    const gapPrevSell = (prevCci ?? cciVal[i]) - (prevCciMa ?? cciMa[i]);
    const gapCurrSell = cciMa[i] - cciVal[i];
    const exactSellPrice = candle.open + clamp(gapPrevSell / Math.max(0.0001, gapPrevSell + gapCurrSell), 0, 1) * (candle.close - candle.open);
    const allowBuy = settings.strict_trend ? greenTrend : true;
    const condCciBuy = crossover(cciVal[i], cciMa[i], prevCci, prevCciMa);
    const condCciEarly = settings.enable_early && isUnderMa && gapUp <= finalEarly && candle.close > candle.open && isCciRising;
    const wasOverMa = (prevCci ?? 0) > (prevCciMa ?? 0);
    const condCciReentry = isOverMa && wasOverMa && isCciRising && candle.close > prevClose;
    const isHoldingInitial = lastBuyPrice != null;
    const triggerNewBuy = (condCciBuy || condCciEarly || condCciReentry) && allowBuy && !isHoldingInitial;
    const allowSell = settings.strict_trend ? !greenTrend : true;
    const condCciSell = crossunder(cciVal[i], cciMa[i], prevCci, prevCciMa) && allowSell;
    const primedToCrossDown = isOverMa && gapDown <= finalSens && isCciFalling;
    const allowDumpSell = settings.strict_trend ? !greenTrend : true;
    const condKDump = maxDrop >= settings.instant_drop && primedToCrossDown && allowDumpSell;
    const triggerSellHold = (condCciSell || condKDump) && isHoldingInitial;
    if (triggerSellHold) {
      const execSell = condKDump ? candle.open * (1 - settings.instant_drop / 100) : exactSellPrice;
      sellSignals.push({ index: i, price: execSell, pnl: ((execSell - lastBuyPrice) / lastBuyPrice) * 100, reason: condKDump ? "單根跌破 2%" : "死亡交叉" });
      lastBuyPrice = null;
    }
    if (triggerNewBuy) {
      const execBuy = condCciEarly ? exactEarlyPrice : condCciBuy ? exactBuyPrice : candles[i - 1]?.close ?? candle.close;
      buySignals.push({ index: i, price: execBuy, reason: condCciEarly ? "即將交叉" : condCciBuy ? "黃金交叉" : "接續買點" });
      lastBuyPrice = execBuy;
    }
  }
  return { stValue, trend, cciVal, cciMa, cciAtr, buySignals, sellSignals };
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
    return { effectiveTimeframe, fallback, lastClose: null };
  }
  const computed = computeIndicator(candles);
  const macd = computeMacd(candles);
  const kdj = computeKdj(candles);
  const lastCandle = candles[candles.length - 1];
  const lastCci = computed.cciVal[candles.length - 1];
  const lastCciMa = computed.cciMa[candles.length - 1];
  const isUnderMa = (lastCciMa ?? 0) - (lastCci ?? 0) > 0;
  const isGreenTrend = computed.trend[candles.length - 1] === -1;
  const lastBuyPrice = computed.buySignals.length ? computed.buySignals[computed.buySignals.length - 1].price : null;
  const livePnl = lastBuyPrice == null ? null : ((lastCandle.close - lastBuyPrice) / lastBuyPrice) * 100;
  const liveKChange = ((lastCandle.close - lastCandle.open) / lastCandle.open) * 100;
  const lastCciAtr = computed.cciAtr[candles.length - 1] ?? 0;
  const prevClose = candles[candles.length - 2]?.close ?? lastCandle.close;
  const changeValue = lastCandle.close - prevClose;
  const changePct = prevClose === 0 ? 0 : ((lastCandle.close / prevClose) - 1) * 100;
  const distStr = settings.enable_early ? `< ${round((settings.use_dynamic ? lastCciAtr * settings.early_mult : settings.static_early), 1)} 點` : "已關閉提前預判";
  const priceArea = { x: 42, y: 72, w: 890, h: 350 };
  const xAxisArea = { x: 42, y: 430, w: 890, h: 38 };
  const priceScaleArea = { x: 932, y: 72, w: 78, h: 350 };
  const cciArea = { x: 42, y: 500, w: 968, h: 110 };
  const macdArea = { x: 42, y: 640, w: 968, h: 110 };
  const kdjArea = { x: 42, y: 780, w: 968, h: 100 };
  const infoArea = { x: 1040, y: 90, w: 250, h: 270 };
  state.chartLayout = { priceArea, xAxisArea, priceScaleArea, cciArea, macdArea, kdjArea };
  drawRoundRect(xAxisArea.x, xAxisArea.y, xAxisArea.w, xAxisArea.h, 8, state.chartView.hoverZone === "xAxis" ? "rgba(247,200,67,0.08)" : "rgba(255,255,255,0.03)", state.chartView.hoverZone === "xAxis" ? "rgba(247,200,67,0.4)" : null);
  drawRoundRect(priceScaleArea.x, priceScaleArea.y, priceScaleArea.w, priceScaleArea.h, 8, state.chartView.hoverZone === "priceScale" ? "rgba(41,105,255,0.08)" : "rgba(255,255,255,0.03)", state.chartView.hoverZone === "priceScale" ? "rgba(41,105,255,0.45)" : null);
  drawText(`${stock.name} · ${timeframeLabels[effectiveTimeframe]} · TWSE`, 42, 42, "#f5f6fa", 24);
  drawText(`${stock.code}`, 360, 42, "#f7c843", 20);
  drawText(`${round(changeValue, 2)} (${round(changePct, 2)}%)`, 460, 42, changeValue >= 0 ? "#15d18d" : "#ff5263", 18);
  drawRoundRect(cciArea.x, cciArea.y - 6, cciArea.w, cciArea.h + 12, 10, "rgba(255,255,255,0.015)", null);
  drawRoundRect(macdArea.x, macdArea.y - 6, macdArea.w, macdArea.h + 12, 10, "rgba(255,255,255,0.015)", null);
  drawRoundRect(kdjArea.x, kdjArea.y - 6, kdjArea.w, kdjArea.h + 12, 10, "rgba(255,255,255,0.015)", null);
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
  const visibleJ = kdj.j.slice(startIndex, endIndex);
  const rawMinPrice = Math.min(...visible.map((c) => c.low), ...visibleSt.filter((v) => v != null));
  const rawMaxPrice = Math.max(...visible.map((c) => c.high), ...visibleSt.filter((v) => v != null));
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
  const labelCallouts = [];
  ctx.save();
  ctx.beginPath();
  ctx.rect(priceArea.x, priceArea.y, priceArea.w, priceArea.h);
  ctx.clip();

  visible.forEach((candle, i) => {
    const x = priceArea.x + i * candleWidth + candleWidth / 2 + panX;
    const openY = mapPriceY(candle.open); const closeY = mapPriceY(candle.close); const highY = mapPriceY(candle.high); const lowY = mapPriceY(candle.low);
    const color = candle.close >= candle.open ? "#12c48b" : "#ff5263";
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
    const bg = isBuy ? "#ffe44c" : signal.pnl >= 0 ? "#ff9811" : "#ff5252";
    const fg = isBuy ? "#111317" : "#ffffff";
    const label = isBuy ? `買點\n${signal.reason}\n價:${round(signal.price, 2)}` : `賣點 (${signal.reason})\n價:${round(signal.price, 2)}\n獲利:${round(signal.pnl, 2)}%`;
    const lines = label.split("\n");
    const boxW = 124;
    const boxH = 24 + lines.length * 16;
    const desiredBoxY = isBuy ? y + 72 : y - boxH - 72;
    const boxY = desiredBoxY;
    const boxX = clamp(x - boxW / 2, priceArea.x + 8, priceArea.x + priceArea.w - boxW - 8);
    labelCallouts.push({ boxX, boxY, boxW, boxH, lines, fg, bg, targetX: x, targetY: y, isBuy });
  });
  labelCallouts.forEach((callout) => {
    const anchorX = clamp(callout.targetX, callout.boxX + 18, callout.boxX + callout.boxW - 18);
    const startY = callout.isBuy ? callout.boxY : callout.boxY + callout.boxH;
    const endY = callout.isBuy ? callout.targetY + 14 : callout.targetY - 14;
    ctx.strokeStyle = callout.bg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(anchorX, startY);
    ctx.lineTo(anchorX, endY);
    ctx.stroke();
    ctx.fillStyle = callout.bg;
    ctx.beginPath();
    if (callout.isBuy) {
      ctx.moveTo(anchorX, callout.targetY + 4);
      ctx.lineTo(anchorX - 6, callout.targetY + 16);
      ctx.lineTo(anchorX + 6, callout.targetY + 16);
    } else {
      ctx.moveTo(anchorX, callout.targetY - 4);
      ctx.lineTo(anchorX - 6, callout.targetY - 16);
      ctx.lineTo(anchorX + 6, callout.targetY - 16);
    }
    ctx.closePath();
    ctx.fill();
    drawRoundRect(callout.boxX, callout.boxY, callout.boxW, callout.boxH, 8, callout.bg, null);
    callout.lines.forEach((line, idx) => drawText(line, callout.boxX + callout.boxW / 2, callout.boxY + 18 + idx * 16, callout.fg, 12, "center"));
  });
  ctx.restore();

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
    ctx.fillStyle = value >= 0 ? "rgba(21,209,141,0.65)" : "rgba(255,82,99,0.65)";
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
  const kdjMin = Math.min(0, ...visibleK.filter((v) => v != null), ...visibleD.filter((v) => v != null), ...visibleJ.filter((v) => v != null));
  const kdjMax = Math.max(100, ...visibleK.filter((v) => v != null), ...visibleD.filter((v) => v != null), ...visibleJ.filter((v) => v != null));
  const mapKdjY = (v) => kdjArea.y + ((kdjMax - v) / (kdjMax - kdjMin || 1)) * kdjArea.h;
  ctx.save();
  ctx.beginPath();
  ctx.rect(kdjArea.x, kdjArea.y, kdjArea.w, kdjArea.h);
  ctx.clip();
  [20, 50, 80].forEach((level) => {
    const y = mapKdjY(level);
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(kdjArea.x, y); ctx.lineTo(kdjArea.x + kdjArea.w, y); ctx.stroke(); ctx.setLineDash([]);
  });
  [visibleK, visibleD, visibleJ].forEach((series, idx) => {
    const color = idx === 0 ? "#36b4ff" : idx === 1 ? "#f7c843" : "#ff5e67";
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
  drawText("CCI", cciArea.x, cciArea.y - 12, "#97a0af", 14);
  drawText("MACD", macdArea.x, macdArea.y - 12, "#97a0af", 14);
  drawText("KDJ", kdjArea.x, kdjArea.y - 12, "#97a0af", 14);
  drawRoundRect(infoArea.x, infoArea.y, infoArea.w, infoArea.h, 14, "rgba(19,22,30,0.95)", "#2a3040");
  const rows = [
    ["CCI 狀態", isUnderMa ? "藍在下" : "藍在上", isUnderMa ? "#ff5263" : "#15d18d", isUnderMa ? "#ffffff" : "#111317"],
    ["最新收盤價", round(lastCandle.close, 2), "#111317", "#f7c843"],
    ["當前浮動獲利", livePnl == null ? "未持倉" : `${round(livePnl, 2)}%`, "#111317", livePnl == null ? "#97a0af" : livePnl >= 0 ? "#15d18d" : "#ff5263"],
    ["當下幅度", `${round(liveKChange, 2)}%`, "#111317", liveKChange >= 0 ? "#15d18d" : "#ff5263"],
    ["大趨勢保護", settings.strict_trend ? "已開啟 (安全)" : "已關閉 (危險)", "#111317", settings.strict_trend ? "#15d18d" : "#f7c843"],
    ["當前波段", isGreenTrend ? "多頭" : "空頭", "#111317", isGreenTrend ? "#15d18d" : "#ff5263"],
    ["預判狀態", distStr, "#111317", settings.enable_early ? "#f7c843" : "#97a0af"],
  ];
  rows.forEach((row, i) => {
    const top = infoArea.y + 14 + i * 36;
    drawText(row[0], infoArea.x + 16, top + 16, "#c7cfdb", 13);
    drawRoundRect(infoArea.x + 118, top, 116, 26, 6, row[2], null);
    drawText(String(row[1]), infoArea.x + 176, top + 17, row[3], 13, "center");
  });
  const leftDate = formatDate(visible[0].date);
  const midDate = formatDate(visible[Math.floor((visible.length - 1) / 2)].date);
  const rightDate = formatDate(visible[visible.length - 1].date);
  drawText(leftDate, xAxisArea.x + 4, xAxisArea.y + 24, "#97a0af", 12);
  drawText(midDate, xAxisArea.x + xAxisArea.w / 2, xAxisArea.y + 24, "#97a0af", 12, "center");
  drawText(rightDate, xAxisArea.x + xAxisArea.w - 4, xAxisArea.y + 24, "#97a0af", 12, "right");
  drawText("時間軸: 滾輪縮放", xAxisArea.x + 10, xAxisArea.y + 12, state.chartView.hoverZone === "xAxis" ? "#ffe27a" : "rgba(151,160,175,0.85)", 11);
  drawText("價格軸: 滾輪縮放", priceScaleArea.x + priceScaleArea.w - 6, priceScaleArea.y + priceScaleArea.h + 16, state.chartView.hoverZone === "priceScale" ? "#7ab5ff" : "rgba(151,160,175,0.85)", 11, "right");
  return { effectiveTimeframe, fallback, lastClose: lastCandle.close };
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
      state.selectedCode = stock.code; state.chartView.priceScale = 1; state.chartView.visibleCount = 36; state.chartView.barOffset = 0; state.chartView.panX = 0; state.chartView.panY = 0; renderAll();
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
  closeInfo.textContent = `今日收盤價：${chartResult.lastClose != null ? round(chartResult.lastClose, 2) : "--"}`;
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
function getRecentMonthKeys(count = 8) {
  const keys = [];
  const cursor = new Date(); cursor.setDate(1);
  for (let i = 0; i < count; i += 1) {
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
  const results = await Promise.all(getRecentMonthKeys(8).map((key) => fetchTwseMonth(code, key)));
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
  for (let i = 0; i < 160; i += 1) {
    const date = new Date("2026-01-01T09:00:00");
    date.setHours(date.getHours() + i);
    const drift = Math.sin(i / 7) * 1.4 + (rand() - 0.5) * 4.2;
    const open = price; const close = Math.max(10, open + drift);
    const high = Math.max(open, close) + rand() * 2.2; const low = Math.min(open, close) - rand() * 2.2;
    candles.push({ date: date.toISOString(), open: round(open, 2), high: round(high, 2), low: round(Math.max(1, low), 2), close: round(close, 2), volume: Math.round(3000 + rand() * 6000) });
    price = close + (rand() - 0.5) * 0.9;
  }
  upsertStock({ code, name });
  state.rawCandlesByCode.set(code, candles);
}
function loadDemoData() {
  state.stocks = [];
  state.rawCandlesByCode.clear();
  generateDemoCandles("2330", "台積電", 101, 912);
  generateDemoCandles("1319", "東陽", 207, 96);
  generateDemoCandles("2313", "華通", 509, 225);
  generateDemoCandles("2603", "長榮", 803, 228);
  state.selectedCode = "2330";
  renderAll();
  setStatus("已載入 1 小時示範資料，預設以 4 小時聚合顯示。", "success");
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
  return "";
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
  canvas.style.cursor = zone === "xAxis" ? "ew-resize" : zone === "priceScale" ? "ns-resize" : zone === "priceArea" ? "grab" : "default";
  renderAll();
});
canvas.addEventListener("pointerleave", () => { if (!state.dragState) { state.chartView.hoverZone = ""; canvas.style.cursor = "default"; renderAll(); } });
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
timeframeSelect.addEventListener("change", () => { state.timeframe = timeframeSelect.value; state.chartView.visibleCount = 36; state.chartView.priceScale = 1; state.chartView.barOffset = 0; state.chartView.panX = 0; state.chartView.panY = 0; renderAll(); });
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
loadDemoBtn.addEventListener("click", loadDemoData);
window.addEventListener("resize", () => renderAll());
async function bootstrap() {
  const ok = await ensureStockData("2330", "");
  if (!ok) loadDemoData();
}
bootstrap();
