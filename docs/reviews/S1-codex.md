# Review S1 — Codex

## 結論：退回（列必修）

被審 commit：`743ac33549b61114e12cd6d8609fde94f6252fae`（`743ac33`）。日期：2026-10-17（台北）。**阻擋數 7、建議數 2。** 本輪不開 S2。下列 B1–B7 修正後再複審；沒有要求推翻既定 MILP、GA 或 80/20 時間分配決策。

依指定順序讀送審單、SPEC §1–§4/§8、engine、milp、ui、build、兩個測試檔；另讀同 SHA 的 AGENTS、DECISIONS、index.html/style.css/default.json 與執行所需骨架。只新增本報告，沒有修改既有工程檔。main 在查詢時只多一個修改 REVIEW_PROMPT_S1.md 的提交，未納入審查。

### 審查方實際執行結果

在獨立暫存目錄還原固定 SHA 的來源副本，Node v24.19.0：

| 指令／檢查 | 結果與界線 |
|---|---|
| `node tests/engine.test.js` | exit 0，**20 passed**。 |
| `node build.js` | exit 0，產生 **262 KB** 的單檔。vendor 僅原樣取作建置依賴，未審其實作；未審既有 dist。 |
| `node tests/browser.s1.js` | exit 1，Playwright 找不到 Chromium headless shell：`Executable doesn't exist ... chromium_headless_shell-1234 ...`；本環境沒有可替代的 Chrome/Chromium 執行檔，未完成瀏覽器驗收，不能把這次錯誤歸因為專案功能失敗。 |
| 審查方 Node／VM 反例 | 直接載入未修改的 engine/milp/ui 原始碼，使用受控 GLPK／時鐘／最小 DOM 物件，重現 B1–B6；UI VM 測試是原函式路徑的控制測試，不是實際 Chromium 操作。 |
| 小模型等價對照 | H=2、2 衛星各一需求、同站 2 支 S 天線、d=1、c=0、完整 [0,2) visibility：8 個候選，256 個 0/1 指派，LP 列可行性與 checkFeasible 的 ok **0 個差異**。 |

原測試全綠只證明現有案例，不能排除已重現的反例；工程方的 file:// GLPK 實跑仍是工程方自測，本輪未重新確認其瀏覽器結果。

### 分項結論

| 對象 | 明確結論 |
|---|---|
| checkFeasible 五條規則 | 正常合法 ID 下，通訊重疊報 rule 1、僅校準不足報 rule 2、同衛星通訊重疊報 rule 3，半開邊界正確。固定 d 從需求衍生，沒有可變 duration，rule 4 不需另報。頻段錯誤優先報 5 而不疊加 window，屬明示的診斷分工，不改可行域，可接受。schema／去重仍有 B1、B2。 |
| normalize／feasibleStarts | 一般資料的相鄰／重疊合併、null/缺省 fallback、c=0、end 等於時窗終點、校準跨 H 均正確；但未封閉資料型別且字串鍵有碰撞，不能對所有 SPEC 合法 ID 宣稱等價。 |
| buildLP 列與目標 | 一般 ID 下與 §4.1 相符：每需求、天線 [t,end+c)、衛星 [t,end)，目標係數 `1−(t−r.start)/(nH+1)` 正確。空列恆真，單變數列 x≤1 由 binary／relax 的 0..1 界隱含，裁剪等價。原型鍵 ID 會在分組時崩潰，見 B2。 |
| relax | 移除 binaries/generals，以每變數 `GLP_DB,lb=0,ub=1` 表達連續鬆弛，正確。單需求唯一候選測試得到 1 變數、0 列、binary x0；relax 保留其顯式 0..1 界。 |
| solve 狀態與上界 | 只在 LP OPT 接受 U 的方向正確，U<L 有顯式錯誤；但無 incumbent 的處理、LP 例外及時間原因有 B3、B6。 |
| UI revision/runId | 已進入實際求解的正常返回路徑有接受閘門；commit 同步先 cancel 再換版本，在同一 JS turn 不會插入舊 completion，順序本身可接受。但初始化 await 的競態不在閘門保護內，見 B4。 |
| 編輯與引用 | 正常天線換站程式會移動巢狀天線，再由 normalize 解析新所屬站，不會因天線 id 還含舊站字樣就判錯；但頻段／站／衛星改名後選單與引用不一致，見 B5。 |
| build | 固定 SHA、export 唯一尾端、inline 標記、JSON 敏感字元轉義對本次輸入皆通過；不構成本輪阻擋。 |

## 阻擋項（必修）

### B1 — 驗證器會拋例外，且匯入先渲染後驗證（P1；SPEC §2.1、§3、§6、§8.4）

位置：`src/engine.js:12–73`、normalize；`src/ui.js:91`、renderDataTab、loadData。

**實際構造與結果：**

1. 完整 default.json 只把 `requests` 換成 `{}`：`validateData()` 直接拋 `TypeError ... forEach is not a function`，沒有回傳 `{ok:false,errors}`。其他集合的型別檢查亦放在 forEach 之後；`stations[].antennas={}` 即使先記錯誤，仍繼續呼叫 forEach。
2. 完整 default.json 刪除 `stations[0].antennas`：validateData 回 `{ok:true,errors:[]}`，normalize 隨即拋 `Cannot read properties of undefined (reading 'forEach')`。驗證成功不能保證可正規化。
3. 完整 default.json 把 R1.durMin 換成字串 `"><img src="data:," onerror="globalThis.__reviewProbe=1">`，經 `SGS.app.loadData()`：驗證雖然失敗，但 VM 捕捉到該 img／onerror 原樣出現在 `#tblReq tbody.innerHTML`。原因是 renderDataTab 在驗證之前，且數字欄位直接插值未轉義。FileReader 匯入走同一順序。這已確認 HTML 注入落點；本環境未在實際瀏覽器執行 onerror。

錯誤 JSON 結構還會先取代 draft，令後續渲染／恢復操作面臨已污染結構；外層 catch 把渲染或驗證例外一律寫成「JSON 解析失敗」也不準確。

**可採用的修正要求：**

> validateData 先驗證頂層與所有集合／元素的型別，再遍歷；缺少 antennas 陣列應明確拒絕或依明文契約正規化成空陣列，不能一處接受、一處崩潰。任何 JSON 值都必須回錯誤而非 TypeError。匯入先在區域變數完成 parse→schema／資料驗證→normalize，成功後才替換 draft／commit 與渲染；失敗保留原 committed data、revision、解槽及可操作的編輯器。所有輸入欄位的 HTML 值均轉義，或以 DOM property 設 value，不因聲稱數字欄位就信任輸入。

**補測輸入＋預期：** 以上三例；另逐一把 satellites/stations/visibility/requests/antennas 設成 `{}`、`null`、錯誤元素。預期不 throw、ok=false 且有欄位 path；UI 匯入失敗不產生額外 img／事件屬性，不改 revision 或有效解槽，仍可載入預設資料。安全字串可檢查 DOM 結構，不需真的執行事件。

### B2 — ID 索引與去重鍵不具安全、唯一的表示（P1；SPEC §2.1、§3、§4.1）

位置：`src/engine.js:102–132,175,188–189,226`；`src/milp.js:21,28–29,41–42`。SPEC 允許非空字串 ID，沒有排除下列輸入。

**實際構造與結果：**

- default.json 只把 R1.id 改為 `constructor`：validateData 成功、normalize 成功，但 buildLP 拋 `byReq[v.req].push is not a function`；byAnt/bySat 亦有同類 `{}` 原型鍵問題。
- 在正常 default norm 對 `[{req:'toString',antenna:'GS_1-S',start:0}]` 呼叫 checkFeasible：應為未知需求 schema，實際卻把原型函式當需求，報 rule 5 且 reqs 內容為 undefined；score 算出 assigned=1、totalWait/objective=NaN（JSON 序列化顯示 null）。
- 四需求 id 依序 `['a,b','c','a','b,c']`，分屬四顆衛星、同支天線 A、c=0、d=1、start=0，需求／visibility 都 [0,10)。預期恰 6 個不同需求對的 rule 1，實際只 5 個：`['a,b','c']` 與 `['a','b,c']` 被 `join(',')` 合成相同去重鍵。
- 以下完整資料通過驗證，卻把沒有可見時窗的任務判可行（JSON 中 `\u0000` 是字串內的 NUL）：

```json
{
  "meta":{"horizonMin":6,"calibDefaultMin":0},
  "bands":["S"],
  "satellites":[{"id":"a\u0000b"},{"id":"a"}],
  "stations":[
    {"id":"c","antennas":[{"id":"u","band":"S"}]},
    {"id":"b\u0000c","antennas":[{"id":"v","band":"S"}]}
  ],
  "visibility":[
    {"sat":"a\u0000b","station":"c","start":0,"end":1},
    {"sat":"a","station":"b\u0000c","start":5,"end":6}
  ],
  "requests":[{"id":"r","sat":"a","band":"S","durMin":1,"start":0,"end":1}]
}
```

`feasibleStarts(norm,'r','v')` 實際為 `[0]`，checkFeasible 對 r/v/0 實際回 ok=true。正確應是候選 `[]`、window 違規，因該衛星／站只在 [5,6) 可見。以 NUL 串接的 `(sat,station)` 鍵發生碰撞，導致兩對 visibility 被合併。

**可採用的修正要求：**

> ID 索引／分組使用 Map 或無原型字典，查詢必須確認 own key，未知 ID 不得落到 Object.prototype。複合鍵使用真正的巢狀 Map 或無歧義 tuple 編碼；違規鍵可用 JSON.stringify([rule,排序後reqs])，不能用分隔字元直接串接，也不能再用 split 還原任意 ID。score 對結構非法排程維持明確的錯誤／不可行結果，不產生 NaN。

**補測輸入＋預期：** 上述四組完整重現；constructor/toString/__proto__ 作已存在 ID 時依正常語意工作，未知時回 schema；逗號組恰六對；NUL 組不得跨衛星／站借用時窗。另測 score(norm,{}) 應回受控錯誤／不可行診斷，不在 checkFeasible 已判 schema 後再對非陣列呼叫 forEach 而崩潰。

### B3 — 無 incumbent 被轉成可行空解，LP 例外又會丟掉有效 incumbent（P1；SPEC §4.2 第 2–4 點、§6）

位置：`src/milp.js:109–136`；`src/ui.js:235–241`。

**實際構造與結果：** 以 default norm，注入 `glpk={...M.K,solve:async()=>({result:{status:4,vars:{},z:0}})}`。M.solve 實際回 `schedule:[]、feasible:true、error:null、score=(0,0,0)`；status=1 亦同。UI 真實 solveMILP 函式的 VM 路徑會把該空排程寫進 MILP 槽，蓋掉既有結果，因 `[]` 為 truthy。這違反「無 incumbent 不得把空值解碼成結果」。

另以 status=5、vars={}、z=5 注入，實際顯示「已證明最佳」卻給空排程／score=0，沒有檢查 solver 目標與轉換結果的一致性。對非空模型的這個 stub，問題不是空排程永遠非法，而是結果資料自相矛盾卻被接受。

再令第一個 solve 回有效 FEAS incumbent（§8.2 五個 x=1、z=1194/241），第二個 LP solve reject `Error('LP failed')`：M.solve 整個 reject，已有的合法 incumbent 沒有回給 UI。SPEC 指定 LP 失敗只是不提供 U，不應把已取得的可行排程一併丟棄。

**可採用的修正要求：**

> 以明確 hasIncumbent／有效結果條件控制解碼與寫槽。UNDEF/INFEAS/NOFEAS/UNBND 等無可用整數解時回 schedule=null、score=null 與診斷，UI 不更新解槽。OPT/FEAS 仍須檢查有限的目標與變數、整數容差、checkFeasible，以及 z 與重算 objective 的一致性；失敗不得保留「已證明最佳」標籤。合法的全零 incumbent 與零候選的已證明空解仍須允許。額外 LP 以獨立 try/catch 處理，失敗保留原 status／schedule／score、bound=null，附警告並顯示「上界／gap 尚未取得」；只有有限、有效的 LP OPT 目標可作 U。

**補測輸入＋預期：** 上述 status 1/4、矛盾 OPT，以及 FEAS→LP reject；預先放一份有效 MILP 槽，無 incumbent 時槽保持原值。另測 FEAS 的明確全零 incumbent 可合法回空解、零候選不呼叫 glpk.solve、LP FEAS 不提供 U、LP OPT 的 U<L 明示錯誤、U 非有限值不得顯示為上界。

### B4 — GLPK 初始化競態會讓取消終止錯的實例（P1；SPEC §4.2 第 6 點、§8.3）

位置：`src/ui.js:209–231`。initGLPK 只在 await 完成後寫 glpk，沒有 single-flight promise 或世代／ownership 檢查；取消時若初始化尚未完成，沒有實例可 terminate。過期初始化完成後仍會覆寫共用 glpk 並啟動 M.solve。

**實際受控時序：**

1. solve A，GLPK factory promise A 尚未完成。
2. cancel A，立即 solve B，factory promise B 尚未完成。
3. 先完成 B 初始化：B 開始求解。
4. 再完成 A 初始化：過期 A 仍開始求解，且全域 glpk 被改回 A。
5. cancel B：實際 terminate 的是 **A**，有效的 B 未終止。

VM 執行原 UI 函式得到 `started=['B','A']、terminated=['A']`。末端 accepts 會阻止舊結果入槽，卻無法修復錯誤的實例擁有權及取消效果。

**可採用的修正要求：**

> 求解開始即保存 norm/data/revision/runId；GLPK 初始化用可識別世代的 single-flight 或每 run 的實例 ownership。每次 await 初始化後、呼叫 M.solve 前，再確認該 run 仍有效；過期初始化不得覆寫新實例，且須清理。取消只終止該活動 run 擁有的 worker，並使未完成初始化失效。完成／錯誤處理不得更改新 run 的按鈕、狀態或實例。

**補測輸入＋預期：** 以上倒序完成 factory 的時序，預期 A 不啟動求解、B 被取消時 terminate(B) 恰一次、A 若已產生須被清理且不覆寫 B。另測 boot 的初始 GLPK 初始化與第一次 solve 重疊、commit 發生在初始化 await 期間、cancel→重建→再 solve 成功；使用受控 promise，不靠 sleep 碰運氣。測試必須走 SGS.app.solveMILP/cancelSolve/applyDraft 的實際路徑，不能只測 createGate。

### B5 — 頻段改名後選單仍是舊值，引用無法直接修正（P2；SPEC §2.1、§6 資料分頁、§8.4）

位置：`src/ui.js:124–132,165–198`。

**實際構造與結果：** 預設資料，將頻段輸入 `S, X` 改為 `Ku, X`。onDraftInput 只更新 draft.bands 並 return，沒有重建選單；按套用因天線／需求仍引用 S 而失敗，失敗路徑也不重繪。VM 執行原事件 handler 後，draft.bands 為 Ku/X，但天線 tbody 的 HTML 與修改前完全相同，沒有 Ku option。使用者無法在現有選單直接把舊 S 引用改為新 Ku；必須靠其他無關操作意外觸發重繪。

衛星／站改 id 後也有同類選項更新問題；重繪若沒有保留失效引用 option，瀏覽器還可能顯示第一個有效選項，實際 draft 卻仍保留另一個無效值。天線移站時找不到 target 又靜默回原站，會掩蓋失效選項。

**可採用的修正要求：**

> 編輯 bands、衛星／站 id 後即同步重建受影響的引用選項；不得自動把失效引用顯示成無關的第一項。可以保留一個標示無效的舊值 option，讓使用者明確改選；或提供明確的原子 rename 並同步引用。提交仍需完整 validateData。天線換站查不到 target 時顯示錯誤並保留原狀，不靜默宣稱已移動。

**補測輸入＋預期：** 將 S→Ku 後，Ku 在所有相關選單可選；依次更新全部舊 S 引用後可提交，revision 只增加一次，所有天線／需求的 band 與畫面相同。將 GS_1→G_NEW，修正 visibility 引用後亦可提交。另從預設資料移 GS_1-S 到 GS_2，預期巢狀結構數量 0/3、normalize 的 station=GS_2，R1 在該天線候選變為 [3,4,5]，不沿用 GS_1 visibility。

### B6 — 以耗時猜超時，且 LP 預算不是剩餘實際時間（P2；SPEC §4.2 第 1、3、4 點）

位置：`src/milp.js:97–121`。保留 DECISIONS 的 80/20 配額可以，但配額與實際剩餘預算／停止原因不能混為一談。

**實際受控反例：**

- tmlim=1，stub 在假時鐘 960 ms 回 FEAS，沒有任何停止原因欄位。程式因 ≥95% 而回 timedOut=true、標「超時」。接近上限不是已知的超時原因，違反「確知超時才加註」。
- tmlim=30，第一階段配額 24 秒；stub 在假時鐘已過 31 秒時回有效 FEAS。程式仍啟動第二次 solve，給 LP 6 秒；實測呼叫 tmlim 列表為 `[24,6]`。沒有檢查已無實際剩餘預算。這也可能出現在 worker 排程／傳輸／階段切換延遲，而非要求修改 GLPK 本體。

**可採用的修正要求：**

> 80/20 保留為階段配額上限；另外在求解開始建立單調時鐘 deadline，LP 啟動前重新扣除實際已用時間，其 tmlim 不超過保留配額及實際剩餘時間；不足最小可用時間就跳過 LP。若需要硬上限，由外層 watchdog 取消／清理 worker。timedOut 只依可觀測的停止原因或己方 deadline 事件設定；只有 FEAS＋耗時時，維持「有可行解，未證明最佳」，可以另列估計資訊，不能當確定原因。

**補測輸入＋預期：** 注入假時鐘，不需等 31 秒。第一例未知原因 FEAS 不標確定超時；第二例不得呼叫 LP；剩 2 秒但保留配額 6 秒時，LP 上限≤2 秒；已證明 OPT 不加註超時。

### B7 — browser 測試缺失敗斷言，(f) 未測到真正 UI 閘門（P1；SPEC §8 S1 (a)–(g)、§8.2–8.4）

位置：`tests/browser.s1.js:14–45`、`tests/engine.test.js` gate 三例。

browser 腳本對 status、Z/W、表格數、revision、舊卡標記、負時長拒絕、console errors／外部請求都只有 console.log；結果不符仍可能 exit 0。gate 單元測試只驗證 accepts，沒有執行會發生 B4 的 await 初始化／terminate／重建路徑，因此送審單的 (f) 全通過不能視為 UI 整合驗收。

**可直接採用的驗收補文：**

> browser 腳本需使用 assert 或等效斷言：初始 GLP_OPT、feasible=true、Z=5、W=11；表格計數精確為 3/2/3/6/6；R1.durMin=7 成功提交後 revision 僅 +1、舊槽標示舊資料，再求得 OPT/(5,14)；負值 −3 提交失敗、revision／committed data 不變、錯誤定位 durMin。任一 pageerror／console error，或任何不屬於 file://／本頁合法 blob: 的請求，都使測試失敗。browser 關閉放 finally，頂層失敗明確非零退出。
>
> §8.3 用 B4 的受控 factory/solver，在真正 UI 函式測 commit／cancel／新 run／舊完成／舊失敗／初始化倒序，而非只測 gate 物件。對被丟棄訊息，解槽、目前狀態、按鈕及 worker ownership 均不變。engine 的新增非同步 M.solve 測試必須 await，不能直接丟進目前只呼叫 fn() 的同步 test helper。

目前覆蓋盤點與必補輸入／預期如下（B1–B6 已給完整反例，不再另立重複阻擋）：

| S1 項 | 已有覆蓋 | 缺口與補測 |
|---|---|---|
| (a) MILP OPT/(5,11) | Node 只評分手寫排程；browser 有真正求解但只列印 | 加上述 status／feasibility／N/W 斷言；本輪 browser 因環境未實跑成功。 |
| (b) greedy | Node 精確比較集合、(4,5) 及 959/241，通過 | 已有基準足夠；加入 B2 的安全 ID 回歸。 |
| (c) 不可行 fixture | Node 比較四個違規集合且沒有額外 rule 1，通過 | 補 B2 六對逗號 ID 與未知原型 ID，防止去重／schema 漏報。 |
| (d) D 九列 | Node 都有案例，多數斷言充分 | 缺省校準例除檢查 c=2，也重驗 S12 只有 rule 2；無候選例實際 await M.solve，預期已證明空解且 glpk.solve 呼叫 0 次；補 B1 型別與失敗不中斷。 |
| (e) 轉換 oracle | 五個 x=1 比集合／分數完整；greedy 例只比分數 | 第二組也比較精確四元素集合及手寫 score 三欄。另 assert relax 沒 binaries/generals、每個 bound=0..1；唯一候選裁剪後仍有正確界；加入 B3、B6 狀態／LP／時鐘測例。 |
| (f) gate | 三個純 gate 測試通過 | 補真正 UI 與初始化 ownership 的受控訊息測試（B4）。 |
| (g) UI | browser 有編輯流程、截圖與列印 | 加硬斷言、B1 匯入與 B5 引用編輯測試。甘特圖不只截圖存檔，需核對三列／五任務／校準與手寫時間配置，記錄人工視覺 QA 或可觀測繪圖資料。 |

## 建議項（可延後）

### A1 — metadata 驗證錯誤缺欄位高亮（SPEC §2.1、§6；可於 S2 處理）

showErrors 只找 `[data-path="..."]`，但 H、預設校準等 metadata 輸入只有 data-meta。錯誤清單會出現，欄位不會標 invalid；不是所有錯誤 path 都有定位。

**建議文字：** 為 metadata 同時加上對應 data-path，或建立錯誤 path→控制項的統一映射。輸入 H=0、calibDefaultMin=−1，預期清單與對應欄位都標示，修正後清除。

### A2 — localStorage 降級沒有提示備份（SPEC §2、§8 S4；可於 S4 處理）

saveLS 捕捉失敗回 false，但各呼叫端忽略結果；操作可以繼續，卻沒有 SPEC 要求的匯出備份提示。

**建議文字：** 儲存失敗時顯示可理解且不重複刷屏的暫存／備份提示，保留記憶體操作。注入 localStorage.setItem 拋 SecurityError 或配額錯誤，預期資料／求解仍可用，並可見 JSON 備份提示；後續恢復成功可清除提示。

## 針對 SPEC 開放問題的意見

無新增需 PO 拍板的問題。維持前輪事件點、示意動畫、λ=n+1 的決策；本輪必修是落實既有資料域、結果有效性、取消／版本語意及客觀驗收。80/20 配額與單變數列裁剪可保留，分別依 B6 補 deadline、依 B2 修正字串 ID 分組。
