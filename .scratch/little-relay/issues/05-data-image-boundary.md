# 選定商品資料與照片的儲存邊界

Type: grilling
Label: wayfinder:grilling
Status: resolved
Blocked by: 01, 02

## Question

在免費額度與可複製部署的限制下，商品內容、可售狀態、訂單和處理後照片各存在哪裡？比較 Git 追蹤照片、Cloudflare 靜態資產與物件儲存，並決定哪個系統是庫存的唯一真實來源。候選資料方案必須支援同一件商品的原子化售出或保留，以及購物車多件商品的全成或全敗結帳；此票先確認儲存能力，具體競爭與重試規則由「定義單件商品的結帳一致性與失敗處理」驗證。也決定售出後照片與資料如何保留或清除。

## Comments

- 店家接受啟用 R2 訂閱及超額收費可能性，會設定用量警示；商品說明、價格與照片只在本機編輯後發布。
- 收款後要把商品及公開照片盡快撤下，私有訂單照留給管理端；舊公開網址需盡快失效，但接受清理的短暫延遲和失敗重試。
- 訂單保留送單時的名稱、價格與照片版本；本機重新發布不得重設保留或售出狀態。各種訂單結束後 30 天清除其私有照片。
- 店家確認下述整體儲存方案，包括 D1 無法讀取時暫停結帳。

## Answer

### 線上資料與讀取

- 每間商店使用自己的 Cloudflare D1，作為**已發布商品內容、公開／保留／售出狀態、訂單與明細、身分與授權紀錄，以及送單需核對的交付政策、運費與付款指示版本**的唯一線上真實來源。本機商品資料是編輯和發布輸入，不能直接覆蓋線上庫存狀態；管理員依訂單流程及後台操作變更保留、售出、下架與重新上架狀態。後台不直接編輯商品說明、價格或照片。
- 網站介面與品牌靜態素材由 Workers Static Assets 提供；公開商品資料與即時可售狀態由窄範圍 Worker API 讀取 D1。靜態資產請求免費且不限次數，執行 Worker 程式的請求則計入 Workers 額度。[Cloudflare 靜態資產計費](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- D1 暫時不可用或免費額度耗盡時，商品資料顯示暫不可用並停止結帳，不以舊快取當成可售依據。D1 免費額度與超額失敗條件見[Cloudflare D1 計費](https://developers.cloudflare.com/d1/platform/pricing/)。
- D1 的 `batch()` 可在單次資料庫交易中執行多個陳述式，失敗時回滾，具備單件保留及整單全成或全敗的儲存能力。條件更新影響零列本身不會讓交易失敗；如何建立資料庫不變條件、處理競爭與重試，由[結帳一致性決策](07-checkout-consistency.md)定義與驗證。[Cloudflare D1 batch 文件](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)

### 商品照片

- 原始照片由店家在本機處理；只發布處理後的商品照到 R2，Git 儲存庫只追蹤程式、範本與非商品素材。Git 刪除檔案仍留下歷史；Workers Static Assets／Pages 的照片變更需重新部署，舊部署或快取也可能留存影像。因此選擇可獨立上傳、刪除物件的 R2。本機原圖備份方式由[本地上架工作流](06-local-publishing.md)決定。[GitHub 刪檔說明](https://docs.github.com/en/repositories/working-with-files/managing-files/deleting-files-in-a-repository)、[Cloudflare 靜態資產](https://developers.cloudflare.com/workers/static-assets/)、[Cloudflare R2 一致性](https://developers.cloudflare.com/r2/reference/consistency/)
- 商品照包含主實拍、可選的細節照及 AI 展示照；它們分成可公開存取與僅授權管理端讀取的 R2 儲存區。實作時用獨立公開與私有 bucket，避免私有訂單照經由公開 bucket 的網址洩露。每次發布的照片組合版本保持不可變；每張成功成立的訂單各有自己的整組私有照片副本及送單時的名稱、價格快照，後續本機修改不改寫舊訂單。私有照片以通過授權檢查的路徑讀取。[Cloudflare R2 公開 bucket](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- 成單前須先備妥並驗證該訂單的全部私有照片副本；任一副本失敗，不建立訂單。D1 成單交易若失敗，清理由此產生但未被訂單引用的副本；若回應逾時或程序中斷而無法確定交易結果，須先查 D1 是否已有訂單引用，再清理副本，不可誤刪已成單照片。交易還須驗證準備副本所依據的照片版本未被更換，確保 D1 快照與副本一致；具體競爭與孤兒副本掃除規則由[結帳一致性決策](07-checkout-consistency.md)定義。公開照片刪除前，也要確認已成立訂單的私有副本可用。
- 確認收款時 D1 先準確標示售出並從公開列表移除，再刪除該商品的公開照片物件並清除相應快取。D1 與 R2 沒有共同交易；照片清理失敗要留下待辦、通知管理員並重試，不能倒退已確認的收款狀態。已下載到他處的副本無法收回；若快取未清，即使 R2 已刪除，舊公開網址仍可能暫時可用。[Cloudflare R2 一致性與快取](https://developers.cloudflare.com/r2/reference/consistency/)
- 訂單進入已完成、已取消或已逾期後 30 天，刪除該訂單專屬的私有照片副本；若有進行中的售後案件，依[人工付款與寄送規則](10-manual-payment-shipping.md)暫緩，結案後 30 天再清除。其他訂單的副本與仍用於在售商品的公開照片不受影響。已售商品與訂單的文字紀錄留在 D1 供查單與稽核，其最終保留期限、個資與備份刪除由[顧客與配送資料生命週期](09-customer-data.md)決定。

### 成本與後續邊界

- R2 Standard 有免費用量，但啟用需完成訂閱結帳，超額可能收費；每店設定用量警示。品牌圖片與網站程式可隨靜態部署，商品照片不入 Git。[Cloudflare R2 開始使用](https://developers.cloudflare.com/r2/get-started/)、[R2 計費](https://developers.cloudflare.com/r2/pricing/)
- 上傳順序、照片替換、公開網址清理和可重跑的失敗補償，交由[本地上架、替換照片與下架工作流](06-local-publishing.md)規定。R2 照片與 D1 商品紀錄沒有原子發布能力，流程必須處理尚未被引用的上傳物件。每店部署、用量警示與營運備份交由[獨立商店的複製部署與營運邊界](08-repeatable-deployment.md)規定。
