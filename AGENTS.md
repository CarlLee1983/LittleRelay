# Repository Guidelines

## Structure

- `src/public.ts` and `src/owner.ts`: separate Cloudflare Worker entry points.
- `assets/public/`: the anonymous empty-store page.
- `migrations/`: versioned D1 schema changes.
- `config/store.example.json`: synthetic, non-secret store configuration.
- `scripts/generate-config.mjs`: validates a local store configuration and generates Wrangler files and identity SQL.
- `tests/`: Node.js tests using Cloudflare's local Workers test harness.
- `.scratch/`: planning, specification, and ticket documents.

## Commands

- `npm ci`: install locked development dependencies.
- `npm run config:generate`: read ignored `store.local.json`, generate ignored `.generated/` files.
- `npm run dev:public` / `npm run dev:owner`: run the selected test Worker locally after generating config. Direct local URLs fail the expected-Host guard; use the integration tests for HTTP verification.
- `npm run lint`: Biome check of source, scripts, tests, and configuration.
- `npm run typecheck`: TypeScript check without emission.
- `npm test`: generate synthetic test config, run local Worker and D1 integration tests.
- `npm run check`: lint, typecheck, and tests.

## Style and tests

Use TypeScript for Workers, ECMAScript modules for Node scripts/tests, and Biome formatting. Keep tests at the lowest useful boundary; use the local Worker harness for HTTP, assets, and D1 behavior. Do not put secrets or actual store configuration in version control.

## Commits and pull requests

Use short imperative commit subjects. PRs should explain the purpose, relevant ticket, checks run, and screenshots for visible UI changes. Preserve unrelated work and seek authorization before commit, push, merge, publish, or deploy.
