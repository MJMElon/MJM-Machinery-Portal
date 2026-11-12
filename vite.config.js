import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `base` is "/" locally, but "/<repo>/" on GitHub Pages — the deploy workflow
// sets VITE_BASE to the repo name (same pattern as MachTrek).
// No service worker here on purpose: this portal is an online admin tool, and
// photo data must always come fresh from Supabase.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  // Build stamp: module windows load the app with ?v=<stamp>, so a new deploy
  // is never served from the browser's cached copy of index.html.
  define: { __BUILD__: JSON.stringify(String(Date.now()).slice(-8)) },
  plugins: [react()],
  server: { host: true }
})
