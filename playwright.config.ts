import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', testMatch: ['e2e.spec.ts', 'packed.spec.ts','setup.spec.ts'], timeout: 90000, workers: 1, use: { baseURL: 'http://127.0.0.1:5173', launchOptions: { executablePath: process.env.BROWSER_BIN || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' } } });
