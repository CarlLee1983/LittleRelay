# 查證 Cloudflare 與 GitHub 的免費部署和照片儲存條件

Type: research
Label: wayfinder:research
Status: resolved

## Question

以官方文件查證 Cloudflare 靜態資產、Workers、D1、R2，以及 GitHub 儲存庫或圖片來源的免費額度、限制、超額行為和圖片刪除後的生命週期。比較少量單件商品、公開瀏覽、本地上架的適用性，列出會改變架構選擇的事實及來源；不要代替店主選方案。

## Answer

查證筆記：[Cloudflare 與 GitHub：小型二手衣目錄的免費額度查證](../research/cloudflare-github.md)。純靜態 Workers Assets／Pages 請求免費且不限次數；動態 Worker／Pages Function 共用每日 100,000 次免費額度與每次 10 ms CPU 限制。[Workers 資產計費](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)、[Pages Functions 計費](https://developers.cloudflare.com/pages/functions/pricing/)、[Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)

本機可直接部署 Pages，但 Direct Upload 專案不能原地改為 Git 整合。R2 免費量為每月 10 GB-month、100 萬次 A 類及 1,000 萬次 B 類操作，超額計費且須先完成 R2 訂閱；D1 免費量用完後查詢會失敗。Git 中刪除照片不會刪掉歷史版本，這是圖片儲存路徑的關鍵差異。[Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)、[R2 計費](https://developers.cloudflare.com/r2/pricing/)、[R2 開始使用](https://developers.cloudflare.com/r2/get-started/)、[D1 計費](https://developers.cloudflare.com/d1/platform/pricing/)、[GitHub 刪檔](https://docs.github.com/en/repositories/working-with-files/managing-files/deleting-files-in-a-repository)
