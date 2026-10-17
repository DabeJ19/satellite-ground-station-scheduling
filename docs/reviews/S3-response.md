# S3 審查回應（r1 → r2）

對應 `docs/reviews/S3-codex.md`（PR #9）。被審 commit 見 `docs/REVIEW_PROMPT_S3-r2.md`。

| 項目 | 採納 | 修改 | 驗證 |
|---|---|---|---|
| B1 拖曳用 `state.norm` 但區塊來自 `slot.norm` | 採納 | `src/ui.js`：`canDrag()` 拒絕舊版本解槽並顯示 `#ganttHint`；`state.drag.revision` 記起始版本，`moveDrag/endDrag` 版本不符或需求不存在即 `cancelDrag()`；`commit()` 與 `pointercancel` 呼叫 `cancelDrag()`；新增 `manualBase()`，ghost 可行性與 `ensureManual()` 共用同一基底 | `tests/browser.s3.js` 新增兩步：刪除 R1 後拖舊版 MILP 的 R1 區塊 → 拒絕、無錯誤、解槽不變；拖曳中 `loadData` → drag 清空、放開不寫入；`pointercancel` → 清空；`manualBase()===slots.manual.schedule` |
| B2 播放列用 `state.norm`，甘特／動畫用解槽 norm | 採納 | `viewNorm()`／`isViewStale()`／`syncPlay()`；拉桿、`setTime`、循環上限、標籤全用 `viewNorm()`；切槽與 `commit()` 呼叫 `syncPlay()`；`commit()` 先 `pausePlay()`（並清 `last`） | browser 新增步：H 40→80、原點 08:00 後選舊版 MILP：`setTime(60)`→40、拉桿 100、標籤 10:40；切到空槽位 → H=80、拉桿 25、標籤 08:20；切回 → 夾到 40；stub rAF 受控時戳：39→39.5→循環 0；暫停重播第一幀不跳；commit → playing=false、raf/last=null |
| B3 只細化單一候選 | 採納 | `src/anim.js` `fitPhase`：環狀格點收集所有局部最低盆地（含 359.5/0 交界）→ 各自細化至 1e-5° → 容差 `1e-6·max(1,cost_min)` → 取最小正規化角；回傳 `candidates` | `tests/anim.test.js`：七站 fixture φ 與 0.1° 圓周距 ≤ 0.001、RMS=720/7±0.001、重複三次一致、candidates=7；跨 0° 單點 fixture（φ=359.9、357.1） |
| B4 NUL 複合鍵碰撞 | 採納 | `visKey = JSON.stringify([sat, station])` | anim test：`'A\0B'@'C'` vs `'A'@'B\0C'` 只有 C 與 A\0B 發光（`drawFrame` 回傳 `render.litStations/litSats`） |
| B5 `[0,H)` 弧長為 0 | 採納 | `a1 = a0 + ω·(end−start)·π/180` | anim test：`[0,60)` 跨度 2π；`[50,60)` 跨度 π/3 且 a1>a0 |
| A1 時窗編輯器未隨 H／標籤重畫 | 採納（提前） | `onDraftInput`：`horizonMin` 與 `id/sat/station/durMin/start/end` 即重畫 | browser 步 A1：H 40→60 重畫 1 次、改 id 再重畫 1 次 |
| A2 多衛星超出畫布 | 採納（提前） | `layout`：間距 <8px 時縮 Re（≥12）與 gap（≥3），外圈留 24px | anim test：14 顆衛星外圈 +24 ≤ min(w,h)/2 |

其他：`drawFrame` 回傳 `render:{arcs,litStations,litSats}`（純附加，測試用）；SPEC §6 補明定（draft 5）；DECISIONS 追加一節。

測試：`npm test` 72（39+19+14）全綠；`npm run build` 374 KB；browser S1 19／S2 16／S3 12 步全綠（Chromium，file://，零外部請求）。

---

# S3 複審回應（r2 → r3）

對應 `docs/reviews/S3-codex-r2.md`（PR #10）。

| 項目 | 採納 | 修改 | 驗證 |
|---|---|---|---|
| N1 求解結果替換選中槽未同步播放游標 | 採納 | `src/ui.js` `setSlot(name, slot)`：寫入後若 `name === state.activeSlot` 先 `syncPlay()` 再 `saveLS/renderSched`；MILP、GA、手動皆走 `setSlot`；`ensureManual()` 切到手動槽後 `syncPlay()`；boot 還原解槽後同步一次。暫停狀態不變 | `tests/browser.s3.js` 新增 N1 步：GA 路徑 H80/t70 → 提交 H40（舊槽保留 t70）→ 重跑 GA → t=40、拉桿 100、標籤 10:40、動畫 t=40、playing=false；一般同步 t=20：25% → 換 H40 槽後 50%、timeOrigin 改 20:00 → 標籤 20:20；更新未選中 MILP 槽（零候選）不改 GA 槽的 t/H/標籤；MILP 路徑 t=100 → 提交 H40、`solveMILP()` 替換選中槽 → 40/100%/20:40 |
| A1 band/color 重畫、無效 H 停用拖曳 | 延後 S4 | — | 依 Codex 建議列入 S4 |
| A2 大量衛星畫布容量 | 延後 S4 | — | 依 Codex 建議列入 S4 |

SPEC §6 播放資料來源一句補「任何解槽寫入落在選中槽時同步；寫入未選中槽不改動檢視時間」。

測試：`npm test` 72 全綠；build 374 KB；browser S1 19／S2 16／S3 13 步全綠。

