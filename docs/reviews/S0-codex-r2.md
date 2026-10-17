# Review S0-r2 — Codex

| 項目 | 核對結論（一項一行；「落實」指 S0 規格已納入，不代表程式已實作） |
|---|---|
| B1 上界與最佳解 | **已落實**：改用 R2/R4 互斥，R4/R6 可共存；(5,11) 正確（SPEC §1.3、§8 S1）。 |
| B2 等待基準 | **已落實**：需求 start 為固定基準、未排貢獻 0、共用 score 與字典序比較（§1.1、§3、§4.1）。 |
| B3 合法域 | **已落實**：資料／排程驗證、唯一需求、nullish 校準、visibility 合併、半開邊界與跨 H 校準均已納入（§1.2、§2.1、§3）。 |
| B4 LP 上界／gap | **已落實**：只採 LP GLP_OPT、顯式 0..1、共用預算、上下界與狀態定義清楚（§4.2）。 |
| S1 PPT fixtures | **已落實**：貪婪輸入／首選與預期 (4,5)、不可行輸入與四條違規均明列且驗算正確（§1.3、§8 S1）；新增加的驗收 (d)/(e) 另有 N3 缺口。 |
| S2 解碼／修復／比較 | **已落實**：完整空隙插入、固定修復順序、修復後評分、不可行展示與正式比較分開（§3、§5.1、§6）。 |
| S3 worker／state／離線 | **部分**：共用引擎、儲存降級及 GA revision/runId 已納入；MILP 的過期結果寫入閘門未明定，見 N2（§2、§3、§4.2、§5.3、§7、§8）。 |
| S4 build | **偏離（可接受）**：SHA、唯一尾端、標記／轉義已寫入規格；AST/bundler 延至 vendor 升級，固定版本 adapter 可接受，不要求 S0 完成工程實作（§7；DECISIONS 末段）。 |
| S5 協作 | **已落實**：審查檔邊界、被審 SHA、禁止覆蓋／強推及工程回應義務明列（§8；AGENTS 規則 7–10）。 |
| S6 run 統計 | **已落實**：run seed、PRNG、停滯停止、Z 與 (Z,W) 命中分報、未證明時對 incumbent 比較已納入（§3、§5.2–5.3、§8 S2）。 |
| S7 授權交付 | **已落實**：單檔聲明、版本／來源與自有程式授權區分已寫入（§7、§8 S4；README）；實際交付留待工程驗收。 |
| 開放問題 1 事件點 | **已落實**：S1 逐分鐘，記錄規模，未來只採候選占用起始事件（§4.1、§9.1）。 |
| 開放問題 2 動畫 | **已落實**：接受殘差、ω=360/H、圓周距離、接觸由資料決定（§6、§9.2）。 |
| 開放問題 3 λ | **部分**：λ=n+1 與去重 V 已納入，但「任何不可行者 ≤−1」缺非負等待前提，實際允許負等待，見 N1（§1.1、§5.1、§9.3）。 |

## 結論：退回（列必修）

被審 commit：`0e819b9351abe2de33d22323e3091b2900d76689`（`0e819b9`），SPEC S0 draft 2。日期：2026-10-17（台北）。原 B1–B4 已關閉；**14 項中未完全落實 2 項（均為「部分」，完全「未落實」0 項）；本輪新增列為必修 3 項（N1–N3）；建議 2 項（C1–C2）。** 修正 N1–N3 後再判定是否可開 S1，本輪不使用「有條件通過」。

依指定順序讀取 S0-response → SPEC → DECISIONS 末段 → AGENTS；另讀同 commit 的 default.json 與 README。只新增本檔，不修改 SPEC、DECISIONS、既有 review 或其他檔案。這是規格複審，沒有把工程方「採納」視為程式已完成，亦未執行 build／瀏覽器測試或審 vendor/dist。原 PPT 未直接提供，本次驗證的是已提交 JSON 與明文 fixtures，不背書 PPT 頁面的逐字一致性。

遠端版本檢查：查詢當時 main 比被審 SHA 多兩個 commit，差異檔為 AGENTS.md 與新增的 REVIEW_PROMPT_S0-r2.md；另讀 main 的 AGENTS，規則 7–10 相同。報告只對上述被審 SHA 生效，不將後續提交混入。此工作目錄沒有 Git checkout，故以 GitHub connector 讀取固定 SHA／比較 main 代替本機 fetch，不建立或重設他人工作目錄。

### §1.3 獨立手算：貪婪 fixture

所有時間均為相對 10:00 的整數分鐘，通訊及校準均半開。

| 順序 | 手算結果 |
|---|---|
| R1 | GS_1-S 最早 t=0，通訊 [0,5)，校準 [5,15)，等待 0。 |
| R2 | GS_2-X 的可見起始為 3..6；t=3、4 與 SAT_A 的 R1 重疊，故選 t=5，通訊 [5,7)，校準至 17，等待 5−2=3。 |
| R3 | GS_1-S 候選 6..9 都撞 R1 校準；改試 GS_2-S，最早 t=8，通訊 [8,13)，等待 8−6=2。 |
| R4 | GS_2-X 候選 8..14 全在 R2 的延長占用 [5,17) 內，無法排入。 |
| R5 | GS_1-S 最早 t=20，通訊 [20,25)，等待 0。 |
| R6 | GS_2-X 候選 22..24 全與 SAT_C 的 R5 [20,25) 重疊，無法排入。 |

故排入恰為 `{R1/GS_1-S/0, R2/GS_2-X/5, R3/GS_2-S/8, R5/GS_1-S/20}`，Z=4、W=0+3+2+0=5，`checkFeasible.ok=true`，`objective=4−5/241=959/241`。與 draft 2 一致。

### §1.3 獨立手算：不可行 fixture，恰好四條

通訊區間依次為 R1 [0,5)、R2 [3,5)、R3 [8,13)、R4 [8,10)、R5 [20,25)、R6 [22,24)。

| 規則／需求對 | 違規證據 |
|---|---|
| 3 / R1,R2 | 同 SAT_A，交集 [3,5)。 |
| 3 / R3,R4 | 同 SAT_B，交集 [8,10)。 |
| 3 / R5,R6 | 同 SAT_C，交集 [22,24)。 |
| 2 / R2,R4 | 同 GS_2-X，R2 end=5、R4 start=8，間隔 3<10；R4 在 R2 校準 [5,15) 內開始。 |

**無多報檢查：** GS_1-S 的 R1→R5 間隔 20−5=15≥10；GS_2-X 的 R4→R6 間隔 22−10=12≥10，R2→R6 間隔 22−5=17≥10；GS_2-S 只有 R3。各天線的通訊本身均不重疊，因此 rule 1 為零。每筆均使用相容頻段，時長皆由需求正確衍生，各自完全落在需求時窗、對應站 visibility 與 H 內；沒有未知 id、重複需求或非整數。因此 rule 4、5、window、schema、duplicate-request 亦為零。輸出按無序需求對去重後，必須**恰等於** §1.3 的四個 `(rule,reqs)`，不能僅斷言 length=4。

延長占用可用來判可行性，但不能因此把「校準重疊」再當作 rule 1 的通訊重疊多報。本 fixture 的 R2/R4 僅有 rule 2。

### 最佳解數字交叉核對

§1.3 的五任務排程依序等待 0、3、2、2、4，合計 11；SAT_A 在 t=5、SAT_C 在 t=24 恰好銜接，GS_1-S 的 R1→R5 間隔 19，GS_2-X 的 R2→R6 間隔 15，均可行。R2/R4 不可共存的上界證明正確，故 Z*=5。

W*=11 亦可手算下界：五任務必含三筆 S 及兩筆 X。若選 R2+R6，R5 不能先於 R6，故 R6≥22、R5≥24，兩者等待至少 6；R1 若在 GS_1-S，R1/R2 的等待和至少 3，且 R3 只能 GS_2-S 起於 8 或以後、等待至少 2，合得 W≥11。R1 若在 GS_2-S，R2 必先做，兩者等待和至少 6，總等待至少 12。若選 R4+R6，R4 必在 R6 前、且 R4≤12；同 SAT_B 的 R3 必在 R4 前，從而 R3 在 GS_1-S 最早 6、R4 最早 11；R1 被迫使用 GS_2-S 最早 3，R6≥23、R5≥25，總等待至少 3+0+3+3+5=14。所列 (5,11) 達到下界。

另以同 commit JSON 在記憶體中獨立列舉全部候選及不排入選項，得到 3,242 個可行排程、其中五任務 78 個，最佳 (5,11)，與手算吻合；不是 engine 或 GLPK 實作測試。

## 阻擋項（必修）

### N1 — 罰則的 ≤−1 宣告不成立（SPEC §1.1、§5.1、§9.3；原開放問題 3 未完全關閉）

§5.1 只排除負「start」，沒有排除 `0≤start<request.start`。後者會違反需求時窗，但仍是罰則模式應能評估的非結構錯誤，且依 §1.1 算出負 wait。反例：n=1、H=10、需求 [9,10)、d=1、相容天線、可見 [0,10)、基因 start=0。只有一個 window 違規，W=−9、F=1+9/11=20/11、λ=2、V=1，fitness=−2/11，**大於 −1**。所以 response 的保證及 §5.1 括號敘述過強。

這不要求改 λ：在每需求至多一筆、start 非負的前提下，λ=n+1 仍足以保證不可行者低於空解。最小修正是改證明，不額外縮小罰則模式搜尋域。

**可直接採用的修改文字（取代 §5.1 的 ≤−1 保證，並補入 §1.1）：**

> `0≤totalWait≤nH` 與字典序等價的敘述只針對可行排程。罰則模式允許非負整數 start 早於需求 start，此時 wait 可以為負，僅作 raw fitness 計算，不改正式可行解的評分定義。計分前拒絕未知引用、重複需求、負或非整數 start，使已排筆數至多 n。當 n≥1，合法資料有 request.start≤H−1，故即使有時窗違規，W≥−n(H−1)，F≤n+n(H−1)/(nH+1)。任何不可行者 V≥1，使用 λ=n+1 時，fitness≤−(n+1)/(nH+1)<0，仍低於可行空解 0；不宣稱必≤−1。n=0 直接回傳空解。修復模式對試加後 Schedule 呼叫完整 checkFeasible，任一單筆時窗／頻段／資源違規均須移除，不只檢查與已接受任務的成對衝突。

預期驗證：上述反例 fitness 恰為 −2/11、feasible=false，不計入最佳可行解；修復模式將該基因移除，得到空排程。DECISIONS 既定 λ=n+1 無須推翻，只同步記錄這項證明澄清。

### N2 — MILP 非同步結果缺明確的版本閘門（SPEC §2、§4.2、§5.3、§8 S1；原 S3 部分）

revision/runId 的丟棄規則目前出現在 GA 的 §5.3；§4.2 的 MILP 流程則直接驗證並寫槽。S1 已同時包含可編輯資料及非同步 MILP，不能等 S2 才確保舊資料求解結果不覆蓋新資料狀態。對舊快照通過 checkFeasible，不代表可寫進新 revision 的解槽。

**可直接採用的修改文字（補 §4.2，並納入 §8 S1）：**

> MILP 與 GA 共用 revision/runId 寫入規則。每次求解捕捉正規化資料的不可變快照、目前 revision 與新 runId；輸出一律對該快照驗證和評分。資料變動、取消或新 run 啟動後，任何不符合目前 revision／有效 runId 的進度、解、LP 上界、錯誤與完成訊息全部丟棄，不更新解槽或目前求解狀態；取消使 runId 立即失效，並終止／清理 worker。有效結果才帶相同 revision 寫入 MILP 槽。
>
> S1 加驗：以 N3 的 D 僅保留 R1，revision=1 啟動 MILP；在回覆前刪除 SAT_A 的全部 visibility 並提交為 revision=2，再送回舊 run 的 R1/A/0 可行結果。預期 MILP 解槽及 revision=2 的求解狀態完全不受舊訊息更新。另測取消後及新 run 啟動後舊 run 的完成／失敗訊息，預期同樣丟棄。可用受控 worker stub 決定訊息順序，不依真實求解速度碰運氣。

### N3 — §8 S1 (d)/(e) 尚不能僅憑現文客觀驗收（SPEC §2.1、§3、§8 S1）

(a) 最佳值與 (b)/(c) 兩組 fixture 已可客觀判定；但 (d) 把資料、候選、排程三個不同層次統稱 validateData，且沒有具體邊界輸入／預期結果；(e) 沒有 MILP 變數輸入、預期 Schedule 或三欄數值。不能用「已覆蓋情境」取代明確 oracle。

以下是**可直接加在 §8 的 S1 驗收補充文字**，不用修改任何 PO 決策。

**共同基準 D；每一測例由全新 D 複本獨立修改，不累積前例變更：**

```json
{
  "meta":{"name":"S1 boundaries","timeOrigin":"10:00","horizonMin":10,"calibDefaultMin":2},
  "bands":["S","X"],
  "satellites":[{"id":"SAT_A","color":"#4f8ef7"},{"id":"SAT_B","color":"#f28b5b"}],
  "stations":[{"id":"G","angleDeg":0,"antennas":[{"id":"A","band":"S","calibMin":null}]}],
  "visibility":[
    {"sat":"SAT_A","station":"G","start":0,"end":10},
    {"sat":"SAT_B","station":"G","start":0,"end":10}
  ],
  "requests":[
    {"id":"R1","sat":"SAT_A","band":"S","durMin":2,"start":0,"end":10},
    {"id":"R2","sat":"SAT_B","band":"S","durMin":2,"start":0,"end":10}
  ]
}
```

`R/A/t` 下列記法代表 `{req:R, antenna:A, start:t}`。

| 測例與完整變更 | 資料驗證／正規化預期 | 候選／排程預期 |
|---|---|---|
| D 原樣、calibMin=null；另獨立刪除 calibMin | validateData.ok=true；A 有效校準=2 | `[R1/A/0,R2/A/2]` 僅有 `{rule:2,reqs:[R1,R2]}`，ok=false。 |
| A.calibMin=0 | ok=true；有效校準=0 | 同上排程 ok=true、violations=[]，不得錯用全域 2。 |
| A.calibMin=−1；另獨立令 meta.calibDefaultMin=−1 | ok=false、errors 非空且指到該欄位 | 停止 normalize／求解，不靜默變成 0 或預設值。 |
| requests 追加另一筆 R1 相同 id | validateData.ok=false，錯誤指向重複需求 id | 不求解。 |
| D 不改資料，只給 `[R1/A/0,R1/A/4]` | validateData.ok=true | checkFeasible.ok=false，只有 `'duplicate-request'`；通訊、校準、衛星、時窗均無其他違規。 |
| R1.end=6，SAT_A 的 visibility.end=6 | ok=true | feasibleStarts(R1,A) 恰為 [0,1,2,3,4]；R1/A/4 的 end=6，checkFeasible.ok=true。 |
| SAT_A visibility 改為 [0,5)、[5,10)，其餘不變 | ok=true；normalize 後 SAT_A/G 恰為單段 [0,10) | feasibleStarts(R1,A) 恰為 0..8；R1/A/4 跨接點 5 仍 ok=true。 |
| D 原樣，只給 `[R1/A/8]` | ok=true | end=10=H，校準到 12；t=8 必在 feasibleStarts，checkFeasible.ok=true。 |
| requests 僅保留 R1 且 R1.durMin=11 | validateData.ok=true（無候選不等於資料不合法） | feasibleStarts(R1,A)=[]；空排程 ok=true，score={assigned:0,totalWait:0,objective:0,feasible:true}；求解回傳已證明最佳的空解，可不呼叫零變數 GLPK。 |

> 驗收 (a)：以被審 commit 的完整 default.json 求解，須 GLP_OPT、checkFeasible.ok=true、不同需求數=5、totalWait=11，不強制 Schedule 列順序或某一組等分最佳天線配置。(b) 的 Schedule 集合及 (c) 的違規集合必恰等於 §1.3；reqs 成對先排序／正規化，不比較 msg 字串或輸出列順序。rule 1 依通訊重疊、rule 2 依校準間隔判定，本不可行 fixture 的 R2/R4 不得額外報 rule 1。
>
> 驗收 (e)：以完整 default.json 建立全部候選變數，把 `x[R1,GS_1-S,0]`、`x[R2,GS_2-X,5]`、`x[R3,GS_2-S,8]`、`x[R6,GS_2-X,22]`、`x[R5,GS_1-S,24]` 設為 1，其他變數為 0。MILP 結果轉換後 Schedule 集合須恰為這五個元素；checkFeasible.ok=true；整數 assigned=5、totalWait=11，objective=1194/241（數值比對容差 1e−9）。直接對同一手寫 Schedule 評分須得到相同三欄。再以貪婪 fixture 設定其四個 x=1，其餘為 0，重做轉換，須 assigned=4、totalWait=5、objective=959/241、feasible=true。這是 MILP 轉換／engine 的 S1 測試，不要求提前實作 S2 GA；S2 再對兩種 GA phenotype 做同樣一致性驗收。
>
> S1 的 UI 驗收另以 default.json 開啟單檔：資料表須顯示 3 衛星／2 站／3 天線／6 可見時窗／6 需求；MILP 結果的唯讀甘特圖須有三天線列、五個通訊區塊及對應校準，R1=0、R2=5、R3=8、R6=22、R5=24 的手寫排程須依資料正確呈現。表格把 R1.durMin 由 5 改成 7 並提交，資料驗證仍成功，但 R1 已無法與 R2 共存：新 MILP 須 GLP_OPT、Z=5、W=14（可用 R1/GS_2-S/3、R3/GS_1-S/6、R4/GS_2-X/11、R6/GS_2-X/23、R5/GS_1-S/25 達成）；不得仍顯示舊 (5,11) 為當前版本結果。負時長提交須被拒並顯示欄位錯誤。

## 建議項（可延後）

### C1 — draft 1 的收斂曲線 CSV 需求在改寫中遺漏（SPEC §5.3、§8 S2/S4）

draft 2 只明列每次 run 的 metadata 匯出；§6 的 CSV 又指排程，沒有明確保留原先「每代曲線 CSV、多次 run 統計 CSV」。這是需求遺漏，無須阻擋 S1。

**可直接採用的修改文字：**

> 保留三種不同匯出：排程 CSV、每代 best/avg 曲線 CSV、多次 run 統計 CSV。曲線逐列帶 runId、seed、generation、best、avg；統計保留每次 assigned/totalWait、停止原因、兩種命中結果及彙整指標。S2 驗證資料欄位與畫面一致，S4 驗證單檔下載可用。

### C2 — 樣本標準差的單次／空集合邊界（SPEC §5.3、§8 S2）

指定 n−1 是清楚的，但 runs=1、或零次命中時，部分統計沒有數值定義，不能輸出 NaN 或以 0 冒充。

**可直接採用的修改文字：**

> runs 必須為正整數；樣本數不足 2 時，樣本標準差顯示／匯出 N/A。零次命中時「平均達最佳世代數」亦為 N/A，命中數=0、未命中數=runs；從第 0 次 run 起算 i，預設 baseSeed=42、runs=20 的 seeds 恰為 42..61。

## 針對 SPEC 開放問題的意見

1. 事件點：已結案，沿用 §4.1 的逐分鐘 S1 與候選起始事件規劃，不增加本輪必修。
2. 動畫：已結案，沿用已拍板的示意／圓周擬合，不因殘差推翻決策。
3. λ：值 n+1 保留；N1 只要求修正適用域與錯誤的 ≤−1 宣告，補上正確可行優先證明。

交付狀態：先前建立分支遇到的 403 已在補上本儲存庫的 GitHub App 授權後解除。本報告從被審 SHA 建立 `review/S0-r2` 分支提交，目標為 `main`；僅新增本檔，不修改既有檔案。
