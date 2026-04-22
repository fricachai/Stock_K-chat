# 右側商品清單上下拖曳排序重用說明

這份文件整理的是 `Stock_K-chat` 目前右側 `商品 / 名稱` 清單的上下拖曳排序做法，目的是讓你在其他專案裡可以直接套用。

適用情境：

- 有一個清單要讓使用者用滑鼠拖曳改順序
- 放開滑鼠後立即更新畫面
- 需要把新順序保存到瀏覽器

---

## 1. 功能效果

目前這套做法提供：

- 滑鼠按住單一項目後可上下拖曳
- 拖到其他項目上方時顯示目標提示
- 放開後立即改變順序
- 排序後可直接存到 `localStorage`

---

## 2. 需要的資料結構

先準備一個清單陣列，例如：

```js
const state = {
  watchlist: [
    { code: "2330", name: "台積電" },
    { code: "1319", name: "東陽" },
    { code: "2313", name: "華通" },
  ],
  selectedCode: "2330",
  watchlistDragCode: "",
};
```

重點欄位：

- `watchlist`: 右側清單資料
- `selectedCode`: 目前選中的商品
- `watchlistDragCode`: 正在被拖曳的商品代號

---

## 3. HTML 結構

清單容器：

```html
<div id="watchlistBody" class="watchlist-body"></div>
```

每一列會由 JavaScript 動態產生。

---

## 4. CSS 樣式

以下是可直接複用的核心樣式：

```css
.watchlist-body {
  display: flex;
  flex-direction: column;
}

.watch-item {
  display: grid;
  grid-template-columns: 88px 1fr 24px;
  align-items: center;
  min-height: 54px;
  padding: 0 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.92);
  color: #111;
  cursor: grab;
  user-select: none;
}

.watch-item.is-selected {
  background: linear-gradient(90deg, rgba(90, 72, 18, 0.58), rgba(44, 40, 26, 0.92));
  color: #fff3b0;
  border-left: 4px solid #ffcc37;
}

.watch-item.dragging {
  opacity: 0.42;
}

.watch-item.drop-target {
  outline: 2px dashed rgba(255, 226, 122, 0.72);
  outline-offset: -2px;
}

.watch-code {
  font-weight: 700;
}

.watch-name {
  justify-self: center;
}

.watch-remove {
  justify-self: end;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}
```

---

## 5. 核心排序函式

這個函式負責把拖曳中的項目移動到目標項目前面：

```js
function moveWatchItemBefore(dragCode, targetCode) {
  if (!dragCode || !targetCode || dragCode === targetCode) {
    return false;
  }

  const fromIndex = state.watchlist.findIndex((item) => item.code === dragCode);
  const targetIndex = state.watchlist.findIndex((item) => item.code === targetCode);

  if (fromIndex === -1 || targetIndex === -1) {
    return false;
  }

  const next = [...state.watchlist];
  const [dragged] = next.splice(fromIndex, 1);
  const insertIndex = next.findIndex((item) => item.code === targetCode);

  if (insertIndex === -1) {
    next.push(dragged);
  } else {
    next.splice(insertIndex, 0, dragged);
  }

  state.watchlist = next;
  return true;
}
```

---

## 6. render 函式

這段是最重要的部分。每次重新 render 時，都把拖曳事件綁到每一列上：

```js
function renderWatchlist() {
  const container = document.getElementById("watchlistBody");
  container.innerHTML = "";

  state.watchlist.forEach((stock) => {
    const item = document.createElement("div");
    item.className = "watch-item";
    item.dataset.code = stock.code;
    item.draggable = true;

    if (stock.code === state.selectedCode) {
      item.classList.add("is-selected");
    }

    const code = document.createElement("div");
    code.className = "watch-code";
    code.textContent = stock.code;

    const name = document.createElement("div");
    name.className = "watch-name";
    name.textContent = stock.name || stock.code;

    const removeButton = document.createElement("button");
    removeButton.className = "watch-remove";
    removeButton.type = "button";
    removeButton.textContent = "×";

    item.append(code, name, removeButton);

    item.addEventListener("click", () => {
      state.selectedCode = stock.code;
      renderWatchlist();
    });

    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      state.watchlist = state.watchlist.filter((entry) => entry.code !== stock.code);

      if (state.selectedCode === stock.code) {
        state.selectedCode = state.watchlist[0]?.code || "";
      }

      saveWatchlistState();
      renderWatchlist();
    });

    item.addEventListener("dragstart", (event) => {
      state.watchlistDragCode = stock.code;
      item.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", stock.code);
    });

    item.addEventListener("dragend", () => {
      state.watchlistDragCode = "";
      item.classList.remove("dragging");
      container.querySelectorAll(".drop-target").forEach((node) => {
        node.classList.remove("drop-target");
      });
    });

    item.addEventListener("dragover", (event) => {
      event.preventDefault();

      if (!state.watchlistDragCode || state.watchlistDragCode === stock.code) {
        return;
      }

      event.dataTransfer.dropEffect = "move";
      container.querySelectorAll(".drop-target").forEach((node) => {
        if (node !== item) {
          node.classList.remove("drop-target");
        }
      });
      item.classList.add("drop-target");
    });

    item.addEventListener("dragleave", () => {
      item.classList.remove("drop-target");
    });

    item.addEventListener("drop", (event) => {
      event.preventDefault();
      item.classList.remove("drop-target");

      if (moveWatchItemBefore(state.watchlistDragCode, stock.code)) {
        saveWatchlistState();
        renderWatchlist();
      }
    });

    container.appendChild(item);
  });
}
```

---

## 7. localStorage 保存方式

如果你希望排序後重新整理網頁還保留，就加這段：

```js
const WATCHLIST_STORAGE_KEY = "my-project-watchlist";

function saveWatchlistState() {
  const payload = {
    watchlist: state.watchlist,
    selectedCode: state.selectedCode,
  };

  localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(payload));
}

function loadWatchlistState() {
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed.watchlist)) {
      state.watchlist = parsed.watchlist;
    }

    if (typeof parsed.selectedCode === "string") {
      state.selectedCode = parsed.selectedCode;
    }
  } catch (error) {
    console.error("Failed to restore watchlist:", error);
  }
}
```

初始化時：

```js
loadWatchlistState();
renderWatchlist();
```

---

## 8. 套用到其他專案時最少要搬哪些

最少需要搬這些：

- HTML
  - `#watchlistBody`
- CSS
  - `.watch-item`
  - `.watch-item.dragging`
  - `.watch-item.drop-target`
- JavaScript
  - `state.watchlistDragCode`
  - `moveWatchItemBefore()`
  - `renderWatchlist()`
  - `saveWatchlistState()` / `loadWatchlistState()`（若需要保存）

---

## 9. 目前 Stock_K-chat 專案中的對應位置

若你想對照現成版本，可看：

- JavaScript：
  [app.js](/D:/USB_Data/個人研究/實用分析分類/ChatGPT_個人累積/ChatGPT_Codex_專案資料夾/股票交易策略/Stock_K-chat/app.js)
- CSS：
  [styles.css](/D:/USB_Data/個人研究/實用分析分類/ChatGPT_個人累積/ChatGPT_Codex_專案資料夾/股票交易策略/Stock_K-chat/styles.css)

你若要搬到另一個專案，最穩的方式是：

1. 先把這份 `.md` 的 HTML / CSS / JS 基本版複製過去
2. 先確認拖曳排序可動
3. 再接你自己的清單資料來源
4. 最後再接 `localStorage` 保存

---

## 10. 如果要再往上加功能

這套做法之後還可以再加：

- 拖曳插入線
- 觸控拖曳排序
- 拖曳把項目移到最上/最下
- 拖曳排序後自動同步到後端
- 依登入帳號保存不同清單
