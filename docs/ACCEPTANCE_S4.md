# S4 單檔離線驗收紀錄

產生方式：`NODE_PATH=$(npm root -g) node tests/browser.s4.js`（Playwright，`context.offline=true`）。原始結果：`docs/acceptance/s4-playwright-chromium.json`（入版控；每個瀏覽器渠道各一份，不互相覆寫）與 `tests/out/acceptance-s4.json`。本檔由該結果整理。

## 交付物辨識
| 項目 | 值 |
|---|---|
| 被測程式碼 commit | `fb036dfb53ff588624417f42efb0927d443ec121` |
| 交付 HTML | `dist/index.html`，431286 bytes，SHA-256 `c6f7bb2b2a270eccb9d80bce1cf623c6393ab60dd5035d546e5cfe93b61f1f83` |
| 作業系統 | linux 6.18.44-fc-v139 (x64)；Node v22.22.0 |
| 瀏覽器 | **Playwright Chromium 141.0.7390.37**（渠道 `playwright-chromium`）。Google Chrome：未測。Microsoft Edge：未測（可用 `PW_CHANNEL=msedge` 重跑同一套，結果另存 `docs/acceptance/s4-msedge.json`） |
| 日期（UTC） | 2026-10-18T06:23:04.544Z |

## 結果（15 步全部通過）
| 項目 | 結果 |
|---|---|
| 開啟方式 | `file://…/dist/index.html`，`location.protocol === 'file:'` |
| 網路 | 斷網（`navigator.onLine === false`）；外部請求數 **0**（監聽所有非 file:/blob:/data: 請求） |
| 頁面錯誤 | **0** |
| GLPK 載入 | 「GLPK 5.0 已就緒（WebAssembly，Worker）」— Blob worker + 內嵌 wasm，無 fetch／importScripts |
| smoke LP | max x+y s.t. x+y ≤ 3 → z = **3**，status = 5 = `GLP_OPT`，GLPK 5.0 |
| PPT 實例 MILP | (Z, W) = (5, 11)，「已證明最佳」，可行 |
| GA worker 啟動／取消 | 啟動後 `state.ga.running && worker` 為真；`cancelGA()` → run 結果 `null`、不寫解槽、取消鍵停用；重跑 2 runs → Z = 5 |
| 全部匯出可下載 | `sgs-data.json` 2198 B, `sgs-workspace.json` 11314 B, `schedule-milp.csv` 278 B, `schedule-milp.json` 3559 B, `gantt.png` 16765 B, `animation-frame.png` 90029 B, `ga-curves.csv` 3554 B, `ga-stats.csv` 669 B, `ga-schedule.csv` 278 B（PNG 檢查 `89504e47` 檔頭；CSV 檢查表頭與列數；JSON 解析檢查） |
| 工作區 JSON round trip | 匯出 → 改資料／清解槽 → 匯入 → 資料、設定、三解槽、選中槽完全還原；純資料 JSON 仍可匯入；壞工作區被拒且狀態不變、顯示錯誤 |
| 壞解槽（B1） | `[null]`／`[7]`／未知 req／未知 antenna／start 1.5／重複 req → 該槽略過並提示，其他有效槽與資料仍還原；衝突排程保留為不可行槽；原型鏈鍵不接受；boot 同樣完成 |
| 壞設定／外層（B2） | 11 種壞輸入皆回 ok=false、不拋錯、狀態（資料／draft／revision／設定／槽／播放／控制項）完全不變；boot 遇壞設定 → 載入預設並提示 |
| GA 設定還原（B3） | `ga={}` → 控制項與 `readGaParams()` 回 50/42/λ 空白/runs 20，實際執行參數一致；部分設定由固定預設補齊 |
| 主題切換 | dark → light，重載後保留（儲存可用時） |
| localStorage 失敗 | `Storage.prototype.*` 一律拋錯：頁面以預設資料啟動、顯示備份提示橫幅、`saveLS()` 回傳 false；編輯／套用（r2）、手動排程、主題切換、MILP（R1.durMin=7 → (5,14)）、匯出工作區 JSON 全部仍可用；頁面錯誤 0、外部請求 0 |
| A1／B4 時窗編輯器 | band／color 變更即重畫；H 無效 → 提示、停用拖曳；拖曳中 H 變 `''`/`0`/`1.5` → 後續 move/up 不改 draft，恢復 H 後需重新 pointerdown |
| A2 多衛星版面 | 60 顆衛星 → 畫布 1032×1032、可捲動容器；最外軌道 492 + 24 ≤ 半邊；最小軌道間距 8px；回到 3 顆 → 504×420 不捲動 |

截圖：`tests/out/s4-offline.png`、`tests/out/s4-storage-failure.png`（未入版控）。

## 手動驗收提醒（PO）
1. 雙擊 `dist/index.html`（不需伺服器），斷網亦可。
2. 「模型」分頁按求解 → 顯示「已證明最佳」、Z=5、總等待 11。
3. 「GA 實驗」啟動後按取消 → 狀態回到可再執行。
4. 「排程與動畫」每個匯出鍵都應觸發下載；「資料」分頁可匯出／匯入工作區 JSON。
5. 頁尾「授權與第三方聲明」可展開 GPL-3.0 全文。
