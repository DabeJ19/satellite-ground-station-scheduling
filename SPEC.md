# SPEC — 太空衛星地面站排程：最佳解（MILP）與基因演算法（GA）互動工具

版本：S0 draft 2（2026-10-17）　狀態：已依 Codex S0 審查修訂（docs/reviews/S0-codex.md）
PO：James　工程：Claude Code　審查：Codex

變更摘要（draft 1 → 2）：修正 §1.3 上界證明（B1）；明定等待基準與目標計算（B2）；新增資料驗證契約與候選集合定義（B3）；重寫超時 LP 上界／gap 規則（B4）；納入 S1–S7 建議；§9 開放問題全部結案。

---

## 0. 一句話

單一 HTML 檔（離線可開），讓使用者編輯衛星／地面站／需求資料與參數，
用 MILP（glpk.js）求出可證明的最佳排程、用 GA 求近似解，
三個解槽（手動／MILP／GA）皆可在甘特圖與「衛星繞地示意動畫」中播放比較。

來源題目：課程 week6 PPT《太空衛星地面站排程問題探討》（AIMS 大數據與決策分析）。

---

## 1. 問題定義（與 PPT 完全一致）

### 1.1 目標
Max Z = 排入通訊之總任務數。
工具內實際使用的目標（MILP 與 GA 共用，由 `engine.score()` 唯一定義）：

    earliest_r := requests[r].start          （需求允許開始的下界；不隨天線或部分排程改變）
    wait_r     := start_r − earliest_r        （只對已排需求計算；未排需求貢獻 0）
    assigned   := 已排的不同需求數
    totalWait  := Σ wait_r
    objective  := assigned − totalWait / (|R|·H + 1)      H = 時間軸長度（分鐘）

正式比較可行解時使用字典序 `(assigned 降序, totalWait 升序)`，與上述加權目標數學等價：
因 `0 ≤ totalWait ≤ |R|·H`，任務數多一筆的解其 objective 至少多 `1/(|R|·H+1) > 0`。
空解分數為 `(0, 0, 0)`；`|R| = 0` 時直接回傳空解。
GLPK 為浮點運算，回傳後一律重新以整數計算 `assigned`、`totalWait` 並驗證，不以浮點 z 當作證明。

### 1.2 限制
| # | 限制 | 工具內解讀 |
|---|---|---|
| 1 | 每支天線同一時間只能服務一顆衛星 | 同天線任務區間不重疊 |
| 2 | 天線完成任務後需校準 c 分鐘，期間不得開始新任務 | 同天線前一任務結束 + c ≤ 下一任務開始（等價於占用區間 `[start, start+d+c)` 不重疊） |
| 3 | 同一衛星同一時間只能進行一項通訊任務 | 同衛星通訊區間 `[start, start+d)` 不重疊（跨天線亦算；衛星不占用校準時間） |
| 4 | 需求若被服務，至少須滿足最小時長 | 任務時長固定 = 最小時長 d_r，由需求衍生，不可編輯 |
| 5 | 頻段必須與天線硬體相容 | band(r) == band(a) |
| 隱含 | 任務須在需求可通訊時段內，且在衛星飛越該站的時窗內 | `[start, start+d_r)` ⊆ 需求時窗 ∩ 某一段正規化後的 visibility(sat_r, station(a)) |

- 區間一律半開 `[start, end)`。相鄰任務（前一個 end == 後一個 start）不算重疊；`c_a = 0` 時亦然。
- 時間以**分鐘**為離散單位，所有時間為相對 `timeOrigin` 的整數。
- 初始所有天線在 t = 0 可用。最後一筆任務的校準可以超過 H；只要求通訊區間落在 `[0, H)` 與各時窗內。

### 1.3 預設實例（PPT Given Data）與驗收數字
需求 R1–R6、衛星 SAT_A/B/C、天線 GS_1-S、GS_2-S、GS_2-X、校準 10 min、時窗如 PPT 第 12 頁，資料見 `src/data/default.json`。

**最佳 Z = 5，上界證明：** 三筆 X 需求共用唯一 X 天線。R2 的可行起始為 10:03–10:06，R4 為 10:08–10:14（整數分鐘，含兩端）。若先做 R2，最早完成加校準是 10:15，已晚於 R4 最晚起始 10:14；反向順序 R4 最早完成加校準 10:20，晚於 R2 最晚起始 10:06。因此 R2、R4 至多排一筆，X 任務至多兩筆，總任務數至多五。（R4 與 R6 可以共存：R4 10:08–10:10 校準至 10:20，R6 10:22 開始。）

**加權最佳解 (Z, W) = (5, 11)：**

| 需求 | 天線 | 通訊 | 等待 |
|---|---|---|---:|
| R1 | GS_1-S | 10:00–10:05 | 0 |
| R2 | GS_2-X | 10:05–10:07 | 3 |
| R3 | GS_2-S | 10:08–10:13 | 2 |
| R6 | GS_2-X | 10:22–10:24 | 2 |
| R5 | GS_1-S | 10:24–10:29 | 4 |

獨立全列舉（審查方）：可行排程 3,242 個，五任務 78 個，最小總等待 11。

**貪婪 fixture（重現 PPT 可行解 Z = 4）：** `greedyDecode` 以 order = [R1..R6]、天線依資料列出順序嘗試（S 首選 GS_1-S，X 首選 GS_2-X）。預期 R1/GS_1-S/0、R2/GS_2-X/5、R3/GS_2-S/8、R5/GS_1-S/20，Z = 4、W = 5；R4、R6 排不進。

**不可行 fixture（重現 PPT 第 14–18 頁）：** Schedule = R1/GS_1-S/0、R2/GS_2-X/3、R3/GS_2-S/8、R4/GS_2-X/8、R5/GS_1-S/20、R6/GS_2-X/22。
預期違規集合（依 `(rule, reqs)` 去重，不按分鐘計數）：`{3:[R1,R2]}, {3:[R3,R4]}, {3:[R5,R6]}, {2:[R2,R4]}` 共 4 條。
（PPT 以示意圖呈現，R2/R4 間隔以整數分鐘重建為 3 分鐘；PPT 文字寫 4 分鐘，違規集合相同。）

---

## 2. 資料模型（JSON）

```jsonc
{
  "meta": { "name": "PPT week6", "timeOrigin": "10:00", "horizonMin": 40, "calibDefaultMin": 10 },
  "bands": ["S", "X"],                       // 任意字串
  "satellites": [ { "id": "SAT_A", "color": "#..." } ],
  "stations": [
    { "id": "GS_1", "angleDeg": 0,            // 動畫上在地球圓周的位置，可改
      "antennas": [ { "id": "GS_1-S", "band": "S", "calibMin": null } ] }   // null/缺省 = 全域預設；0 = 不校準（有效覆寫）
  ],
  "visibility": [                             // 每 (衛星, 站) 可多段；載入時排序並合併重疊/相鄰片段
    { "sat": "SAT_A", "station": "GS_1", "start": 0, "end": 12 }
  ],
  "requests": [                               // 每需求單一時窗
    { "id": "R1", "sat": "SAT_A", "band": "S", "durMin": 5, "start": 0, "end": 10 }
  ]
}
```

- UI 顯示時把分鐘換算成 HH:MM。
- 解（Schedule）：`[{ "req": "R1", "antenna": "GS_1-S", "start": 5 }]`；未出現的需求 = 未排入。任務 end 一律由 `start + durMin` 衍生，不信任匯入的 duration/end。
- 三個解槽各存一份 Schedule + 來源標記 + 評分結果 + 資料 revision。
- 持久化：整份 state（資料 + 參數 + 三解槽）存 localStorage；JSON 匯入／匯出同一結構。所有 localStorage 存取包 try/catch，失敗時降級為記憶體狀態並提示匯出 JSON 備份；儲存失敗不得阻止排程操作。

### 2.1 資料驗證契約 `validateData()`
在求解／匯入／資料編輯提交前執行；不合法時回報錯誤位置並停止求解，不靜默截斷或修正。
- `horizonMin` 為正整數；需求 `durMin` 為正整數；全域與天線 `calibMin` 為非負整數。
- 所有需求與 visibility 的 `start`/`end` 為整數且 `0 ≤ start < end ≤ H`。
- 衛星、站、需求 id 各自唯一；天線 id 全資料唯一；引用的衛星、站、band 必須存在。
- 天線 `calibMin` 缺省或 null 採 `calibDefaultMin`（nullish fallback，`0` 為有效值）。
- 每 `(sat, station)` 的 visibility 先排序，將重疊或相鄰片段合併為連通區間。
- 需求時長大於可用時窗、或沒有相容天線／可見時窗時，該需求候選集合為空、不排入；這不是模型不可行。合法資料下空排程必可行。

---

## 3. 共用核心 `engine.js`

以 `globalThis.SGS` 掛載純函式；同一份原始碼同時內嵌到主頁與 GA Blob worker（worker 無 window），不在 worker 重寫規則。

- `validateData(data)` → `{ ok, errors: [{ path, msg }] }`（§2.1）。
- `normalize(data)` → 合併 visibility、套用校準預設；所有模組只吃正規化後的資料。
- `expandAntennas(data)` → 天線列表（含站、頻段、校準）。
- `feasibleStarts(data, r, a)` → 所有整數 t，使 `[t, t+d_r) ⊆ [0,H)`、`⊆` 需求時窗、`⊆` 某一段正規化 visibility，且頻段相容。`t + d_r == window.end` 合法。
- `checkFeasible(data, schedule)` → `{ ok, violations: [{ rule, reqs, msg }] }`，rule ∈ `1|2|3|4|5|'window'|'schema'|'duplicate-request'`。
  **唯一的規則來源**。除資源規則外必須拒絕未知 req/antenna、重複 req、非整數 start、非法引用及超界時間。違規依 `(rule, reqs)` 去重，不按重疊分鐘重複計數。MILP、GA、手動、worker 均使用同一候選集合、占用區間與檢查核心；MILP 線性限制是此核心語意的轉譯，輸出仍須驗證。
- `score(data, schedule)` → `{ assigned, totalWait, objective, feasible }`（§1.1）。
- `greedyDecode(data, order, antennaPref)` → Schedule（GA 間接編碼用；也重現 PPT Z=4 貪婪解）。對每支被嘗試的天線，從其完整 `feasibleStarts` 由小到大掃描，可插入已排任務之前及空隙，不以全域游標或最後任務末端為起始下界。
- `generateInstance(seed, {nSat, nStation, nAntennaPerStation, nReq, windowDensity, bands})` → data（seeded PRNG：mulberry32；所有隨機算子只用指定 PRNG，不用 `Math.random`）。

---

## 4. MILP（`milp.js`，glpk.js 5.0.0，GPL-3.0，內嵌）

### 4.1 時間索引模型
集合：R 需求、A 天線、T = {0..H−1}。S(r,a) = feasibleStarts(r,a)。
變數：x[r,a,t] ∈ {0,1}，僅對 t ∈ S(r,a) 建立。

    max  Σ x[r,a,t] − ε Σ (t − earliest_r)·x[r,a,t]          ε = 1/(|R|·H+1)

    (每需求至多一次)       Σ_{a,t} x[r,a,t] ≤ 1                                    ∀r
    (天線 + 校準, 限制1+2)  Σ_r Σ_{t: t ≤ τ < t + d_r + c_a} x[r,a,t] ≤ 1           ∀a, ∀τ∈T
    (衛星互斥, 限制3)       Σ_{r: sat_r = s} Σ_a Σ_{t: t ≤ τ < t + d_r} x[r,a,t] ≤ 1  ∀s, ∀τ∈T

限制 4、5 與時窗已由 S(r,a) 內建。無 big-M。
校準等價性：同天線兩任務占用區間 `[t_i, t_i+d_i+c_a)` 若交疊，則在 τ = max(t_i, t_j) 處容量列被計入兩次；否則恰滿足「前一任務結束 + c_a ≤ 後一任務開始」。
S1 使用每分鐘列；記錄候選數、列數、非零係數數、建模與求解時間。後續僅在有實測收益時，以每資源所有候選占用區間的**起始事件**建立等價容量列，並與逐分鐘模型比對可行域及最佳 (Z, W)；不得只以 visibility 邊界或某一已選排程作事件點。

### 4.2 求解流程與狀態
1. 在 Web Worker（glpk.js 自帶）呼叫 `solve(lp, { tmlim, presol: true })`。使用者秒數是 MILP 與額外 LP 共用的求解預算；分別記錄耗時；提供中斷／worker 終止。
2. 解 → Schedule → `checkFeasible` 二次驗證 → `score` 重算整數 (assigned, totalWait) → 寫入 MILP 解槽。MILP 轉出的不可行結果視為錯誤，不當作解槽成果。
3. 狀態標示：
   - `GLP_OPT` → 「已證明最佳」。
   - `GLP_FEAS` → 「有可行解，未證明最佳」，確知超時時加註「（超時）」。
   - `GLP_NOFEAS` / `UNDEF` → 「模型／數值異常，待診斷」（合法資料下空排程必可行，不宣稱需求必須全排入）。無 incumbent 時不得把空值解碼成結果。
4. 上界與 gap（僅在未證明最佳時）：令 L 為通過 `checkFeasible` 之整數排程的加權 objective。LP 鬆弛沿用同一目標與全部列，變數改為連續 `0 ≤ x ≤ 1`（顯式 bounds，移除 binaries/generals）。**只有 LP 狀態 `GLP_OPT` 才把其 objective 記為 U**；LP 的 FEAS/UNDEF/失敗均不提供 U，顯示「上界／gap 尚未取得」。沒有剩餘時間預算就不啟動 LP。
   有 U 時顯示 `absoluteGap = max(0, U − L)`、`relativeGap = absoluteGap / max(1, |L|)`，並標示「加權目標的 LP 鬆弛 gap，非原生 B&B gap，亦非任務數差距」。若 U 顯著小於 L（超出浮點容差），回報計算錯誤，不截成 0 掩蓋。
5. 「模型」分頁以純 HTML/CSS（`<sub>`、`<sup>`、Unicode）顯示上述式子，不引入 KaTeX。

---

## 5. GA（`ga.js`，在 Blob URL Web Worker 執行）

### 5.1 兩種編碼（可切換）
**間接編碼（預設）**：染色體 = [需求優先序排列 π] + [每需求天線偏好索引 p_r]。
解碼 = `greedyDecode`（§3）：依 π 順序，先試 p_r 指到的天線、再試其他相容天線，取與目前部分排程不衝突的最早起始（完整掃描 feasibleStarts，可插空隙）；找不到即不排入。天然可行。
審查方已證明：此解碼器對任一「先最大任務數、再最小總等待」的最佳排程都存在可重建它的染色體，無須「起始偏移」基因（docs/reviews/S0-codex.md §B）。此為搜尋空間覆蓋性，不保證有限族群／世代必找到。

**直接編碼**：染色體 = 每需求 (assign ∈{0,1}, antennaIdx, start)。結構非法（重複需求、負起始、非整數）者先拒絕／正規化再計分。
- 修復模式：依 `requests` 陣列順序逐筆檢查，與已接受任務衝突者從 phenotype 移除；fitness = 修復後 Schedule 的 `engine.score`。
- 罰則模式：`fitness = score.objective − λ·V`，V 為共用檢查器回報、依 `(rule, reqs)` 去重的違規數。λ 預設 `|R| + 1`（每次資料變更重算；此值保證任何不可行者分數 ≤ −1，低於可行空解 0），仍可調；使用者調低 λ 時標明不再保證可行解優先。另存 rawFitness、違規集合與最佳可行解（空排程保底）。

兩種編碼的可行 phenotype 都用同一 `score()` 評分，可直接比較；罰則模式的 raw fitness 不作為與 MILP 比較的品質指標。

### 5.2 算子（全部可調）
- 選擇：錦標賽，k（預設 3）
- 交叉：排列用 OX；天線偏好／直接編碼用均勻交叉；交叉率 pc（預設 0.9）
- 突變：排列 swap；天線偏好翻轉；直接編碼起始時間 ±隨機；突變率 pm（預設 0.1）
- 菁英保留 e（預設 2）
- 族群 N（預設 50）、世代上限 G（預設 200）、停滯停止 S 代（預設 50）
- seed（預設 42）；同 seed 同結果；停止只依世代／停滯，不依牆鐘時間

### 5.3 實驗分頁
- 單次 run：每代 best / avg 曲線（canvas 自繪），可中斷；worker 與主頁交換資料快照及 `revision/runId`，資料改動或取消後的舊結果不覆蓋目前解槽。
- 多次 run：runs 次（預設 20），run seed = `(baseSeed + i) >>> 0`；匯出每次 seed、資料／參數版本、停止原因、assigned/totalWait。
- 統計：分別報「命中主目標 Z*」與「命中完整最佳 (Z*, W*)」；只有同一資料且 MILP 已證明最佳時才稱「最佳命中率」，否則報對 incumbent 的差距。平均達最佳世代數只對命中 runs 計算，未命中數另列；標準差採樣本定義（n−1）。
- 以隨機實例產生器產生中／大型實例做比較（PPT 實例太小）。

---

## 6. 介面（單檔，深／淺主題切換，繁中）

分頁：
1. **資料**：衛星、地面站（含天線）、時窗、需求四張可編輯表格；新增／刪除；JSON 匯入匯出（經 `validateData`）；實例產生器面板；時間軸上可拖曳時窗起訖。
2. **模型**：MILP 式子說明；時間上限；求解按鈕；狀態（§4.2）、Z、總等待、上界／gap、求解秒數、模型規模。
3. **GA 實驗**：參數面板、單次 run 曲線、多次 run 統計表、匯出。
4. **排程與動畫**：
   - 解槽選擇器（手動／MILP／GA）＋三者並排評分卡，一律回報 `assigned`、`totalWait`、`objective`、`feasible`。不可行排程可標紅顯示與播放，但不計入最佳可行解、命中率或最優性比較。
   - 甘特圖：列 = 天線，色 = 衛星；校準區段灰色；可行時窗底色；可拖曳任務（改天線 = 拖到別列、改起始 = 橫拖）；拖放後即時 `checkFeasible` 並標紅違規與原因。
   - 動畫：2D 地球（圓）＋各衛星一條半徑遞增的圓軌道；地面站依 `angleDeg` 放在圓周（預設等距），畫覆蓋錐示意。標示「軌道為示意，接觸狀態以輸入時窗為準」。
     - 衛星相位 θ(t) = ω t + φ：固定 `ω = 360/H` 度／分鐘（僅視覺參數）；φ 以各時窗中點 (t_mid, 站角度) 的**圓周角距離**平方和最小化擬合；沒有可見時窗時按衛星索引等距初始化；多解時取最小角度。顯示擬合殘差，不當作違規。
     - **接觸狀態以資料為準**：時窗內 → 站與軌道段發光；任務進行中 → 站—星連線（顏色 = 衛星）；校準中 → 天線灰點。
   - 播放／暫停／倍速（0.5–8×）／時間軸拖曳；同一游標驅動動畫與甘特圖。
   - 匯出：甘特圖 PNG、動畫當前幀 PNG、排程 CSV/JSON。

---

## 7. 工程

```
satellite-ground-station-scheduling/
  SPEC.md  DECISIONS.md  AGENTS.md  README.md
  src/
    index.html   style.css
    engine.js    milp.js   ga.js   ui.js   anim.js
    data/default.json          # PPT 實例
  vendor/glpk/glpk-5.0.0.js    # 自帶 worker + wasm（已 base64 內嵌於該檔）
  build.js                     # 把 src/* + vendor 內嵌成 dist/index.html
  dist/index.html              # 交付物（追蹤進 git）
  docs/REVIEW_REQUEST_<sprint>.md  docs/REVIEW_PROMPT_<sprint>.md  docs/reviews/
```

- 瀏覽器：Chrome / Edge 最新版；`file://` 直接開啟必須可用（Worker 用 Blob URL，wasm 不用 fetch，不用 importScripts）。零外部網路請求。
- 所有模組以 IIFE 掛在 `globalThis.SGS`；GA Blob worker 腳本自足，內嵌同一份 engine 原始碼。
- build（`node build.js`，Node ≥ 18）：
  - 對 vendor glpk 檔驗證 SHA-256；確認 `export{pe as default};` 恰好出現一次且位於檔尾，否則失敗；改寫為 `window.GLPK=pe;`。此轉換為版本專用 adapter；升級 vendor 時改用 bundler 由模組入口產出 IIFE，不猜測壓縮符號，仍不改寫 `vendor/`。
  - 每個 `<!-- @inline:x -->` 標記必須恰好出現一次並完全替換。
  - 預設資料先 `JSON.parse` 驗證，再 `JSON.stringify` 並轉義 `<`、`>`、`&`、U+2028/2029；檢查內嵌 JS/CSS 不含會提前關閉元素的 `</script>`／`</style>`。
- 單檔 HTML 內保留 glpk.js 版權與 GPL-3.0 授權聲明、確切版本、建置轉換說明與來源取得方式；README 區分自有程式授權（MIT）與內嵌依賴授權，不把整份 HTML 表述為純 MIT。

---

## 8. Sprint 與驗收

| Sprint | 交付 | 驗收 |
|---|---|---|
| S0 | 本 SPEC + 骨架 + build | Codex 審 spec：有條件通過 → 已修訂（draft 2） |
| S1 | engine（含 validateData/normalize）+ milp + 甘特圖（唯讀）+ 資料分頁（表格編輯，不含拖曳） | (a) PPT 實例 MILP：`GLP_OPT`、Z=5、W=11；(b) greedy fixture Z=4、W=5；(c) 不可行 fixture 回報 §1.3 的 4 條違規且無多報；(d) `validateData` 覆蓋：calibMin=0、負校準、重複 req、`end==window.end`、相鄰 visibility 合併、H 尾端通訊合法但校準跨 H、無候選需求之空解；(e) 同一 Schedule 經 MILP 轉換與 `score` 三欄一致 |
| S2 | GA 兩種編碼 + 實驗分頁 + 產生器 | PPT 實例、固定 seeds 與預設參數：20 runs 命中 (5,11) 100%（經驗驗收，非演算法保證）；30 需求隨機實例 GA 與 MILP（tmlim 30s）差距可報告；取消後舊結果不覆蓋解槽 |
| S3 | 動畫 + 甘特圖拖曳 + 時窗拖曳 + 播放控制 | 三解槽皆可播放；拖出違規即時標紅；擬合殘差顯示 |
| S4 | 匯出、主題切換、localStorage 降級、授權聲明、收尾 | 單檔離線驗收紀錄：Chrome/Edge 版本、file://、斷網、smoke z=3 且 `GLP_OPT`、GA worker 啟動／取消、無外部請求、儲存失敗不阻止操作；全部匯出可用；授權文字齊備 |

每個 Sprint 結束：`node build.js` → `dist/index.html` 可開 → 寫 `docs/REVIEW_REQUEST_<sprint>.md` + `docs/REVIEW_PROMPT_<sprint>.md`（記錄被審 commit SHA）→ Codex 審 → 回覆寫 `docs/reviews/<sprint>-codex.md` → 工程方逐項回應於 `docs/reviews/<sprint>-response.md` 並更新 DECISIONS.md。

---

## 9. 已結案的開放問題（draft 1 §9）
1. 事件點限制 → S1 保留逐分鐘並記錄規模指標；只在實測有收益時改用候選起始事件列（§4.1）。
2. 動畫相位擬合殘差 → 接受；ω = 360/H、圓周角距離擬合、殘差只顯示（§6）。
3. 直接編碼罰則 λ → 預設 |R|+1，依 `(rule, reqs)` 去重計 V（§5.1）。
