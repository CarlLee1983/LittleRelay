# 查證 LINE Login 的身分驗證與帳號邊界

Type: research
Label: wayfinder:research
Status: resolved

## Question

以 LINE 官方文件查證登入流程、可穩定識別顧客的 ID、provider/channel 邊界、token 驗證、安全措施及管理員核准流程的技術前提。說明哪些資訊首次登入前無法可靠取得，以及複製新商店時哪些設定必須獨立建立；附來源，不代替店主決定操作流程。

## Answer

查證與直接來源見 [LINE Login 身分與部署事實](../research/line-login.md)。穩定鍵是 provider 範圍內的 LINE user ID；首次登入並同意前，無法從 LINE Login 可靠取得該顧客的 ID，故商店的允許名單須在驗證後對應身分。網頁登入須驗證 `state`、安全換取 token，並在後端驗證 ID token（含預期 channel／nonce）或 access token；LINE 亦建議 PKCE。Developing channel 僅供指定測試角色登入，正式使用需 Published。複製新店若建獨立 channel，須自行設定 callback、channel ID／secret、發布狀態與所需權限；provider 選擇會影響 user ID 是否可跨 channel 對應。使用者撤銷授權會使 token 失效，但不改變同 provider 的 user ID。這些事實不決定店主的核准介面或操作流程。
