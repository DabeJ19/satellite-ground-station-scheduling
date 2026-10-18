# S4 審查回應（r1 → r2）

對應 `docs/reviews/S4-codex.md`（PR #12）。被審 commit 見 `docs/REVIEW_PROMPT_S4-r2.md`。

| 項目 | 採納 | 修改 | 驗證 |
|---|---|---|---|
| B1 壞 schedule 未略過，匯入／boot 拋錯 | 採納 | `src/ui.js` 新增 `buildSlotFromSaved()`：區域變數內驗 data、`schedule` 為陣列、元素為物件、req/antenna 存在、start 整數、`checkFeasible` 無 schema／duplicate-request → 否則略過並回報原因；只接受 `manual/milp/ga` 三個自有鍵（`hasOwnProperty`）；結構合法但衝突者保留為不可行槽。`ganttLayout`／`renderTray`／`csvSchedule` 加 null／非物件防護；`violations.reqs` 防護 | `tests/browser.s4.js` B1 步：`[null]`、`[7]`、未知 req、未知 antenna、start=1.5、重複 req 六種 → ok、milp=null、skipped 含 milp、ga 槽保留、顯示提示、無 pageerror；衝突 manual 槽保留為不可行（rule 1、違規區可見）；原型鏈鍵不被接受。boot 步：`[null]` 槽在 localStorage → 啟動完成、rev=7、ga 保留、提示 |
| B2 設定／外層未先驗證 | 採納 | `restoreWorkspace()` 改為「全部先驗後套用」：format/version（自有欄位 `format` → 必為 `sgs-workspace`、version 1..1）、data、revision 正整數、slots 外層為物件、`sanitizeSettings()`（白名單、型別、`validateGaParams`）；任一失敗回傳路徑錯誤，不 commit。`isWorkspace()` 以 `hasOwnProperty` 判別（`requests:null` 不再被當工作區）。boot 以 try/catch 包住，失敗載入預設資料並提示 | B2 步：ga 字串、`seed:{toString:null}`、settings 陣列、popSize=1、tmlim=-3、`format:'other'`、`format:null`、version 999、`requests:null`、slots 陣列、revision 0 共 11 種 → 不拋錯、ok=false、資料／draft／revision／settings／槽／t／控制項／tmlim 全不變、顯示錯誤；目前版標記工作區與無標記舊格式仍可還原。boot 步：壞 settings → 載入預設、rev=1、提示「無法還原」、控制項為預設 |
| B3 空 GA 設定還原後控制項沿用舊值 | 採納 | `defaultSettings()`／`fullGaParams()`：每次還原從固定預設（`SGS.ga.DEFAULTS` + runs 20）出發，白名單合併後**一律**完整回填全部 GA 控制項（λ null → 空白）；`initGA` 與 boot 預設路徑同樣完整回填 | B3 步：控制項改 99/123/λ7 → 匯入 `ga:{}` → 畫面與 `readGaParams()` 回 50/42/空白、runs 20；實際 run 的 `state.ga.params` 為 50/42/auto；部分設定 `{popSize:10}` → 其餘為固定預設（seed 42，非 123）。boot 步：`ga:{}` → 50/42/空白/20 |
| B4 拖曳中 H 變無效仍可寫入 | 採納 | `initWinEditor`：`draw()` 發現 H 無效立即 `drag=null`；`pointermove` 寫入前檢查 `validH`，不合法即取消 | A1/B4 步：pointerdown 後把 H 設為 `''`／`0`／`1.5`，後續 move/up 不改 draft；恢復 H=80 後直接 move 仍不改；重新 pointerdown 才改 12→14。原有「H 先無效才嘗試拖曳」測例保留 |
| C1 驗收紀錄可追溯 | 採納（提前） | `tests/browser.s4.js` 記錄 sourceCommit、dist SHA-256／bytes、OS、Node、瀏覽器渠道；JSON 另存 `docs/acceptance/s4-<channel>.json`（入版控，各渠道不互相覆寫）；`docs/ACCEPTANCE_S4.md` 新增對應欄位；Chrome／Edge 標「未測」 | 見 `docs/ACCEPTANCE_S4.md`、`docs/acceptance/s4-playwright-chromium.json` |

SPEC §6 補 S4-r2 明定（draft 7）；DECISIONS 追加一節。

測試：`npm test` 78 全綠；build 421 KB；browser S1 19／S2 16／S3 13／S4 15 步全綠（Chromium 141，file://，斷網）。
