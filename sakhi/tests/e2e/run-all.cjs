// Runs every browser suite that needs no credentials against a running build:
//   npm run build && npx vite preview --port 4176   (and `npm run server` for /api; no keys needed)
//   npm run test:e2e
// The mocked-Claude suite (ai-mock-claude.cjs) needs extra setup and is run separately (see its header).
const { execFileSync } = require('child_process')
const suites = ['primary-journey', 'offline', 'lesson-e2e', 'speech-e2e', 'progress-e2e', 'intent-e2e', 'multilingual-e2e', 'fallback-e2e', 'ai-nokey', 'coach-e2e', 'demo-e2e', 'helper-e2e']
let failed = 0
for (const s of suites) {
  try {
    const out = execFileSync('node', [`${__dirname}/${s}.cjs`], { encoding: 'utf8', timeout: 180000 })
    const last = out.trim().split('\n').at(-1)
    const bad = /PROBLEMS|FAIL/.test(out) || (/^errors \[/.test(last) && last !== 'errors []')
    if (bad) failed++
    console.log(`${bad ? '✗' : '✓'} ${s}: ${last}`)
  } catch (e) {
    failed++
    console.log(`✗ ${s}: ${String(e.stdout || e.message).trim().split('\n').slice(-3).join(' | ')}`)
  }
}
console.log(failed ? `\n${failed} suite(s) failed` : `\nAll ${suites.length} browser suites passed`)
process.exit(failed ? 1 : 0)
