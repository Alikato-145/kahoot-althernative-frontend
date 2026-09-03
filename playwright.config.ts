import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'e2e/**/*.spec.ts',
  use: { baseURL: 'http://127.0.0.1:3100' },
  webServer: { command: 'node ./node_modules/next/dist/bin/next dev -p 3100', url: 'http://127.0.0.1:3100/join', reuseExistingServer: true },
})
