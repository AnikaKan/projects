// Starts the speech backend.  Dev: `npm run server` (Vite proxies /api → :8787).
// Prod: `npm run build && npm run serve` (serves dist/ and /api on one origin).
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { createSpeechApp } from './app.mjs'

// Load .env without extra dependencies (simple KEY=VALUE lines).
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
}

const port = Number(process.env.PORT || 8787)
const staticDir = process.argv.includes('--static') ? 'dist' : null
createServer(createSpeechApp({ staticDir })).listen(port, () => {
  console.log(`Backend on http://localhost:${port} · Sarvam ${process.env.SARVAM_API_KEY ? 'configured' : 'NOT configured (browser speech only)'} · Claude ${process.env.ANTHROPIC_API_KEY ? 'configured' : 'NOT configured (approved fallback explanations only)'}`)
})
