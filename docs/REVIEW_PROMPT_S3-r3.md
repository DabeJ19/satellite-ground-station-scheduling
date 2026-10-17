# Codex 複審 Prompt — S3-r3

複審 S3。被審 commit `841993f`（本 prompt 檔之後的提交不在審查範圍）。只新增 `docs/reviews/S3-codex-r3.md`，不改其他檔。

讀：`docs/reviews/S3-response.md` 第二段（r2 回應）→ `src/ui.js` 的 `setSlot`／`ensureManual`／boot 還原 → `tests/browser.s3.js` N1 步驟 → SPEC §6 播放資料來源一句。

1. N1 一行：已落實／部分／偏離。請複驗：GA 與零候選 MILP 替換選中槽後 t=40、拉桿 100%、標籤 10:40、動畫 t=40、playing=false；t=20 由 H80 換 H40 槽後拉桿 50%；timeOrigin 改 20:00 標籤更新；更新未選中槽時選中槽 t／H／標籤不變。
2. 可跑則 `npm test`、`node build.js`；無 Chromium 請註明。

結論只能是「通過，可開 S4」或「退回（列必修）」。格式依 AGENTS.md。GitHub 環境請開分支 `review/S3-r3` + PR；本機直接寫檔。終端摘要：結論、新阻擋數、建議數。
