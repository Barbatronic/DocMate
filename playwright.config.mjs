import { defineConfig } from '@playwright/test';

/**
 * Parcours navigateur (Chromium) avec caméra et micro simulés par le navigateur.
 * `npm test` lance tout sauf les tests marqués @network (téléphone : serveur PeerJS en ligne).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8766',
    viewport: { width: 1600, height: 900 },
    locale: 'fr-FR',
    colorScheme: 'dark',
    permissions: ['camera', 'microphone'],
    acceptDownloads: true,
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: { command: 'node tests/serve.mjs', env: { PORT: '8766' }, url: 'http://127.0.0.1:8766', reuseExistingServer: true },
});
