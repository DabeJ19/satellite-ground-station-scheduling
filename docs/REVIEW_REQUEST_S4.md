# Review Request — S4（匯出收尾、localStorage 降級、授權聲明、離線驗收、A1/A2 收尾）

被審 commit：見 `docs/REVIEW_PROMPT_S4.md`。

## 範圍
- `src/ui.js`：工作區 JSON（`snapshotWorkspace/exportWorkspace/isWorkspace/restoreWorkspace/importWorkspace`；boot 與匯入共用 `restoreWorkspace`；`saveLS` 改用同一快照）、`importJSONText` 自動判別；排程分頁「排程 CSV／JSON」（`exportSchedule`）；`drawAnim` 依 `anim.fitSize` 放大畫布並切換可捲動容器；時窗編輯器 band／color 重畫、無效 H 提示＋停用拖曳
- `src/anim.js`：`fitSize(norm, w, h)`
- `src/index.html`／`src/style.css`：匯出鍵、`#winEditorHint`、`.animWrap`、頁尾授權 details（`__GLPK_SHA256__`、`@inline:license`）
- `build.js`：內嵌 `vendor/glpk/LICENSE`（HTML 轉義、檢查 GPL v3 標題）、SHA 佔位替換、零外部資源標記自檢
- `tests/build.test.js`（新，5 項，納入 `npm test`）、`tests/anim.test.js`（+1 fitSize）、`tests/browser.s4.js`（新，11 步；offline context ＋ Storage 全拋錯 context）
- `docs/ACCEPTANCE_S4.md`（由 `tests/out/acceptance-s4.json` 整理）、README、SPEC draft 6、DECISIONS

## 驗收結果（工程方自測；SPEC §8 S4）
| 項 | 預期 | 實際 | 結果 |
|---|---|---|---|
| 離線單檔 | file://、斷網、零外部請求、GLPK 就緒 | Chromium 141.0.7390.37，`navigator.onLine=false`，外部請求 0、pageerror 0 | ✔ |
| smoke | z=3 且 GLP_OPT | z=3，status=5=GLP_OPT | ✔ |
| PPT 實例 | (5,11) 已證明最佳 | (5,11)、可行 | ✔ |
| GA worker 啟動／取消 | 取消 → 不寫槽、可重跑 | running+worker 為真 → cancel → 結果 null、ga 槽 null、取消鍵停用；重跑 2 runs Z=5 | ✔ |
| 全部匯出可用 | 九個匯出鍵皆下載 | sgs-data.json、sgs-workspace.json、schedule-milp.csv/.json、gantt.png、animation-frame.png、ga-curves/stats/schedule.csv；PNG 檔頭、CSV 表頭與列數、JSON 結構皆檢查 | ✔ |
| 工作區 JSON | 匯出→匯入完全還原；純資料仍可匯入；壞檔拒絕 | 三者皆符 | ✔ |
| 儲存失敗不阻止操作 | Storage 全拋錯 | 預設資料啟動、橫幅、`saveLS()=false`；套用 r2、手動排程、主題、MILP (5,14)、匯出工作區全可用 | ✔ |
| 主題切換 | 切換並保存 | dark→light，重載保留 | ✔ |
| 授權文字齊備 | 單檔內版本、©、來源、SHA、轉換說明、GPL 全文；README 區分 | build.test 5/5 | ✔ |
| A1 | band／color 重畫；無效 H 停用拖曳 | 重畫次數 1/2/3；H='' → 提示、disabled、拖曳不改 draft；H=80 後拖 12→16 | ✔ |
| A2 | 60 星放得下 | 畫布 1032×1032 可捲動、外圈 492+24 ≤ 516、最小 gap 8；回 3 星 504×420 | ✔ |

`npm test` 39+19+15+5；`npm run test:browser` 19+16+13+11；build 416 KB。

## 請審查方特別看
1. 工作區 JSON 判別規則與 `restoreWorkspace` 的失敗語意（data 無效不動狀態；壞解槽略過）；與 localStorage 還原共用是否引入回歸。
2. 授權區是否滿足 GPL-3.0 隨單檔散布的要求（全文、版權、來源、修改說明）；README 表述。
3. `tests/browser.s4.js` 的離線與儲存失敗情境是否足以作為 §8 S4 驗收；`docs/ACCEPTANCE_S4.md` 欄位是否齊備。
4. `fitSize` 容量公式與可捲動容器在窄畫布／分頁隱藏時的行為。

## 已知限制
- 驗收以 Playwright 內建 Chromium 執行；Edge 可用 `PW_CHANNEL=msedge` 重跑同一套，本輪未另行記錄。
