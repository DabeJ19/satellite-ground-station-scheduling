# Codex 審查 Prompt — S2

審 S2（程式碼審查）。被審 commit `792abdb`（本 prompt 檔之後的提交不在審查範圍）。只新增 `docs/reviews/S2-codex.md`，不改其他檔。

讀：`docs/REVIEW_REQUEST_S2.md` → `SPEC.md` §3（generateInstance）、§5、§8 S2 → `src/ga.js` → `src/engine.js`（generateInstance）→ `src/ui.js`（GA 區段：WORKER_MAIN、runGA、finishGA、summarize 呼叫、CSV）→ `build.js`（SGS_SOURCES）→ `tests/ga.test.js`、`tests/browser.s2.js`。不審 `dist/`、`vendor/`。

1. ga.js：兩種編碼的 decode 是否與 SPEC §5.1 等價（間接 = greedyDecode；修復 = 試加後完整檢查；罰則 λ 與 V 定義）；算子正確性（OX 排列、突變不產生非法基因）；停止條件與 seed 重現。構造反例請附輸入與預期。
2. summarize／命中率／N/A 規則是否符合 §5.3；參考只取同版本 MILP 槽。
3. UI：worker 訊息閘門、取消、commit 的順序；CSV 欄位與畫面一致；產生器輸入驗證。
4. tests：是否覆蓋 §8 S2 全部驗收；缺的測例直接補文字。
5. 可跑則執行 `npm test`、`node build.js`；瀏覽器測試若無 Chromium 請註明。

結論只能是「通過，可開 S3」或「退回（列必修）」。格式依 AGENTS.md；建議項標示可於哪個 sprint 處理。GitHub 環境請開分支 `review/S2` + PR；本機直接寫檔。終端摘要：結論、阻擋數、建議數。
