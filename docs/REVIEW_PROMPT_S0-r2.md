# Codex 複審 Prompt — S0 draft 2

（兩種用法擇一：A. 在 ChatGPT / Codex 連接 GitHub repo `DabeJ19/satellite-ground-station-scheduling`（branch `main`）後整段貼上；B. 在本機專案根目錄啟動 Codex CLI 後整段貼上）

---

你是本專案的審查方（reviewer）。你上一輪審查（`docs/reviews/S0-codex.md`，被審 commit `1f921a6`）給出「有條件通過：阻擋 4、建議 7」。工程方已依你的意見修訂規格，本輪是**複審**：確認每一項是否被正確落實，以及修訂有沒有引入新問題。被審 commit：`0e819b9351abe2de33d22323e3091b2900d76689`。**不要修改任何既有檔案**，只能新增 `docs/reviews/S0-codex-r2.md`。

請依序閱讀：
1. `AGENTS.md`（注意新增的規則 7–10）
2. `docs/reviews/S0-codex.md`（你上一輪的報告）
3. `docs/reviews/S0-response.md`（工程方逐項回應）
4. `SPEC.md`（draft 2，主要審查對象）
5. `DECISIONS.md` 末段「S0 審查後修訂」
6. `README.md` 授權段

複審重點：

A. **逐項核對落實**：對 B1–B4、S1–S7、開放問題 1–3 共 14 項，各給一行結論：「已落實 / 部分落實（缺什麼）/ 未落實 / 落實方式偏離你的建議（是否可接受）」，並標 SPEC 章節。

B. **新引入的問題**：draft 2 新增的文字是否自相矛盾或與 DECISIONS.md 衝突？特別看：
   - §1.1 字典序比較與加權目標的等價敘述；
   - §1.3 的貪婪 fixture (Z=4, W=5) 與不可行 fixture（4 條違規）——請獨立手算驗證這兩組數字，不可行 fixture 的 R2 起始 3、R4 起始 8 是否確實只產生那 4 條違規、沒有多報；
   - §2.1 驗證契約與 §3 `checkFeasible` 錯誤碼是否有重疊或缺口（例如：超界時間算 `'window'` 還是 `'schema'`？）；
   - §4.2 的時間預算在 MILP 與 LP 之間如何分配未寫死——是否需要明定（例如 LP 至少保留 20%）？
   - §5.1 λ = |R|+1 的保證前提（§2.1 已封閉合法域）是否在 spec 中完整；
   - §7 build 的 JSON 轉義清單是否足夠（`<`、`>`、`&`、U+2028/2029）。

C. **S1 可開工判定**：S1 的驗收條件（§8）是否可被客觀判定？缺少的測試輸入或預期輸出請直接補文字。

輸出：將複審結果寫入 `docs/reviews/S0-codex-r2.md`，格式依 `AGENTS.md`「審查回覆格式」，另在最前面加一張 14 項落實核對表。結論只能是「通過，可開 S1」或「退回（列出必修）」；若通過但仍有建議，列在建議項並標示可於哪個 sprint 處理。若你在 GitHub 環境工作，請建立分支 `review/S0-r2` 並開 Pull Request 到 `main`；若在本機，直接寫檔即可。最後在終端摘要：結論、未落實項數、新阻擋項數、建議項數。
