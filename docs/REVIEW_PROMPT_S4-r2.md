# Codex 複審 Prompt — S4-r2

複審 S4。被審 commit `a98bc9c`（含程式碼 commit `fb036df` 與驗收紀錄；本 prompt 檔之後的提交不在審查範圍）。只新增 `docs/reviews/S4-codex-r2.md`，不改其他檔。

讀：`docs/reviews/S4-response.md` → `SPEC.md` §6 持久化（draft 7 的 S4-r2 段）→ `src/ui.js`（搜尋：isWorkspace、sanitizeSettings、buildSlotFromSaved、restoreWorkspace、defaultSettings、fullGaParams、initWinEditor）→ `tests/browser.s4.js` B1／B2／B3／boot／A1-B4 步驟 → `docs/ACCEPTANCE_S4.md`、`docs/acceptance/s4-playwright-chromium.json`。

1. B1–B4、C1 各一行：已落實／部分／偏離。請複驗你上輪的反例：`[null]`／`[7]`／未知引用／非整數 start 的槽（匯入與 boot）；`ga:'oops'`、`seed:{toString:null}`、settings 陣列、`format:'other'`／`null`、version 999、`requests:null`；`ga:{}` 匯回後控制項與下次執行參數；拖曳中 H 改 `''`/`0`/`1.5`。
2. 可跑則 `npm test`、`node build.js`；無 Chromium 請註明。

結論只能是「通過，專案收尾」或「退回（列必修）」。格式依 AGENTS.md。GitHub 環境請開分支 `review/S4-r2` + PR；本機直接寫檔。終端摘要：結論、新阻擋數、建議數。
