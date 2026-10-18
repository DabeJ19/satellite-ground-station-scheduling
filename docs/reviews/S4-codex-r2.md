# Review S4 — Codex（r2）

| 項目 | 複審結果（各項一行） |
| --- | --- |
| B1 壞解槽 | **已落實**（SPEC §2／§6 S4-r2、§8 S4）：六種結構不合法排程在匯入及 boot 均略過、提示且保留其他有效槽；合法但衝突的 manual 保留為不可行；純函式防護另見建議 C3。 |
| B2 先驗後套用 | **已落實指定反例**（SPEC §2／§6 S4-r2）：壞設定與外層匯入皆受控拒絕，資料、設定、播放、控制項、持久化及進行中 worker 不變；boot 壞設定回預設並提示；無標記 boot 判別差異另見 C2。 |
| B3 GA 預設回填 | **已落實**（SPEC §6 S4-r2）：`ga={}` 回復50／42／λ空白／runs20，實際 worker 使用50／42／auto；部分設定及 boot 也由固定預設補齊。 |
| B4 拖曳中 H 無效 | **已落實**（SPEC §6 S4-r2、§8 S4）：`''`／0／1.5 都使既有拖曳作廢；恢復有效 H 後需新 pointerdown 才能改時窗。 |
| C1 驗收追溯 | **已落實**（SPEC §7／§8 S4）：紀錄及入版控 JSON 含來源 commit、HTML SHA-256／bytes、OS、Node、瀏覽器渠道／版本；Chrome、Edge 明列未測。 |

## 結論：通過，專案收尾

被審 commit：`a98bc9ca2c5155ff4ebfcfa6cdc5f646e16e9d47`（`a98bc9c`）；其中程式碼 commit 為 `fb036dfb53ff588624417f42efb0927d443ec121`。**新阻擋數 0、建議數 2**。C2／C3 為額外邊界一致性建議，不重開已修正的四項 UI 阻擋。

已依指定範圍核對 S4-response、SPEC draft 7、UI 還原及拖曳程式、B1／B2／B3／boot／A1-B4 瀏覽器測例、驗收 Markdown 與原始 JSON，另核對 AGENTS.md、DECISIONS.md。遠端 compare 確認 fb036df→a98bc9c 只有兩份驗收文件差異；a98bc9c 之後 main 的 prompt／CLAUDE.md 提交不在範圍。本地不是 git checkout，使用 GitHub connector 固定 SHA 與 compare 核對，未執行 git fetch；只新增本報告，不改既有檔案、不審 dist／vendor。

執行結果：

- `npm test`：**78 通過、0 失敗**（39 engine＋19 GA＋15 anim＋5 build）。
- `node build.js`：成功，約 **421 KB**。
- `node tests/browser.s4.js`：本環境缺少 Chromium `chromium_headless_shell-1234`，啟動前失敗，**15 個瀏覽器步驟未執行**。沒有將工程方驗收紀錄冒充本環境實跑結果。
- 額外以 Node VM 載入被審原始 UI／核心模組，以 DOM／canvas stub、控制項字串轉換及實際事件 handler 複驗；GA 執行原始 worker 程式。這些補驗不取代真實 Chromium 畫面／下載驗收。

獨立複驗細節：

| 輸入／操作 | 結果 |
| --- | --- |
| 槽 schedule 為 `[null]`、`[7]`、未知 req、未知 antenna、start=1.5、重複 req | 六種皆分別測匯入與 boot：milp=null、skipped 含 milp、另一有效 GA 槽保留、顯示略過提示、無拋錯。 |
| 結構合法的衝突 manual 排程 | 還原成功、不列 skipped，feasible=false，保留共用 checker 的違規結果；沒有誤刪不可行手動解。 |
| `ga:'oops'`、`seed:{toString:null}`、settings陣列、popSize=1、tmlim=-3 | 匯入皆回 ok=false、不拋錯；boot 受控改載預設資料及50／42等預設參數並提示。 |
| `format:'other'`／null、version999、`requests:null`、slots陣列、revision0 | 匯入皆拒絕；`requests:null` 不再因 truthiness 被當工作區。標記版及無標記正常舊格式仍可還原。 |
| 上述11種匯入，期間有 GA worker 正在執行 | data／draft／revision／settings／槽／播放／控制項／localStorage快照皆未變；run物件相同、terminate次數0；補送原 worker 結果後可正常完成。 |
| 99／123／λ7 之後匯回 `ga={}` | 控制項及讀值回50／42／null／runs20；實際 worker 訊息參數為50／42／auto。 |
| 部分設定 `{ga:{popSize:10}}` 與 `ga={}` boot | 部分設定得到10／42／null，tmlim30；boot 空設定得到50／42／null／runs20，不沿用上一工作區。 |
| 無效 H 於拖曳途中設 `''`、`0`、`1.5` | 後續 move／up 均保持 end12；改回H80後直接 move 仍保持12，新 pointerdown 才可改16。 |
| 三槽白名單／原型鍵 | 只接受自有 manual／milp／ga；繼承的 milp 不會被還原。 |

驗收資料追溯核對：Markdown 與 `docs/acceptance/s4-playwright-chromium.json` 一致指向 **fb036df**、**431286 bytes**、SHA-256 `c6f7bb2b2a270eccb9d80bce1cf623c6393ab60dd5035d546e5cfe93b61f1f83`、Linux x64／Node22.22.0／Playwright Chromium141.0.7390.37。JSON 有15個 ok=true、passed=15、errors=[]、external=[]，九個下載名稱／大小與摘要相符。這是工程方送測產物的紀錄核對；本輪重建含不同 build 時間，不將其雜湊當成送測產物雜湊。

## 阻擋項（必修）

無。本輪四項原始阻擋均可關閉；現有 UI 匯入／boot 入口已隔離壞槽與壞設定。

## 建議項（可延後）

### C2 — 無標記工作區的 boot 判別可與匯入統一

對應：**SPEC §2／§6 S4-r2 工作區判別與共用還原**。額外輸入 `W={data:D,slots:{},requests:null}`（D為完整default.json）經 `importJSONText` 會走資料驗證並拒絕，符合指定反例；但同一 W 放在 localStorage 時，boot 直接呼叫 `restoreWorkspace`，仍還原 D 而不顯示拒絕提示，因還原函式沒有驗證無標記相容路徑的「不得有自有 requests」條件。

此差異不影響本工具正常匯出的工作區，也沒有拋錯或載入無效主資料，故列為非阻擋。

可直接採用的修改文字：

> 將工作區外層判別／驗證收斂到共用程序：無標記輸入必須有自有 data、slots 且沒有自有 requests；boot 不符合時載入預設並提示，匯入則拒絕且不動狀態。保留正常無標記舊儲存格式相容性。

補測：同一 W 分別測匯入與 boot；前者拒絕不改狀態，後者使用預設並提示；刪除 requests 欄位後兩者均可還原。可於後續維護處理。

### C3 — `contactState` 的直接呼叫尚未符合新防護敘述

對應：**SPEC §6 S4-r2「接觸狀態對 null／非物件元素跳過」**。工作區入口已驗證並略過此類槽，但直接呼叫 `SGS.anim.contactState(norm,[null],0)` 仍拋出 `Cannot read properties of null (reading 'req')`。本輪沒有修改 anim.js，UI 正常還原路徑不會把此輸入傳入，因此不作為收尾阻擋。

可直接採用的修改文字：

> 在 `contactState` 排程遍歷開頭跳過 null、非物件及陣列元素，再取 req／antenna；維持目前合法項目的半開區間判定。

補測：`contactState(norm,[null,7,[],validTask],t)` 不拋錯，結果只由 validTask 貢獻；讓純函式單元測試直接覆蓋這項契約，而不只依賴 workspace validator。可於後續維護處理。

## 針對 SPEC 開放問題的意見

無新增需 PO 決策的開放問題。接受 draft 7 的白名單設定、固定預設、逐槽略過、先驗後套用與拖曳作廢規則。C1 已完成；C2／C3 是額外邊界一致性建議，不影響指定 UI 驗收反例已修正的結論。
