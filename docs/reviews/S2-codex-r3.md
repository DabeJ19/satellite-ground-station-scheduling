# Review S2 — Codex（r3）

| 項目 | 複審結論 |
|---|---|
| N1 | **已落實**：使用者設定與 effectiveParams 分開，auto 在 n=6／30 分別為 7／31，手動 7 保留並警示；控制項不被有效 λ 覆寫（SPEC §5.1、§5.3）。重開頁面的完整參數回填另列 A2，於 S4 處理。 |
| N2 | **已落實**：圖軸依實際 gen=0..maxGen，generations=1 的第 0／1 代位於繪圖區左右端，刻度為 [0,1]；多曲線也依最大實際世代對齊（SPEC §5.2–5.3）。 |

## 結論：通過，可開 S3

被審 commit：`a07b08389d164eb34bf945af5ae81079e7260a9d`（`a07b083`）。日期：2026-10-17（台北）。

**新阻擋數 0、建議數 1。** 前輪 N1／N2 的指定反例均通過，S2 必修可關閉；完整持久化回填列為 S4 建議，不影響本輪已驗證的單次／跨資料版本執行。

依指定順序閱讀 S2-response 的 r2 回應、ui 的 effective／lambdaMode 與 drawGaChart、browser N1／N2 步驟；另讀同 SHA 的 AGENTS、DECISIONS 與測試／建置依賴。透過 GitHub connector 固定 SHA、查詢分支並比較 main；查詢時 main 只多一筆 REVIEW_PROMPT_S2-r3.md 修改，未納入審查。工作區不是 git checkout，執行使用獨立暫存來源副本。只新增本報告，不改既有檔案；vendor 僅作原樣建置依賴，未審其實作，未審既有 dist。

### N1：獨立反例複驗

以未修改的 UI 函式、最小 DOM、記憶體 localStorage 與原 Worker 腳本文字在 Node VM 執行：

| 操作 | 實際結果 |
|---|---|
| default n=6、direct／penalty、λ 留空 | effective λ=7、lambdaMode=auto，輸入仍空白，settings.ga.lambda=null。 |
| 載入 30 需求資料，不編輯 λ，再執行 | effective λ=31、mode=auto，輸入仍空白，沒有低 λ 警示；結果顯示 auto=\|R\|+1。 |
| 檢查兩批資料 | CSV 各記 7／31；保存的第一批解槽快照仍為 7，不被第二批改寫。 |
| n=30 手動輸入 7 | effective λ=7、mode=manual，完成狀態顯示「不再保證可行解優先」。 |
| 留空，先 indirect 再切 direct／penalty | 仍維持 auto，n=30 使用 31。 |
| 保存 auto 設定，重新建立 app 並讀取保存資料 | λ 設定保存為 null；下一次執行仍依當次 n 使用 n+1。其他 GA 控制項的完整回填見 A2。 |

原本在 runGA 內回寫 effective λ、把 auto 變成手動值的根因已移除。effectiveParams 凍結並記 lambdaMode；使用者設定保存 input，Worker／解槽／CSV 保存該批實際數值，分工正確。

### N2：座標與刻度複驗

直接記錄原 drawGaChart 的繪圖呼叫及 state.lastGaChart，未改寫應用程式來源。

| 輸入 | 實際結果 |
|---|---|
| 600px 畫布、generations=1、stagnation=50 | history=[0,1]；plotLeft=48、plotRight=588；gen0.x=48、gen1.x=588；ticks=[0,1]。實際 moveTo／lineTo 使用相同座標，不再出現 x=−492。 |
| direct／repair、seed=1、generations=100、stagnation=50、3 runs | 最後世代為 [54,56,63]，圖軸 maxGen=63；所有點在 [48,588]，最長曲線末點在 588。 |
| 第一個 direct run 的命中世代 | best.gen=4，history 首次 (5,11) 的 gen=4，圖中亦使用 gen=4 的座標。 |

minGen=0、maxGen 取實際最後世代，刻度含 0 與最大世代；零跨度以 max(1,span) 防止除零。繪圖與 history／CSV 已使用同一世代編號。

### 測試與建置

| 指令／檢查 | 結果與界線 |
|---|---|
| `npm test` | exit 0，**engine 39＋GA 19 項全過**，合計 58 項。 |
| `node build.js` | exit 0，**343 KB**；固定 vendor SHA-256 驗證通過。 |
| 審查方 N1／N2 控制測試 | 上述 auto／manual、跨資料版本、保存、CSV 與圖軸反例均通過。 |
| `node tests/browser.s2.js` | exit 1，launch 階段缺 Chromium headless shell（chromium_headless_shell-1234），未進入測例；本環境無替代 Chrome／Chromium。**未獨立複驗工程方的 15 步 Chromium file:// 結果。** Node 控制測試不代替實際瀏覽器與視覺驗收。 |

browser 的 N1 已加入兩次資料版本、手動 λ、間接轉罰則與 auto reload 斷言；N2 已加入一代短 run 及三 run 的範圍、刻度、右端與命中世代斷言，對應本輪缺口。

## 阻擋項（必修）

無。N1、N2 均可關閉。

## 建議項（可延後）

### A2 — 重開頁面後回填已保存的 GA 參數（SPEC §2、§8 S4；可於 S4 處理）

boot 先 initGA，之後才 loadLS／還原 state.settings；結尾只重新回填 tmlim，沒有再次 writeGaParams。因此保存內容雖正確，GA 控制項仍可能顯示 HTML 預設值。

獨立控制測試：n=30、direct／penalty、手動 λ=7 保存後重新建立 app，localStorage 及 state.settings.ga.lambda 都是 7，但 λ 控制項為空白，encoding 控制項回到 indirect。現有 auto reload 測試因 auto 本來就是空白，無法偵測這個差異。

此為重開頁面的參數恢復缺口；本輪指定的同頁面 auto 重算與手動保留已通過，完整持久化驗收可於 S4 補齊。

**可直接採用的修改文字：**

> 在 loadLS 還原 settings 後呼叫 writeGaParams(state.settings.ga)，或先載入 settings 再初始化 GA 控制項。lambda=null 回填空白，手動數值照原值回填；同步恢復 encoding、directMode 與其他 GA 參數，保留已完成批次的 effectiveParams 快照。

**補測輸入＋預期：** 保存 direct／penalty、λ=7、popSize=10、generations=10 後 reload，四者控制項均恢復；n=30 再執行仍用手動 7 並警示。另測 auto=null reload 後仍空白、有效值為 31，並比對其他已保存控制項。

## 針對 SPEC 開放問題的意見

無新增需 PO 決策的問題。可依既定規格開 S3；A2 納入 S4 的持久化驗收。

終端摘要：結論＝通過，可開 S3；新阻擋數＝0；建議數＝1。
