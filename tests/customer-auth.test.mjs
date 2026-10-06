import assert from "node:assert/strict";
import test from "node:test";
import { createTestHarness } from "wrangler";

const origin = "https://shop.test.example.test";

function browserCookie(response, name) {
  const header = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${name}=`));
  assert.ok(header, `${name} cookie was not set`);
  return header.split(";")[0];
}

async function begin(worker, version = "1") {
  const response = await worker.fetch(`${origin}/auth/line/start`, {
    method: "POST",
    body: new URLSearchParams({ noticeVersion: version }),
    redirect: "manual",
  });
  return response;
}

test("LINE callback creates one pending application and repeat login preserves it", async () => {
  const server = createTestHarness({
    workers: [
      {
        configPath: ".test-generated/public.wrangler.jsonc",
        env: "test",
        secrets: { LINE_CHANNEL_SECRET: "synthetic-secret" },
      },
    ],
  });
  await server.listen();
  const originalFetch = globalThis.fetch;
  let nonce = "";
  let userId = "U0123456789abcdef0123456789abcdef";
  let tokenValid = true;
  let audience = "2000000001";
  let nonceValid = true;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = new URLSearchParams(await new Request(input, init).text());
    if (url === "https://api.line.me/oauth2/v2.1/token") {
      assert.equal(body.get("client_id"), "2000000001");
      assert.equal(body.get("client_secret"), "synthetic-secret");
      assert.equal(body.get("redirect_uri"), `${origin}/auth/line/callback`);
      assert.ok(body.get("code_verifier"));
      return Response.json({ id_token: "synthetic-id-token" });
    }
    if (url === "https://api.line.me/oauth2/v2.1/verify") {
      assert.equal(body.get("client_id"), "2000000001");
      assert.equal(body.get("nonce"), nonce);
      return tokenValid
        ? Response.json({
            sub: userId,
            name: "<小明>",
            aud: audience,
            iss: "https://access.line.me",
            nonce: nonceValid ? nonce : "wrong-nonce",
          })
        : new Response("invalid token", { status: 400 });
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  };

  try {
    const worker = server.getWorker("sample-shop-test-public");
    await worker.applyD1Migrations("DB");
    const db = (await worker.getEnv()).DB;
    assert.equal((await worker.fetch(`${origin}/privacy`)).status, 503);
    assert.equal((await begin(worker)).status, 503);

    await db.exec(
      "INSERT INTO deployment_identity (singleton, store_id, environment) VALUES (1, 'sample-shop', 'test');",
    );
    await db.exec(
      "INSERT INTO privacy_notices (version, body, published_at) VALUES (1, '合成個資告知：僅供測試。', 1);",
    );
    await db.exec(
      "INSERT INTO privacy_current (singleton, version) VALUES (1, 1);",
    );
    const privacy = await worker.fetch(`${origin}/privacy`);
    assert.equal(privacy.status, 200);
    assert.equal(privacy.headers.get("Cache-Control"), "no-store");
    assert.match(await privacy.text(), /合成個資告知/);
    assert.equal((await begin(worker, "0")).status, 409);

    const first = await begin(worker);
    assert.equal(first.status, 303);
    await assert.rejects(
      db.exec(
        "UPDATE privacy_notices SET body = '未換版本的修改' WHERE version = 1;",
      ),
    );
    await assert.rejects(
      db.exec("DELETE FROM privacy_notices WHERE version = 1;"),
    );
    const authorize = new URL(first.headers.get("Location"));
    assert.equal(authorize.origin, "https://access.line.me");
    const formAction = privacy.headers
      .get("Content-Security-Policy")
      ?.split(";")
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith("form-action "));
    assert.equal(formAction, `form-action 'self' ${authorize.origin}`);
    assert.equal(authorize.searchParams.get("client_id"), "2000000001");
    assert.equal(authorize.searchParams.get("scope"), "profile openid");
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
    assert.ok(authorize.searchParams.get("code_challenge"));
    nonce = authorize.searchParams.get("nonce");
    const state = authorize.searchParams.get("state");
    const oauth = browserCookie(first, "__Host-lr_oauth");
    assert.match(
      first.headers.get("Set-Cookie"),
      /HttpOnly; Secure; SameSite=Lax/,
    );
    const callbackUrl = `${origin}/auth/line/callback?state=${state}&code=first-code`;
    assert.equal((await worker.fetch(callbackUrl)).status, 400);

    const callback = await worker.fetch(callbackUrl, {
      headers: { Cookie: oauth },
      redirect: "manual",
    });
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get("Location"), "/account");
    const session = browserCookie(callback, "__Host-lr_session");
    const account = await worker.fetch(`${origin}/account`, {
      headers: { Cookie: session },
    });
    assert.equal(account.status, 200);
    const accountText = await account.text();
    assert.match(accountText, /待核准|pending/);
    assert.match(accountText, /&lt;小明&gt;/);
    assert.doesNotMatch(accountText, /U0123456789abcdef/);
    const firstCustomer = await db
      .prepare("SELECT application_number, status FROM customers")
      .first();
    assert.equal(firstCustomer.status, "pending");
    assert.ok(firstCustomer.application_number.startsWith("LR-"));
    assert.equal(
      (await worker.fetch(callbackUrl, { headers: { Cookie: oauth } })).status,
      400,
    );

    await db.exec("UPDATE customers SET status = 'rejected';");
    const second = await begin(worker);
    nonce = new URL(second.headers.get("Location")).searchParams.get("nonce");
    const secondState = new URL(
      second.headers.get("Location"),
    ).searchParams.get("state");
    const secondOauth = browserCookie(second, "__Host-lr_oauth");
    const secondCallback = await worker.fetch(
      `${origin}/auth/line/callback?state=${secondState}&code=second-code`,
      { headers: { Cookie: secondOauth }, redirect: "manual" },
    );
    assert.equal(secondCallback.status, 303);
    assert.deepEqual(
      (
        await db
          .prepare("SELECT application_number, status FROM customers")
          .all()
      ).results,
      [
        firstCustomer && {
          application_number: firstCustomer.application_number,
          status: "rejected",
        },
      ],
    );
    const secondSession = browserCookie(secondCallback, "__Host-lr_session");
    assert.match(
      await (
        await worker.fetch(`${origin}/account`, {
          headers: { Cookie: secondSession },
        })
      ).text(),
      /已拒絕/,
    );

    tokenValid = false;
    userId = "Uffffffffffffffffffffffffffffffff";
    const third = await begin(worker);
    nonce = new URL(third.headers.get("Location")).searchParams.get("nonce");
    const thirdState = new URL(third.headers.get("Location")).searchParams.get(
      "state",
    );
    assert.equal(
      (
        await worker.fetch(
          `${origin}/auth/line/callback?state=${thirdState}&code=bad-code`,
          { headers: { Cookie: browserCookie(third, "__Host-lr_oauth") } },
        )
      ).status,
      400,
    );
    assert.equal(
      (await db.prepare("SELECT COUNT(*) AS total FROM customers").first())
        .total,
      1,
    );

    const fifth = await begin(worker);
    nonce = new URL(fifth.headers.get("Location")).searchParams.get("nonce");
    const fifthState = new URL(fifth.headers.get("Location")).searchParams.get(
      "state",
    );
    await db.exec(
      "INSERT INTO privacy_notices (version, body, published_at) VALUES (2, '新版合成個資告知', 2);",
    );
    await db.exec("UPDATE privacy_current SET version = 2;");
    assert.equal(
      (
        await worker.fetch(
          `${origin}/auth/line/callback?state=${fifthState}&code=stale-notice`,
          { headers: { Cookie: browserCookie(fifth, "__Host-lr_oauth") } },
        )
      ).status,
      409,
    );
    assert.equal(
      (await db.prepare("SELECT COUNT(*) AS total FROM customers").first())
        .total,
      1,
    );

    tokenValid = true;
    const sixth = await begin(worker, "2");
    nonce = new URL(sixth.headers.get("Location")).searchParams.get("nonce");
    const sixthState = new URL(sixth.headers.get("Location")).searchParams.get(
      "state",
    );
    audience = "other-channel";
    assert.equal(
      (
        await worker.fetch(
          `${origin}/auth/line/callback?state=${sixthState}&code=wrong-channel`,
          { headers: { Cookie: browserCookie(sixth, "__Host-lr_oauth") } },
        )
      ).status,
      400,
    );
    audience = "2000000001";

    const seventh = await begin(worker, "2");
    nonce = new URL(seventh.headers.get("Location")).searchParams.get("nonce");
    const seventhState = new URL(
      seventh.headers.get("Location"),
    ).searchParams.get("state");
    nonceValid = false;
    assert.equal(
      (
        await worker.fetch(
          `${origin}/auth/line/callback?state=${seventhState}&code=wrong-nonce`,
          { headers: { Cookie: browserCookie(seventh, "__Host-lr_oauth") } },
        )
      ).status,
      400,
    );
    nonceValid = true;
    assert.equal(
      (await db.prepare("SELECT COUNT(*) AS total FROM customers").first())
        .total,
      1,
    );

    await db.exec("UPDATE deployment_identity SET store_id = 'another-shop';");
    assert.equal((await worker.fetch(`${origin}/privacy`)).status, 503);
    assert.equal((await begin(worker, "2")).status, 503);
    assert.equal(
      (
        await worker.fetch(`${origin}/account`, {
          headers: { Cookie: secondSession },
        })
      ).status,
      503,
    );
    await db.exec("UPDATE deployment_identity SET store_id = 'sample-shop';");

    await db.exec("UPDATE customer_sessions SET expires_at = 1;");
    assert.equal(
      (
        await worker.fetch(`${origin}/account`, {
          headers: { Cookie: secondSession },
        })
      ).status,
      401,
    );

    const expired = await begin(worker, "2");
    nonce = new URL(expired.headers.get("Location")).searchParams.get("nonce");
    const expiredState = new URL(
      expired.headers.get("Location"),
    ).searchParams.get("state");
    await db
      .prepare("UPDATE oauth_attempts SET expires_at = 1 WHERE state_hash = ?")
      .bind(await hashForTest(expiredState))
      .run();
    assert.equal(
      (
        await worker.fetch(
          `${origin}/auth/line/callback?state=${expiredState}&code=expired-code`,
          { headers: { Cookie: browserCookie(expired, "__Host-lr_oauth") } },
        )
      ).status,
      400,
    );
    assert.equal(
      (await db.prepare("SELECT COUNT(*) AS total FROM customers").first())
        .total,
      1,
    );

    assert.equal(
      (await worker.fetch("https://other.example.test/privacy")).status,
      421,
    );
    assert.equal((await worker.fetch(`${origin}/account`)).status, 401);
    assert.equal(
      (await worker.fetch(`${origin}/api/orders`, { method: "POST" })).status,
      404,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await server.close();
  }
});

async function hashForTest(value) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Buffer.from(digest).toString("base64url");
}
