# SPEC — 太空衛星地面站排程：最佳解（MILP）與基因演算法（GA）互動工具

版本：S0 draft 1（2026-10-17）　狀態：待 Codex 審查
PO：James　工程：Claude Code　審查：Codex

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
工具內實際使用的目標（MILP 與 GA 共用）：

    maximize  Σ_r assigned_r  −  ε · Σ_r wait_r
    wait_r = start_r − earliest_r（分鐘）；ε = 1 / (|R|·H + 1)，H = 時間軸長度（分鐘）

ε 的選法保證次目標總和 < 1，永遠不會翻轉主目標的排序。

### 1.2 限制
| # | 限制 | 工具內解讀 |
|---|---|---|
| 1 | 每支天線同一時間只能服務一顆衛星 | 同天線任務區間不重疊 |
| 2 | 天線完成任務後需校準 c 分鐘，期間不得開始新任務 | 同天線前一任務結束 + c ≤ 下一任務開始 |
| 3 | 同一衛星同一時間只能進行一項通訊任務 | 同衛星任務區間不重疊（跨天線亦算） |
| 4 | 需求若被服務，至少須滿足最小時長 | 任務時長固定 = 最小時長 d_r |
| 5 | 頻段必須與天線硬體相容 | band(r) == band(a) |
| 隱含 | 任務須在需求可通訊時段內，且在衛星飛越該站的時窗內 | [start, start+d_r) ⊆ req_window_r ∩ vis_window(sat_r, station(a)) 的某一段 |

區間一律半開 [start, end)。相鄰任務（前一個 end == 後一個 start）不算重疊。
時間以**分鐘**為離散單位。

### 1.3 預設實例（PPT Given Data）
需求 R1–R6、衛星 SAT_A/B/C、天線 GS_1(S)、GS_2(S)、GS_2(X)、校準 10 min、時窗如 PPT 第 12 頁。
已手算驗證：**最佳 Z = 5**（R1 GS_1 10:05、R2 GS_2-X 10:03、R3 GS_2-S 10:08、R6 GS_2-X 10:22、R5 GS_1 10:25）；
PPT 的貪婪可行解 Z = 4。上界證明：三筆 X 需求共用唯一 X 天線，R4 與 R2、R6 任一皆無法共存 ⇒ X 任務 ≤ 2 ⇒ Z ≤ 5。
這兩個數字是 S1 的驗收測試。

---

## 2. 資料模型（JSON）

```jsonc
{
  "meta": { "name": "PPT week6", "timeOrigin": "10:00", "horizonMin": 40, "calibDefaultMin": 10 },
  "bands": ["S", "X"],                       // 任意字串
  "satellites": [ { "id": "SAT_A", "color": "#..." } ],
  "stations": [
    { "id": "GS_1", "angleDeg": 0,            // 動畫上在地球圓周的位置，可改
      "antennas": [ { "id": "GS_1-S", "band": "S", "calibMin": null } ] }   // null = 用全域預設
  ],
  "visibility": [                             // 每 (衛星, 站) 可多段
    { "sat": "SAT_A", "station": "GS_1", "start": 0, "end": 12 }
  ],
  "requests": [
    { "id": "R1", "sat": "SAT_A", "band": "S", "durMin": 5, "start": 0, "end": 10 }
  ]
}
```

- 所有時間為相對 `timeOrigin` 的分鐘整數。UI 顯示時換算成 HH:MM。
- 解（Schedule）：`[{ "req": "R1", "antenna": "GS_1-S", "start": 5 }]`；未出現的需求 = 未排入。
- 三個解槽各存一份 Schedule + 來源標記 + 評分結果。
- 持久化：整份 state（資料 + 參數 + 三解槽）存 localStorage；JSON 匯入／匯出同一結構。

---

## 3. 共用核心 `engine.js`

- `expandAntennas(data)` → 天線列表（含站、頻段、校準）。
- `feasibleStarts(data, r, a)` → 該需求在該天線所有可行起始分鐘的集合（已套用限制 4、5 與隱含時窗）。
- `checkFeasible(data, schedule)` → `{ ok, violations: [{ rule: 1|2|3|4|5|'window', reqs: [...], msg }] }`
  **唯一的規則來源**。MILP 解、GA 解、手動解在顯示前都必須通過它；GA 解碼器內部也呼叫它的增量版本。
- `score(data, schedule)` → `{ assigned, totalWait, objective }`。
- `greedyDecode(data, order, antennaPref)` → Schedule（GA 間接編碼用；也用來重現 PPT 的 Z=4 貪婪解）。
- `generateInstance(seed, {nSat, nStation, nAntennaPerStation, nReq, windowDensity, bands})` → data（seeded PRNG：mulberry32）。

---

## 4. MILP（`milp.js`，glpk.js 5.0.0，GPL-3.0，內嵌）

### 4.1 時間索引模型
集合：R 需求、A 天線、T = {0..H−1}。
S(r,a) = feasibleStarts(r,a)。
變數：x[r,a,t] ∈ {0,1}，僅對 t ∈ S(r,a) 建立。

    max  Σ x[r,a,t] − ε Σ (t − earliest_r)·x[r,a,t]

    (每需求至多一次)      Σ_{a,t} x[r,a,t] ≤ 1                                   ∀r
    (天線 + 校準, 限制1+2)  Σ_r Σ_{t: t ≤ τ < t + d_r + c_a} x[r,a,t] ≤ 1          ∀a, ∀τ∈T
    (衛星互斥, 限制3)      Σ_{r: sat_r = s} Σ_a Σ_{t: t ≤ τ < t + d_r} x[r,a,t] ≤ 1  ∀s, ∀τ∈T

限制 4、5 與時窗已由 S(r,a) 內建。無 big-M。
規模：PPT 實例約 6×3×~10 ≈ 100 個二元變數、~150 條限制，GLPK 毫秒級。

### 4.2 求解流程
1. 在 Web Worker（glpk.js 自帶）呼叫 `solve(lp, { tmlim: 使用者秒數, presol: true })`。
2. 結果狀態：`GLP_OPT` → 標「已證明最佳」；`GLP_FEAS`（超時）→ 標「未證明最佳（超時）」並附 LP 鬆弛上界（另跑一次無整數限制取得 bound，顯示 gap）；`GLP_NOFEAS`/`UNDEF` → 顯示錯誤。
3. 解 → Schedule → `checkFeasible` 二次驗證 → 寫入 MILP 解槽。
4. 頁面「模型」分頁以 KaTeX 風格純 HTML/CSS 顯示上述式子（不引入 KaTeX 函式庫；用 `<sub>`、`<sup>` 與 Unicode）。

---

## 5. GA（`ga.js`，在 Web Worker 執行，Blob URL 建立）

### 5.1 兩種編碼（可切換）
**間接編碼（預設）**：染色體 = [需求優先序排列 π] + [每需求天線偏好索引 p_r]。
解碼：依 π 順序，對需求 r 先試 p_r 指到的天線、再試其他相容天線，取 `feasibleStarts` 中與目前部分排程不衝突的最早起始；找不到即不排入。天然可行。

**直接編碼**：染色體 = 每需求 (assign ∈{0,1}, antennaIdx, start)。
- 修復模式：依需求順序逐筆檢查，與已接受任務衝突者改為未排入。
- 罰則模式：fitness = objective − λ·(違規數)，λ 可調；最終解仍過 `checkFeasible`，不可行則標示。

### 5.2 算子（全部可調）
- 選擇：錦標賽，k（預設 3）
- 交叉：排列用 OX；天線偏好／直接編碼用均勻交叉；交叉率 pc（預設 0.9）
- 突變：排列 swap；天線偏好翻轉；直接編碼起始時間 ±隨機；突變率 pm（預設 0.1）
- 菁英保留 e（預設 2）
- 族群 N（預設 50）、世代上限 G（預設 200）、停滯停止 S 代（預設 50）
- seed（預設 42）；同 seed 同結果

### 5.3 實驗分頁
- 單次 run：每代 best / avg 曲線（canvas 自繪），可中斷。
- 多次 run：runs 次（預設 20），回報 最佳 / 平均 / 標準差 / 命中 MILP 最佳率 / 平均達最佳世代數。
- 匯出：每代曲線 CSV、多次 run 統計 CSV。
- 以隨機實例產生器產生中／大型實例做比較（PPT 實例太小，GA 第一代即達最佳）。

---

## 6. 介面（單檔，深／淺主題切換，繁中）

分頁：
1. **資料**：衛星、地面站（含天線）、時窗、需求四張可編輯表格；新增／刪除；JSON 匯入匯出；實例產生器面板；時間軸上可拖曳時窗起訖。
2. **模型**：MILP 式子說明；時間上限；求解按鈕；狀態（最佳／超時／不可行）、Z、總等待、求解秒數。
3. **GA 實驗**：參數面板、單次 run 曲線、多次 run 統計表、匯出。
4. **排程與動畫**：
   - 解槽選擇器（手動／MILP／GA）＋三者並排評分卡（Z、總等待、可行性）。
   - 甘特圖：列 = 天線，色 = 衛星；校準區段灰色；可行時窗底色；可拖曳任務（改天線 = 拖到別列、改起始 = 橫拖）；拖放後即時 `checkFeasible` 並標紅違規與原因（重現 PPT 不可行解範例）。
   - 動畫：2D 地球（圓）＋各衛星一條半徑遞增的圓軌道；地面站依 `angleDeg` 放在圓周（預設等距），畫覆蓋錐示意。
     - 衛星相位：以該衛星各時窗中點 (t_mid, 站角度) 做最小平方擬合 θ(t) = ω t + φ（ω 固定，φ 擬合；同站多段時窗取各段中點）。
     - **接觸狀態以資料為準**：在時窗內 → 站與軌道段發光；任務進行中 → 站—星連線（顏色 = 衛星），校準中 → 天線灰點。
   - 播放／暫停／倍速（0.5–8×）／時間軸拖曳；同一游標驅動動畫與甘特圖。
   - 匯出：甘特圖 PNG、動畫當前幀 PNG、排程 CSV/JSON。

---

## 7. 工程

```
衛星軌道/
  SPEC.md  DECISIONS.md  AGENTS.md  README.md
  src/
    index.html   style.css
    engine.js    milp.js   ga.js   ui.js   anim.js
    data/default.json          # PPT 實例
  vendor/glpk/glpk-5.0.0.js    # 自帶 worker + wasm（已 base64 內嵌於該檔）
  build.js                     # 把 src/* + vendor 內嵌成 dist/index.html
  dist/index.html              # 交付物（追蹤進 git）
  docs/REVIEW_REQUEST_TEMPLATE.md  docs/reviews/
```

- 瀏覽器：Chrome / Edge 最新版；`file://` 直接開啟必須可用（Worker 用 Blob URL，wasm 不用 fetch）。
- 零外部網路請求。
- build：`node build.js`（Node ≥ 18）。vendor 檔尾 `export{pe as default}` 由 build 改寫為 `window.GLPK=pe`。
- 所有模組以 IIFE / 全域命名空間 `SGS.*` 掛載，避免單檔內 ES module 問題。

---

## 8. Sprint 與驗收

| Sprint | 交付 | 驗收 |
|---|---|---|
| S0 | 本 SPEC + 骨架 + build | Codex 審 spec 通過 |
| S1 | engine + milp + 甘特圖（唯讀）+ 資料分頁（表格編輯，不含拖曳） | PPT 實例 MILP Z=5、greedyDecode 重現 Z=4；`checkFeasible` 對 PPT 不可行解報出 4 條違規 |
| S2 | GA 兩種編碼 + 實驗分頁 + 產生器 | PPT 實例 GA 20 runs 命中率 100%；30 需求隨機實例 GA 與 MILP（tmlim 30s）差距可報告 |
| S3 | 動畫 + 甘特圖拖曳 + 時窗拖曳 + 播放控制 | 三解槽皆可播放；拖出違規即時標紅 |
| S4 | 匯出、主題切換、localStorage、收尾 | 單檔離線開啟；全部匯出可用 |

每個 Sprint 結束：`node build.js` → `dist/index.html` 可開 → 寫 `docs/REVIEW_REQUEST_<sprint>.md` → Codex 審 → 回覆寫 `docs/reviews/`。

---

## 9. 開放問題（給 Codex 審查時特別看）
1. 時間索引模型的天線限制用「每分鐘一條」會有 |A|·H 條限制；H 大時（> 1440）是否改成只在事件點 τ 建限制？（S1 先用每分鐘，實測後決定）
2. 動畫相位擬合對「同衛星多站時窗」會有殘差，是否接受？（已決策：接受，接觸狀態以資料為準）
3. 直接編碼罰則模式的 λ 預設值。
