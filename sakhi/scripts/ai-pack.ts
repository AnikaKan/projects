// Writes server/explain/lesson-pack.json from the approved lesson content (see src/ai/pack.ts).
// Run after editing lesson content or translations: npm run ai:pack
import { writeFileSync } from 'node:fs'
import { buildExplainPack } from '../src/ai/pack'
import { LESSONS } from '../src/learning/storage'

async function main() {
  const packs = Object.fromEntries(Object.values(LESSONS).map((c) => [c.id, buildExplainPack(c)]))
  const out = new URL('../server/explain/lesson-pack.json', import.meta.url)
  writeFileSync(out, JSON.stringify(packs, null, 1) + '\n')
  console.log(`wrote ${Object.keys(packs).length} lesson pack(s) → server/explain/lesson-pack.json`)
}
main()
