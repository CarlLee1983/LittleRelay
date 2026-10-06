import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const input = path.resolve(
  process.argv[2] ?? path.join(root, "store.local.json"),
);
const output = path.resolve(process.argv[3] ?? path.join(root, ".generated"));

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a nonempty string`);
  }
  return value;
}

function requireHost(value, label) {
  const host = requireString(value, label);
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) || host.includes("..")) {
    throw new Error(`${label} must be a lowercase hostname`);
  }
  return host;
}

export function validateStoreConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("store config must be an object");
  }
  const storeId = requireString(config.storeId, "storeId");
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(storeId)) {
    throw new Error("storeId must be a short lowercase slug");
  }
  requireString(config.accountId, "accountId");

  const unique = new Map();
  for (const environment of ["test", "production"]) {
    const settings = config[environment];
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      throw new Error(`${environment} settings are required`);
    }
    for (const field of [
      "publicHost",
      "ownerHost",
      "d1DatabaseName",
      "d1DatabaseId",
      "publicR2Bucket",
      "privateR2Bucket",
      "lineProviderId",
      "lineChannelId",
    ]) {
      const value = field.endsWith("Host")
        ? requireHost(settings[field], `${environment}.${field}`)
        : requireString(settings[field], `${environment}.${field}`);
      if (field === "lineProviderId") continue;
      const group = field.endsWith("Host")
        ? "host"
        : field.startsWith("d1")
          ? field
          : field.endsWith("R2Bucket")
            ? "r2Bucket"
            : field;
      const key = `${group}:${value}`;
      if (unique.has(key)) {
        throw new Error(
          `${environment}.${field} duplicates ${unique.get(key)}`,
        );
      }
      unique.set(key, `${environment}.${field}`);
    }
  }
  return config;
}

function relative(outputDir, file) {
  return path
    .relative(outputDir, path.join(root, file))
    .split(path.sep)
    .join("/");
}

function workerConfig(config, kind, outputDir) {
  const env = {};
  for (const environment of ["test", "production"]) {
    const settings = config[environment];
    const host = kind === "public" ? settings.publicHost : settings.ownerHost;
    env[environment] = {
      name: `${config.storeId}-${environment}-${kind}`,
      workers_dev: false,
      preview_urls: false,
      routes: [{ pattern: host, custom_domain: true }],
      vars: {
        STORE_ID: config.storeId,
        DEPLOYMENT_ENV: environment,
        EXPECTED_HOST: host,
        ...(kind === "public"
          ? {
              LINE_CHANNEL_ID: settings.lineChannelId,
              LINE_PROVIDER_ID: settings.lineProviderId,
            }
          : {}),
      },
      d1_databases: [
        {
          binding: "DB",
          database_name: settings.d1DatabaseName,
          database_id: settings.d1DatabaseId,
          migrations_dir: relative(outputDir, "migrations"),
        },
      ],
      ...(kind === "public"
        ? {
            assets: {
              directory: relative(outputDir, "assets/public"),
              binding: "ASSETS",
              run_worker_first: true,
            },
          }
        : {}),
    };
  }
  return {
    account_id: config.accountId,
    name: `${config.storeId}-unconfigured-${kind}`,
    main: relative(outputDir, `src/${kind}.ts`),
    compatibility_date: "2026-10-06",
    workers_dev: false,
    preview_urls: false,
    env,
  };
}

export async function generate(inputPath = input, outputDir = output) {
  const config = validateStoreConfig(
    JSON.parse(await readFile(inputPath, "utf8")),
  );
  await mkdir(outputDir, { recursive: true });
  for (const kind of ["public", "owner"]) {
    await writeFile(
      path.join(outputDir, `${kind}.wrangler.jsonc`),
      `${JSON.stringify(workerConfig(config, kind, outputDir), null, 2)}\n`,
    );
  }
  for (const environment of ["test", "production"]) {
    const identitySql = `INSERT INTO deployment_identity (singleton, store_id, environment) VALUES (1, '${config.storeId}', '${environment}') ON CONFLICT(singleton) DO UPDATE SET store_id = CASE WHEN deployment_identity.store_id = excluded.store_id AND deployment_identity.environment = excluded.environment THEN deployment_identity.store_id ELSE NULL END;\n`;
    await writeFile(
      path.join(outputDir, `init-${environment}.sql`),
      identitySql,
    );
  }
  await writeFile(
    path.join(outputDir, "resources.json"),
    `${JSON.stringify(
      {
        storeId: config.storeId,
        test: {
          publicR2Bucket: config.test.publicR2Bucket,
          privateR2Bucket: config.test.privateR2Bucket,
          lineProviderId: config.test.lineProviderId,
          lineChannelId: config.test.lineChannelId,
        },
        production: {
          publicR2Bucket: config.production.publicR2Bucket,
          privateR2Bucket: config.production.privateR2Bucket,
          lineProviderId: config.production.lineProviderId,
          lineChannelId: config.production.lineChannelId,
        },
      },
      null,
      2,
    )}\n`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  await generate();
}
