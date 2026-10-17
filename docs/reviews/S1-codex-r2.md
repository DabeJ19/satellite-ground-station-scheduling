# Review S1 — Codex（r2）

| 項目 | 逐項結論與章節 |
|---|---|
| B1 | **部分**：requests={}、缺 antennas、HTML durMin 已修；部分非法 JSON 欄位仍使驗證器拋 TypeError，見 N1（SPEC §2.1、§3、§8.4）。 |
| B2 | **部分**：Map、逗號六對與 NUL 複合鍵已修；schema 錯誤訊息仍可讓 checkFeasible／score 拋錯，與 B1 同屬 N1（SPEC §2.1、§3、§4.1）。 |
| B3 | **已落實**：無 incumbent 不解碼／寫槽，檢查變數與 z，LP reject 保留有效 incumbent（SPEC §4.2 第 2–4 點）。 |
| B4 | **偏離，可接受**：只銷毀進行中 run 的實例，閒置實例保留；世代號、single-flight 與初始化後閘門可維持 ownership（SPEC §4.2 第 6 點、§8.3）。 |
| B5 | **已落實**：change 重建引用選單、保留無效舊值，換站找不到目標時不移動（SPEC §2.1、§6、§8.4）。 |
| B6 | **已落實**：未知停止原因不標超時，LP 依 deadline 剩餘量及配額決定是否啟動與 tmlim（SPEC §4.2 第 1、3、4 點）。 |
| B7 | **部分**：硬斷言、async runner、真實 UI 函式路徑與初始化倒序已補；工程測試仍缺實際 reject 舊 run，以及 boot／初始化中 commit 的獨立斷言，見 A3，可於 S2 補（SPEC §8.3–8.4）。 |
| A1 | **已落實**：metadata 加 data-path，H／預設校準錯誤可高亮與清除（SPEC §2.1、§6、§8.4）。 |
| A2 | **已落實**：儲存失敗顯示 JSON 備份提示、不中止操作，恢復成功清除提示（SPEC §2、§8 S4）。 |

## 結論：退回（列必修）

被審 commit：`74e55da9b23ffc7e48342ddb74eb20a3301d8f98`（`74e55da`）。日期：2026-10-17。

**新增阻擋 1 項（N1，B1／B2 共用缺口），建議 1 項（A3）。** 九項核對為：已落實 5、偏離可接受 1、部分 3、未落實 0。「未落實 0」不代表全部完成；B1／B2 的部分落實仍須修正。本輪不開 S2。

依指定順序讀取 response、engine、milp、ui、兩個測試檔、SPEC §4.2、DECISIONS 末段；另讀同 SHA 的 AGENTS、build 與建置所需來源。main 查詢時僅多一個修改 `docs/REVIEW_PROMPT_S1-r2.md` 的提交，未納入審查。工作區沒有 git checkout，以 GitHub connector 固定 SHA 取代本機 fetch／分支查詢；在獨立暫存副本執行檢查。只提交本報告，不修改既有檔案；vendor 僅作原樣建置依賴，未審其實作，未審既有 dist。

### 實際執行結果與上輪反例複驗

| 指令／檢查 | 結果 |
|---|---|
| `node tests/engine.test.js` | exit 0，**37 passed, 0 failed**。包含 fixtures、邊界、轉換 oracle、狀態、LP 及假時鐘回歸。 |
| `node build.js` | exit 0，**271 KB**；vendor 雜湊通過 build 的固定 SHA-256 檢查。 |
| `node tests/browser.s1.js` | exit 1，啟動前找不到 Chromium headless shell（`chromium_headless_shell-1234`）。本環境無可替代 Chrome／Chromium，**未重跑瀏覽器驗收**；不是功能測例失敗。工程方的 15 步通過仍屬工程方自測。 |
| 審查方補充控制測試 | Node v24.19.0 直接載入未修改的 engine／milp／ui，以最小 DOM、注入 factory 與受控 promise 檢查原函式。以下 UI 結果屬控制測試，不能代替 Chromium、實際 Worker 或視覺驗收。 |

| 指定反例 | 本次觀察／判定 |
|---|---|
| requests={}、缺 antennas | 回 ok=false 與正確 path，不拋錯；UI 匯入失敗保留 committed data、draft、revision、解槽。 |
| HTML durMin | 拒絕匯入、表格內容不被替換，錯誤 HTML 沒有新增 img 落點；實際瀏覽器事件執行未測。 |
| constructor／toString id | 原回歸通過；另把 constructor、toString、__proto__ 分別作需求／天線／衛星／站的合法 ID，12 組均可建模並通過對應排程檢查。未知原型名稱依 schema 拒絕，分數有限。 |
| 逗號六對 | 四需求同天線同時通訊，rule 1 **恰六對**，未因鍵碰撞少報。 |
| NUL 複合鍵 | 原兩對 visibility 不再混合；r/v 候選為 []，r/v/0 報 window。 |
| NOFEAS 覆寫 | solve 回 hasIncumbent=false、schedule=null、score=null；UI 保留原 MILP 槽並顯示「解槽未更新」。UNDEF／INFEAS／UNBND 亦不當作空解。 |
| 矛盾 OPT／LP reject | vars={}、z=5 被判結果無效；0.5 變數被拒。合法 FEAS→LP reject 保留 (5,11)、1194/241，bound.unavailable 且附警告。全零 incumbent 與零候選空解仍接受。 |
| 初始化倒序 | A 初始化中取消、啟動 B，先完成 B 再完成 A：started=[B]；先清理 A，cancel B 後 terminated=[A,B]；現用實例不被 A 覆蓋。 |
| boot／commit／舊失敗 | boot 與首次 solve 共用一次初始化；初始化中 commit 使舊 run 失效，遲到實例被清理且不求解。新 run 已啟動後舊 promise reject，舊回傳為 null，狀態／按鈕／新實例保持不變，新結果可正常入槽。 |
| S→Ku、站改名、天線移站 | handler 重繪含 Ku 與「S（無效）」；引用未修時拒絕提交，修完只增一個 revision。站改名後可修正 visibility；無效移站不改巢狀資料，移 GS_1-S→GS_2 後數量 0/3、候選 [3,4,5]。 |
| 960 ms／31 s 預算 | tmlim=1、960 ms 回 FEAS，不標超時且只呼叫 [1]；tmlim=30、31 s 回 FEAS，只呼叫 [24]、不跑 LP；28 s 回 FEAS 剩 2 s 時呼叫 [24,2]。OPT 不加超時註記。 |
| A1／A2 | H=0、全域校準 −1 的對應欄位標 invalid，還原後清除；setItem 拋配額錯誤仍可提交且顯示備份提示，恢復後提示消失。 |

### B4 差異判斷

**接受保留閒置實例。** 取消的必要效果是讓活動 run 失效並清理其求解資源；沒有活動 run 時保留可重用的實例符合此目的。此版本在 run 開始等待初始化前已設 solving=true，cancel 因而能遞增世代；遲到初始化會自行 terminate。初始化後再次檢查 runId，過期成功與錯誤也通過同一閘門。這同時避免 boot 的初次 commit 無故破壞共用初始化。

受控測試亦確認閒置 cancel／commit 不 terminate，而活動 run 取消及初始化中 commit 會清理。此差異不構成必修，也不要求改成每次取消都重建。

## 阻擋項（必修）

### N1 — 非法欄位在錯誤訊息中強制轉字串，仍會拋 TypeError（P2；B1／B2 未完整落實）

**對應 SPEC：§2.1、§3、§8.4。** 位置：`src/engine.js` 的 validateData（第 26、62、70–71、82–83 行）、checkFeasible（第 207–209 行），以及呼叫它的 score；UI importJSONText／loadData 亦受影響。

型別檢查本身已加入，但錯誤分支的 `String(value)` 仍可能執行物件的字串轉型。以下是普通、可由 JSON.parse 產生的資料，不需要函式、Proxy 或循環引用：

```js
require('./src/engine.js');
const fs = require('fs');
const E = SGS.engine;
const base = JSON.parse(fs.readFileSync('src/data/default.json', 'utf8'));
const badValue = JSON.parse('{"toString":null}');

const d = structuredClone(base);
d.requests[0].band = badValue;
E.validateData(d); // 實際：TypeError: Cannot convert object to primitive value

const norm = E.normalize(base);
const s = [{ req: badValue, antenna: 'GS_1-S', start: 0 }];
E.checkFeasible(norm, s); // 同樣拋 TypeError
E.score(norm, s);         // 同樣拋 TypeError
```

獨立把同一 badValue 放在 `meta.timeOrigin`、`stations[0].antennas[0].band`、`visibility[0].sat`、`visibility[0].station`、`requests[0].sat`、`requests[0].band`，六次 validateData 都拋錯；在排程的 req／antenna／start 各測 checkFeasible 與 score，另六次亦拋錯。

UI 控制測試對 `SGS.app.importJSONText(JSON.stringify(d))` 也重現例外。JSON 語法是合法的，因此 parse 的 catch 不會處理後續驗證錯誤。既有有效狀態雖保留，呼叫卻沒有回傳 ok=false，也沒有正常顯示欄位錯誤。這違反本輪採納的「任何 JSON 值回受控診斷」及共用核心拒絕非法排程的契約。

**可直接採用的修改要求：**

> 對 timeOrigin、band、sat、station、排程 req／antenna／start，先依各欄位契約驗證型別，再處理格式或引用。型別不符時直接回傳固定的型別錯誤訊息與欄位 path／schema 違規；若需顯示原值，使用不會對物件／陣列呼叫 String 或隱式字串轉型的安全格式化函式。validateData、checkFeasible、score 本身都須對這些非法 JSON 值回傳受控結果，UI 保持原資料、版本、解槽並顯示驗證錯誤。

**必補測例（輸入＋預期）：**

- default.json 全新複本，分別把上述六個資料欄位設為 `{"toString":null}`：validateData 不 throw、ok=false、errors 指向該欄；不得進入求解。
- 正常 default norm，排程單筆 R1/GS_1-S/0 分別把 req、antenna、start 設為該物件：checkFeasible 不 throw、ok=false 且回 schema；score 不 throw、feasible=false、有受控診斷且數值有限。
- 由 importJSONText 匯入 band 為該物件的完整 JSON：回 ok=false、錯誤指向 requests[0].band，draft／committed data／revision／解槽保持原值；接著仍可成功載入預設資料。
- 將該物件包在陣列中亦作型別錯誤回歸，確保安全格式化不再經陣列 join 間接觸發相同轉型。

N1 是一個共用根因，**不把 B1／B2 兩處症狀重複計成兩項阻擋**。

## 建議項（可延後）

### A3 — 補齊工程方 UI 回歸的舊失敗與初始化情境（SPEC §4.2 第 6 點、§8.3–8.4；可於 S2 共用 GA 閘門前處理）

`tests/browser.s1.js` 第 182 行的步驟名稱寫「stale failure too」，但實際只呼叫 deferred.resolve，沒有 reject。初始化倒序已有測試，但 boot／首次 solve 共用初始化、初始化中 commit 的獨立斷言仍未補入工程測試。這些行為本輪審查方控制測試均通過，原始碼閘門亦一致，故作為非阻擋補測。

**可直接採用的補文：**

> 追加受控 UI 測例：run A 進入求解後提交新版本並啟動 B，A 的 solver promise reject；預期 A 回 null，B 的解槽、狀態文字、按鈕及 GLPK ownership 均不改，B 完成後可入槽。另分開測 boot 初始化尚未完成時首次 solve 只呼叫一次 factory，以及 run 初始化中 commit 使遲到實例 terminate 且不呼叫 solve。使用可觀測的 pending／started 訊號推進時序，取代固定 10 ms 等待。完成前調整「stale failure too」名稱，使名稱與已有斷言一致。

## 針對 SPEC 開放問題的意見

無新增需 PO 決策的問題。接受 B4 的閒置實例保留與既定 80/20 配額；本輪退回原因僅為 N1 的受控輸入錯誤契約仍未封閉。

終端摘要：結論＝退回（列必修）；未落實數＝0（另有部分落實 3：B1、B2、B7）；新阻擋數＝1；建議數＝1。
