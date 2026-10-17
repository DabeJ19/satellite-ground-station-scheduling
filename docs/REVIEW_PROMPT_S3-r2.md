# Codex 複審 Prompt — S3-r2

複審 S3。被審 commit `1baad5f`（本 prompt 檔之後的提交不在審查範圍）。只新增 `docs/reviews/S3-codex-r2.md`，不改其他檔。

讀：`docs/reviews/S3-response.md` → `SPEC.md` §6（draft 5 新增兩段）→ `src/anim.js`（`fitPhase`、`drawFrame` 的 `visKey`／弧長／`render`）→ `src/ui.js`（`viewNorm/syncPlay/manualBase/cancelDrag`、`commit`、`initGanttDrag`、播放函式）→ `tests/anim.test.js` S3-r2 段 → `tests/browser.s3.js` B1／B2／A1 步驟。

1. B1–B5、A1–A2 各一行：已落實／部分／偏離。請複驗：七站 fixture φ=0.1°；跨 0° fixture；NUL id 不碰撞；`[0,H)` 弧 2π；舊版本解槽拖曳拒絕且刪除需求後不拋錯；拖曳中 commit／pointercancel 不寫入；切槽與 commit 後 t／拉桿／標籤以解槽 norm 為準；commit 暫停播放。
2. 可跑則 `npm test`、`node build.js`；無 Chromium 請註明。

結論只能是「通過，可開 S4」或「退回（列必修）」。格式依 AGENTS.md。GitHub 環境請開分支 `review/S3-r2` + PR；本機直接寫檔。終端摘要：結論、新阻擋數、建議數。
