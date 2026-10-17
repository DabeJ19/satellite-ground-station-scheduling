# AGENTS.md — 給 Claude Code 與 Codex 的共同工作約定

## 角色
- **PO**：James。決定需求與優先順序；不讀程式碼，靠 SPEC、驗收測試與可開啟的 dist/index.html 判斷。
- **工程（Claude Code）**：依 SPEC.md 實作；每個 sprint 結束前執行 `node build.js` 並確認 `dist/index.html` 可離線開啟。
- **審查（Codex）**：只審 `src/`、`build.js`、`SPEC.md`，不審 `dist/`、`vendor/`。審查結果寫到 `docs/reviews/<sprint>-codex.md`。

## 硬性規則
1. `src/engine.js` 的 `checkFeasible()` 是唯一的規則來源。MILP、GA、手動模式不得各自實作限制檢查。
2. 不得新增任何外部網路請求或 CDN。
3. 不得修改 `vendor/`（除 build 時在記憶體中改寫 export）。
4. 每個 sprint 的驗收測試寫在 SPEC §8；未通過不得宣告完成。
5. 變更 SPEC 需在 DECISIONS.md 追加一行紀錄（日期 + 原因）。
6. 時間一律為相對 `timeOrigin` 的整數分鐘，區間半開 `[start, end)`。

## 審查請求格式
見 `docs/REVIEW_REQUEST_TEMPLATE.md`。工程方在 sprint 結束時產出 `docs/REVIEW_REQUEST_<sprint>.md`。

## 審查回覆格式
```
# Review <sprint> — Codex
## 結論：通過 / 有條件通過 / 退回
## 阻擋項（必修）
## 建議項（可延後）
## 針對 SPEC 開放問題的意見
```

## 指令
- 建置：`node build.js`
- 開啟：直接雙擊 `dist/index.html`
