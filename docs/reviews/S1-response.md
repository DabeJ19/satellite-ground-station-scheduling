# Response to Review S1 — Claude Code（工程方）

日期：2026-10-17　被審 commit：`743ac33`　PR #3 已合併（`87e9f24`）

## 阻擋項（全部採納）
| # | 處置 | 落點 |
|---|---|---|
| B1 | validateData 重寫為型別安全（先驗頂層／集合／元素型別再遍歷；缺 antennas 明確拒絕）；loadData/importJSONText 在區域變數完成 validate→normalize 後才替換 state；renderDataTab 所有值經 esc；三個反例＋全集合 {}/null/壞元素回歸 | engine.js、ui.js；tests B1 ×4、browser B1 |
| B2 | reqById/antById/satById 改 Map；visibility 用 Map<sat, Map<station>>；去重鍵 JSON.stringify；milp 分組用 Map；score 對結構非法回 feasible=false + error、無 NaN | engine.js、milp.js；tests B2 ×4（constructor/toString/__proto__、逗號六對、NUL 鍵、非陣列） |
| B3 | hasIncumbent：僅 OPT/FEAS 解碼；變數有限且近似 0/1；checkFeasible；z 與 objective 一致；否則 schedule=null、「結果無效」、UI 不寫槽。LP 獨立 try/catch，失敗保留 incumbent，bound.unavailable + warning | milp.js、ui.js；tests B3 ×6、browser「NOFEAS 不覆寫解槽」 |
| B4 | GLPK 初始化 single-flight + 世代號；過期初始化完成即 terminate 並拋 stale；solveMILP 在初始化後再驗 run 有效；cancel 只終止進行中 run 的實例（閒置實例保留，避免 boot 期 commit 誤殺）；可注入 factory | ui.js；browser「init race」（倒序完成：started=[B]、terminated=[A] 再 [A,B]、inst=B） |
| B5 | change 事件重建選單；失效引用保留為「（無效）」option；天線換站找不到目標報錯並保留原狀 | ui.js；browser B5 ×3（S→Ku、GS_1→G_NEW、移站 0/3 與候選 [3,4,5]） |
| B6 | deadline 單調時鐘（可注入 now）；LP tmlim = min(配額, 實際剩餘)，<1 s 跳過；不再宣稱「超時」，FEAS 附用時／上限 note；OPT 不加註 | milp.js；tests B6 ×3（960 ms/1 s 不標超時且無 LP；31 s 超支跳過 LP；剩 2 s 配額 6 → LP tmlim 2） |
| B7 | browser 測試 15 步全硬斷言、finally 關閉、非零退出；外部請求檢查排除 file:// 與 blob:；甘特圖以 `state.lastGantt` 可觀測幾何核對三列五任務與校準；§8.3 在真實 UI 路徑以可注入 factory／deferred solver 測：舊結果遲到被丟棄、cancel/新 run、初始化倒序 | tests/browser.s1.js、tests/engine.test.js（async runner） |

## 建議項（本輪一併採納）
| # | 處置 |
|---|---|
| A1 | metadata 輸入加 data-path，錯誤高亮；browser 測 H=0、calibDefaultMin=−1 |
| A2 | saveLS 失敗顯示備份提示（不重複），成功後清除；browser 以 setItem 拋 QuotaExceededError 測 |

## 自測結果
- `node tests/engine.test.js`：37 passed, 0 failed
- `node build.js`：271 KB
- `node tests/browser.s1.js`（Chromium file://）：15 browser steps passed；無 pageerror／console error／外部請求

## 補充
- B4 的設計差異：cancel 僅在 `state.solving` 時銷毀實例；閒置的已就緒實例不銷毀（否則 boot 時 commit 會終止剛初始化的實例）。取消中的 run 其初始化若未完成，世代號遞增後完成時自行 terminate。
- 審查方環境無 Chromium：browser 測試仍是工程方自測；截圖在 tests/out/（不入 git）。

---

# Response to Review S1-r2 — Claude Code（工程方）

日期：2026-10-17　被審 commit：`74e55da`　PR #4 已合併

| # | 處置 | 落點 |
|---|---|---|
| N1 `{"toString":null}` 拋 TypeError | **採納（B1/B2 共用根因）**：新增 `engine.fmt()` 安全格式化（物件／陣列用 JSON.stringify，不呼叫 String）；validateData 對 timeOrigin/band/sat/station 先驗型別再驗引用，訊息改用 fmt；checkFeasible 的 req/antenna/start 型別錯誤回 schema；UI `esc()` 對物件走 fmt。Node 回歸：六個資料欄位（含包陣列）不 throw、ok=false、path 正確；排程三欄位 × {物件, 陣列} 不 throw、schema、分數有限。瀏覽器：importJSONText 匯入 band 為該物件 → ok=false、錯誤指向 requests[0].band、draft/committed/revision/解槽不變、之後可載入預設 | engine.js、ui.js；tests N1 ×2、browser N1 |
| A3 UI 回歸補齊 | 採納：(1) 改名誤導的步驟；(2) 新增「run A 進入求解後 commit + 啟動 B，A 的 solver reject → A 回 null，B 的狀態／按鈕／實例／解槽不變，B 結果可入槽」；(3) 「boot 閒置初始化 pending + 首次 solve → factory 只呼叫一次，solve 在該實例執行」（新增測試鉤子 `_warmGLPK`）；(4) 「run 初始化中 commit → 遲到實例 terminate、solve 從未呼叫、run 回 null」；既有 §8.3 步驟改用可觀測的 pending 計數等待，不再固定 10 ms | tests/browser.s1.js（19 步） |

## 自測
`node tests/engine.test.js` 39 passed；`node build.js` 272 KB；`node tests/browser.s1.js` 19 browser steps passed（Chromium file://，無 pageerror／外部請求）。

---

# Response to Review S1-r3 — Claude Code（工程方）
PR #5 已合併。C1（waitFor 逾時）採納：頁內 `__waitFor(predicate, label, timeoutMs=2000)` 逾時 reject 並清除 timer；S1 既有步驟改用；S2 測試第一步即驗證逾時路徑。
