# Review S2 — Codex（r2）

| 項目 | 複審結論 |
|---|---|
| B1 | **已落實**：cancel／commit／取代／error／done 均結束 Promise，Worker 恰終止一次，舊 callback 不影響新 run（SPEC §4.2 第 6 點、§5.3、§8 S2）。 |
| B2 | **已落實**：H=10 的越界、非整數計數與 S／S3 天線 ID 碰撞均修正；UI 拒絕非法參數且不增 revision（SPEC §2.1、§3、§8 S2）。 |
| B3 | **部分**：best.gen、history、命中統計與 CSV 的數字已一致；繪圖仍沿用第 1 代座標，短 run 的第 0 代被畫出畫布，見 N2（SPEC §5.2–5.3）。 |
| B4 | **部分**：非法參數、有效快照與低 λ 警示已修；有效 λ 回寫輸入欄使 auto 模式遺失，換資料不再重算，見 N1（SPEC §5.1–5.3）。 |
| B5 | **已落實**：曲線與統計 CSV 皆含批次 runId，同 seed 的兩批可區別，內容可對回 history（SPEC §5.3）。 |
| B6 | **已落實**：incumbent (4,5) 對 GA (5,11) 的 gapZ=−1 在結果區與 CSV 同時呈現，並說明符號與參考狀態（SPEC §5.3、§8 S2）。 |
| A1 | **已落實**：decode 與 lastPopulation 保留 violationCount、去重 violations 集合及 rawFitness（SPEC §5.1）。 |

## 結論：退回（列必修）

被審 commit：`5a1d4275260cb3490b8cc198ad26c830ad4c17c9`（`5a1d427`）。日期：2026-10-17（台北）。

**仍有必修缺口的項目 2（B3、B4，均為部分落實）；新阻擋 2、建議 0。** 本輪不開 S3。下列 N1／N2 是修正後的跨版本參數與繪圖整合缺口，未重複計算已修好的原反例。

依指定順序閱讀 S2-response、ga、engine 產生器、ui 指定函式、Node B2／B3 與 browser B1／B2／B4／B5／B6 步驟；另讀 AGENTS、DECISIONS、build 與執行依賴。透過 GitHub connector 固定 SHA 讀取、查詢分支及比較 main；查詢時 main 僅多一筆 REVIEW_PROMPT_S2-r2.md 的修改，未納入審查。工作區不是 git checkout，測試在獨立暫存來源副本執行。只新增本報告，不修改既有檔案；vendor 僅作原樣建置依賴，未審其實作，未審既有 dist。

### 實際執行結果

| 指令／檢查 | 結果與界線 |
|---|---|
| `npm test` | exit 0，**engine 39＋GA 19 項全過**。包含 B2 邊界、B3 世代與前輪基準回歸。 |
| `node build.js` | exit 0，**343 KB**；固定 vendor SHA-256 驗證通過。 |
| `node tests/browser.s2.js` | exit 1，launch 階段缺 Chromium headless shell（chromium_headless_shell-1234），未進入測例。本環境無可替代 Chrome／Chromium；工程方的 13 步瀏覽器通過仍屬工程方自測。 |
| 審查方控制測試 | Node v24.19.0 載入未修改的 engine／ga／milp／ui，以最小 DOM、受控 Worker、實際 Worker 腳本文字及繪圖呼叫紀錄複驗。這些結果不代替真實 Chromium／file://／視覺驗收。 |

### 指定反例複驗

| 反例 | 實際結果 |
|---|---|
| cancel 後 Promise／terminate | Promise 回 null，terminate 恰一次、handler 清除；再次 cancel 不重複 terminate。 |
| commit／新 run 取代 A | A 回 null、terminate(A) 恰一次；B 的實例、running、狀態與按鈕保持正確。以保存的舊 callback 送四類舊訊息，均未影響 B。 |
| 正常 done／重複 done | 成功回一份 results，terminate 恰一次；重複 callback 與事後 cancel 不再終止。 |
| message error／worker.onerror／finishGA 例外 | 分別回 null、清理一次、running=false；finishGA 的錯誤能結案。 |
| H=10／短時窗 | H=10..15 × seeds 0、1、2、3、42 共 30 組，validateData 均通過，visibility 滿足 0≤start<end≤H。 |
| nSat=1.5／nStation=1.5 | 回含正確 errors.path 的參數 Error；UI 捕捉並顯示 generator.nSat，資料版本不增，不再拋未捕捉 TypeError。 |
| bands=['S','S3']、每站三天線 | 全資料天線 ID 唯一，validateData 通過。 |
| direct／repair seed=1 | 最佳 (5,11)；best.gen=4，history 首次命中 gen=4，meanGenToHit=4，history 從 0 開始。圖軸尚有 N2。 |
| popSize=1、elite=20、pc=2、λ=0 | 拒絕執行，錯誤指到 popSize／elite／pc，未建立 Worker。 |
| 合法參數＋λ=0 | 可執行，完成狀態有「不再保證可行解優先」；有效 params 凍結，解槽／CSV 記實際值，執行後改控制項不改舊 CSV。auto λ 尚有 N1。 |
| curve CSV runId | 完整 header 含 runId；連續兩批同 seed 的 ID 不同，逐列批次識別及 history 筆數對應正確。 |
| incumbent (4,5) | 預設 GA 得 (5,11)，summary.gapZ=−1；結果區顯示「GA 多 1 個任務」，CSV summary 末欄為 −1，refProven=false。 |
| A1 診斷集合 | R1/GS_1-S/30：violationCount=1、集合含 window/R1、rawFitness=objective−λ；lastPopulation 同樣保留集合、計數及 rawFitness。 |

接受本輪明示的世代定義：初始族群為第 0 代，generations 是子代批數，history.length=generations+1。核心數據、停止與命中統計已按此定義一致；N2 僅是圖軸未同步。

## 阻擋項（必修）

### N1 — auto λ 被有效值回寫成手動值，換資料後未重算（P2；B4 尚未完整落實）

**對應 SPEC：§5.1「λ 預設 n+1、資料變更重算」、§5.3。** 位置：ui.js runGA 第 434–435 行，以及 settings.ga 的保存／回填。

**實際重現（全程使用正常 UI 資料流）：**

1. default.json，n=6；選 direct／penalty，λ 留空。執行一批。
2. 第一批 effectiveParams.lambda 正確為 7，但 writeGaParams(effective) 把欄位填成「7」，settings.ga 也存成數值 7，auto 的 null 意圖遺失。
3. 載入 generateInstance(1,{nReq:30,nSat:6,nStation:3})，不編輯 λ，執行下一批。
4. **實際仍用 7，預期 auto 應為 31。** 程式轉而顯示低 λ 警示；使用者並未選擇手動降低權重。

受控執行紀錄：

```text
first:  n=6,  effective λ=7, input="7"
second: n=30, effective λ=7, input="7"
expected second auto λ=31
```

警示不能補回 auto 語意。此問題也會由「先跑 indirect，再換資料並選 penalty」進入，因 indirect 同樣會把解析後 λ 回寫。已凍結的單批有效參數正確，但「下一批應如何解析」的使用者設定與該批快照被混在一起。

**可直接採用的修改文字：**

> 分開保存使用者輸入設定與每批 effectiveParams。λ 留空時，設定持續保留 lambda=null 或明確 auto 模式；每批針對當次 norm 重新計算 n+1。控制項保留 auto 狀態，有效 λ 顯示在本批參數資訊；Worker、解槽、CSV 仍記該批實際數值。localStorage 保存 auto／manual 意圖。使用者明確指定的數值（包含 0、7）保持手動設定，不因換資料而覆寫。

**必補輸入＋預期：**

- λ 留空，在 n=6 執行後換成 n=30：兩批有效 λ 分別為 7、31；第一批匯出／快照仍是 7，第二批為 31。
- auto 設定保存並重新載入後，換資料仍重算。
- 手動 λ=7 或 0，換成 n=30 後仍保留手動值且顯示低 λ 警示。
- 先 indirect 再切 direct／penalty，同樣保留原本的 auto／manual 意圖。

### N2 — 曲線仍用第 1 代座標，第 0 代可被畫到畫布外（P2；B3 尚未完整落實）

**對應 SPEC：§5.2–5.3 每代曲線與統計一致。** 位置：ui.js drawGaChart 第 517、521、525 行。

核心 history 已改成 0..G，但繪圖仍把 history.length 當最大世代，使用：

```js
x(g) = L + (g - 1) / max(1, maxGen - 1) * plotWidth
// 刻度仍從 g=1 畫到 history.length
```

**實際合法反例：** default 資料，generations=1、stagnation=50；history 的 gen 為 [0,1]。600px 畫布、L=48、R=12 時：

- 第 0 代 x=**−492**，超出畫布。
- 第 1 代 x=48，停在繪圖區左端。
- 軸刻度卻為「1」在 x=48、「2」在 x=588。

審查方直接記錄原 drawGaChart 的 moveTo／fillText，得到上述數字；不是推測瀏覽器效能或截圖外觀。此合法短 run 的第 0 代資料被裁掉，且軸顯示了不存在的第 2 代。較長 run 也缺少第 0 代刻度與正確的繪圖範圍。

**可直接採用的修改文字：**

> 繪圖範圍與刻度依 history 的實際 gen 值建立，不用筆數充當最大世代。以 minGen=0、maxGen=各曲線最後世代的最大值，x(g)=L+(g−minGen)/max(1,maxGen−minGen)·plotWidth；刻度從 0 開始，與 history／CSV 同一編號。只有第 0 代時採安全的零跨度顯示。

**必補輸入＋預期：**

- generations=1、600px 畫布：gen=0 在 x=48、gen=1 在 x=588，兩筆均在繪圖區，刻度為 0／1，不出現第 2 代。
- direct／repair seed=1 的最佳世代 4，在圖軸、history、命中統計與 CSV 都對應第 4 代。
- 多 run 不同停止世代時，最長曲線末點對齊最大世代，沒有點因編號被畫到繪圖區外。

## 建議項（可延後）

無新增建議。A1 已在本輪提前落實。

## 針對 SPEC 開放問題的意見

無新增需 PO 決策的問題。既有 GA 編碼、算子、參考槽與 Worker 設計可保留；本輪只需補 N1 的 auto 設定語意及 N2 的第 0 代繪圖整合。

終端摘要：結論＝退回（列必修）；未落實數＝2（含部分落實 B3、B4）；新阻擋數＝2；建議數＝0。
