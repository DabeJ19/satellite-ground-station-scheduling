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
7. 審查方（Codex）僅可在 `review/<sprint>` 新增該輪 `docs/reviews/<sprint>-codex.md`，不修改工程檔或 `main`。複審另用檔名 `<sprint>-codex-r2.md`，既有 review 檔不得靜默重寫。
8. 送審包與審查報告均記錄被審 commit SHA；工程方合併 review 前核對被審內容是否已改動，若有須列差異或重新送審，不得將舊 review 當作新版本通過。
9. 工作開始先 `git fetch` 並確認分支／工作目錄狀態；不得覆蓋對方未提交變更、reset 他人分支或 force push。
10. 工程方對每輪審查逐項回應於 `docs/reviews/<sprint>-response.md`（採納／不採納 + 理由），SPEC 修訂同步追加 DECISIONS.md。

## 審查請求格式
見 `docs/REVIEW_REQUEST_TEMPLATE.md`。工程方在 sprint 結束時產出兩個檔案：
- `docs/REVIEW_REQUEST_<sprint>.md`：範圍、自測結果、重點
- `docs/REVIEW_PROMPT_<sprint>.md`：**可直接貼給 Codex 的完整審查 prompt**（PO 的標準要求，每次審查必附），並同時在對話中貼出

## 審查回覆格式
```
# Review <sprint> — Codex
## 結論：通過 / 有條件通過 / 退回
## 阻擋項（必修）
## 建議項（可延後）
## 針對 SPEC 開放問題的意見
```

## 儲存庫與同步（GitHub 為共用中心）
- GitHub：https://github.com/DabeJ19/satellite-ground-station-scheduling（public，`main`）
- 工程方（Claude Code）在雲端工作區 commit 並 push 到 `main`；PO 本機資料夾只做 `git pull` 取最新（開 `dist/index.html` 用）。
- 審查方（Codex / ChatGPT）從 GitHub 讀取；審查結果以分支 `review/<sprint>` + Pull Request 提交 `docs/reviews/<sprint>-codex.md`，由工程方合併。
- 若審查方在本機執行而無法 push，直接把檔案寫在本機資料夾，工程方會同步上去。

## 指令
- 建置：`node build.js`
- 開啟：直接雙擊 `dist/index.html`
