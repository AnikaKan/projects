// The Sarvam and Anthropic keys must never reach the browser: no frontend file may reference the Sarvam host,
// its auth header or a key variable, and the production bundle must not contain them either.
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const walk = (dir, ext) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? (f === '__tests__' ? [] : walk(p, ext)) : ext.test(f) ? [p] : []
  })
const FORBIDDEN = /api\.sarvam\.ai|api-subscription-key|SARVAM_API_KEY|VITE_SARVAM|api\.anthropic\.com|ANTHROPIC_API_KEY|VITE_ANTHROPIC|x-api-key|sk-ant-|@anthropic-ai\/sdk/

describe('secrets stay on the server', () => {
  it('frontend source never references Sarvam/Anthropic credentials or calls either API directly', () => {
    for (const f of [...walk('src', /\.(ts|tsx)$/), ...walk('shared', /\.m?[jt]s$/)]) expect(readFileSync(f, 'utf8'), f).not.toMatch(FORBIDDEN)
  })
  it.skipIf(!existsSync('dist'))('built bundle contains no key, header or Sarvam host', () => {
    for (const f of walk('dist', /\.(js|html)$/)) expect(readFileSync(f, 'utf8'), f).not.toMatch(FORBIDDEN)
  })
  it('.env files are git-ignored and an example without a key is provided', () => {
    expect(readFileSync('.gitignore', 'utf8')).toMatch(/^\.env$/m)
    expect(readFileSync('.env.example', 'utf8')).toMatch(/^SARVAM_API_KEY=$/m)
    expect(readFileSync('.env.example', 'utf8')).toMatch(/^ANTHROPIC_API_KEY=$/m)
  })
})
