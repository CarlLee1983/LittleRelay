# 小衣接力：可複製的二手童衣商店架構

Label: wayfinder:map

## Destination

形成可交付實作的架構與操作規格：任何家庭可下載範本，在 AI agent 引導下改成自己的品牌、頁面與品牌圖片，獨立部署同一套二手童衣商店功能；商品公開展示，僅讓經 LINE 登入並由店家核准的顧客購買，且在 Cloudflare 服務上盡量節省免費額度。

## Notes

- 首店販售自家孩子的單件二手衣；每間商店有獨立部署、資料與帳號設定。
- 第一版網站建立訂單，由店家人工確認付款與寄送；不上線金流。
- 本地整理照片與商品資料並發布；妻子在後台處理顧客核准、訂單、售出與下架。
- 複製者應能透過專案附帶的同名 Codex／Claude Code skill 與共用指引，修改品牌與頁面、重新生成品牌圖片，並驗證商店功能仍正確。
- 此地圖只解決實作前的決策。處理 `grilling` 票時使用 grilling 與 domain-modeling；研究票依官方資料查證並附來源。
- 為交付已約定的規格，此地圖包含最後一張彙整任務票；它只整理已決定事項與驗收案例，不進入程式實作。
- Issue tracker 採本地 Markdown：子票在 `issues/`；`Blocked by:` 指向必須先解決的票號。每次只處理一張非研究票。

## Decisions so far

- [定義商品與訂單的生命週期](issues/01-order-lifecycle.md)：送單才整單保留，待付款有可設定期限；付款回報暫停到期，收款、逾期與退款各有明確轉換。
- [查證 Cloudflare 與 GitHub 的免費部署和照片儲存條件](issues/02-cloudflare-github-facts.md)：靜態讀取可避開動態請求額度；Git 刪檔仍留歷史，D1 與 R2 各有額度邊界。
- [查證 LINE Login 的身分驗證與帳號邊界](issues/03-line-login-facts.md)：顧客 ID 須由驗證後的 LINE 登入取得，provider 與 channel 設定影響各店身分邊界。
- [定義顧客核准與管理員權限](issues/04-buyer-approval.md)：待核准顧客以綁定 LINE 身分的一次性邀請碼取得購買資格；Access 店主與 LINE 管理員權限分離，撤銷不取消既有訂單。
- [選定商品資料與照片的儲存邊界](issues/05-data-image-boundary.md)：每店 D1 掌握已發布資料和庫存；網站介面走靜態資產，商品照用 R2 分公開與私有留存，結單後定期清理。
- [定義本地上架、替換照片與下架工作流](issues/06-local-publishing.md)：一張手機實拍建立草稿，經人工預覽後逐件發布；AI 展示照需忠於實拍，後台區分暫停與永久撤下。
- [定義單件商品的結帳一致性與失敗處理](issues/07-checkout-consistency.md)：D1 整單交易防超賣並固定訂單快照；重送查原結果，付款回報與到期以資料庫時刻判定。
- [定義人工付款與寄送規則](issues/10-manual-payment-shipping.md)：首店以 TWD 人工轉帳、超商寄送或面交；訂單固定應付金額，入帳逐筆核對，退款和售後保留原訂單紀錄。
- [定義顧客與配送資料的生命週期](issues/09-customer-data.md)：只收必要身分與交付資料；訂單紀錄、收件資料及備份各按明確期限清理，還原不得復活已刪資料或權限。
- [定義每店品牌、頁面與生成圖片的修改邊界](issues/13-brand-customization-boundary.md)：本機品牌包與指定前端區域可客製；營運設定與交易規則分離，素材須有權利及來源紀錄，品牌回退不回滾訂單。
- [定義邀請碼兌換與資格撤銷的一致性](issues/15-invite-redemption.md)：每人同時一組、綁定 LINE 身分的邀請碼；核發、兌換、作廢與資格變更按 D1 原子先後判定，舊碼不能恢復停權。
- [定義後台待辦與管理動作](issues/12-admin-workflow.md)：共用待辦按金流風險與時效排序，逐筆核對收退款、寄送與顧客資格；高影響動作確認，店主專屬全店設定。
- [定義獨立商店的複製部署與營運邊界](issues/08-repeatable-deployment.md)：每店獨立帳號與雙 Worker，測試環境隔離；手動發布、帳號外備份及逾期停寫，資料無法證明完整時維持停賣。
- [定義 AI agent 客製化指引與驗證流程](issues/14-agent-customization-workflow.md)：Codex 與 Claude Code 由同名 skill 共讀一份指引，按初始設定、品牌及單件商品照分支；店主人工發布，兩種 agent 在乾淨範本驗收。
- [彙整可實作架構與操作規格](issues/11-spec-handoff.md)：將已決定事項整理為根目錄的 [實作交接規格](../../IMPLEMENTATION_SPEC.md)，附跨流程驗收案例；尚無需新增決策票。

## Not yet specified

目前沒有無法具體提問的已知範圍；後續票據若揭露新問題，再記錄於此。

## Ready for agent

- [建立第一階段商店基礎與身分權限](issues/16-stage-one-foundation.md)：從已完成的交接規格開始實作每店隔離、D1 遷移、LINE／Access 身分及可驗證的權限交易邊界。

## Out of scope

- 此地圖的規劃階段不建站、不部署，也不整合線上金流；第一階段實作另由 ready-for-agent 票據承接。
- 不建立多店共用的單一平台；每店獨立部署。
