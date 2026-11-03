import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Offline app shell: lists every built file in precache-manifest.json so public/sw.js can cache the whole
 * app (JS, CSS, all three scripts' fonts, pre-generated audio manifest) on the first online visit.
 */
function precacheManifest(): Plugin {
  return {
    name: 'hisaab-precache-manifest',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'))
      this.emitFile({ type: 'asset', fileName: 'precache-manifest.json', source: JSON.stringify({ version: Date.now(), files: ['./', ...files] }) })
    },
  }
}

// /api is served by the speech backend (server/index.mjs), which holds the Sarvam key.
export default defineConfig({
  plugins: [react(), precacheManifest()],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  preview: { proxy: { '/api': 'http://localhost:8787' } },
})
