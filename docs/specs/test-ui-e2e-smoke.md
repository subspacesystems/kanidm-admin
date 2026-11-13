# test-ui-e2e-smoke: Playwright setup and a login + person list smoke test

## Goal
Browser tests for the console. This task adds the Playwright harness to `app/ui` and makes the two tests in
`app/ui/tests/smoke.e2e.ts` (already written, do not edit) pass.

## Requirements
- Add `@playwright/test` to `devDependencies` at exactly `1.64.1` (no `^`/`~`; it matches the browser build in the
  image). Update `bun.lock` with `bun install`.
- Add a `test:e2e` script to `app/ui/package.json`: `playwright test`.
- Add `app/ui/playwright.config.ts`:
  - `testDir: './tests'`, `testMatch: '**/*.e2e.ts'` (so `bun test` never picks them up).
  - `use.baseURL: 'http://127.0.0.1:4100'`. Never set `ignoreHTTPSErrors`; the browser already trusts the run's CA.
  - `workers: 1`, `retries: 0`, a reporter that prints only failures in CI (`'line'` is fine).
  - `webServer` starting the app: command `cargo run --manifest-path ../Cargo.toml`, `url` the base URL,
    `timeout` 600000 (first build is slow), `reuseExistingServer: true`, and `env` that passes through
    `process.env` plus: `APP_SKIP_FRONTEND_BUILD=1`, `APP_SERVER__ADDRESS=127.0.0.1:4100`,
    `APP_KANIDM__URL=<KANIDM_URL>`, `APP_KANIDM__CA_PATH=<KANIDM_CA_PATH>` (the app reads `app/ui/dist`, which the
    `bun-build` gate builds first). Only include the two `APP_KANIDM__*` values when the variables are set.
  - When `KANIDM_URL` is unset, `webServer` must be left out (`undefined`) so `bun run test:e2e` skips the tests
    cleanly (they call `test.skip`) instead of building and starting an app that has no Kanidm.
- Add `test-results/` and `playwright-report/` under `app/ui` to `.gitignore` if not already ignored.
- Do not edit `tests/smoke.e2e.ts`, change app source, add other dependencies, or add translated strings.

## Acceptance
- `cd app/ui && bun run test:e2e` with Slipway's env: both tests pass.
- Without `KANIDM_URL`: it exits 0 with both tests skipped.
- `bunx --bun tsc --noEmit`, lint and `bun test` stay green. If lint complains about `tests/` or the config
  file, fix the config (eslint ignores/overrides) rather than weakening rules for other code.
- The test signs in as `idm_admin`, not `admin`: the person list is an `idm_admins` permission.

## Where to look
- `app/ui/tests/smoke.e2e.ts`: the tests and the selectors they use.
- `LoginForm` render in `app/ui/src/features/auth/components/login-form.ts` (`show LoginForm.render`).
- `PersonListPage` in `app/ui/src/features/persons/components/person-list-page.ts`.
- `Settings::load` in `app/src/settings/loader.rs`: `APP_*` env layer, `__` as the nesting separator.
- `KanidmSettings` in `app/src/settings/kanidm.rs` (`url`, `ca_path`).
- `app/ui/package.json`, `app/ui/eslint.config.js`.
