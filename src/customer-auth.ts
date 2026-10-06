export interface CustomerAuthEnv {
  DB: D1Database;
  DEPLOYMENT_ENV: "test" | "production";
  EXPECTED_HOST: string;
  STORE_ID: string;
  LINE_PROVIDER_ID: string;
  LINE_CHANNEL_ID: string;
  LINE_CHANNEL_SECRET?: string;
}

interface Notice {
  version: number;
  body: string;
}

interface Attempt {
  nonce: string;
  code_verifier: string;
  notice_version: number;
}

const oauthCookie = "__Host-lr_oauth";
const sessionCookie = "__Host-lr_session";
const commonHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function randomValue(bytes = 32): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function hash(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return btoa(String.fromCharCode(...digest))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function cookie(request: Request, name: string): string | null {
  const pair = request.headers
    .get("Cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  const value = pair?.slice(name.length + 1);
  return value && /^[A-Za-z0-9_-]{20,100}$/.test(value) ? value : null;
}

function setCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const escapes: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return escapes[character];
  });
}

function page(
  title: string,
  body: string,
  status = 200,
  extraHeaders?: HeadersInit,
): Response {
  return new Response(
    `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><main><h1>${escapeHtml(title)}</h1>${body}</main></html>`,
    {
      status,
      headers: {
        ...commonHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; form-action 'self'; base-uri 'none'",
        ...extraHeaders,
      },
    },
  );
}

function failure(status = 400): Response {
  return page(
    "登入未完成",
    '<p>請回到個資告知頁重新開始。</p><p><a href="/privacy">返回告知</a></p>',
    status,
    {
      "Set-Cookie": setCookie(oauthCookie, "", 0),
    },
  );
}

async function identityMatches(env: CustomerAuthEnv): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT store_id, environment FROM deployment_identity WHERE singleton = 1",
  ).first<{ store_id: string; environment: string }>();
  return (
    row?.store_id === env.STORE_ID && row.environment === env.DEPLOYMENT_ENV
  );
}

async function currentNotice(env: CustomerAuthEnv): Promise<Notice | null> {
  if (!(await identityMatches(env))) return null;
  return env.DB.prepare(
    "SELECT n.version, n.body FROM privacy_current AS c JOIN privacy_notices AS n ON n.version = c.version WHERE c.singleton = 1",
  ).first<Notice>();
}

async function privacyPage(env: CustomerAuthEnv): Promise<Response> {
  try {
    const notice = await currentNotice(env);
    if (!notice) return page("告知暫不可用", "<p>目前無法開始登入。</p>", 503);
    const action =
      env.DEPLOYMENT_ENV === "production"
        ? "<p>登入尚未開放。</p>"
        : `<form method="post" action="/auth/line/start"><input type="hidden" name="noticeVersion" value="${notice.version}"><button type="submit">閱讀後以 LINE 登入</button></form>`;
    const body = `<pre>${escapeHtml(notice.body)}</pre>${action}`;
    return page("個人資料告知", body);
  } catch {
    return page("告知暫不可用", "<p>目前無法開始登入。</p>", 503);
  }
}

async function start(
  request: Request,
  env: CustomerAuthEnv,
): Promise<Response> {
  if (!env.LINE_CHANNEL_SECRET || !env.LINE_CHANNEL_ID || !env.LINE_PROVIDER_ID)
    return failure(503);
  if (Number(request.headers.get("Content-Length") ?? 0) > 1024)
    return failure(413);
  if (
    request.headers.get("Content-Type")?.split(";")[0] !==
    "application/x-www-form-urlencoded"
  )
    return failure(415);
  let version: string | null;
  try {
    const body = await request.text();
    if (body.length > 1024) return failure(413);
    version = new URLSearchParams(body).get("noticeVersion");
  } catch {
    return failure();
  }
  try {
    const notice = await currentNotice(env);
    if (!notice) return failure(503);
    if (version !== String(notice.version)) return failure(409);

    const state = randomValue();
    const browser = randomValue();
    const nonce = randomValue();
    const verifier = randomValue();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("DELETE FROM oauth_attempts WHERE expires_at < ?")
      .bind(now)
      .run();
    await env.DB.prepare("DELETE FROM customer_sessions WHERE expires_at < ?")
      .bind(now)
      .run();
    await env.DB.prepare(
      "INSERT INTO oauth_attempts (state_hash, browser_hash, store_id, environment, provider_id, channel_id, nonce, code_verifier, notice_version, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        await hash(state),
        await hash(browser),
        env.STORE_ID,
        env.DEPLOYMENT_ENV,
        env.LINE_PROVIDER_ID,
        env.LINE_CHANNEL_ID,
        nonce,
        verifier,
        notice.version,
        now + 600,
      )
      .run();

    const authorize = new URL("https://access.line.me/oauth2/v2.1/authorize");
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", env.LINE_CHANNEL_ID);
    authorize.searchParams.set(
      "redirect_uri",
      `https://${env.EXPECTED_HOST}/auth/line/callback`,
    );
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("scope", "profile openid");
    authorize.searchParams.set("nonce", nonce);
    authorize.searchParams.set("code_challenge", await hash(verifier));
    authorize.searchParams.set("code_challenge_method", "S256");
    return new Response(null, {
      status: 303,
      headers: {
        ...commonHeaders,
        Location: authorize.toString(),
        "Set-Cookie": setCookie(oauthCookie, browser, 600),
      },
    });
  } catch {
    return failure(503);
  }
}

async function lineIdentity(
  code: string,
  attempt: Attempt,
  env: CustomerAuthEnv,
): Promise<{ userId: string; displayName: string } | null> {
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: `https://${env.EXPECTED_HOST}/auth/line/callback`,
    client_id: env.LINE_CHANNEL_ID,
    client_secret: env.LINE_CHANNEL_SECRET ?? "",
    code_verifier: attempt.code_verifier,
  });
  const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody,
    signal: AbortSignal.timeout(10000),
  });
  if (!tokenResponse.ok) return null;
  const token = (await tokenResponse.json()) as { id_token?: unknown };
  if (typeof token.id_token !== "string") return null;
  const verifyResponse = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      id_token: token.id_token,
      client_id: env.LINE_CHANNEL_ID,
      nonce: attempt.nonce,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!verifyResponse.ok) return null;
  const verified = (await verifyResponse.json()) as {
    sub?: unknown;
    name?: unknown;
    aud?: unknown;
    iss?: unknown;
    nonce?: unknown;
  };
  if (
    typeof verified.sub !== "string" ||
    !verified.sub ||
    verified.sub.length > 255 ||
    verified.aud !== env.LINE_CHANNEL_ID ||
    verified.iss !== "https://access.line.me" ||
    verified.nonce !== attempt.nonce
  )
    return null;
  return {
    userId: verified.sub,
    displayName:
      typeof verified.name === "string" && verified.name
        ? verified.name.slice(0, 100)
        : "LINE 使用者",
  };
}

async function callback(
  request: Request,
  env: CustomerAuthEnv,
  url: URL,
): Promise<Response> {
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const browser = cookie(request, oauthCookie);
  if (!state || state.length > 100 || !code || code.length > 2048 || !browser)
    return failure();

  try {
    const now = Math.floor(Date.now() / 1000);
    const stateHash = await hash(state);
    const attempt = await env.DB.prepare(
      "UPDATE oauth_attempts SET consumed_at = ? WHERE state_hash = ? AND browser_hash = ? AND store_id = ? AND environment = ? AND provider_id = ? AND channel_id = ? AND expires_at > ? AND consumed_at IS NULL RETURNING nonce, code_verifier, notice_version",
    )
      .bind(
        now,
        stateHash,
        await hash(browser),
        env.STORE_ID,
        env.DEPLOYMENT_ENV,
        env.LINE_PROVIDER_ID,
        env.LINE_CHANNEL_ID,
        now,
      )
      .first<Attempt>();
    if (!attempt) return failure();
    const deleted = await env.DB.prepare(
      "DELETE FROM oauth_attempts WHERE state_hash = ? AND consumed_at = ?",
    )
      .bind(stateHash, now)
      .run();
    if (deleted.meta.changes !== 1) return failure(503);

    const notice = await currentNotice(env);
    if (!notice || notice.version !== attempt.notice_version)
      return failure(409);
    const identity = await lineIdentity(code, attempt, env);
    if (!identity) return failure();

    const session = randomValue();
    const customerId = crypto.randomUUID();
    const applicationNumber = `LR-${randomValue(9)}`;
    const guard =
      "EXISTS (SELECT 1 FROM privacy_current WHERE singleton = 1 AND version = ?) AND EXISTS (SELECT 1 FROM deployment_identity WHERE singleton = 1 AND store_id = ? AND environment = ?)";
    const results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO customers (id, store_id, provider_id, channel_id, line_user_id, display_name, application_number, status, created_at, last_active_at) SELECT ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ? WHERE ${guard} ON CONFLICT(store_id, provider_id, channel_id, line_user_id) DO NOTHING`,
      ).bind(
        customerId,
        env.STORE_ID,
        env.LINE_PROVIDER_ID,
        env.LINE_CHANNEL_ID,
        identity.userId,
        identity.displayName,
        applicationNumber,
        now,
        now,
        notice.version,
        env.STORE_ID,
        env.DEPLOYMENT_ENV,
      ),
      env.DB.prepare(
        `UPDATE customers SET display_name = ?, last_active_at = ? WHERE store_id = ? AND provider_id = ? AND channel_id = ? AND line_user_id = ? AND ${guard}`,
      ).bind(
        identity.displayName,
        now,
        env.STORE_ID,
        env.LINE_PROVIDER_ID,
        env.LINE_CHANNEL_ID,
        identity.userId,
        notice.version,
        env.STORE_ID,
        env.DEPLOYMENT_ENV,
      ),
      env.DB.prepare(
        `INSERT INTO customer_sessions (session_hash, customer_id, expires_at, created_at) SELECT ?, id, ?, ? FROM customers WHERE store_id = ? AND provider_id = ? AND channel_id = ? AND line_user_id = ? AND ${guard}`,
      ).bind(
        await hash(session),
        now + 86400,
        now,
        env.STORE_ID,
        env.LINE_PROVIDER_ID,
        env.LINE_CHANNEL_ID,
        identity.userId,
        notice.version,
        env.STORE_ID,
        env.DEPLOYMENT_ENV,
      ),
    ]);
    if (results[2]?.meta.changes !== 1) return failure(503);
    const headers = new Headers(commonHeaders);
    headers.set("Location", "/account");
    headers.append("Set-Cookie", setCookie(oauthCookie, "", 0));
    headers.append("Set-Cookie", setCookie(sessionCookie, session, 86400));
    return new Response(null, {
      status: 303,
      headers,
    });
  } catch {
    return failure(503);
  }
}

async function account(
  request: Request,
  env: CustomerAuthEnv,
): Promise<Response> {
  const session = cookie(request, sessionCookie);
  if (!session)
    return page("請先登入", '<p><a href="/privacy">閱讀個資告知</a></p>', 401);
  try {
    if (!(await identityMatches(env))) return page("暫不可用", "", 503);
    const customer = await env.DB.prepare(
      "SELECT c.application_number, c.status, c.display_name FROM customer_sessions AS s JOIN customers AS c ON c.id = s.customer_id WHERE s.session_hash = ? AND s.expires_at > ? AND c.store_id = ? AND c.provider_id = ? AND c.channel_id = ?",
    )
      .bind(
        await hash(session),
        Math.floor(Date.now() / 1000),
        env.STORE_ID,
        env.LINE_PROVIDER_ID,
        env.LINE_CHANNEL_ID,
      )
      .first<{
        application_number: string;
        status: string;
        display_name: string;
      }>();
    if (!customer)
      return page(
        "請先登入",
        '<p><a href="/privacy">閱讀個資告知</a></p>',
        401,
      );
    const labels: Record<string, string> = {
      pending: "待核准",
      approved: "已核准",
      rejected: "已拒絕",
      revoked: "已撤銷",
    };
    return page(
      "我的申請",
      `<p>${escapeHtml(customer.display_name)}</p><p>申請編號：${escapeHtml(customer.application_number)}</p><p>目前狀態：${labels[customer.status] ?? "狀態不明"}</p>`,
    );
  } catch {
    return page("暫不可用", "", 503);
  }
}

export async function handleCustomerRoute(
  request: Request,
  env: CustomerAuthEnv,
  url: URL,
): Promise<Response> {
  if (url.pathname === "/privacy" && request.method === "GET")
    return privacyPage(env);
  if (env.DEPLOYMENT_ENV === "production") return page("暫不可用", "", 503);
  if (url.pathname === "/auth/line/start" && request.method === "POST")
    return start(request, env);
  if (url.pathname === "/auth/line/callback" && request.method === "GET")
    return callback(request, env, url);
  if (url.pathname === "/account" && request.method === "GET")
    return account(request, env);
  return new Response("Not found", { status: 404, headers: commonHeaders });
}
