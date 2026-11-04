import { defineConfig, devices } from '@playwright/test';

// biome-ignore lint/suspicious/noUndeclaredEnvVars: Playwright runs outside Turborepo, so turbo.json does not track this variable.
const port = Number(Bun.env.E2E_PORT ?? '4010');
const baseURL = `http://127.0.0.1:${port}`;
const ci = Boolean(Bun.env.CI);

// Browser journeys against the built static web app, served by the real API
// code with an in-memory task store. Files end in `.e2e.ts` so that
// `bun test`, which also picks up `*.spec.ts`, never loads them.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci
    ? [
        ['list'],
        ['junit', { outputFile: 'test-results/e2e-junit.xml' }],
        ['html', { open: 'never' }],
      ]
    : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bun run apps/api/test/e2e-server.ts',
    url: `${baseURL}/healthz`,
    reuseExistingServer: !ci,
    timeout: 30_000,
    env: { E2E_PORT: String(port) },
  },
});
