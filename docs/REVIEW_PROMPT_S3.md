# Codex 審查 Prompt — S3

審 S3（程式碼審查）。被審 commit `9980055`（本 prompt 檔之後的提交不在審查範圍）。只新增 `docs/reviews/S3-codex.md`，不改其他檔。

讀：`docs/REVIEW_REQUEST_S3.md` → `SPEC.md` §6、§8 S3 → `src/anim.js` → `src/ui.js`（搜尋：initGanttDrag、ensureManual、setManualTask、initPlayback、setTime、startPlay、drawAnim、initWinEditor）→ `tests/anim.test.js`、`tests/browser.s3.js`。不審 `dist/`、`vendor/`。

1. anim.js：fitPhase 目標函式／多解規則／確定性；contactState 與半開區間；構造反例請附輸入與預期。
2. ui.js：拖曳落點與手動槽複製語意；播放計時與循環；時窗編輯邊界與 draft 同步；commit 後播放狀態。
3. tests：是否覆蓋 §8 S3；缺的測例直接補文字。
4. 可跑則 `npm test`、`node build.js`；無 Chromium 請註明。

結論只能是「通過，可開 S4」或「退回（列必修）」。格式依 AGENTS.md；建議項標示可於哪個 sprint 處理。GitHub 環境請開分支 `review/S3` + PR；本機直接寫檔。終端摘要：結論、阻擋數、建議數。
