# LittleRelay

可複製的二手童衣商店起點。目前提供空白公開頁與測試環境的待核准 LINE 登入流程；正式登入、店主入口、商品與訂單功能尚未啟用。

## 本機開始

需要 Node.js 22.12 以上。

```sh
npm ci
npm run check
```

`npm test` 會以合成設定產生兩個 Worker 的測試／正式設定，啟動本機 Workers runtime，套用 D1 遷移，驗證空白資料庫、主機拒絕、店主拒絕、LINE 回呼的成功與失敗路徑，以及正式寫入關閉。`npm run lint` 檢查程式格式，`npm run typecheck` 檢查 TypeScript。

## 商店設定

複製 `config/store.example.json` 為 `store.local.json`，填入同一 Cloudflare 帳號中的商店 ID、測試與正式主機、各自的 D1 資源 ID、R2 bucket 名稱、LINE provider ID 與 channel ID。`store.local.json` 已排除版控。測試與正式環境的主機、D1、R2 與 LINE channel 識別值必須互不重複；同一 provider 可用於兩個 channel。產生器會拒絕重複的隔離資源。設定檔不存放 LINE secret、Access 憑證或其他秘密。

```sh
npm run config:generate
npm run dev:public
```

產生的 `.generated/public.wrangler.jsonc`、`.generated/owner.wrangler.jsonc` 與初始化 SQL 不進版控。`resources.json` 記錄此階段尚未綁定 Worker 的 R2 名稱與 LINE channel ID，供建立資源時核對。要測試店主 Worker，另執行 `npm run dev:owner`。本機 `wrangler dev` 的入口 URL 與預期 Host 不同，因此直接瀏覽會得到 421；整合測試以預期 Host 發送請求。

## D1 初始化與部署前檢查

每個環境先建立獨立 D1 與 R2 資源，並核對產生設定中的主機、資源 ID、Worker 名稱。套用全部版本化遷移，再執行對應的 `.generated/init-test.sql` 或 `.generated/init-production.sql`。初始化可重跑；如果既有資料庫屬於其他商店或環境，SQL 會失敗。以下是本機測試資料庫的範例：

```sh
npx wrangler d1 migrations apply DB --local --config .generated/public.wrangler.jsonc --env test
npx wrangler d1 execute DB --local --config .generated/public.wrangler.jsonc --env test --file .generated/init-test.sql
npx wrangler d1 execute DB --local --config .generated/public.wrangler.jsonc --env test --command "SELECT store_id, environment FROM deployment_identity"
```

`migrations/0002_line_pending_customer.sql` 只建立個資告知、一次性登入嘗試、顧客與 session 的資料表，不附真實告知文字或顧客資料。商店須先在 D1 發布自己的現行個資告知，才能開始測試登入；已發布告知不可原地修改或刪除，修改須新增版本並切換現行指標。告知不可讀或版本在登入期間改變時，流程會失敗關閉。測試 Worker 的 `LINE_CHANNEL_SECRET` 應以 Wrangler secret 設定，並在 LINE Console 核對 provider、channel 與 `https://<公開測試主機>/auth/line/callback`。登入只保存 LINE ID 與顯示名稱，不保存或顯示頭像、Email、好友清單。本機整合測試使用合成告知與模擬 LINE 回應，不需真實憑證。正式環境的登入及顧客寫入維持 503，直到備份、暫停閘和真實 LINE 連線驗收完成。

部署前可使用 `npx wrangler deploy --dry-run --config .generated/public.wrangler.jsonc --env test` 檢查設定；店主 Worker 與正式環境也須各做一次。公開 Worker 只服務預期 Host；`/api/` 營運寫入尚未啟用，店主 Worker 對所有預期 Host 請求回 403。`workers_dev` 與版本預覽 URL 在兩個環境都設定為關閉。Cloudflare 的正式資源建立、Access 政策、遠端部署與真實主機 smoke test 尚待帳號、網域和 LINE 測試 channel 備妥後驗收。回退應關閉登入路由並使嘗試與 session 失效，保留 D1 遷移和既有顧客紀錄，不還原舊 D1 快照。

Cloudflare 設定與部署行為以 [Wrangler 設定文件](https://developers.cloudflare.com/workers/wrangler/configuration/)、[D1 命令文件](https://developers.cloudflare.com/d1/wrangler-commands/) 與 [Workers Access 文件](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) 為準。

LINE 登入參數、PKCE 與伺服器驗證依 [LINE 網頁登入流程](https://developers.line.biz/en/docs/line-login/integrate-line-login/)、[PKCE 文件](https://developers.line.biz/en/docs/line-login/integrate-pkce/) 和 [LINE Login API](https://developers.line.biz/en/reference/line-login/)。
