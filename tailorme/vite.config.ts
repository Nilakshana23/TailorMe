import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  envDir: existsSync(fileURLToPath(new URL('./.env', import.meta.url))) ? '.' : '..',
  plugins: [react(), tailwindcss()],
})
