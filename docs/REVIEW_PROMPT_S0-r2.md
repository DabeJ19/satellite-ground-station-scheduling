# Codex 複審 Prompt — S0 draft 2

複審 S0。被審 commit `0e819b9`。只新增 `docs/reviews/S0-codex-r2.md`，不改其他檔。

讀：`docs/reviews/S0-response.md` → `SPEC.md`（draft 2）→ `DECISIONS.md` 末段 → `AGENTS.md` 規則 7–10。

1. 你的 14 項（B1–B4、S1–S7、開放問題 1–3）逐項一行：已落實／部分（缺什麼）／未落實／偏離（可否接受），標章節。
2. draft 2 新文字有無矛盾或新問題；§1.3 兩組 fixture 數字請獨立手算驗證（含不可行 fixture 是否恰好 4 條、無多報）。
3. §8 S1 驗收是否可客觀判定；缺的輸入／預期值直接補文字。

結論只能是「通過，可開 S1」或「退回（列必修）」。格式依 AGENTS.md，最前面放 14 項核對表。GitHub 環境請開分支 `review/S0-r2` + PR；本機直接寫檔。終端摘要：結論、未落實數、新阻擋數、建議數。
