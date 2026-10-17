# CLAUDE.md — Claude Code 進入本專案先讀

本專案：太空衛星地面站排程（MILP 最佳解 × GA × 單檔 HTML）。你是**工程方**；審查方是 Codex；PO 是 James（不讀程式碼，靠測試與可開啟的 dist/index.html 判斷）。

## 先讀（順序）
1. `AGENTS.md` — 角色、硬性規則（尤其：`src/engine.js` 的 `checkFeasible()` 是唯一規則來源；零外部請求；每輪審查要附 prompt）
2. `SPEC.md` — 規格（§8 是每個 sprint 的驗收）
3. `DECISIONS.md` 末段 — 最近決策
4. `docs/reviews/` 最新的 `S<n>-codex*.md` 與 `S<n>-response.md` — 目前審查狀態

## 目前狀態（更新於每次送審）
- S0 規格：通過。S1：r3 通過。S2：r3 通過。S3（動畫 + 播放控制 + 甘特圖拖曳 + 時窗拖曳）：r1 退回（B1–B5、A1–A2）已全數修正，**S3-r2 待 Codex 複審**。
- 下一步：S3 通過 → S4（匯出收尾、localStorage 降級驗收、授權聲明、離線驗收紀錄），見 SPEC §7、§8。

## 指令
```
npm test              # engine + ga + anim 單元測試（純 Node，必須全綠）
npm run build         # node build.js → dist/index.html（單檔，離線可開）
npm run test:browser  # Playwright + Chromium 跑 S1–S3 瀏覽器驗收（file://）；無法下載 Chromium 時設 PW_CHANNEL=msedge 用本機 Edge
python3 tools/enumerate.py src/data/default.json   # 全列舉 oracle，核對 (Z,W)
```

## 工作方式
- 每個 sprint：實作 → `npm test` + `npm run build` + `npm run test:browser` 全綠 → 寫 `docs/REVIEW_REQUEST_S<n>.md` 與精簡的 `docs/REVIEW_PROMPT_S<n>.md`（記錄被審 commit SHA）→ commit/push → PO 把 prompt 交給 Codex。
- 收到審查：逐項回應寫 `docs/reviews/S<n>-response.md`（採納／不採納＋理由），SPEC 有改動就在 DECISIONS.md 追加一行，再送複審 prompt `REVIEW_PROMPT_S<n>-r<k>.md`。
- 不改 `vendor/`；不加 CDN；時間為整數分鐘、區間半開。
- 測試先行：先把 SPEC §8 的驗收寫成斷言，再實作。
