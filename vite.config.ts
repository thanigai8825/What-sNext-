import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { aiDevServer } from './server/ai-dev-plugin.ts'

export default defineConfig(({ mode }) => {
  // Server-only secrets (no VITE_ prefix) never reach the browser bundle.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      tailwindcss(),
      aiDevServer({ apiKey: env.ANTHROPIC_API_KEY, model: env.AI_MODEL }),
    ],
  }
})
