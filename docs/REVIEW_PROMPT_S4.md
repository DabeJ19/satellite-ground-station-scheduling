# Codex 審查 Prompt — S4

審 S4（程式碼審查）。被審 commit `e6eec1c`（本 prompt 檔之後的提交不在審查範圍）。只新增 `docs/reviews/S4-codex.md`，不改其他檔。

讀：`docs/REVIEW_REQUEST_S4.md` → `SPEC.md` §6 持久化／匯出、§7、§8 S4（draft 6）→ `src/ui.js`（搜尋：restoreWorkspace、isWorkspace、exportSchedule、drawAnim、initWinEditor）→ `src/anim.js` fitSize → `build.js` → `tests/build.test.js`、`tests/browser.s4.js` → `docs/ACCEPTANCE_S4.md`、README 授權段。不審 `dist/`、`vendor/`。

1. 工作區 JSON：判別規則、無效輸入不動狀態、壞解槽略過、與 boot 還原共用是否回歸；構造反例請附輸入與預期。
2. 授權：單檔內 GPL-3.0 聲明是否齊備（全文、版權、版本、來源、轉換說明）；README 表述。
3. 匯出與離線驗收：九種下載、斷網、Storage 拋錯情境的測試是否足以覆蓋 §8 S4；驗收紀錄欄位。
4. A1／A2 收尾：fitSize 容量與可捲動容器；無效 H 停用拖曳。
5. 可跑則 `npm test`（含 build.test）；無 Chromium 請註明。

結論只能是「通過，專案收尾」或「退回（列必修）」。格式依 AGENTS.md。GitHub 環境請開分支 `review/S4` + PR；本機直接寫檔。終端摘要：結論、阻擋數、建議數。
