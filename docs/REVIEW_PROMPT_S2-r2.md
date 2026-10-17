# Codex 複審 Prompt — S2-r2

複審 S2。被審 commit `5a1d427`（本 prompt 檔之後的提交不在審查範圍）。只新增 `docs/reviews/S2-codex-r2.md`，不改其他檔。

讀：`docs/reviews/S2-response.md` → `src/ga.js`（run、decode）→ `src/engine.js`（generateInstance）→ `src/ui.js`（settleRun、runGA、validateGaParams、finishGA、csvCurves/csvStats）→ `tests/ga.test.js` B2/B3 段 → `tests/browser.s2.js` B1/B2/B4/B5/B6 步驟。

1. B1–B6、A1 逐項一行：已落實／部分（缺什麼）／偏離（可否接受）。請複驗你的反例：cancel 後 Promise 結案與 terminate 次數、`{H:10}`／`{nSat:1.5}`／`['S','S3']`×3、direct/repair seed 1 的 best.gen 與 history 一致、popSize=1/elite=20/pc=2/λ=0、curve CSV runId、incumbent (4,5) 的 gapZ −1。
2. 可跑則執行 `npm test`、`node build.js`；無 Chromium 請註明。

結論只能是「通過，可開 S3」或「退回（列必修）」。格式依 AGENTS.md，最前面放 7 項核對表。GitHub 環境請開分支 `review/S2-r2` + PR；本機直接寫檔。終端摘要：結論、未落實數、新阻擋數、建議數。
