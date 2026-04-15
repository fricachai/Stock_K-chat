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

const state = {
  stocks: [],
  candlesByCode: new Map(),
  selectedCode: null,
  loadingCodes: new Set(),
  chartView: {
    visibleCount: 60,
    priceScale: 1,
  },
  chartLayout: null,
};

function setStatus(message, type = "") {
  statusText.textContent = message;
  statusText.className = `status-text${type ? ` ${type}` : ""}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

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
    if (values[i] != null) {
      sum += values[i];
      count += 1;
    }
    if (i >= length && values[i - length] != null) {
      sum -= values[i - length];
      count -= 1;
    }
    if (i >= length - 1 && count > 0) result[i] = sum / count;
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
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - prevClose),
      Math.abs(candle.low - prevClose),
    );
  });
}

function atr(candles, length) {
  return sma(trueRange(candles), length);
}

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
      finalUpper[i] = upperBand[i];
      finalLower[i] = lowerBand[i];
      trend[i] = -1;
      stValue[i] = lowerBand[i];
      continue;
    }

    finalUpper[i] =
      upperBand[i] < finalUpper[i - 1] || candles[i - 1].close > finalUpper[i - 1]
        ? upperBand[i]
        : finalUpper[i - 1];

    finalLower[i] =
      lowerBand[i] > finalLower[i - 1] || candles[i - 1].close < finalLower[i - 1]
        ? lowerBand[i]
        : finalLower[i - 1];

    if (stValue[i - 1] === finalUpper[i - 1]) {
      trend[i] = candles[i].close <= finalUpper[i] ? 1 : -1;
    } else {
      trend[i] = candles[i].close >= finalLower[i] ? -1 : 1;
    }

    stValue[i] = trend[i] === -1 ? finalLower[i] : finalUpper[i];
  }

  return { stValue, trend };
}

function crossover(a1, a2, prev1, prev2) {
  return prev1 != null && prev2 != null && a1 != null && a2 != null && prev1 <= prev2 && a1 > a2;
}

function crossunder(a1, a2, prev1, prev2) {
  return prev1 != null && prev2 != null && a1 != null && a2 != null && prev1 >= prev2 && a1 < a2;
}

function computeIndicator(candles) {
  const { stValue, trend } = supertrend(candles, settings.st_multiplier, settings.st_period);
  const cciVal = cci(candles, settings.cci_len);
  const cciMa = sma(cciVal, settings.cci_ma_len);
  const cciTr = cciVal.map((value, i) => {
    if (value == null) return null;
    const prev = cciVal[i - 1] ?? value;
    return Math.abs(value - prev);
  });
  const cciAtr = sma(cciTr, 14);

  let lastBuyPrice = null;
  const buySignals = [];
  const sellSignals = [];
  const livePnlHistory = [];

  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i];
    const greenTrend = trend[i] === -1;
    const finalSens = settings.use_dynamic ? (cciAtr[i] ?? 0) * settings.sens_mult : settings.static_sens;
    const finalEarly = settings.use_dynamic ? (cciAtr[i] ?? 0) * settings.early_mult : settings.static_early;
    const maxDrop = ((candle.open - candle.low) / candle.open) * 100;
    const gapUp = (cciMa[i] ?? 0) - (cciVal[i] ?? 0);
    const gapDown = (cciVal[i] ?? 0) - (cciMa[i] ?? 0);
    const isUnderMa = gapUp > 0;
    const isOverMa = gapDown > 0;
    const isCciRising = (cciVal[i] ?? 0) > (cciVal[i - 1] ?? Number.NEGATIVE_INFINITY);
    const isCciFalling = (cciVal[i] ?? 0) < (cciVal[i - 1] ?? Number.POSITIVE_INFINITY);
    const isHolding = lastBuyPrice != null;

    const gapPrevBuy = (cciMa[i - 1] ?? 0) - (cciVal[i - 1] ?? 0);
    const gapCurrBuy = (cciVal[i] ?? 0) - (cciMa[i] ?? 0);
    let tCrossUp = gapPrevBuy / Math.max(0.0001, gapPrevBuy + gapCurrBuy);
    tCrossUp = clamp(tCrossUp, 0, 1);
    const exactBuyPrice = candle.open + tCrossUp * (candle.close - candle.open);

    const gapUpPrev = (cciMa[i - 1] ?? 0) - (cciVal[i - 1] ?? 0);
    let tEarly = (gapUpPrev - finalEarly) / Math.max(0.0001, gapUpPrev - gapUp);
    tEarly = clamp(tEarly, 0, 1);
    const exactEarlyPrice = candle.open + tEarly * (candle.close - candle.open);

    const gapPrevSell = (cciVal[i - 1] ?? 0) - (cciMa[i - 1] ?? 0);
    const gapCurrSell = (cciMa[i] ?? 0) - (cciVal[i] ?? 0);
    let tCrossDown = gapPrevSell / Math.max(0.0001, gapPrevSell + gapCurrSell);
    tCrossDown = clamp(tCrossDown, 0, 1);
    const exactSellPrice = candle.open + tCrossDown * (candle.close - candle.open);

    const condCciBuy = crossover(cciVal[i], cciMa[i], cciVal[i - 1], cciMa[i - 1]);
    const condCciEarly = settings.enable_early && isUnderMa && gapUp <= finalEarly && candle.close > candle.open && isCciRising;
    const wasOverMa = (cciVal[i - 1] ?? 0) > (cciMa[i - 1] ?? 0);
    const condCciReentry = isOverMa && wasOverMa && isCciRising && candle.close > (candles[i - 1]?.close ?? candle.close);
    const triggerNewBuy = (condCciBuy || condCciEarly || condCciReentry) && (settings.strict_trend ? greenTrend : true) && !isHolding;

    const condCciSell = crossunder(cciVal[i], cciMa[i], cciVal[i - 1], cciMa[i - 1]) && (settings.strict_trend ? !greenTrend : true);
    const primedToCrossDown = isOverMa && gapDown <= finalSens && isCciFalling;
    const condKDump = maxDrop >= settings.instant_drop && primedToCrossDown && (settings.strict_trend ? !greenTrend : true);
    const triggerSellHold = (condCciSell || condKDump) && isHolding;

    if (triggerSellHold) {
      const execSell = condKDump ? candle.open * (1 - settings.instant_drop / 100) : exactSellPrice;
      const finalPnl = ((execSell - lastBuyPrice) / lastBuyPrice) * 100;
      sellSignals.push({ index: i, price: execSell, pnl: finalPnl, reason: condKDump ? "單根跌破 2%" : "死亡交叉" });
      lastBuyPrice = null;
    }

    if (triggerNewBuy) {
      const execBuy = condCciEarly ? exactEarlyPrice : condCciBuy ? exactBuyPrice : candles[i - 1]?.close ?? candle.close;
      buySignals.push({ index: i, price: execBuy, reason: condCciEarly ? "即將交叉" : condCciBuy ? "黃金交叉" : "接續買點" });
      lastBuyPrice = execBuy;
    }

    livePnlHistory.push(lastBuyPrice == null ? null : ((candle.close - lastBuyPrice) / lastBuyPrice) * 100);
  }

  return { stValue, trend, cciVal, cciMa, cciAtr, buySignals, sellSignals, livePnlHistory, lastBuyPrice };
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
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function renderChart(stock) {
  const candles = state.candlesByCode.get(stock.code) || [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawRoundRect(0, 0, canvas.width, canvas.height, 18, "#0b0c10", "#1f2330");

  if (!candles.length) {
    drawText("尚未載入這支股票的 K 線資料", 60, 120, "#f5f6fa", 28);
    drawText("請匯入 `code,name,date,open,high,low,close,volume` 格式 CSV", 60, 160, "#97a0af", 18);
    state.chartLayout = null;
    return;
  }

  const computed = computeIndicator(candles);
  const lastCandle = candles[candles.length - 1];
  const lastCci = computed.cciVal[candles.length - 1];
  const lastCciMa = computed.cciMa[candles.length - 1];
  const isUnderMa = (lastCciMa ?? 0) - (lastCci ?? 0) > 0;
  const isGreenTrend = computed.trend[candles.length - 1] === -1;
  const lastBuyPrice = computed.lastBuyPrice;
  const livePnl = lastBuyPrice == null ? null : ((lastCandle.close - lastBuyPrice) / lastBuyPrice) * 100;
  const liveKChange = ((lastCandle.close - lastCandle.open) / lastCandle.open) * 100;
  const lastCciAtr = computed.cciAtr[candles.length - 1] ?? 0;
  const prevClose = candles[candles.length - 2]?.close ?? lastCandle.close;
  const changeValue = lastCandle.close - prevClose;
  const changePct = prevClose === 0 ? 0 : ((lastCandle.close / prevClose) - 1) * 100;
  const distStr = settings.enable_early ? `< ${round((settings.use_dynamic ? lastCciAtr * settings.early_mult : settings.static_early), 1)} 點` : "已關閉提前預判";

  const priceArea = { x: 40, y: 72, w: 890, h: 430 };
  const xAxisArea = { x: 40, y: 502, w: 890, h: 30 };
  const priceScaleArea = { x: 930, y: 72, w: 66, h: 430 };
  const cciArea = { x: 40, y: 544, w: 956, h: 130 };
  const pnlArea = { x: 40, y: 700, w: 956, h: 110 };
  const infoArea = { x: 965, y: 90, w: 300, h: 270 };
  state.chartLayout = { priceArea, xAxisArea, priceScaleArea };

  drawText(`${stock.name} · 日線 · TWSE`, 40, 42, "#f5f6fa", 24);
  drawText(`${stock.code}`, 360, 42, "#f7c843", 20);
  drawText(`${round(changeValue, 2)} (${round(changePct, 2)}%)`, 460, 42, changeValue >= 0 ? "#15d18d" : "#ff5263", 18);

  const visibleCount = clamp(state.chartView.visibleCount, 20, Math.min(180, candles.length));
  state.chartView.visibleCount = visibleCount;
  const visible = candles.slice(-visibleCount);
  const offset = candles.length - visible.length;
  const visibleSt = computed.stValue.slice(-visibleCount);
  const visibleCci = computed.cciVal.slice(-visibleCount);
  const visibleCciMa = computed.cciMa.slice(-visibleCount);
  const visiblePnl = computed.livePnlHistory.slice(-visibleCount);

  const rawMinPrice = Math.min(...visible.map((c) => c.low), ...visibleSt.filter((v) => v != null));
  const rawMaxPrice = Math.max(...visible.map((c) => c.high), ...visibleSt.filter((v) => v != null));
  const rawMidPrice = (rawMinPrice + rawMaxPrice) / 2;
  const rawHalfRange = Math.max((rawMaxPrice - rawMinPrice) / 2, rawMidPrice * 0.01);
  const scaledHalfRange = rawHalfRange * state.chartView.priceScale;
  const minPrice = rawMidPrice - scaledHalfRange;
  const maxPrice = rawMidPrice + scaledHalfRange;
  const minCci = Math.min(-100, ...visibleCci.filter((v) => v != null), ...visibleCciMa.filter((v) => v != null));
  const maxCci = Math.max(100, ...visibleCci.filter((v) => v != null), ...visibleCciMa.filter((v) => v != null));
  const minPnl = Math.min(-10, ...visiblePnl.filter((v) => v != null));
  const maxPnl = Math.max(10, ...visiblePnl.filter((v) => v != null));
  const mapPriceY = (price) => priceArea.y + ((maxPrice - price) / (maxPrice - minPrice || 1)) * priceArea.h;

  drawRoundRect(xAxisArea.x, xAxisArea.y, xAxisArea.w, xAxisArea.h, 8, "rgba(255,255,255,0.03)", null);
  drawRoundRect(priceScaleArea.x, priceScaleArea.y, priceScaleArea.w, priceScaleArea.h, 8, "rgba(255,255,255,0.03)", null);

  for (let i = 0; i <= 6; i += 1) {
    const y = priceArea.y + (priceArea.h / 6) * i;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(priceArea.x, y);
    ctx.lineTo(priceScaleArea.x + priceScaleArea.w, y);
    ctx.stroke();
  }

  for (let i = 0; i <= 5; i += 1) {
    const price = maxPrice - ((maxPrice - minPrice) / 5) * i;
    const y = priceArea.y + (priceArea.h / 5) * i;
    drawText((round(price, 2) ?? price).toFixed(2), priceScaleArea.x + priceScaleArea.w - 8, y + 4, "#c8d0dd", 12, "right");
  }

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(priceScaleArea.x, priceArea.y);
  ctx.lineTo(priceScaleArea.x, priceArea.y + priceArea.h);
  ctx.stroke();

  const candleWidth = priceArea.w / visible.length;
  visible.forEach((candle, i) => {
    const x = priceArea.x + i * candleWidth + candleWidth / 2;
    const openY = mapPriceY(candle.open);
    const closeY = mapPriceY(candle.close);
    const highY = mapPriceY(candle.high);
    const lowY = mapPriceY(candle.low);
    const color = candle.close >= candle.open ? "#12c48b" : "#ff5263";

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();

    ctx.fillStyle = color;
    const bodyY = Math.min(openY, closeY);
    const bodyH = Math.max(2, Math.abs(closeY - openY));
    ctx.fillRect(x - candleWidth * 0.3, bodyY, candleWidth * 0.6, bodyH);

    const st = visibleSt[i];
    if (st != null && i > 0 && visibleSt[i - 1] != null) {
      const stY = mapPriceY(st);
      const prevX = priceArea.x + (i - 1) * candleWidth + candleWidth / 2;
      const prevY = mapPriceY(visibleSt[i - 1]);
      ctx.strokeStyle = computed.trend[offset + i] === -1 ? "#00e08a" : "#ff5e67";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(x, stY);
      ctx.stroke();
    }
  });

  [...computed.buySignals, ...computed.sellSignals].filter((signal) => signal.index >= offset).forEach((signal) => {
    const localIndex = signal.index - offset;
    const x = priceArea.x + localIndex * candleWidth + candleWidth / 2;
    const y = mapPriceY(signal.price);
    const isBuy = !Object.prototype.hasOwnProperty.call(signal, "pnl");
    const bg = isBuy ? "#ffe44c" : signal.pnl >= 0 ? "#ff9811" : "#ff5252";
    const fg = isBuy ? "#111317" : "#ffffff";
    const label = isBuy ? `買點\n${signal.reason}\n價:${round(signal.price, 2)}` : `賣點 (${signal.reason})\n價:${round(signal.price, 2)}\n獲利:${round(signal.pnl, 2)}%`;
    const lines = label.split("\n");
    const boxH = 22 + lines.length * 16;
    const boxY = isBuy ? y + 12 : y - boxH - 12;
    drawRoundRect(x - 54, boxY, 108, boxH, 8, bg, null);
    lines.forEach((line, idx) => drawText(line, x, boxY + 18 + idx * 16, fg, 12, "center"));
  });

  visibleCci.forEach((value, i) => {
    if (value == null) return;
    const x = cciArea.x + i * candleWidth + candleWidth / 2;
    const mapCciY = (v) => cciArea.y + ((maxCci - v) / (maxCci - minCci || 1)) * cciArea.h;
    const y = mapCciY(value);
    if (i > 0 && visibleCci[i - 1] != null) {
      const prevX = cciArea.x + (i - 1) * candleWidth + candleWidth / 2;
      const prevY = mapCciY(visibleCci[i - 1]);
      ctx.strokeStyle = "#2969ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  });

  visibleCciMa.forEach((value, i) => {
    if (value == null) return;
    const x = cciArea.x + i * candleWidth + candleWidth / 2;
    const mapCciY = (v) => cciArea.y + ((maxCci - v) / (maxCci - minCci || 1)) * cciArea.h;
    const y = mapCciY(value);
    if (i > 0 && visibleCciMa[i - 1] != null) {
      const prevX = cciArea.x + (i - 1) * candleWidth + candleWidth / 2;
      const prevY = mapCciY(visibleCciMa[i - 1]);
      ctx.strokeStyle = "#f0c71d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  });

  [-100, 0, 100].forEach((level) => {
    const y = cciArea.y + ((maxCci - level) / (maxCci - minCci || 1)) * cciArea.h;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(cciArea.x, y);
    ctx.lineTo(cciArea.x + cciArea.w, y);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  visiblePnl.forEach((value, i) => {
    if (value == null) return;
    const x = pnlArea.x + i * candleWidth + candleWidth / 2;
    const mapPnlY = (v) => pnlArea.y + ((maxPnl - v) / (maxPnl - minPnl || 1)) * pnlArea.h;
    const y = mapPnlY(value);
    const baseY = mapPnlY(0);
    ctx.fillStyle = value >= 0 ? "rgba(21,209,141,0.65)" : "rgba(255,82,99,0.65)";
    ctx.fillRect(x - candleWidth * 0.35, Math.min(y, baseY), candleWidth * 0.7, Math.abs(baseY - y));
  });

  drawText("CCI", cciArea.x, cciArea.y - 12, "#97a0af", 14);
  drawText("浮動獲利 / 持倉區", pnlArea.x, pnlArea.y - 12, "#97a0af", 14);

  drawRoundRect(infoArea.x, infoArea.y, infoArea.w, infoArea.h, 14, "rgba(19,22,30,0.95)", "#2a3040");
  const rows = [
    ["CCI 狀態", isUnderMa ? "藍在下" : "藍在上", isUnderMa ? "#ff5263" : "#15d18d", isUnderMa ? "#ffffff" : "#111317"],
    ["買進基準價", lastBuyPrice == null ? "-" : round(lastBuyPrice, 2), "#111317", "#f7c843"],
    ["當前浮動獲利", livePnl == null ? "未持倉" : `${round(livePnl, 2)}%`, "#111317", livePnl == null ? "#97a0af" : livePnl >= 0 ? "#15d18d" : "#ff5263"],
    ["當下日 K 幅度", `${round(liveKChange, 2)}%`, "#111317", liveKChange >= 0 ? "#15d18d" : "#ff5263"],
    ["大趨勢保護", settings.strict_trend ? "已開啟 (安全)" : "已關閉 (危險)", "#111317", settings.strict_trend ? "#15d18d" : "#f7c843"],
    ["當前波段", isGreenTrend ? "多頭" : "空頭", "#111317", isGreenTrend ? "#15d18d" : "#ff5263"],
    ["預判狀態", distStr, "#111317", settings.enable_early ? "#f7c843" : "#97a0af"],
  ];

  rows.forEach((row, i) => {
    const top = infoArea.y + 14 + i * 36;
    drawText(row[0], infoArea.x + 16, top + 16, "#c7cfdb", 13);
    drawRoundRect(infoArea.x + 138, top, 146, 26, 6, row[2], null);
    drawText(String(row[1]), infoArea.x + 211, top + 17, row[3], 13, "center");
  });

  const leftDate = formatDate(visible[0].date);
  const midDate = formatDate(visible[Math.floor((visible.length - 1) / 2)].date);
  const rightDate = formatDate(visible[visible.length - 1].date);
  drawText(leftDate, xAxisArea.x + 4, xAxisArea.y + 20, "#97a0af", 12);
  drawText(midDate, xAxisArea.x + xAxisArea.w / 2, xAxisArea.y + 20, "#97a0af", 12, "center");
  drawText(rightDate, xAxisArea.x + xAxisArea.w - 4, xAxisArea.y + 20, "#97a0af", 12, "right");
  drawText("時間軸: 滾輪縮放", xAxisArea.x + 8, xAxisArea.y + xAxisArea.h + 14, "rgba(151,160,175,0.85)", 11);
  drawText("價格軸: 滾輪縮放", priceScaleArea.x + priceScaleArea.w - 4, priceScaleArea.y + priceScaleArea.h + 14, "rgba(151,160,175,0.85)", 11, "right");
}

function renderWatchlist() {
  const keyword = searchInput.value.trim().toLowerCase();
  watchlistEl.innerHTML = "";

  state.stocks
    .filter((stock) => !keyword || stock.code.toLowerCase().includes(keyword) || stock.name.toLowerCase().includes(keyword))
    .forEach((stock) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `watch-item ${stock.code === state.selectedCode ? "active" : ""}`;
      item.innerHTML = `<span class="watch-code">${stock.code}</span><span class="watch-name">${stock.name}</span>`;
      item.addEventListener("click", async () => {
        state.selectedCode = stock.code;
        state.chartView.priceScale = 1;
        renderAll();
        if (!state.candlesByCode.has(stock.code)) {
          await ensureStockData(stock.code, stock.name);
        }
      });
      watchlistEl.appendChild(item);
    });
}

function renderAll() {
  const stock = state.stocks.find((entry) => entry.code === state.selectedCode) || state.stocks[0];
  if (!stock) return;
  state.selectedCode = stock.code;
  chartTitle.textContent = `${stock.code} ${stock.name}`;
  const candles = state.candlesByCode.get(stock.code) || [];
  const lastClose = candles[candles.length - 1]?.close;
  closeInfo.textContent = `今日收盤價：${lastClose != null ? round(lastClose, 2) : "--"}`;
  renderWatchlist();
  renderChart(stock);
}

function upsertStock(stock) {
  const existing = state.stocks.find((entry) => entry.code === stock.code);
  if (existing) {
    existing.name = stock.name;
  } else {
    state.stocks.push(stock);
  }
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
  const cursor = new Date();
  cursor.setDate(1);
  for (let i = 0; i < count; i += 1) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    keys.push(`${year}${month}01`);
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
  const marker = `${code} `;
  const afterCode = cleaned.split(marker)[1] || "";
  return afterCode.split(" ").find(Boolean) || code;
}

async function fetchTwseMonth(code, dateKey) {
  const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateKey}&stockNo=${encodeURIComponent(code)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.stat !== "OK") return { title: payload.title || "", rows: [] };
  const rows = (payload.data || []).map((row) => ({
    date: parseTwseDate(row[0]),
    open: parseNumber(row[3]),
    high: parseNumber(row[4]),
    low: parseNumber(row[5]),
    close: parseNumber(row[6]),
    volume: parseNumber(row[1]) ?? 0,
  })).filter((row) => row.date && [row.open, row.high, row.low, row.close].every(Number.isFinite));
  return { title: payload.title || "", rows };
}

async function fetchTwseStockData(code) {
  const monthKeys = getRecentMonthKeys(8);
  const results = await Promise.all(monthKeys.map((key) => fetchTwseMonth(code, key)));
  const nameSource = results.find((item) => item.title)?.title || "";
  const name = extractNameFromTitle(nameSource, code);
  const candles = results.flatMap((item) => item.rows).sort((a, b) => new Date(a.date) - new Date(b.date));
  const deduped = candles.filter((candle, index, array) => index === 0 || candle.date !== array[index - 1].date);
  if (!deduped.length) throw new Error("No official daily data");
  return { code, name, candles: deduped };
}

async function ensureStockData(code, preferredName = "") {
  if (state.loadingCodes.has(code)) return false;
  state.loadingCodes.add(code);
  setStatus(`Fetching ${code} from TWSE official daily data...`);

  try {
    const result = await fetchTwseStockData(code);
    upsertStock({ code: result.code, name: preferredName || result.name });
    state.candlesByCode.set(code, result.candles);
    state.selectedCode = code;
    setStatus(`Loaded ${result.code} ${preferredName || result.name} from TWSE official daily data.`, "success");
    renderAll();
    return true;
  } catch (error) {
    if (preferredName) {
      upsertStock({ code, name: preferredName });
      renderAll();
    }
    setStatus(`${code} load failed: ${error.message}`, "error");
    return false;
  } finally {
    state.loadingCodes.delete(code);
  }
}

async function loadWatchlistRows(rows) {
  rows.forEach((row) => {
    if (!row.code) return;
    upsertStock({ code: row.code, name: row.name || row.code });
  });
  renderAll();

  for (const row of rows) {
    if (!row.code) continue;
    if (!state.candlesByCode.has(row.code)) {
      await ensureStockData(row.code, row.name || "");
    }
  }
}

function loadPriceRows(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    if (!row.code || !row.date) return;
    const code = row.code;
    const list = grouped.get(code) ?? [];
    list.push({
      date: row.date,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume || 0),
    });
    grouped.set(code, list);
    if (row.name) upsertStock({ code, name: row.name });
  });

  grouped.forEach((candles, code) => {
    candles.sort((a, b) => new Date(a.date) - new Date(b.date));
    state.candlesByCode.set(code, candles.filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite)));
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
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function generateDemoCandles(code, name, seed, startPrice) {
  const rand = seededRandom(seed);
  const candles = [];
  let price = startPrice;
  for (let i = 0; i < 96; i += 1) {
    const date = new Date("2026-01-01T09:00:00");
    date.setHours(date.getHours() + i * 4);
    const drift = Math.sin(i / 7) * 1.8 + (rand() - 0.5) * 5.2;
    const open = price;
    const close = Math.max(10, open + drift);
    const high = Math.max(open, close) + rand() * 4.2;
    const low = Math.min(open, close) - rand() * 4.2;
    candles.push({ date: date.toISOString(), open: round(open, 2), high: round(high, 2), low: round(Math.max(1, low), 2), close: round(close, 2), volume: Math.round(5000 + rand() * 9000) });
    price = close + (rand() - 0.5) * 1.2;
  }
  upsertStock({ code, name });
  state.candlesByCode.set(code, candles);
}

function loadDemoData() {
  state.stocks = [];
  state.candlesByCode.clear();
  generateDemoCandles("2330", "台積電", 101, 912);
  generateDemoCandles("1319", "東陽", 207, 96);
  generateDemoCandles("2313", "華通", 509, 225);
  generateDemoCandles("2603", "長榮", 803, 228);
  state.selectedCode = "2330";
  renderAll();
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function detectChartZone(point) {
  const layout = state.chartLayout;
  if (!layout) return "";
  const inBox = (box) => point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
  if (inBox(layout.xAxisArea)) return "xAxis";
  if (inBox(layout.priceScaleArea)) return "priceScale";
  return "";
}

canvas.addEventListener("wheel", (event) => {
  const zone = detectChartZone(getCanvasPoint(event));
  if (!zone) return;
  event.preventDefault();
  const zoomIn = event.deltaY < 0;
  if (zone === "xAxis") {
    state.chartView.visibleCount = clamp(state.chartView.visibleCount + (zoomIn ? -8 : 8), 20, 180);
  } else if (zone === "priceScale") {
    state.chartView.priceScale = clamp(state.chartView.priceScale + (zoomIn ? -0.1 : 0.1), 0.5, 3);
  }
  renderAll();
}, { passive: false });

canvas.addEventListener("mousemove", (event) => {
  const zone = detectChartZone(getCanvasPoint(event));
  canvas.style.cursor = zone ? "ns-resize" : "default";
});

canvas.addEventListener("mouseleave", () => {
  canvas.style.cursor = "default";
});

stockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = codeInput.value.trim();
  const name = nameInput.value.trim();
  if (!code) {
    setStatus("Please enter a stock code first.", "error");
    return;
  }
  upsertStock({ code, name: name || code });
  codeInput.value = "";
  nameInput.value = "";
  renderAll();
  await ensureStockData(code, name);
});

searchInput.addEventListener("input", renderWatchlist);

watchlistFileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  readFile(file, (text) => loadWatchlistRows(parseCsv(text)));
  event.target.value = "";
});

priceFileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  readFile(file, (text) => {
    loadPriceRows(parseCsv(text));
    setStatus("Local K-line CSV imported.", "success");
  });
  event.target.value = "";
});

loadDemoBtn.addEventListener("click", () => {
  loadDemoData();
  setStatus("Demo data loaded. Enter a stock code on the right to fetch official TWSE daily data.", "success");
});

window.addEventListener("resize", () => renderAll());

async function bootstrap() {
  const ok = await ensureStockData("2330", "");
  if (!ok) {
    loadDemoData();
    setStatus("Could not reach official data on startup. Demo data has been loaded instead.", "error");
  }
}

bootstrap();
