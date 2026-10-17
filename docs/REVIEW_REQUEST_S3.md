# Review Request — S3（動畫 + 播放控制 + 甘特圖拖曳 + 時窗拖曳）

被審 commit：見 `docs/REVIEW_PROMPT_S3.md`。

## 範圍
- `src/anim.js`（新）：circDiff、stationAngles、fitPhase／fitAll（ω=360/H、圓周角距離、格點＋細化、無時窗等距、多解取最小）、satAngle、contactState（以資料為準）、layout、drawFrame
- `src/ui.js`：播放狀態（play/pause/倍速/拖曳，1× = 每秒 1 分鐘，到 H 循環）、甘特圖時間游標、drawAnim、甘特圖拖曳（pointer events；落在手動解槽；托盤取消／拖回）、時窗時間軸編輯（資料分頁，只改 draft）、動畫幀 PNG、A2 參數回填
- `src/index.html`、`src/style.css`：播放列、動畫畫布、托盤、時窗時間軸
- `tests/anim.test.js`（新，9 項）、`tests/browser.s3.js`（新，8 步）、`tests/browser.s2.js`（A2）

## 驗收結果（工程方自測；SPEC §8 S3）
| 項 | 預期 | 實際 | 結果 |
|---|---|---|---|
| 三解槽皆可播放 | MILP／GA／手動都能進動畫 | t=22.5：MILP 與 GA 槽 active=[R6]、SAT_C 在 GS_1／GS_2 時窗內、GS_2-X 未在校準；手動槽 t=24.5 active=[R5] | ✔ |
| 游標同步 | 同一游標驅動動畫與甘特圖 | scrub 50% → t=20、動畫 t=20、標籤 10:20；4× 播放 600 ms 前進量在 0.5–1.5× 預期內；暫停後不變；39.9 處播放循環回 0 | ✔ |
| 拖出違規即時標紅 | 拖 R1 到 GS_2-S 與 R3 重疊 → 手動槽、rule 1、紅框、違規列表 | ghost 即時顯示 ok=false；放下後 manual 不可行、`1:R1+R3`、違規區可見、MILP 槽不變、評分卡標不可行 | ✔ |
| 手動增減 | 拖回可行；拖到托盤取消；托盤拖回 | R1 回 GS_1-S@0 可行；R5 → 托盤後 Z=4 且 chip 出現；chip 拖回 GS_1-S@24 → (5,11) 可行 | ✔ |
| 時窗拖曳 | 端點／平移改 draft，需套用 | visibility[0].end 12→15（表格同步 15、committed 仍 12）→ 套用 r+1；R2 整段平移 [2,8)→[5,11) | ✔ |
| 擬合殘差顯示 | 顯示 φ 與 RMS | PPT 實例三衛星殘差 46.5°／51.0°／51.0°（同衛星在相隔 120° 的兩站時窗重疊，示意動畫的已知折衷） | ✔ |
| Node | fitPhase：一致時窗殘差 0、φ=270 可重現；不一致 → 殘差 45°；無時窗 → 0/120/240；對稱退化 → 取最小角 90；contactState 多個時刻；layout 半徑遞增 | 9/9 | ✔ |

`npm test` 39+19+9；`npm run test:browser` 19+16+8；build 370 KB；零 pageerror／外部請求。

## 請審查方特別看
1. `anim.fitPhase` 的目標函式與多解規則是否符合 SPEC §6（圓周角距離、ω 固定、最小角度）；格點 0.5° + 細化是否確定性。
2. `contactState` 是否完全以資料判定（時窗、任務區間、校準區間），與 `checkFeasible` 的半開區間語意一致。
3. 甘特圖拖曳：`ensureManual` 複製語意（從 MILP/GA 拖曳不改原槽）、舊 revision 槽的處理、ghost 可行性預覽用的 base schedule。
4. 播放迴圈：rAF 計時、暫停／倍速切換時的 `last` 重置、commit 後 t > H 的處理。
5. 時窗時間軸：拖曳改 draft 的邊界（start<end、0..H）、與表格輸入的同步。

## 已知未完成
- S4：CSV／PNG 匯出收尾（已有大部分）、localStorage 降級驗收、授權聲明核對、離線驗收紀錄。
