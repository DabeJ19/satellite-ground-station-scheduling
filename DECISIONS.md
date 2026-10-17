# DECISIONS — grill-me 決策紀錄

日期：2026-10-16 ~ 10-17　方式：grill-me（Matt Pocock grilling skill）三輪，PO 逐題選擇。

## 第一輪
| # | 題目 | 決定 |
|---|---|---|
| Q1 | 最佳解在哪裡算 | 瀏覽器內 glpk.js（WASM MILP） |
| Q2 | 動畫真軌道 / 示意 | 示意（2D 地球 + 圓軌道，時窗為輸入資料） |
| Q3 | 時間粒度 / 任務時長 | 分鐘離散；時長 = 最小時長 |
| Q4 | 可調參數邊界 | 可增刪衛星/站/天線/需求 + 拖拉介面 |
| Q5 | 外部依賴 | glpk.js base64 內嵌，單檔離線可開 |
| Q6 | 頁面重點 | 「模型」分頁 + 「GA 實驗」分頁 |
| Q7 | GA 平手 | 次目標 = 總等待時間最小，權重遠小於主目標 |
| Q8 | 協作 | 雙 agent：Claude Code 工程、Codex 審查 |

## 第二輪
| # | 題目 | 決定 |
|---|---|---|
| A1 | MILP 建模 | 時間索引 x[r,a,t]，無 big-M |
| A2 | 算不完時 | 時間上限 + 標示「未證明最佳」+ gap |
| A3 | 次目標一致 | MILP 與 GA 同用 加權次目標 |
| A4 | 測試實例 | 有 seed 的隨機實例產生器 |
| B1 | GA 編碼 | 間接 + 直接 兩種可切換 |
| B2 | GA 算子 | 標準算子，參數全部可調 |
| B3 | 停止 / 重現 | 世代上限 + 停滯 + seed |
| B4 | 實驗 | 多次 run 統計 + 收斂曲線；Web Worker |
| C1 | 拖拉對象 | 甘特圖拖任務（手動排程）+ 時間軸拖時窗 |
| C2 | 動畫幾何 | 相位擬合時窗，接觸狀態以資料為準 |
| C3 | UI | 深 / 淺主題可切換；繁中；localStorage |
| C4 | 審查流程 | 連接本機 git 資料夾；spec 先審再實作 |

## 第三輪
| # | 題目 | 決定 |
|---|---|---|
| D1 | 原始碼結構 | src/ 分檔 + build.js 產 dist/index.html |
| D2 | 直接編碼不可行 | 修復 / 罰則 兩者可選 |
| D3 | 手動解地位 | 第三個解槽，可動畫可比較（允許不可行但標紅） |
| D4 | 資料模型 | 全套彈性（多天線、任意頻段、多時窗、校準可覆寫） |
| D5 | 動畫配置 | 站自動等距可改角度；軌道半徑逐衛星遞增 |
| D6 | 播放控制 | 播放/暫停/倍速/拖曳，與甘特圖游標同步 |
| D7 | 匯出 | 排程 CSV/JSON + 收斂曲線 CSV + 畫布 PNG |
| D8 | Sprint | S0 spec → S1 引擎+MILP+甘特 → S2 GA → S3 動畫+拖拉 → S4 編輯器+產生器+匯出 |

## 預設假設（PO 未反對即成立）
- build 腳本用 Node（`node build.js`）
- 僅保證 Chrome / Edge 最新版
- glpk.js 為 GPL-3.0；課堂用途無虞，商用需另評估

## 2026-10-17 S0 審查後修訂（Codex 有條件通過 → draft 2）
| 項目 | 決定 | 原因 |
|---|---|---|
| §1.3 上界證明 | 改用 R2/R4 互斥；R4/R6 可共存 | 審查反例成立（R4 10:08–10:10 校準至 10:20，R6 10:22 可排） |
| 等待基準 | `earliest_r = requests[r].start`；未排貢獻 0；字典序比較 | 原 spec 未定義，兩種解讀會改變排名 |
| 資料驗證 | 新增 `validateData()` 與正規化契約 | 可增刪／匯入必須封閉合法域，否則 ε 界與校準等價證明失效 |
| LP 上界 | 只有 LP `GLP_OPT` 才提供 U；gap 明確標示為加權目標的 LP 鬆弛 gap | LP 超時的可行值不是上界 |
| GA 解碼器 | 不加起始偏移基因 | 審查方證明間接編碼可重建任一加權最佳解 |
| 直接編碼罰則 | λ 預設 \|R\|+1，V 依 (rule, reqs) 去重 | 保證不可行者低於可行空解 |
| 多次 run | run seed = (baseSeed+i)>>>0；分報 Z* 命中與 (Z*,W*) 命中 | 重現性與統計定義 |
| 動畫擬合 | ω = 360/H、圓周角距離 | 避免 359°/1° 誤差，可重現 |
| build | SHA-256 + 標記唯一 + JSON 轉義；AST adapter 延後 | 固定 vendor 版本下足夠 |
| 授權 | 單檔內附 GPL-3.0 聲明；README 區分授權 | 交付物含 GPL 依賴 |
| 協作 | AGENTS.md 加入 S5 最小同步規則 | 防止舊 review 誤套新版本、覆蓋對方變更 |

## 2026-10-17 S0 複審後修訂（Codex 退回 3 項必修 → draft 3）
| 項目 | 決定 | 原因 |
|---|---|---|
| 罰則模式可行優先證明 | λ = n+1 保留；保證改為 `fitness ≤ −(n+1)/(nH+1) < 0`，不宣稱 ≤ −1；罰則模式允許負等待（只影響 raw fitness） | 審查反例：start 早於需求 start 產生負等待，原宣告過強 |
| 修復模式 | 對試加後 Schedule 呼叫完整 checkFeasible | 單筆時窗／頻段違規不能只靠成對衝突檢查 |
| 版本閘門 | revision/runId 寫入規則改為 MILP 與 GA 共用（§4.2 第 6 點），S1 即驗收 | S1 已同時有可編輯資料與非同步 MILP |
| S1 驗收 oracle | 新增 §8.1 邊界 fixture D、§8.2 MILP 轉換 oracle、§8.3 閘門測試、§8.4 UI 驗收 | 原 (d)/(e) 無法客觀判定 |
| 驗收工具 | 加入 `tools/enumerate.py` 全列舉 oracle | 獨立核對 (5,11)、(5,14) |
| 匯出 | 明列排程／曲線／統計三種 CSV | draft 2 改寫時遺漏 |
| 統計邊界 | n<2 標準差與零命中世代數顯示 N/A | 避免 NaN |

## 2026-10-17 S1 實作期間
| 項目 | 決定 | 原因 |
|---|---|---|
| 求解時間預算分配 | MILP 取 80%（至少 1 s），LP 鬆弛取其餘（至少 1 s 才啟動） | r2 審查提問（§4.2 預算未寫死）；避免 MILP 超時吃光預算讓 LP 永遠不跑 |
| 時間索引列裁剪 | 只含 ≤1 個變數的容量列不建（由 0..1 界隱含） | 等價且縮小模型；統計數字（rows）為裁剪後 |
| 解槽保存 | 每個解槽保存其資料快照與 revision；版本不符時評分卡標「舊版本資料」，甘特圖以該快照繪製 | 符合 §4.2 閘門：舊結果不覆蓋，但仍可檢視 |
| 單變數 LP 列 | 無候選（0 變數）時不呼叫 GLPK，直接回傳已證明最佳的空解 | §8.1 最後一列 |

## 2026-10-17 S1 審查後修訂（Codex 退回 7 項 → S1-r2）
| 項目 | 決定 | 原因 |
|---|---|---|
| 資料驗證 | validateData 先驗型別再遍歷，任何 JSON 值皆回 {ok,errors}；匯入在區域變數完成 parse→validate→normalize 後才取代 state；所有輸入值轉義 | B1：原本會 throw、先渲染後驗證、HTML 注入 |
| 索引與鍵 | 所有 id 索引改 Map；(sat,station) 用巢狀 Map；違規去重鍵 JSON.stringify([rule, reqs]) | B2：原型鍵、逗號／NUL 碰撞 |
| 結果有效性 | 新增 hasIncumbent 判定（§4.2 第 2 點）；LP 獨立 try/catch | B3 |
| GLPK 實例 ownership | single-flight 初始化 + 世代號；cancel 只終止進行中 run 擁有的實例／未完成初始化；初始化後再驗 run 有效 | B4 |
| 引用選單 | bands／衛星 id／站 id 變更時重建選單，失效引用保留並標「無效」；天線換站找不到目標報錯不移動 | B5 |
| 時間預算 | 80/20 配額 + deadline 實際剩餘；不標「超時」 | B6 |
| 測試 | browser 測試硬斷言、非零退出；UI 閘門以可注入 GLPK factory 測實際路徑 | B7 |
| metadata 欄位定位、儲存失敗提示 | 採納 | A1、A2 |

## 2026-10-17 S1-r2 審查後
| 項目 | 決定 | 原因 |
|---|---|---|
| 錯誤訊息格式化 | 所有來自輸入的值一律經 `engine.fmt()`，不對物件呼叫 String() | N1：`{"toString":null}` 會讓 String() 拋錯 |
| 工作環境 | PO 決定暫時維持 Cowork（雲端工作區 + GitHub）方式；Claude Code CLI 本機環境待權限問題解決後再評估 | 工作機 PowerShell 執行政策與無 Node |

## 2026-10-17 S2 實作期間
| 項目 | 決定 | 原因 |
|---|---|---|
| GA 執行位置 | Blob worker 內嵌 build 時注入的 engine.js/ga.js 原始碼字串（`window.SGS_SOURCES`），主頁與 worker 同一份規則 | SPEC §3、§7（不在 worker 重寫規則） |
| GA 閘門 | 獨立 `gateGA`（與 MILP 同語意）；commit 同時重設兩者並終止 worker | §4.2 第 6 點共用規則 |
| GA 解槽 | 多次 run 取最佳可行 phenotype；再過一次 checkFeasible 才寫槽 | §5.3、§6 |
| 命中參考 | 只有同版本的 MILP 解槽才作參考；`opt` 稱「命中最佳率」，`feas` 稱「命中 MILP incumbent 率」；無參考只列 GA 自身統計 | §5.3 |
| 進度回報 | 每 ⌈G/50⌉ 代 postMessage 一次 | 避免訊息洪水 |
| 產生器 | 參數：seed、衛星數、站數、每站天線數、需求數、時窗密度、H、校準；每衛星至少一段時窗；需求時窗錨定在該衛星某段 visibility 附近 | §3 |
| 直接編碼起始突變 | 在該天線的 feasibleStarts 索引上 ±2 步移動 | 避免產生明顯時窗外的起始 |
| C1 | 測試 waitFor 加逾時 | S1-r3 建議 |

## 2026-10-17 S2 審查後修訂（Codex 退回 6 項 → S2-r2）
| 項目 | 決定 | 原因 |
|---|---|---|
| GA run 生命週期 | 單一結案程序 settleRun（取消／過期／錯誤 → null，成功 → results），完成亦 terminate Worker | B1 |
| 產生器 | 入口驗證拋 Error(errors)；時窗受 H 約束；天線 id 集合去重；輸出必過 validateData | B2 |
| 世代編號 | 第 0 代 = 初始族群；所有輸出同一編號 | B3 |
| GA 參數 | 執行前驗證；有效參數快照（resolveParams）回寫並凍結；λ 低於 |R|+1 顯示警示 | B4 |
| CSV | 曲線與統計皆含批次 runId；summary 含 gapZ | B5、B6 |
| 違規集合 | decode 保留 violations 集合與 rawFitness | A1 |
