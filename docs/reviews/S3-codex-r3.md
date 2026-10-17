# Review S3 — Codex（r3）

**N1：已落實**（SPEC §6 播放資料來源、§8 S3）。`setSlot()` 寫入選中槽時先同步、再儲存與重畫；未選中槽不改檢視時間；`ensureManual()` 切槽及 boot 還原後亦補同步。指定的 GA／MILP、比例、時間原點與暫停反例均通過。

## 結論：通過，可開 S4

被審 commit：`841993f53e71ecd424626591e7c05c7563e727d6`（`841993f`）。**新阻擋數 0、本輪新增建議數 0**。

已依序核對 `docs/reviews/S3-response.md` 的 r2→r3 回應、`src/ui.js` 的 `setSlot`／`ensureManual`／boot、`tests/browser.s3.js` 的 N1 步驟，以及 SPEC §6 新增的解槽寫入同步規則；DECISIONS.md 也有對應紀錄。main 當時只比被審 SHA 多新增 prompt 檔的提交，未納入範圍。工作目錄不是 git checkout，使用 GitHub connector 固定 SHA 與 compare 核對，未執行 git fetch；只新增本報告，不改既有檔案，不審 dist／vendor。

獨立複驗結果：

| 路徑／輸入 | 實測與預期 |
| --- | --- |
| GA：H80 選中槽 t70，提交 H40 後重新執行 GA | 新槽 H40，**t40／滑桿100%／10:40／動畫t40／playing=false**；槽 revision 等於目前 revision。 |
| 零候選 MILP：選中舊 H120 槽 t100，提交 H40、`requests=[]` 後 `solveMILP()` | 實際零候選求解流程回傳合法空解；替換後 **t40／100%／10:40／動畫t40／playing=false**。 |
| 一般比例：H80 槽 t20，換成 H40 槽 | t保持20，滑桿由25%改為**50%**；不是僅在超界時才同步。 |
| 時間原點改為20:00 | 新槽 t20 的控制列標籤為**20:20**；另測只改 origin、不改 H，也正確更新。 |
| 更新未選中的 MILP 槽 | 以目前 H120、零需求資料求解，GA 仍被選取；其 **H40／t20／滑桿50%／20:20／動畫t20** 全部不變。 |
| `ensureManual()` 由舊快照切入目前版手動槽 | 依目前版 H40 將t70夾至40，滑桿100%、標籤10:40；原 GA 槽保持原快照。 |
| boot：目前資料 H40／20:00，還原選中的舊 GA 快照 H80／10:00 | 還原後依選中快照同步，H80／t0／滑桿0%／10:00／動畫t0，保持暫停。 |

驗證方法與限制：

- `npm test`：**72 通過、0 失敗**（engine 39、GA 19、anim 14）。
- `node build.js`：成功，約 **374 KB**；vendor 僅作建置依賴。
- `node tests/browser.s3.js`：缺少 Chromium `chromium_headless_shell-1234`，啟動階段失敗，**13 個瀏覽器步驟未執行**。未將工程方自測當成本環境實跑結果。
- 上表以 Node VM 載入原始 UI 與核心模組複驗，DOM／canvas 使用 stub；GA 跑原始 worker 程式，MILP 走 `solveMILP()` 與零候選分支（不呼叫求解器）。檢查 t、拉桿、標籤、動畫狀態與 playing，並核對新增瀏覽器測試有硬斷言。這些檢查不取代真實 Chromium 的畫面驗收。

## 阻擋項（必修）

無。上輪 N1 已關閉；本輪修改範圍未發現新阻擋。

## 建議項（可延後）

本輪無新增建議。前輪 **A1（band／color 重繪、無效 H 停用拖曳）**及 **A2（大量衛星畫布容量）**已在 r2 回應與 DECISIONS.md 明確安排於 **S4**，維持原待辦，不作為本輪 S3 阻擋，也不重複計入新增建議數。

## 針對 SPEC 開放問題的意見

無新增開放問題。SPEC §6 已將「寫入選中槽也同步、未選中槽不改檢視時間」寫明，實作及 N1 測試與此一致；無須改動既有 PO 決策。
