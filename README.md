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
專案程式碼：MIT。內嵌之 glpk.js 5.0.0 為 GPL-3.0（見 vendor/glpk/LICENSE）。
