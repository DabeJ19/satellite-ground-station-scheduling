# Review Request — S1（engine + MILP + 唯讀甘特圖 + 資料表格）

被審 commit：見 `docs/REVIEW_PROMPT_S1.md`。

## 範圍
- `src/engine.js`（validateData / normalize / feasibleStarts / checkFeasible / score / greedyDecode / mulberry32）
- `src/milp.js`（時間索引建模、解碼、LP 鬆弛上界、版本閘門 createGate、solve）
- `src/ui.js`、`src/index.html`、`src/style.css`（資料分頁表格編輯、模型分頁、解槽評分卡、唯讀甘特圖、localStorage 降級）
- `build.js`（SHA-256、標記唯一、JSON 轉義、`</script>` 檢查）
- `tests/engine.test.js`（Node，20 項）、`tests/browser.s1.js`（Playwright/Chromium，file://）
- `tools/enumerate.py`（A1 已修：合併 visibility、去重）

未在 S1 範圍：GA（ga.js 空）、動畫（anim.js 空）、拖曳、實例產生器、CSV/PNG 匯出（甘特圖 PNG 已順手做）。

## 驗收結果（工程方自測；§8 S1）
| 項 | 預期 | 實際 | 結果 |
|---|---|---|---|
| (a) default.json MILP | GLP_OPT、ok、Z=5、W=11 | status=5、Z=5、W=11、obj=4.954356846…；排程 R1/GS_1-S/0 R2/GS_2-X/5 R3/GS_2-S/8 R6/GS_2-X/22 R5/GS_1-S/24；39 變數／136 列／725 非零；MILP 18–43 ms | ✔ |
| (b) greedy fixture | 集合恰等於 §1.3，(4,5,959/241) | 一致 | ✔ |
| (c) 不可行 fixture | 恰 4 條 `{3:R1,R2}{3:R3,R4}{3:R5,R6}{2:R2,R4}`，無 rule 1 | 一致 | ✔ |
| (d) §8.1 D 九測例 | 如表 | 全部通過（tests/engine.test.js） | ✔ |
| (e) §8.2 轉換 oracle | (5,11,1194/241)、(4,5,959/241)、三欄一致 | 一致 | ✔ |
| (f) §8.3 閘門 | 舊 revision／取消／新 run 的訊息丟棄 | createGate 三測例通過（stub 順序控制） | ✔ |
| (g) §8.4 UI | 表格計數 3/2/3/6/6；R1.durMin=7 → r2、(5,14)、舊卡標「舊版本資料」；負時長被拒 | 一致（截圖 tests/out/*.png） | ✔ |
| 離線 | file://、無外部請求、無 console error | 唯一非 file 請求為 glpk 的 blob: worker URL | ✔ |

## 與 SPEC 的差異／補充決策
- 時間預算 80/20 分配與單變數列裁剪：見 DECISIONS.md「S1 實作期間」。
- `checkFeasible` 的 'window' 與 'schema' 分工：id/型別/負值 → 'schema'；時間不在需求時窗∩飛越時窗∩[0,H) → 'window'；頻段不符 → rule 5（不再同時報 'window'）。
- 甘特圖 PNG 匯出提前實作（S4 項目）。

## 請審查方特別看
1. `engine.checkFeasible` 的規則 1／2 分工：通訊重疊報 rule 1、僅校準間隔不足報 rule 2，兩者互斥；是否與 §1.2 一致。
2. `milp.buildLP` 的列生成（每分鐘 τ、裁剪單變數列）是否仍與 §4.1 等價；`relax` 模式的 bounds 寫法是否正確（glpk.js JSON API）。
3. `milp.solve` 的 timedOut 判定（milpMs ≥ 95% 上限）是否合理；LP 上界僅在 `GLP_OPT` 採用。
4. `ui.js` 的 commit → `gate.setRevision` → `cancelSolve` 順序是否能保證舊 run 結果不落地（含 glpk.terminate 後重建實例）。
5. 資料表格編輯 → draft → validateData 的路徑；錯誤定位（`data-path`）是否覆蓋全部欄位。

## 已知未完成
- GA、動畫、拖曳、產生器：S2–S4。
- 多時窗需求（單需求多段允許區間）不在規格內。
