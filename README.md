# 太空衛星地面站排程 — MILP 最佳解 × 基因演算法 × 互動動畫

清大 AIMS「大數據與決策分析」最佳化課程專案。
單一 HTML 檔，離線可開：編輯資料與參數、用 MILP（glpk.js）求最佳排程、用 GA 求近似解，
並以甘特圖與衛星繞地示意動畫播放比較。

- 規格：[SPEC.md](SPEC.md)
- 決策紀錄：[DECISIONS.md](DECISIONS.md)
- 協作約定：[AGENTS.md](AGENTS.md)

## 使用
```
npm test              # engine / GA / anim / build 單元測試（純 Node）
npm run build         # node build.js → dist/index.html
npm run test:browser  # Playwright + Chromium：S1–S4 瀏覽器驗收（file://、含斷網情境）
```
雙擊 `dist/index.html` 即可使用（不需伺服器、可斷網、零外部請求）。

- 分頁：資料（表格編輯、時窗時間軸拖曳、seeded 產生器、JSON 匯入匯出）→ 模型（MILP，已證明最佳／時間上限內最佳可行＋上界）→ GA 實驗（參數、單次曲線、多次統計、CSV）→ 排程與動畫（三解槽、甘特圖拖曳、播放、匯出）。
- 匯出：資料 JSON、工作區 JSON（資料＋參數＋三解槽，可匯回）、排程 CSV/JSON、甘特圖 PNG、動畫幀 PNG、GA 曲線／統計／排程 CSV。
- 瀏覽器儲存失敗（私密模式、配額）時降級為記憶體狀態並提示匯出 JSON 備份，所有操作仍可用。
- 離線驗收紀錄：[docs/ACCEPTANCE_S4.md](docs/ACCEPTANCE_S4.md)。

## 授權
- 本專案自有程式碼（`src/`、`build.js`、文件）：MIT。
- `vendor/glpk/glpk-5.0.0.js`（jvail/glpk.js，GLPK 的 WebAssembly 移植）：**GPL-3.0**，見 `vendor/glpk/LICENSE`，來源 https://github.com/jvail/glpk.js 。
- `dist/index.html` 內嵌了上述 glpk.js，因此整份單檔交付物受 GPL-3.0 約束，不是純 MIT；單檔內保留其版權與授權聲明，build 時的轉換僅為把 ES module export 改寫為全域變數（見 `build.js`）。
