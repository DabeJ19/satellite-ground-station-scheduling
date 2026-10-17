# Response to Review S2 — Claude Code（工程方）

日期：2026-10-17　被審 commit：`792abdb`　PR #6 已合併

## 阻擋項（全部採納）
| # | 處置 | 落點 |
|---|---|---|
| B1 run 生命週期 | 每個 run 一個物件 {worker, resolve, settled, runId, params…}；`settleRun()` 只執行一次：取消／commit／被新 run 取代／error／done 全走同一結案（null 或 results），終止該 run 的 Worker、清 handler、不動新 run。正常 done 也 terminate。finishGA 例外 → 結案 null 並回報。瀏覽器：取消按鈕 → promise 2 s 內回 null、狀態「已取消」（永真斷言已刪）；受控 worker：cancel／commit／replace 各 terminate 恰一次且回 null，done 後 terminate 恰一次，舊 done／重複 done 不重複結案 | ui.js；browser B1 ×2 |
| B2 產生器 | 入口驗證（計數正整數、H 10..100000 整數、density 0..1、校準非負整數、seed 非負整數、bands 不重複非空）→ 拋 Error 含 `errors[{path,msg}]`；時窗長度 `ri(min(8,H), min(15,H))`、起點 `0..H−len`（含 fallback）；天線 id 以集合保證唯一；輸出必過 validateData。UI 捕捉錯誤、定位欄位、不增 revision | engine.js、ui.js；ga.test B2 ×3、browser B2 UI |
| B3 世代編號 | 初始族群 = 第 0 代並記入 history；第 k 批子代 = 第 k 代；history／onGeneration／best.gen／bestGen／CSV 同一編號；`generations` = 子代批數，history 長度 = generations+1。測試：direct/repair seed 1 的 best.gen == history 首次 (5,11) 的 gen == meanGenToHit；indirect 初始命中 = 0 | ga.js；ga.test B3 ×2 |
| B4 參數 | 執行前 `validateGaParams`（有限性／整數／機率範圍／runs），錯誤標欄位、不建 Worker；通過後以 `resolveParams` 產生不可變 effectiveParams，回寫控制項，worker／解槽／畫面／CSV 全用同一快照（執行後改控制項不影響舊批）；罰則 λ < |R|+1 時狀態列與結果區顯示「不再保證可行解優先」 | ui.js；browser B4 |
| B5 curve CSV runId | 曲線 CSV 第一欄 `runId`（批次），保留 runIndex／seed；統計 CSV 同樣加 runId；header 斷言改為完整比對，兩批同 seed 的 runId 不同並可對回 history | ui.js；browser B5 |
| B6 gapZ | 結果區顯示 `gapZ = Z* − Z_GA`（負值 = GA 任務數較多，附文字）；統計 CSV summary 列加 gapZ；未證明最佳的參考註明不代表最優性。測試：incumbent (4,5) feas vs GA (5,11) → −1、「GA 多 1 個任務」、CSV 末欄 −1 | ui.js、ga.summarize；browser B6 |

## 建議項
| # | 處置 |
|---|---|
| A1 違規集合 | 採納：decode 回 `violationCount` 與 `violations`（去重集合）與 `rawFitness`；lastPopulation 亦保留。測試：R1/GS_1-S/30 → count 1、集合 window:R1、rawFitness = objective − λ·1 |

## 自測
`npm test`：engine 39 + ga 19 全過；`node build.js` 343 KB；瀏覽器：S1 19 步、S2 13 步全過（Chromium file://，零 pageerror／外部請求）。

---

# Response to Review S2-r2 — Claude Code（工程方）

日期：2026-10-17　被審 commit：`5a1d427`　PR #7 已合併

| # | 處置 | 落點 |
|---|---|---|
| N1 auto λ 被回寫 | **採納**：使用者設定（λ 留空 = auto，存 localStorage 為 null）與每批 effectiveParams 分開；不再回寫控制項；每批依當次 norm 重算 n+1；effective 記 `lambdaMode: auto/manual`，結果區顯示「λ=31（auto = \|R\|+1）」或「（手動）」；低 λ 警示只對手動值。瀏覽器：n=6 → 7、n=30 → 31（CSV 各記 7／31）；手動 7 在 n=30 保留並警示；先 indirect 再 penalty 保留 auto；重新載入後 auto 仍重算 | ui.js；browser N1 |
| N2 曲線座標 | **採納**：minGen=0、maxGen=各曲線最後 gen 的最大值，x(g)=L+(g−0)/max(1,maxGen)·plotW；刻度從 0 起並含 maxGen；`state.lastGaChart` 暴露刻度與各點 x 供測試。瀏覽器：generations=1 → gen0 在 plotLeft、gen1 在 plotRight、刻度 [0,1]；3 runs 不同停止世代 → 最長曲線末點對齊右端、所有點在繪圖區內、best.gen == 曲線首次命中世代 | ui.js；browser N2 |

自測：`npm test` 39+19；瀏覽器 S1 19 步、S2 15 步；build 343 KB。
