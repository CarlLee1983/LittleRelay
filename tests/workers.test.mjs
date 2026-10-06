import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createTestHarness } from "wrangler";

function harness(environment) {
  return createTestHarness({
    workers: [
      { configPath: ".test-generated/public.wrangler.jsonc", env: environment },
      { configPath: ".test-generated/owner.wrangler.jsonc", env: environment },
    ],
  });
}

test("empty test store serves public assets without records and denies owner access", async () => {
  const server = harness("test");
  await server.listen();
  try {
    const publicWorker = server.getWorker("sample-shop-test-public");
    const ownerWorker = server.getWorker("sample-shop-test-owner");
    await publicWorker.applyD1Migrations("DB");
    await publicWorker.applyD1Migrations("DB");
    const db = (await publicWorker.getEnv()).DB;
    const tables = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all();
    assert.deepEqual(
      tables.results
        .map((row) => row.name)
        .filter((name) => !name.startsWith("_") && !name.startsWith("sqlite_")),
      [
        "customer_sessions",
        "customers",
        "d1_migrations",
        "deployment_identity",
        "oauth_attempts",
        "privacy_current",
        "privacy_notices",
      ],
    );
    assert.equal(
      (
        await db
          .prepare("SELECT COUNT(*) AS total FROM deployment_identity")
          .first()
      ).total,
      0,
    );
    for (const table of [
      "customers",
      "customer_sessions",
      "oauth_attempts",
      "privacy_notices",
    ]) {
      assert.equal(
        (await db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).first())
          .total,
        0,
      );
    }

    const homepage = await publicWorker.fetch(
      "https://shop.test.example.test/",
    );
    assert.equal(homepage.status, 200);
    assert.match(await homepage.text(), /商店正在準備中/);
    assert.equal(
      (
        await db
          .prepare("SELECT COUNT(*) AS total FROM deployment_identity")
          .first()
      ).total,
      0,
    );
    assert.equal(
      (await publicWorker.fetch("https://shop.test.example.test/style.css"))
        .status,
      200,
    );
    assert.equal(
      (await publicWorker.fetch("https://unknown.example.test/")).status,
      421,
    );
    assert.equal(
      (await publicWorker.fetch("https://unknown.example.test/style.css"))
        .status,
      421,
    );
    assert.equal(
      (await publicWorker.fetch("https://shop.test.example.test/owner/"))
        .status,
      404,
    );
    assert.equal(
      (
        await publicWorker.fetch("https://shop.test.example.test/api/orders", {
          method: "POST",
        })
      ).status,
      404,
    );
    assert.equal(
      (await ownerWorker.fetch("https://owner.test.example.test/")).status,
      403,
    );
    assert.equal(
      (await ownerWorker.fetch("https://unknown.example.test/")).status,
      421,
    );

    const identitySql = await readFile(".test-generated/init-test.sql", "utf8");
    await db.exec(identitySql);
    await db.exec(identitySql);
    assert.deepEqual(
      await db
        .prepare("SELECT store_id, environment FROM deployment_identity")
        .first(),
      { store_id: "sample-shop", environment: "test" },
    );
    await assert.rejects(
      db.exec(identitySql.replace("sample-shop", "other-shop")),
    );
    await assert.rejects(
      db.exec(identitySql.replace("'test'", "'production'")),
    );
  } finally {
    await server.close();
  }
});

test("production Worker has no operational write path", async () => {
  const server = harness("production");
  await server.listen();
  try {
    const publicWorker = server.getWorker("sample-shop-production-public");
    const ownerWorker = server.getWorker("sample-shop-production-owner");
    assert.equal(
      (await publicWorker.fetch("https://shop.example.test/")).status,
      200,
    );
    assert.equal(
      (
        await publicWorker.fetch("https://shop.example.test/api/orders", {
          method: "POST",
        })
      ).status,
      503,
    );
    assert.equal(
      (
        await publicWorker.fetch("https://shop.example.test/auth/line/start", {
          method: "POST",
        })
      ).status,
      503,
    );
    assert.equal(
      (
        await publicWorker.fetch("https://shop.example.test/", {
          method: "POST",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await publicWorker.fetch("https://preview.example.test/api/orders", {
          method: "POST",
        })
      ).status,
      421,
    );
    assert.equal(
      (
        await ownerWorker.fetch("https://owner.example.test/api/orders", {
          method: "POST",
        })
      ).status,
      403,
    );
  } finally {
    await server.close();
  }
});
