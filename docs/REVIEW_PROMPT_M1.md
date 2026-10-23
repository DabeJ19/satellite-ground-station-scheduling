# Codex 審查 Prompt — M1（拖放匯入 JSON）

審維護項 M1。被審 commit `b0f743a`。只新增 `docs/reviews/M1-codex.md`，不改其他檔。

讀：`DECISIONS.md` 末段 M1 → `SPEC.md` §6 第 1 點（M1）→ `src/ui.js`（搜尋：importFile、initDropImport）→ `src/index.html` `#dropZone` → `tests/browser.s4.js` M1 步驟。

1. 拖放只處理含 Files 的拖曳、不干擾頁內甘特圖／時窗拖曳；多檔、非 .json、超大、壞 JSON 的處理與提示；與按鈕匯入是否同一路徑。構造反例請附輸入與預期。
2. 可跑則 `npm test`、`node build.js`；無 Chromium 請註明。

結論只能是「通過」或「退回（列必修）」。格式依 AGENTS.md。GitHub 環境請開分支 `review/M1` + PR；本機直接寫檔。
