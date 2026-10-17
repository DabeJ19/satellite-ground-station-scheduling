# Codex 複審 Prompt — S0 draft 3

複審 S0 draft 3。被審 commit `fd43e60`（本 prompt 檔之後的提交不在審查範圍）。只新增 `docs/reviews/S0-codex-r3.md`，不改其他檔。

讀：`docs/reviews/S0-response.md` 第二段（r2 回應）→ `SPEC.md` 的 §1.1、§4.2 第 6 點、§5.1、§5.3、§8（含 8.1–8.4）→ `DECISIONS.md` 末段 → `tools/enumerate.py`。

1. N1–N3、C1–C2 逐項一行：已落實／部分（缺什麼）／偏離（可否接受）。
2. §5.1 新證明 `fitness ≤ −(n+1)/(nH+1)` 是否正確；§8.1 九個測例與 §8.2 兩組數值（1194/241、959/241）是否與你的手算一致；§8.4 的 (5,14) 可獨立核對。
3. 判定：**「通過，可開 S1」或「退回（列必修）」**。若通過但有建議，標示可於哪個 sprint 處理。

格式依 AGENTS.md，最前面放 5 項核對表。GitHub 環境請開分支 `review/S0-r3` + PR；本機直接寫檔。終端摘要：結論、未落實數、新阻擋數、建議數。
