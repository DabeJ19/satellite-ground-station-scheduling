# Review S1 — Codex（r3）

| 項目 | 複審結論 |
|---|---|
| N1 | **已落實**：fmt 安全處理物件／陣列，validateData 先驗型別，checkFeasible／score 回受控 schema 錯誤，esc 與匯入路徑通過反例複驗（SPEC §2.1、§3、§8.4）。 |
| A3 | **已落實**：補入舊 solver reject、閒置初始化共用、初始化中 commit 三個 UI 情境，步驟名稱與斷言相符；等待 helper 的逾時改善列 C1，可於 S2 處理（SPEC §4.2 第 6 點、§8.3–8.4）。 |

## 結論：通過，可開 S2

被審 commit：`f0b2deab515df10901edd8927bd52fb992cff39d`（`f0b2dea`）。日期：2026-10-17（台北）。

**新阻擋數 0、建議數 1。** 本次複審確認 N1 必修已關閉，A3 的三個補測情境已加入。通過範圍為此固定 SHA 的 S1；不代表後續工程提交或 S2 已通過。

依指定順序讀取 S1-response 的 r2 回應、engine、ui、Node N1 測試、browser N1／A3 步驟，並掃描完整 engine／milp／ui 的轉字串與插值位置；另讀同 SHA 的 AGENTS 與建置所需來源。以 GitHub connector 讀取固定 SHA、查詢分支並比較 main。查詢時 main 只多一筆修改 `docs/REVIEW_PROMPT_S1-r3.md` 的提交，未納入審查。只新增本報告；既有工程、測試、審查檔均未修改。執行用副本與控制測試位於獨立暫存目錄，未提交；vendor 僅作建置依賴，未審其實作，未審既有 dist。

### N1 獨立複驗

每個資料測例都從該 SHA 的 default.json 全新複本開始，bad 值為 JSON.parse 產生的 `{"toString":null}`；另逐欄測 `[{"toString":null}]`，不是只測一個頻段欄位。

| 資料欄位 | 物件值 | 包陣列 |
|---|---|---|
| meta.timeOrigin | ok=false，對應 path，無例外 | 同左 |
| stations[0].antennas[0].band | ok=false，對應 path，無例外 | 同左 |
| visibility[0].sat | ok=false，對應 path，無例外 | 同左 |
| visibility[0].station | ok=false，對應 path，無例外 | 同左 |
| requests[0].sat | ok=false，對應 path，無例外 | 同左 |
| requests[0].band | ok=false，對應 path，無例外 | 同左 |

以上 **12 組**均通過。fmt 對這兩種值均回傳字串，沒有呼叫物件／陣列的 String 轉型；timeOrigin 的型別錯誤直接拒絕，不先轉型。

以正常 default norm 與單筆 R1/GS_1-S/0 排程，再分別替換 req、antenna、start：

| 排程欄位 | 物件值與包陣列的結果 |
|---|---|
| req | checkFeasible.ok=false，恰一條 schema；score.assigned=0、feasible=false、有 error，三個分數欄均有限。 |
| antenna | 同上。 |
| start | 同上。 |

以上 **6 組**均不拋錯；checkFeasible 與 score 分別實際呼叫。

另以未修改的 UI 原函式、最小 DOM 與受控依賴，對前述 **12 組完整 JSON**逐一呼叫 importJSONText：均回 ok=false，錯誤包含該 path，draft／committed data／revision／解槽保持原值，之後仍可載入預設資料。HTML 顯示經 esc 處理。這是 Node 控制測試，沒有宣稱實際瀏覽器驗收。

### A3 核對與執行

`tests/browser.s1.js` 已新增：

1. A 進入 solver 後 commit，再啟動 B，實際對 A 的 deferred 呼叫 reject；斷言 A 回 null，B 的狀態、按鈕、實例及解槽不變，B 完成後寫入目前 revision。
2. 以 _warmGLPK 呼叫與 boot 相同的 initGLPK，初始化 pending 時啟動首次 solve；斷言 factory 恰一次，solve 在該實例執行。
3. run 初始化 pending 時 commit，完成遲到初始化；斷言該實例 terminate、solve 從未呼叫、run 回 null、按鈕恢復。

本輪控制測試亦執行了原 UI 的舊 reject／新 run、實際 boot 與首次 solve 共用初始化、初始化中 commit；結果均符合上述語意。過期結果、錯誤及初始化都沒有改動有效 run 的狀態或 ownership。原誤稱「stale failure too」的步驟已改名，真正 reject 情境另有獨立測例。

### 剩餘 String／模板插值掃描

**仍有保留位置；N1 修正不等於刪除全部轉型。** 下表依實際呼叫來源判定。

| 位置 | 來源與結論 |
|---|---|
| engine 的 fmt | String 只接 number／boolean／bigint；字串用 JSON.stringify，物件／陣列由帶 catch 的 JSON.stringify 處理，symbol／function 回型別標記。N1 兩種 bad 值均安全。 |
| engine 的驗證／規則訊息 | path、索引與數值為內部值；重複 ID、頻段及資源訊息的原值已經 isId／normalize 驗證；非法 req／antenna／start 改用 fmt。沒有再把本輪六欄位或排程三欄位的非法物件直接插值。 |
| engine minutesToHHMM | timeOrigin 來自已驗證 norm，缺省用 00:00；h／mm 為計算數值。保留可接受。 |
| ui parseByType、移站錯誤訊息 | raw 與 el.value 來自 DOM 控制項的字串值；不直接接收尚未驗證的 JSON 物件。 |
| ui renderDataTab 的 bands.map(String)、String(a.band)、String(r.band) | draft 由驗證成功的資料建立，後續正常編輯值來自字串控制項；非法 JSON 匯入在替換 draft／渲染之前被拒。本輪 12 組匯入確認沒有到達這些轉型。 |
| ui esc、cssEsc、String(v.rule) | esc 對物件改走 fmt，其餘為純量；cssEsc 接核心產生的錯誤 path；rule 是核心定義的數字／字串枚舉。 |
| ui HTML／canvas 模板 | 表格值、選項、錯誤與文字標籤經 esc／val；其餘為內部索引、已驗證 ID／band、計算分數或 CSS 常數。canvas 的 ID／band 也來自 norm。 |
| milp 建模／變數診斷 | 列名、變數名為內部生成；插值 x 前已檢查為有限 number；目標、用時與規模是計算值或 GLPK 結果。 |
| 求解器與例外邊界 | ui 的 GLPK version、初始化 catch、solveMILP 的 String(err.message 或 err)，以及 milp 的 status、異常 z、LP status／例外訊息仍有轉型／串接。這些來自 GLPK／Error 介面，沒有由 JSON 資料欄位直接提供；A3 本輪實際使用 Error reject 通過。本次結論沒有擴張成對任意注入 solver 物件或任意 rejection 值的保證。 |

### 實際執行結果

在固定 SHA 的獨立來源副本執行，Node v24.19.0：

| 指令／檢查 | 結果 |
|---|---|
| `node tests/engine.test.js` | exit 0，**39 passed, 0 failed**；包含 N1、前輪 fixtures、ID、incumbent、LP 與預算回歸。 |
| `node build.js` | exit 0，**272 KB**；原樣 vendor 通過 build 的固定 SHA-256 檢查。 |
| 獨立 Node／UI 控制測試 | 12 組資料、6 組排程、12 組 UI 匯入與 A3 三情境均通過；另複驗倒序初始化、NOFEAS 不覆寫、引用編輯及儲存降級，無回歸。 |
| `node tests/browser.s1.js` | exit 1，launch 階段缺 Chromium headless shell（chromium_headless_shell-1234）；未進入測例。本環境沒有可替代 Chrome／Chromium，**未獨立複驗 19 步瀏覽器結果**。工程方在 response 記錄的 Chromium file:// 通過屬工程方自測。 |

## 阻擋項（必修）

無。N1 已由型別檢查、安全格式化及完整反例複驗關閉。

## 建議項（可延後）

### C1 — 為受控測試的等待條件加逾時（SPEC §8.3–8.4；可於 S2 處理）

browser 的 waitFor 以 setInterval 等條件成立，沒有逾時 reject。若回歸導致 pending 計數或 terminate 訊號永遠不出現，測試可能一直等待，無法進入後續斷言與 finally。這是測試失敗時的診斷與退出品質，不阻擋已驗證的 S1 行為。

**可直接採用的補文：**

> 共用 waitFor(predicate, label, timeoutMs=2000)，條件達成或逾時均清除 timer；逾時 reject Error，帶步驟名稱與等待條件，交由現有失敗處理非零退出並關閉 browser。補一例 predicate 永遠為 false，預期在上限內失敗且沒有殘留 interval。

## 針對 SPEC 開放問題的意見

無新增需 PO 決策的問題。維持前輪接受的 GLPK ownership、閒置實例保留、80/20 預算與版本閘門設計。

終端摘要：結論＝通過，可開 S2；新阻擋數＝0；建議數＝1。
