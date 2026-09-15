/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Mirrors the "@/*" path alias in tsconfig.json, which shadcn components use.
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Pins TZ so the local-vs-UTC day-boundary tests are deterministic
    // everywhere, not just on a machine that happens to sit west of UTC.
    setupFiles: ['./src/test-setup.ts'],
  },
})
