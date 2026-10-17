# 太空衛星地面站排程 — MILP 最佳解 × 基因演算法 × 互動動畫

清大 AIMS「大數據與決策分析」最佳化課程專案。
單一 HTML 檔，離線可開：編輯資料與參數、用 MILP（glpk.js）求最佳排程、用 GA 求近似解，
並以甘特圖與衛星繞地示意動畫播放比較。

- 規格：[SPEC.md](SPEC.md)
- 決策紀錄：[DECISIONS.md](DECISIONS.md)
- 協作約定：[AGENTS.md](AGENTS.md)

## 使用
```
node build.js        # 產生 dist/index.html
```
雙擊 `dist/index.html` 即可使用。

## 授權
- 本專案自有程式碼（`src/`、`build.js`、文件）：MIT。
- `vendor/glpk/glpk-5.0.0.js`（jvail/glpk.js，GLPK 的 WebAssembly 移植）：**GPL-3.0**，見 `vendor/glpk/LICENSE`，來源 https://github.com/jvail/glpk.js 。
- `dist/index.html` 內嵌了上述 glpk.js，因此整份單檔交付物受 GPL-3.0 約束，不是純 MIT；單檔內保留其版權與授權聲明，build 時的轉換僅為把 ES module export 改寫為全域變數（見 `build.js`）。
