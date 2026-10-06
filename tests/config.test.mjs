import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateStoreConfig } from "../scripts/generate-config.mjs";

const example = JSON.parse(await readFile("config/store.example.json", "utf8"));

test("test and production resources stay distinct", async () => {
  assert.doesNotThrow(() => validateStoreConfig(example));
  for (const kind of ["public", "owner"]) {
    const config = JSON.parse(
      await readFile(`.test-generated/${kind}.wrangler.jsonc`, "utf8"),
    );
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    for (const environment of ["test", "production"]) {
      const worker = config.env[environment];
      assert.equal(worker.workers_dev, false);
      assert.equal(worker.preview_urls, false);
      assert.equal(worker.vars.STORE_ID, example.storeId);
      assert.equal(worker.vars.DEPLOYMENT_ENV, environment);
      assert.equal(worker.d1_databases.length, 1);
      assert.equal(worker.routes.length, 1);
      if (kind === "public") assert.equal(worker.assets.run_worker_first, true);
      else assert.equal(worker.assets, undefined);
    }
    assert.notEqual(config.env.test.name, config.env.production.name);
    assert.notEqual(
      config.env.test.d1_databases[0].database_id,
      config.env.production.d1_databases[0].database_id,
    );
  }
});

test("shared resource identifiers are rejected", () => {
  for (const [field, other] of [
    ["publicHost", "ownerHost"],
    ["d1DatabaseId", "d1DatabaseId"],
    ["privateR2Bucket", "publicR2Bucket"],
    ["lineChannelId", "lineChannelId"],
  ]) {
    const config = structuredClone(example);
    config.production[field] = config.test[other];
    assert.throws(() => validateStoreConfig(config), /duplicates/);
  }
});
