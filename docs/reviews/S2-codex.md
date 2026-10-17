# Review S2 — Codex

## 結論：退回（列必修）

被審 commit：`792abdb50c98a9cf3a06505b6b4249cfa663fda5`（`792abdb`）。日期：2026-10-17（台北）。

**阻擋數 6、建議數 1。本輪不開 S3。** GA 的可行解與主要搜尋流程通過核對；必修集中在 Worker 結案、產生器邊界、世代編號及實驗輸出契約。

依指定順序閱讀送審單、SPEC §3／§5／§8 S2、ga、engine 的產生器、ui GA 區段、build 與兩個 S2 測試；另讀 AGENTS、DECISIONS、index.html、package.json 與執行依賴。以 GitHub connector 固定 SHA 讀取並查詢分支；查詢時 main 只多一筆 REVIEW_PROMPT_S2.md 的修改，未納入審查。工作區不是 git checkout，測試在固定來源的獨立暫存副本執行。只新增本報告，不修改既有檔案；vendor 僅原樣作建置依賴，未審其實作，未審既有 dist。

### 實際執行與驗收覆蓋

| 檢查 | 結果與界線 |
|---|---|
| `npm test` | exit 0：engine **39 passed**、GA **14 passed**，合計 53 項。 |
| `node build.js` | exit 0，**334 KB**；固定 vendor SHA-256 驗證通過。 |
| `node tests/browser.s2.js` | exit 1，launch 階段缺 Chromium headless shell（chromium_headless_shell-1234）；未進入測例。本環境無 Chrome／Chromium，工程方的瀏覽器通過紀錄未獨立複驗。 |
| Worker 文字執行 | 以未修改的 engine／ga 與 UI 產生的實際 Blob 腳本文字，在 Node VM 執行 WORKER_MAIN；seeds 42..61 **20/20 得 (5,11)**，有 progress／run-done／done 訊息。這不代替瀏覽器 Blob Worker 驗收。 |
| 30 需求對照 | generateInstance(1,{nSat:6,nStation:3,nReq:30})；GA seed=42 得 **(16,39)**。同一 buildLP 的 158 個二元變數／399 列，另以 SciPy 1.17.0／HiGHS、30 s 上限求得 optimal **(16,39)**；轉回排程經 engine 檢查可行。這是另一求解器核對，沒有冒稱本環境跑過 glpk.js。 |
| 算子與 UI 控制測試 | OX 在長度 0..9 共 1,000 組排列檢查通過；以原 UI 函式、最小 DOM、受控 Worker 複驗取消、完成、參數、CSV、參考槽及四類舊訊息，重現下列缺陷。 |

| §8 S2／延伸驗收 | 明確結論與缺測 |
|---|---|
| 預設參數 20 runs 命中 (5,11) 100% | Node 與 Worker 文字控制執行均通過；預設是 indirect，不將 direct 的較低命中率誤判為此項失敗。 |
| 30 需求 GA／MILP 差距可報告 | 兩個解的數值另有核對；UI 缺數值差距，見 B6。現有 browser 只驗 summary.gapZ 是整數與「參考：MILP」文字，沒有驗畫面顯示 gap。 |
| 取消／commit 後不覆寫解槽 | 原始碼順序正確，控制測試送回舊 progress、run-done、done、error 均未改新狀態；但 Promise 與 Worker 結案有 B1。browser 的取消測試不等待被取消的 Promise，且有永真斷言。 |
| 兩種 phenotype 的共用評分 | indirect／repair 與 engine.score 一致；單筆時窗修復及 penalty 負等待案例有覆蓋。 |
| seed、停止、統計邊界 | 同 seed 的 history／best 重現；停止原因有測；n=1 樣本標準差為 null→N/A，零命中 meanGenToHit 為 null、miss=runs 正確。世代編號仍有 B3。 |
| 產生器與 CSV | 目前測試偏正常預設值／header／列數，缺 B2、B4–B6 的完整輸入與預期。各項下方已直接給補測文字。 |

### 分項審查結論

| 對象 | 結論 |
|---|---|
| 間接解碼 | 直接呼叫共用 greedyDecode，偏好索引轉 Map；完整候選掃描與插空隙語意相同，未另寫近似解碼器。 |
| 直接修復 | 依 requests 順序試加後完整 checkFeasible，包含單筆 window 檢查；符合 §5.1。 |
| 罰則 | 內部染色體一需求一基因；非法引用、負／非整數 start 在組 raw 時排除。V 使用共用檢查器已去重的違規筆數，fitness=objective−λV；預設 λ=n+1 隨 norm 重算，負等待反例仍低於 0。違規集合保存不足列 A1；調低 λ 的警示缺於 B4。 |
| 算子 | OX 保留區段並按另一父代循環順序補齊；均勻交叉不改需求位置；swap 保持排列，偏好／天線索引只從相容集合抽樣。直接起始在 feasibleStarts 索引上 ±2 步，符合 DECISIONS 已採用的實作選擇，沒有要求改回分鐘位移。 |
| 停止與重現 | 搜尋只依世代、停滯及明確 shouldStop；時鐘僅量測 elapsedMs，未用於搜尋停止。raw fitness 的選擇與最佳可行解分開保存，空解保底正確。 |
| summarize／參考 | bestW 取字典序最佳 run 的 W，非跨任務數直接取最小 W；hitZ／hitZW 分開、樣本 SD 分母 n−1、N/A 規則正確。gaReference 只接受同 revision 且 feasible 的 MILP 槽，opt／incumbent 區別正確。 |
| Worker 閘門 | commit 先 cancelSolve／cancelGA，再換資料、revision 並重設兩個 gate；onmessage 在分派四類訊息前驗 gate，onerror 亦驗 runId。這部分可接受；生命週期仍須依 B1 完成。 |
| build SGS_SOURCES | 序列化原 engine／ga，供 Blob worker 載入同一份規則；沒有第二套限制檢查或新增外部請求。build 通過；實際 file:// Worker 仍待具 Chromium 的環境驗收。 |

## 阻擋項（必修）

### B1 — GA 取消不結束 Promise，正常完成又丟失未終止 Worker 的參照（P1；SPEC §4.2 第 6 點、§5.3、§8 S2）

位置：ui.js cancelGA／runGA，尤其第 381–427 行。

**實際時序與結果：**

- `const p=SGS.app.runGA(1); SGS.app.cancelGA();`：Worker terminate 恰一次、running=false、按鈕恢復，但 p 一直 pending。commit 或新 run 透過 cancelGA 取消舊 run 也相同。這與函式註解 Promise<results|null>、取消／過期回 null 的契約不符。
- 正常收到 done：Promise 有回結果，卻只把 state.ga.worker=null，沒有 terminate。之後 cancelGA 已找不到該 Worker，仍無法清理。控制測試得到 done 時 terminate=0、再 cancel 後仍為 0。

閘門有擋住舊結果，但沒有處理舊呼叫端的結案及已完成 Worker 的清理。

**可採用的修改文字：**

> 每個 run 保存獨立的 worker、resolver 與 settled 狀態。cancel、commit、新 run 取代、error、done 均進入同一個只執行一次的結案程序：取消／過期 resolve(null)，成功 resolve(results)，終止該 run 的 Worker 並清除 handler／參照；先使其 gate 失效，且不得清掉新 run 的 worker 或 resolver。正常完成也清理 Worker。finishGA 例外亦須完成清理並回報錯誤。

**必補輸入＋預期：** 受控 Worker 令 A pending，分別 cancel、commit、啟動 B；A 的 Promise 在有限等待內回 null，terminate(A) 恰一次，B 不受影響。另送成功 done，結果正確且 terminate 恰一次；重複 terminal／舊四類訊息均不重複結案。browser 取消情境應操作取消按鈕並實際 assert「已取消」，刪除 `assert.ok(/已取消/.test(r.status) || true)` 的永真尾項，並等待／驗證 p。

### B2 — 產生器合法邊界會產出非法資料，參數亦未先驗證（P1；SPEC §2.1、§3 generateInstance、§8 S2）

位置：engine.js 第 332–363 行；ui.js btnGenerate。

**已重現輸入：**

1. `generateInstance(1,{H:10})`：UI 允許 H=10，但生成 visibility 的 end 包含 12、15、11，validateData 回 false。len 固定抽 8..15，沒有限制至 H；seed 0、2、3、42 亦重現越界。
2. `generateInstance(1,{nSat:1.5})` 及 `{nStation:1.5}`：拋 Cannot read properties of undefined (reading 'id')。陣列長度與抽樣上界對小數採不同語意；UI 只用 Number 讀值，沒有先檢查 step／合法性，點自訂按鈕不會自動阻止此輸入。
3. `generateInstance(1,{bands:['S','S3'],nAntennaPerStation:3})`：同站天線 ID 為 GS_1-S、GS_1-S3、GS_1-S3，產生重複 ID。頻段字串與數字後綴串接不具唯一性。

**可採用的修改文字：**

> UI 與 generateInstance 入口驗證計數為有限正整數、H 為支援範圍的整數、density 在 [0,1]、校準非負整數、bands 為不重複非空字串；非法輸入回可定位錯誤，保留目前資料與 revision。對支援的 H，所有生成時窗長度與起點皆受 H 約束，例如 H≥10 時 len 抽 8..min(15,H)，起點抽 0..H−len，包含 fallback 分支。天線 ID 使用站／天線序號等不依頻段後綴猜測的唯一編碼。生成完成通過 validateData 後才提交。

**必補輸入＋預期：** H=10..15、上述 seeds，全部時窗滿足 0≤start<end≤H 且 validateData.ok=true；任意有效 bands（含 S、S3）及每站三天線均唯一。小數、空欄、負數／越界 density 等輸入受控拒絕，不 throw、不增 revision；正常參數相同 seed 深度相等。

### B3 — 最佳世代／命中世代與曲線／CSV 相差一代（P2；SPEC §5.2–5.3、§8 S2）

位置：ga.js 第 138–161、188 行。

**可重現：** default norm，`run(norm,{encoding:'direct',directMode:'repair',seed:1,generations:100,stagnation:50})`。最佳為 (5,11)，best.gen=4，summarize 的 meanGenToHit=4；history 第一次記錄相同最佳分數卻是 gen=5。初始最佳亦記 best.gen=0，曲線第一筆卻為 gen=1。

原因是初始 consider 用 0，下一代 consider 用目前 gen，該族群到下一圈才以 gen+1 寫 history。

**可採用的修改文字：**

> 全部輸出共用同一世代編號。可保留初始族群為第 0 代、第一批子代為第 1 代，將 history／onGeneration、最佳可行解 gen、raw bestGen、CSV 與命中世代統一；評估次數及既定停止條件保持明確。meanGenToHit 只平均命中 runs，且等於曲線在同一編號下首次達到該目標的世代。

**必補輸入＋預期：** 上例 best.gen 與 history 首次 (5,11) 的 gen、CSV 對應列及 meanGenToHit 完全相同；採第 0 代方案時均為 4。預設 indirect 初始即命中時均為 0。另保留零命中 N/A 與未命中數測例。

### B4 — 有效 GA 參數與畫面／CSV 快照不一致，低 λ 未警示（P2；SPEC §5.1–5.3）

位置：ga.js resolveParams；ui.js readGaParams、runGA、finishGA、csvStats。

**實際控制輸入：** direct／penalty，popSize=1、elite=20、pc=2、lambda=0。按執行仍送入 Worker；resolveParams 實際使用 popSize=2、elite=1、pc=1。結果的 r.params 正確，但 state.ga.params、解槽 metadata 與 CSV 仍記 1／20／2。這會讓依匯出資料重做的實驗參數描述失真。HTML min／max 本身沒有阻止這條執行路徑。

λ=0 是介面允許的值；本例畫面沒有 §5.1 要求的「不再保證可行解優先」警示。仍可保存最佳可行解，不等於 raw fitness 的可行優先保證仍成立。

**可採用的修改文字：**

> 執行前驗證 GA 輸入的有限性、整數／機率範圍及 runs 正整數；錯誤時標欄位並停止建立 Worker。若保留相依參數的裁剪，將有效值回寫控制項並建立不可變 effectiveParams 快照；worker、解槽、畫面與 CSV 全部使用同一有效快照／r.params，保留每次 run 的實際 seed。罰則模式 λ<n+1 時明示「不再保證可行解優先」，允許使用者繼續選擇該權重。

**必補輸入＋預期：** 上述非法範圍輸入受控拒絕；若測 API 的裁剪，輸出與 metadata 均記實際 2／1／1，不能再記 1／20／2。合法 λ=0 可執行且警示可見；auto λ 在資料版本改變後重算。執行後再編輯控制項，不得改變該批 CSV／解槽所記的有效參數。

### B5 — 曲線 CSV 缺規格指定的 runId（P2；SPEC §5.3）

位置：ui.js csvCurves 第 501–504 行；browser.s2.js 的 header 斷言。

實際 header：

```text
runIndex,seed,generation,best,avg,bestAssigned,bestWait
```

SPEC 指定逐列 runId、seed、generation、best、avg。runIndex 每批重新從 0 起算，不能代替 runId；目前測試反而硬性接受缺欄位的 header。

**可採用的修改文字：**

> 曲線每列補上實際批次 runId，保留 runIndex／seed 區分批次內的 run；統計 CSV 使用相同批次識別，以便與曲線及該批資料／有效參數快照連結。更新 header 與內容斷言，不能只驗列數。

**必補輸入＋預期：** 同 seed 連續執行兩批，曲線 CSV 的 runId 各等於當次 state.ga.runId 且兩批不同；逐列可依 runId＋runIndex／seed 對回 history，best／avg／generation 與畫面資料相同。執行後修改參數不改舊批識別。

### B6 — 算出差距卻未在結果區／統計 CSV 報告（P2；SPEC §5.3、§8 S2「差距可報告」）

位置：ga.js summarize 的 gapZ；ui.js renderGaResult、csvStats。

**完整可行反例：** default 資料的同版本 MILP incumbent 槽放貪婪 fixture (4,5)，標 label.kind='feas'；GA 預設 seed=42 得 (5,11)。summary.gapZ 正確為 −1，但結果區只顯示 incumbent 命中率 0/1 及「只報對 incumbent 的差距」這句說明，沒有數值差距；統計 CSV summary 亦沒有 gapZ。

這沒有要求取消 DECISIONS 已接受的「命中 MILP incumbent 率」標示；缺的是原本承諾的差距數值。任務數不同時，單看命中 0/1 也無法區分 GA 較好或較差。

**可採用的修改文字：**

> 有同版本參考時顯示並匯出 gapZ=Z_ref−Z_GA_best，清楚說明負值代表 GA 任務數較多；未證明最佳的參考標 incumbent，不把差距解讀為最優性保證。若補等待或 objective 差距，註明符號與比較目標，僅同任務數時作等待優劣比較。畫面與 CSV 使用同一 summary 值。

**必補輸入＋預期：** 上例結果區及 CSV 均可直接讀到 −1／「GA 多一任務」；相等為 0、GA 少一任務為 +1。舊 revision 的 MILP 槽不作參考，不顯示跨版本 gap。browser 應 assert 數值差距的畫面文字及 CSV 欄位，不只 assert summary 裡是整數。

## 建議項（可延後）

### A1 — 保留罰則模式的違規集合，方便解釋 fitness（SPEC §5.1；可於 S3 處理）

目前 decode 的 violations 是筆數 V，沒有保存 checkFeasible 回傳的集合；run 的 lastPopulation 亦只存筆數與 score。V 計算正確，不影響本輪已核對的罰則值或最佳可行解，但 §5.1「另存 rawFitness、違規集合」的診斷資料尚不完整。

**建議修改文字：**

> 將 violationCount 與 violations 分開，保留共用檢查器的去重集合及 rawFitness；可在除錯／選取染色體時查看，避免把每個族群的完整集合都當進度訊息傳送。單筆 R1/GS_1-S/30 預期 violationCount=1、集合含 window/R1、rawFitness 與 objective−λV 一致。

## 針對 SPEC 開放問題的意見

無新增需 PO 拍板的問題。維持間接編碼不加起始偏移、直接起始突變採候選索引移動、獨立 gateGA、同版本 MILP 參考與 incumbent 標示等既定決策。產生器難度偏低不是本輪阻擋；本輪只要求合法邊界及客觀、可重現的輸出。

終端摘要：結論＝退回（列必修）；阻擋數＝6；建議數＝1。
