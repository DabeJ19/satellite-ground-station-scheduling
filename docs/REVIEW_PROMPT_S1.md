# Codex 審查 Prompt — S1

審 S1（程式碼審查）。被審 commit `__SHA__`。只新增 `docs/reviews/S1-codex.md`，不改其他檔。

讀：`docs/REVIEW_REQUEST_S1.md` → `SPEC.md` §1–§4、§8（S1 列與 8.1–8.4）→ `src/engine.js` → `src/milp.js` → `src/ui.js` → `build.js` → `tests/engine.test.js`、`tests/browser.s1.js`。不審 `dist/`、`vendor/`。

1. engine：`checkFeasible` 五條規則＋window/schema/duplicate 的判定與去重是否與 SPEC 等價；找反例（請實際構造輸入並說明預期）。`feasibleStarts`、`normalize` 的邊界（半開、合併、nullish 校準）。
2. milp：`buildLP` 列生成是否等價於 §4.1（含單變數列裁剪）；目標係數；`relax` bounds；`solve` 的狀態／上界／timedOut 邏輯是否符合 §4.2。
3. ui：revision/runId 閘門在 UI 路徑上是否真的擋住舊結果（commit、cancel、terminate 後重建）；表格編輯→驗證→新版本的資料流有無漏洞（例如天線換站、頻段改名後的引用）。
4. tests：是否覆蓋 §8 S1 (a)–(g)；缺的測例直接補文字（輸入＋預期）。
5. 可在本機跑則執行 `node tests/engine.test.js`、`node build.js`，回報結果；不能跑就註明。

結論只能是「通過，可開 S2」或「退回（列必修）」。格式依 AGENTS.md；建議項標示可於哪個 sprint 處理。GitHub 環境請開分支 `review/S1` + PR；本機直接寫檔。終端摘要：結論、阻擋數、建議數。
