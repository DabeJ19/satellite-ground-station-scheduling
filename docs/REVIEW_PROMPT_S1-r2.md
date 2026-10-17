# Codex 複審 Prompt — S1-r2

複審 S1。被審 commit `74e55da`（本 prompt 檔之後的提交不在審查範圍）。只新增 `docs/reviews/S1-codex-r2.md`，不改其他檔。

讀：`docs/reviews/S1-response.md` → `src/engine.js` → `src/milp.js` → `src/ui.js` → `tests/engine.test.js` → `tests/browser.s1.js` → `SPEC.md` §4.2（已補結果有效性與預算規則）→ `DECISIONS.md` 末段。

1. B1–B7、A1–A2 逐項一行：已落實／部分（缺什麼）／偏離（可否接受）。特別複驗你上輪的反例（requests={}、缺 antennas、HTML durMin、constructor/toString id、逗號六對、NUL 鍵、NOFEAS 覆寫、LP reject、初始化倒序、S→Ku、960 ms／31 s 預算）。
2. B4 的差異點：cancel 只在進行中 run 時銷毀 GLPK 實例，閒置實例保留——是否可接受。
3. 可跑則執行 `node tests/engine.test.js`、`node build.js`；瀏覽器測試若環境無 Chromium 請註明。

結論只能是「通過，可開 S2」或「退回（列必修）」。格式依 AGENTS.md，最前面放 9 項核對表。GitHub 環境請開分支 `review/S1-r2` + PR；本機直接寫檔。終端摘要：結論、未落實數、新阻擋數、建議數。
