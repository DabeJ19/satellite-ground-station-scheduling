# Review Request — S2（GA 兩種編碼 + 實驗分頁 + 產生器 + CSV）

被審 commit：見 `docs/REVIEW_PROMPT_S2.md`。

## 範圍
- `src/ga.js`（新）：resolveParams、buildContext、兩種編碼（indirect / direct）、decode（repair / penalty）、算子（錦標賽、OX、均勻、swap／翻轉／起始位移）、菁英、停止條件、`run`、`runSeeds`、`summarize`
- `src/engine.js`：新增 `generateInstance(seed, opts)`
- `src/ui.js`：GA 實驗分頁（Blob worker、`gateGA`、進度、收斂曲線 canvas、統計表、三種 CSV）、資料分頁產生器面板、commit 時同時終止 GA worker
- `build.js`：內嵌 `window.SGS_SOURCES`（engine.js、ga.js 原文）供 worker 使用
- `tests/ga.test.js`（新，14 項）、`tests/browser.s2.js`（新，8 步）、`tests/browser.s1.js`（C1 逾時 waitFor）

## 驗收結果（工程方自測；SPEC §8 S2）
| 項 | 預期 | 實際 | 結果 |
|---|---|---|---|
| PPT 實例、預設參數、seeds 42..61 | 20 runs 命中 (5,11) 100% | Node：20/20；瀏覽器（worker）：hitZW 20/20、hitZ 20/20、參考 = MILP 已證明最佳 | ✔ |
| 30 需求隨機實例 GA vs MILP(tmlim 30) | 差距可報告 | seed=1/6 衛星/3 站/30 需求：MILP `GLP_OPT` (16,39) 12 ms；GA 5 runs 最佳 (16,39)，gapZ=0，hitZ 5/5；結果區顯示「參考：MILP 已證明最佳」 | ✔ |
| 取消後舊結果不覆寫解槽 | 取消 → 解槽不變；之後改資料 → 舊結果不落地 | 取消 50 runs 大族群：GA 槽內容不變、按鈕恢復；改版後槽標舊 revision | ✔ |
| 兩種 GA phenotype 與 `score` 一致（§8.2 延伸） | 三欄一致 | Node：indirect 解碼 == greedyDecode 且 score 相等；direct/repair 50 個隨機染色體全可行且 score 相等 | ✔ |
| 罰則保證 | λ 預設 n+1；不可行 raw fitness < 0 | PPT：λ=7，單一 window 違規 fitness ≤ −7/241；N1 反例形狀 fitness = −2/11 | ✔ |
| 重現性 | 同 seed 同 history | ✔ | ✔ |
| 統計邊界 | runs=1 → sd N/A；零命中 → meanGenToHit N/A、miss=runs | ✔ | ✔ |
| CSV | 曲線／統計（含 summary 列）／排程 | 統計 CSV 1+20+1+2 列；曲線 CSV 欄位 runIndex,seed,generation,best,avg,bestAssigned,bestWait | ✔ |
| 直接編碼兩模式 | 可跑、解槽可行 | repair／penalty 各 1 run 可行 Z≥4 | ✔ |

Node：`npm test` 39 + 14 全過；`npm run test:browser` 19 + 8 全過；build 334 KB；零 pageerror／外部請求。

## 觀察（非缺陷，供報告參考）
- PPT 實例與預設產生器實例對 GA 都偏容易（間接編碼第 0 代即達最佳；30 需求實例 MILP 12 ms 證明最佳）。直接編碼在 PPT 上 20 runs 命中 (5,11) 約 55–60%，可作為兩種編碼的對照材料。若要更難的實例，提高需求數／密度（參數已開放）。

## 請審查方特別看
1. `ga.decode` 間接模式是否完全等於 `engine.greedyDecode`（SPEC §5.1 的覆蓋性證明前提：完整掃描 feasibleStarts、可插空隙）。
2. 直接編碼修復模式「逐筆試加 + 完整 checkFeasible」是否符合 S0-r3 的 N1 要求；罰則模式 V 的去重是否沿用 checkFeasible 的 (rule, reqs)。
3. `summarize` 的命中定義與 §5.3 是否一致；參考來源（同版本 MILP 槽）的判定。
4. Worker 訊息閘門（`gateGA.accepts`）是否覆蓋 progress / run-done / done / error 四種訊息；commit → `cancelGA` → terminate 的順序。
5. `generateInstance` 的合法性（validateData 必過）與可重現性。

## 已知未完成
- 動畫、拖曳、PNG 匯出（S3/S4）。
- 產生器產出的實例難度偏低（非規格要求）。
