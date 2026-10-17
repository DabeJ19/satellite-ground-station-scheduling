# Review Request — S0（規格與骨架）

## 範圍
- SPEC.md（主要審查對象）
- DECISIONS.md、AGENTS.md
- build.js、src/index.html、src/ui.js（煙霧測試）、src/data/default.json
- vendor/glpk/glpk-5.0.0.js（不需審內容，只需確認授權與內嵌方式可接受）

## 驗收測試結果（工程方自測）
| 測試 | 預期 | 實際 | 結果 |
|---|---|---|---|
| `node build.js` | 產生 dist/index.html | 212 KB | ✔ |
| headless Chromium 以 file:// 開啟 dist/index.html | glpk worker + wasm 啟動、解 smoke LP z=3 | z=3，status=GLP_OPT，無 console error | ✔ |

## 請審查方特別看
1. SPEC §4.1 時間索引 MILP 的三條限制是否完整涵蓋 PPT 五條限制與隱含時窗（尤其限制 2 校準用「占用區間延長 c_a」的寫法）。
2. SPEC §1.1 的 ε 選法是否確保次目標永不翻轉主目標。
3. SPEC §5.1 間接編碼解碼器是否會系統性地排除某些最佳解（例如最佳解需要「非最早起始」時）。若會，是否需要在染色體加入「起始偏移」基因？
4. SPEC §9 三個開放問題。
5. AGENTS.md 的硬性規則是否足以讓兩個 agent 不互相踩到。

## 已知未完成
- src/engine.js、milp.js、ga.js、anim.js 為空骨架（S1 起實作）。
