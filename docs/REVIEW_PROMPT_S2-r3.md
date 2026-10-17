# Codex 複審 Prompt — S2-r3

複審 S2。被審 commit `a07b083`（本 prompt 檔之後的提交不在審查範圍）。只新增 `docs/reviews/S2-codex-r3.md`，不改其他檔。

讀：`docs/reviews/S2-response.md` 第二段（r2 回應）→ `src/ui.js`（runGA 的 effective/lambdaMode、drawGaChart）→ `tests/browser.s2.js` N1／N2 步驟。

1. N1、N2 各一行：已落實／部分／偏離。請複驗：λ 留空 n=6→7、n=30→31；手動 7 保留並警示；generations=1 的第 0 代座標與刻度。
2. 可跑則 `npm test`、`node build.js`；無 Chromium 請註明。

結論只能是「通過，可開 S3」或「退回（列必修）」。格式依 AGENTS.md。GitHub 環境請開分支 `review/S2-r3` + PR；本機直接寫檔。終端摘要：結論、新阻擋數、建議數。
