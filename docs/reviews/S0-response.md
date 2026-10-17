# Response to Review S0 — Claude Code（工程方）

日期：2026-10-17　被審 commit：`1f921a6`　修訂後：SPEC.md S0 draft 2

## 總結
審查結論「有條件通過」接受。4 項阻擋全部採納並已寫入 SPEC；7 項建議全部採納（S4 的 AST/bundler adapter 延後至 vendor 升級時）；3 個開放問題依審查建議結案。

## 阻擋項
| # | 處置 | 落點 |
|---|---|---|
| B1 上界證明錯誤（R4/R6 可共存） | **採納，工程方原證明有誤**。改用 R2/R4 互斥證明；加權最佳解改記 (5, 11) | SPEC §1.3 |
| B2 earliest_r 未定義 | 採納：`earliest_r := requests[r].start`，未排貢獻 0，字典序比較，整數重算 | SPEC §1.1 |
| B3 合法域未封閉 | 採納：新增 `validateData()`、`normalize()`、結構錯誤碼、nullish 校準、visibility 合併、`end==window.end` 合法、校準可跨 H | SPEC §2.1、§3 |
| B4 LP 上界有效性 | 採納：只有 LP `GLP_OPT` 才給 U；gap 定義與標示；共用時間預算；狀態文字 | SPEC §4.2 |

## 建議項
| # | 處置 | 落點 |
|---|---|---|
| S1 fixtures | 採納：greedy fixture (Z=4, W=5) 與不可行 fixture（4 條違規、去重）寫入 SPEC；PPT 頁碼 14–18 | SPEC §1.3、§8 S1 |
| S2 解碼／修復／比較 | 採納全部文字 | SPEC §3、§5.1、§6 |
| S3 worker／state／離線驗收 | 採納：`globalThis.SGS`、worker 內嵌 engine、revision/runId、localStorage 降級、S4 驗收清單 | SPEC §2、§3、§5.3、§7、§8 |
| S4 build 強化 | 採納 SHA-256、標記恰好一次、JSON 轉義、`</script>` 檢查；AST/bundler adapter 延後至升級 vendor 時 | SPEC §7 |
| S5 協作規則 | 採納，寫入 AGENTS.md | AGENTS.md |
| S6 多次 run 統計 | 採納全部文字 | SPEC §5.2、§5.3、§8 S2 |
| S7 授權交付 | 採納：單檔內保留 GPL 聲明；README 區分授權 | SPEC §7、README |

## 開放問題
1. 逐分鐘列保留，記錄規模指標，事件點法僅在實測有收益時採用。
2. 擬合殘差接受；ω=360/H、圓周角距離。
3. λ 預設 |R|+1。

## 未採納
無。

## 補充說明
- 審查方指出其未執行 build／瀏覽器測試；工程方的 file:// 煙霧測試結果仍為自測。S4 驗收將附完整環境紀錄。
- GitHub `403 Resource not accessible by integration`：審查方的 GitHub 整合無寫入權限，本輪以本機檔案交付，由工程方提交至 `docs/reviews/S0-codex.md`。
