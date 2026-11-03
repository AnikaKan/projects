import { describe, expect, it } from 'vitest'
import { checkGeneratedText, revealsAnswer } from '../../../shared/aiGuards.mjs'
import serverPack from '../../../server/explain/lesson-pack.json'
import { REVENUE_VS_PROFIT } from '../../learning/content/revenueVsProfit'
import { buildExplainPack, PACK_BUSINESSES, PACK_LANGS, STAGES } from '../pack'

const pack = buildExplainPack(REVENUE_VS_PROFIT)

describe('explain pack (what the server may tell Claude)', () => {
  it('server copy is in sync with the approved lesson content (run `npm run ai:pack` after editing content)', () => {
    expect(JSON.parse(JSON.stringify(pack))).toEqual((serverPack as Record<string, unknown>).revenue_vs_profit)
  })

  it('every approved string passes the same guards applied to model output (script + amounts)', () => {
    for (const b of PACK_BUSINESSES)
      for (const stage of STAGES)
        for (const lang of PACK_LANGS) {
          const st = pack.stages[b][stage]
          expect(st.approved[lang].length, `${b}/${stage}/${lang}`).toBeGreaterThan(0)
          for (const s of st.approved[lang]) {
            const g = checkGeneratedText(s, { lang, allowed: st.allowed })
            // Approved Hindi/Telugu text may mention "udhaar"-style words but never advice topics.
            expect(g, `${b}/${stage}/${lang}: ${s}`).toEqual({ ok: true })
            expect(revealsAnswer(s, st.reveal), `${b}/${stage}/${lang} reveals: ${s}`).toBe(false)
          }
        }
  })

  it('open questions never carry the answer: no correct option id, no computed answer in the example', () => {
    for (const b of PACK_BUSINESSES) {
      const r = pack.stages[b]['response:asking']
      expect(r.question!.correctOptionId).toBeNull()
      expect(Object.keys(r.example)).not.toContain('left')
      expect(Object.keys(pack.stages[b]['practice:asking'].example)).not.toContain('profit')
      expect(Object.keys(pack.stages[b]['check:asking'].example)).not.toContain('profitAfter')
      expect(pack.stages[b]['response:feedback'].question!.correctOptionId).toBe('left')
    }
  })

  it('validated example matches the deterministic calculation (vegetable demo: ₹500 − ₹300 = ₹200)', () => {
    expect(pack.stages.vegetable.example.example).toMatchObject({ sales: 500, goodsCost: 300, left: 200, profit: 130 })
    expect(pack.stages.grocery.example.example).toMatchObject({ credit: 200, cashInBox: 1300 })
  })
})
