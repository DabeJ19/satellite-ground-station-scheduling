# Review S4 — Codex

## 結論：退回（列必修）

被審 commit：`e6eec1c04ae27310ee20559b108d15c6620d7bc3`（`e6eec1c`）。**阻擋數 4、建議數 1**。只新增本報告，不改既有檔案。

已讀指定送審包、SPEC draft 6、UI／anim／build、測試、驗收紀錄及 README 授權段，另核對 AGENTS.md、DECISIONS.md。透過 GitHub connector 固定讀取 SHA；main 當時僅多新增 `docs/REVIEW_PROMPT_S4.md` 的提交，該提交不在範圍。工作目錄不是 git checkout，以遠端 commit／compare 核對代替 git fetch，未覆蓋工程工作目錄。不審 dist／vendor 原始碼；建置依賴只按原始位元組準備於獨立暫存副本。

| 審查重點 | 明確結論 |
| --- | --- |
| 工作區判別／無效輸入 | **未完整符合**。主 data 無效會在提交前拒絕；但 format／version／settings 的檢查不足，壞設定會先改狀態再拋錯，見 B2。 |
| 壞解槽略過／boot 共用 | **部分落實**。data 無效的解槽能略過並提示；schedule 陣列內的壞元素未略過，匯入及 boot 均可崩潰，見 B1。 |
| 工作區參數還原 | **部分落實**。有完整 GA 設定的正常路徑可還原；空設定未重設控制項，下一次執行仍使用前一工作區數值，見 B3。 |
| 單檔授權（SPEC §7） | **指定資訊已具備**。`src/index.html` 有 glpk.js 5.0.0、Jan Vaillant 版權、GPL-3.0、上游來源、SHA、export 轉換說明；build 將 LICENSE 全文 HTML 轉義後內嵌。README 區分自有 MIT 與內嵌 GPL，明說交付物不是純 MIT。 |
| 九種下載／斷網／Storage 拋錯 | **主要正常路徑覆蓋足夠，壞檔邊界不足**。browser.s4 檢查九個下載、JSON 結構、CSV 表頭／列數、PNG 檔頭；offline context 驗證 file:、smoke、worker、零外部請求；第二個 context 模擬 Storage 方法全部拋錯。B1–B4 的反例尚未覆蓋。 |
| A1 無效 H 停用拖曳 | **部分落實**。band／color 已重畫；無效 H 阻止新拖曳，但既有拖曳仍能繼續改值，見 B4。 |
| A2 多衛星畫布容量 | **已落實核心要求**。`need=2·(12+8n+24)` 配合放大畫布與可捲動容器，可保留間距及外圈留白；60／100星及窄尺寸核對通過。 |
| 驗收紀錄 | **主要欄位齊備**。日期、Chromium 版本、file:、斷網、smoke z/status、GA、外部請求、下載、主題、Storage、A1/A2 都有記錄；來源版本／產物雜湊可補強，見 C1。未另測 Chrome／Edge 的限制已有揭露。 |

執行結果：`npm test` **78 通過、0 失敗**（engine 39、GA 19、anim 15、build 5）；`node build.js` 成功，約 **416 KB**。`node tests/browser.s4.js` 因缺少 Chromium `chromium_headless_shell-1234`，在啟動階段失敗，**11 個瀏覽器步驟未執行**；工程方 Chromium 自測紀錄不冒充本環境實跑結果。

下列反例以 Node VM 載入被審原始模組及 UI，使用 DOM／canvas stub，實際呼叫匯入／boot／表格事件／pointer handler；控制項 value setter 模擬 DOM 字串轉換。另確認 Storage 全拋錯時可啟動、提交 r2、建立手動槽、匯出工作區，`saveLS()` 回傳 false。這些不是 Chromium 像素或下載驗收。

## 阻擋項（必修）

以下 `D` 均指完整 `src/data/default.json` 的獨立深複本；各 fixture 不累積修改。

### B1 — 壞 schedule 未略過，能讓匯入及 boot 拋錯

對應：**SPEC §2 持久化／壞解槽略過、§6、§8 S4**。位置：`restoreWorkspace()` 第179–184行、`makeSlot()`，以及後續 `drawGantt()`／`contactState()`。

完整組裝輸入：

```js
const w = {
  format: 'sgs-workspace', version: 1, data: D, revision: 99,
  slots: { milp: { data: D, revision: 99, schedule: [null] } },
  activeSlot: 'milp'
};
```

實測 `importJSONText(JSON.stringify(w))` 拋出 `Cannot read properties of null (reading 'req')`，revision 已變99、壞 MILP 槽已寫入。`makeSlot()` 的共用 checker 雖能回報 schema 違規，restore 仍把此槽視為成功；之後繪圖解參照 null。將同一檔放進 `sgs.state.v1`，boot 共用還原也拋錯，無法正常完成啟動。未知 req 的排程也被接受為不可行槽，而非列入 skipped。

可直接採用的修改文字：

> 還原解槽先在區域變數驗證 data、schedule 元素與引用，再建立槽。以共用 checker 的 schema／duplicate-request 結果辨識結構不合法者，逐槽略過並提示；僅接受 manual／milp／ga 三個自有鍵，不用 `k in slots` 接受原型鏈鍵。保留結構合法但有資源／時窗衝突的手動排程，仍可標紅播放。繪圖另加 null／元素型別防護，boot 遇到壞槽必須能完成還原其他有效資料。

補測輸入＋預期：上述 `[null]`、`[7]`、未知 req／antenna、非整數 start 分別匯入及 boot；主資料還原成功，milp=null、skipped 含 milp、顯示提示，沒有 pageerror。另一個有效槽必須保留。另以結構合法但兩任務重疊的 manual 槽驗證不可被一律丟棄。

### B2 — 設定／工作區外層未先驗證，失敗發生於提交之後

對應：**SPEC §2 工作區 JSON 判別與還原、§6、§8 S4**。位置：`isWorkspace()` 第163行、`restoreWorkspace()` 第169–176行、`writeGaParams()`。

輸入：`{format:'sgs-workspace',version:1,data:D,revision:99,slots:{},settings:{ga:'oops'}}`。可將 D.meta.name 設為 `should not commit`，便於觀察是否已寫入。

實測先提交新 data／revision99，再拋出 `Cannot use 'in' operator to search for 'encoding' in oops`。改成 `settings:{ga:{seed:{toString:null}}}` 則在控制項字串轉換時拋錯，狀態一樣已改；放入 localStorage 也使 boot 失敗。這不是「拒絕且不動現有狀態」。

判別亦與 draft 6 有差異：帶 `format:'other'` 或 `format:null` 的完整資料 D 被當純資料接受並建立新版，然而 SPEC 明定「有 format 視為工作區」。`format:'sgs-workspace',version:999` 則無檢查即還原。另有 `{data:D,slots:{},requests:null}`：requests 欄位明明存在，仍因 `!obj.requests` 被視為工作區並提交，而不是依「無 requests」的判別規則走資料驗證後拒絕。

可直接採用的修改文字：

> 用是否具有 format 自有欄位判別帶標記工作區，並驗證支援的 format／version；無標記相容路徑須有 data、slots 且沒有 requests 自有欄位，不以 truthiness 判斷欄位存在。data、外層集合與 settings 先在區域變數完整驗證／正規化：設定只取白名單鍵，ga 必須為非陣列物件、欄位型別及合成後參數須符合既有驗證契約。失敗回傳路徑錯誤，不先 commit、取消執行或改動資料／設定／解槽／持久化。通過後才一次套用；boot 不得被壞設定中斷。

補測：上述字串 ga、物件 seed、陣列 settings、未知 format／version；匯入不得拋錯，回 ok=false，資料、draft、revision、settings、槽、播放與現有 worker 皆不變。boot 需受控拒絕並可用預設資料啟動／提示。再測目前版標記工作區及無標記舊儲存格式仍能還原。

### B3 — 空 GA 設定還原後，控制項及下一次執行仍使用舊值

對應：**SPEC §2「資料＋參數＋三解槽」、§6 工作區匯出／匯入、§8 S4**。位置：`restoreWorkspace()` 的設定合併與條件式 `writeGaParams()`。

可重現步驟：

1. 新啟動，深複製 `exportWorkspace()` 為 W；其 settings 為 `{tmlim:30,ga:{}}`，畫面 popSize=50、seed=42。
2. 在另一組設定將控制項改成 popSize=99、seed=123（例如執行該組設定後再匯回 W）。
3. `importJSONText(JSON.stringify(W))` 回傳 ok=true。

實測 `state.settings.ga` 已是 `{}`，但畫面仍為99／123，`readGaParams()` 也回99／123；下一次 run 用的不是 W 所代表的預設值。現有 round trip 只比 settings 物件，沒有核對控制項及實際執行參數。

可直接採用的修改文字：

> 每次還原都從固定預設設定建立完整參數，再套用工作區提供的白名單值；不要與前一工作區設定混合。ga={} 或缺省代表預設值，也必須完整回填所有 GA 控制項，包含 auto λ 的空白狀態。畫面、保存的設定及下一次執行的參數須一致，不得因物件沒有鍵而跳過回填。

補測：深複製新工作區 W，執行99／123的設定，再匯回 W；畫面及 `readGaParams()` 須恢復50／42，λ留空；實際啟動 worker 的參數亦符合預設。另測部分舊版設定以固定預設補齊，不繼承上一工作區；匯入與 boot 結果一致。

### B4 — H 於拖曳途中變無效，既有拖曳仍可寫入

對應：**SPEC §6「H 不是正整數時停用拖曳」、§8 S4／A1**。位置：`initWinEditor()` 第963–975行。

實測事件序列：預設 D，在 visibility[0] 的 end=12 上 pointerdown；對 H 輸入欄送 input、值清空；此時 `validH=false`、disabled 樣式及提示均已顯示；再 pointermove 至15並 pointerup。結果該 draft.end 仍由 **12 變15**。目前只擋新的 pointerdown，已有的區域變數 drag 沒有作廢，pointermove 也未檢查 validH。

可直接採用的修改文字：

> 時窗編輯器發現 H 無效時立即清除既有 drag；pointermove 寫入前再次檢查 validH，不合法即取消且不改 draft。修正 H 後必須由新 pointerdown 開始，不沿用失效前的拖曳。提示及 disabled 樣式維持現有行為。

補測：先開始拖曳，再把 H 分別設為空字串、0、1.5；後續 move／up 都不能改任何時窗。恢復 H80後直接 move 仍不修改，重新 pointerdown 才可把12改16。保留現有「H先無效才嘗試開始拖曳」測例，兩種順序都須通過。

## 建議項（可延後）

### C1 — 驗收紀錄補上交付物辨識與實際瀏覽器渠道

對應：**SPEC §7 瀏覽器／單檔交付、§8 S4 離線驗收紀錄**。現有紀錄主要欄位完整，也明確揭露只跑 Playwright Chromium，沒有虛報 Edge。建議讓後續驗收能對應到確切檔案，而不只靠日期與約416KB。

可直接採用的文件文字：

> 被測來源 commit／source tree：……；交付 HTML SHA-256：……；作業系統：……；瀏覽器產品／渠道及版本：……。Playwright Chromium 與實際 Chrome／Edge 分列，未測者標「未測」。保留本次原始驗收 JSON 或可追溯的 CI artifact，避免重跑覆寫後只剩人工整理摘要。

可於收尾文件整理時補齊，非本輪阻擋。後續若執行 Chrome／Edge，相同11步結果應另存紀錄，不覆蓋 Chromium 的歷史紀錄。

## 針對 SPEC 開放問題的意見

不推翻兩種 JSON、排程取選中槽、GPL 授權區或可捲動畫布等既有決策。A2 的 `fitSize` 實測在1／3／20／60／100星、窄及寬尺寸均能使 layout 外圈＋24px落在畫布內；有空間時保留原寬高，僅高度不足時可能形成長方形而非正方形，屬可接受的容量實作差異。A1 主要行為已補，但仍需 B4 的拖曳途中防護。B1–B4 修正並補足實際 UI／boot 測例後，再判定專案收尾。
