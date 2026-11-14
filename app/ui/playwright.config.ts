import { defineConfig } from '@playwright/test';

const baseUrl = 'http://127.0.0.1:4100';
const kanidmUrl = process.env.KANIDM_URL;
const kanidmCaPath = process.env.KANIDM_CA_PATH;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.ts',
  workers: 1,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: baseUrl,
  },
  // Without a Kanidm there is nothing to start: leave the web server
  // undefined so the tests skip instead of building an unusable app.
  webServer: kanidmUrl
    ? {
        command: 'cargo run --manifest-path ../Cargo.toml',
        url: baseUrl,
        timeout: 600000,
        reuseExistingServer: true,
        env: {
          ...process.env,
          APP_SKIP_FRONTEND_BUILD: '1',
          APP_SERVER__ADDRESS: '127.0.0.1:4100',
          // The default `development` env enables the Docker testcontainer
          // chain; the e2e app must talk to the real Kanidm above instead.
          APP_TESTCONTAINER__ENABLED: 'false',
          // `development` also spawns `bun watch`, whose initial rebuild
          // empties and rewrites `dist/` while tests are running. The
          // e2e run serves the `dist/` built beforehand, so no watcher.
          APP_FRONTEND__WATCH: 'false',
          ...(kanidmUrl ? { APP_KANIDM__URL: kanidmUrl } : {}),
          ...(kanidmCaPath ? { APP_KANIDM__CA_PATH: kanidmCaPath } : {}),
        },
      }
    : undefined,
});
