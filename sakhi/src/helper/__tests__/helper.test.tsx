// @vitest-environment jsdom
// Business Helper: deterministic calculations, request routing, the screens with voice test doubles,
// corrections, language, lesson links, and that nothing sensitive is stored.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AppStateProvider, useApp } from '../../state/AppState'
import { MemoryStore } from '../../assessment/storage'
import { SpeechProvider } from '../../speech/SpeechContext'
import { flush, RecognitionHarness, SynthHarness, V } from '../../speech/__tests__/fakes'
import { HomeScreen } from '../../screens/Home'
import { LessonRoute } from '../../learning/ui/LessonExperience'
import { HelperHome, MoneyTool, PriceTool } from '../screens'
import { MAX_AMOUNT, checkMoneyAnswer, checkPrice, explainMoney, routeRequest } from '../helperModel'
import { HELPER_EN, HELPER_HI, HELPER_TE } from '../../i18n/helperStrings'
import { mentionsAdviceTopic } from '../../../shared/aiGuards.mjs'

describe('calculations (deterministic)', () => {
  it('Check My Price: remaining = price − cost − other costs; verdicts; not called profit', () => {
    expect(checkPrice({ item: 'vegBasket', cost: 300, extra: 50, price: 450 })).toMatchObject({ totalCost: 350, remaining: 100, verdict: 'covers', noExtras: false, lesson: 'm1' })
    expect(checkPrice({ item: 'x', cost: 300, extra: 0, price: 300 })).toMatchObject({ remaining: 0, verdict: 'breakEven', noExtras: true })
    expect(checkPrice({ item: 'x', cost: 300, extra: 40, price: 320 })).toMatchObject({ remaining: -20, verdict: 'loss' })
    expect(() => checkPrice({ item: 'x', cost: 1.5, extra: 0, price: 3 })).toThrow()
    expect(() => checkPrice({ item: 'x', cost: MAX_AMOUNT + 1, extra: 0, price: 3 })).toThrow()
  })
  it('Understand My Money: sales, cash received, still owed and profit are kept apart', () => {
    const c = explainMoney('credit', { sales: 500, received: 400 })
    expect(c.rows.map((r) => [r.key, r.amount])).toEqual([['sales', 500], ['received', 400], ['owed', 100]])
    expect(c).toMatchObject({ message: 'bh.money.credit.owed', lesson: 'm3' })
    expect(explainMoney('credit', { sales: 500, received: 500 }).message).toBe('bh.money.credit.allPaid')
    expect(explainMoney('salesProfit', { sales: 500, goodsCost: 300 }).rows.at(-1)).toMatchObject({ key: 'leftBeforeOther', amount: 200 })
    expect(explainMoney('expenses', { goodsCost: 300, transport: 40, smallCosts: 10 }).rows.at(-1)).toMatchObject({ key: 'totalCost', amount: 350 })
    expect(explainMoney('expenses', { goodsCost: 300, transport: 0, smallCosts: 0 }).message).toBe('bh.money.expenses.onlyGoods')
    expect(explainMoney('household', { boxMoney: 800, takenHome: 150 })).toMatchObject({ lesson: 'm5', vars: { left: 650 } })
    expect(checkMoneyAnswer('credit', { sales: 500 }, 'received', 600)).toMatchObject({ ok: false, key: 'bh.err.receivedMore' })
    expect(checkMoneyAnswer('household', { boxMoney: 100 }, 'takenHome', 150)).toMatchObject({ ok: false, key: 'bh.err.takenMore' })
    expect(checkMoneyAnswer('credit', {}, 'sales', 12345678)).toMatchObject({ ok: false, key: 'bh.err.range' })
  })
  it('spoken requests are routed to a supported tool, or to none', () => {
    expect(routeRequest('I want to check my selling price', 'en')).toBe('price')
    expect(routeRequest('help me understand my profit', 'en')).toBe('money')
    expect(routeRequest('मुझे दाम जाँचना है', 'hi')).toBe('price')
    expect(routeRequest('मेरा उधार का हिसाब', 'hi')).toBe('money')
    expect(routeRequest('నా ధర చూడాలి', 'te')).toBe('price')
    expect(routeRequest('ఈ రోజు లాభం ఎంత', 'te')).toBe('money')
    expect(routeRequest('should I take a loan with interest money', 'en')).toBe('loan')
    expect(routeRequest('keep money separate', 'en')).toBe('money') // "rate" inside "separate" is not "price"
    expect(routeRequest('what is the weather today', 'en')).toBeNull()
  })
  it('every string exists in en / hi / te and no helper text gives loan or investment advice', () => {
    expect(Object.keys(HELPER_HI)).toEqual(Object.keys(HELPER_EN))
    expect(Object.keys(HELPER_TE)).toEqual(Object.keys(HELPER_EN))
    for (const d of [HELPER_EN, HELPER_HI, HELPER_TE])
      for (const [k, v] of Object.entries(d)) if (!k.includes('loan')) expect(mentionsAdviceTopic(v), `${k}: ${v}`).toBe(false)
  })
})

// ── Screens ─────────────────────────────────────────────────────────

let store: MemoryStore
let rec: RecognitionHarness
let synth: SynthHarness
let app: ReturnType<typeof useApp>
let path = ''
function Spy() {
  app = useApp()
  path = useLocation().pathname
  return null
}
function Shell({ at }: { at: string }) {
  return (
    <AppStateProvider store={store}>
      <SpeechProvider stt={rec.service()} tts={synth.service()}>
        <MemoryRouter initialEntries={[at]}>
          <Spy />
          <Routes>
            <Route path="/home" element={<HomeScreen />} />
            <Route path="/helper" element={<HelperHome />} />
            <Route path="/helper/price" element={<PriceTool />} />
            <Route path="/helper/money" element={<MoneyTool />} />
            <Route path="/lessons/:id" element={<LessonRoute />} />
          </Routes>
        </MemoryRouter>
      </SpeechProvider>
    </AppStateProvider>
  )
}
const id = (t: string) => screen.getByTestId(t)
const click = async (el: HTMLElement) =>
  act(async () => {
    fireEvent.click(el)
    await flush()
  })
const keys = async (digits: string) => {
  for (const d of digits) await click(id(`bh-key-${d}`))
}
const say = async (micTestid: string, words: string) => {
  rec.script = { kind: 'result', transcript: words }
  await click(id(micTestid))
  await act(async () => {
    await flush()
  })
}

beforeEach(() => {
  localStorage.clear()
  store = new MemoryStore()
  rec = new RecognitionHarness()
  synth = new SynthHarness([V.enIN, V.hiIN, V.teIN])
})
afterEach(cleanup)

describe('Business Helper screens', () => {
  it('the tab opens the helper home; existing tabs remain', async () => {
    render(<Shell at="/home" />)
    expect(id('nav-home')).toBeTruthy()
    expect(id('nav-journey')).toBeTruthy()
    await click(id('nav-helper'))
    expect(path).toBe('/helper')
    expect(id('bh-welcome').textContent).toContain('How can I help your business today?')
    expect(id('bh-tool-price').dataset.soon).toBe('false')
    expect(id('bh-tool-money').dataset.soon).toBe('false')
    expect(id('bh-tool-message').dataset.soon).toBe('true')
    expect(id('bh-tool-loan').dataset.soon).toBe('true')
  })

  it('voice request routes to Check My Price; unsupported requests show the options; loan is "coming soon" with no advice', async () => {
    render(<Shell at="/helper" />)
    await say('bh-mic', 'tell me the weather')
    expect(id('bh-not-understood').textContent).toContain('I can help with these')
    expect(path).toBe('/helper')
    await say('bh-mic', 'should I take a loan')
    expect(id('bh-soon').dataset.tool).toBe('loan')
    expect(id('bh-soon').textContent).toContain('It will not tell you whether to take a loan')
    await click(id('bh-soon-ok'))
    await say('bh-mic', 'I want to check my selling price')
    expect(path).toBe('/helper/price')
  })

  it('Check My Price: voice amount is read back for confirmation; keypad works; result is correct; a correction updates it', async () => {
    render(<Shell at="/helper/price" />)
    await click(id('bh-item-vegBasket'))
    // cost by voice
    const spokenBefore = synth.spoken.length
    await say('bh-amount-mic', 'three hundred rupees')
    expect(id('bh-heard').dataset.amount).toBe('300')
    expect(synth.spoken.slice(spokenBefore).some((u) => /300|three hundred/i.test(u.text) && u.lang === 'en-IN')).toBe(true) // spoken confirmation
    await click(id('bh-amount-confirm'))
    // other costs by tap
    await keys('50')
    await click(id('bh-amount-confirm'))
    // price by tap
    await keys('450')
    await click(id('bh-amount-confirm'))
    expect(id('bh-price-result').dataset.remaining).toBe('100')
    expect(id('bh-price-message').textContent).toBe('If you sell for ₹450, ₹100 is left after the costs you told me.')
    expect(id('bh-price-notes').textContent).toContain('may not be your final profit')
    expect(id('bh-price-notes').textContent).toContain('cannot tell you the best price')
    expect(id('bh-why-link').getAttribute('href')).toBe('/lessons/m1')
    expect(screen.queryByTestId('bh-practise-link')).toBeNull()
    // correct the price
    await click(id('bh-row-price-change'))
    await click(id('bh-key-del'))
    await click(id('bh-key-del'))
    await click(id('bh-key-del'))
    await keys('320')
    await click(id('bh-amount-confirm'))
    expect(id('bh-price-result').dataset.verdict).toBe('loss')
    expect(id('bh-price-message').textContent).toContain('₹30 short')
    // "Not sure" → offer practice (no label on her)
    await click(id('bh-selfcheck-unsure'))
    expect(id('bh-practise-link').getAttribute('href')).toBe('/lessons/m2')
  })

  it('no other costs → gentle prompt about forgotten costs and a practice link to Everyday costs', async () => {
    render(<Shell at="/helper/price" />)
    await click(id('bh-item-tomatoes'))
    await keys('200')
    await click(id('bh-amount-confirm'))
    await click(id('bh-amount-extra'))
    await keys('260')
    await click(id('bh-amount-confirm'))
    expect(id('bh-price-forgot')).toBeTruthy()
    expect(id('bh-practise-link').dataset.module).toBe('m2')
  })

  it('Understand My Money (credit): the brief’s example, with a check on impossible amounts', async () => {
    render(<Shell at="/helper/money" />)
    await click(id('bh-scenario-credit'))
    await say('bh-amount-mic', 'I sold 500 rupees of vegetables today')
    expect(id('bh-heard').dataset.amount).toBe('500')
    await click(id('bh-amount-confirm'))
    expect(id('bh-question-text').textContent).toContain('Did you receive all ₹500')
    await keys('600')
    await click(id('bh-amount-confirm'))
    expect(id('bh-amount-error').textContent).toContain('cannot be more than the sales (₹500)')
    await click(id('bh-key-del'))
    await click(id('bh-key-del'))
    await click(id('bh-key-del'))
    await keys('400')
    await click(id('bh-amount-confirm'))
    expect(id('bh-row-owed').dataset.amount).toBe('100')
    expect(id('bh-money-message').textContent).toBe('You made ₹500 in sales, received ₹400 in cash, and are still owed ₹100. That does not mean your profit is ₹500.')
    expect(id('bh-why-link').dataset.module).toBe('m3')
    // correcting sales below "received" re-asks the received amount
    await click(id('bh-row-sales-change'))
    await click(id('bh-key-del'))
    await click(id('bh-key-del'))
    await click(id('bh-key-del'))
    await keys('300')
    await click(id('bh-amount-confirm'))
    expect(id('bh-money').dataset.step).toBe('received')
  })

  it('several amounts or no amount in one answer are not guessed', async () => {
    render(<Shell at="/helper/money" />)
    await click(id('bh-scenario-salesProfit'))
    await say('bh-amount-mic', 'maybe 400 or 500')
    expect(id('bh-heard').dataset.amount).toBe('')
    expect(id('bh-heard').textContent).toContain('more than one amount')
    await say('bh-amount-mic', 'I do not know')
    expect(id('bh-heard').textContent).toContain('did not hear an amount')
    expect((id('bh-amount-confirm') as HTMLButtonElement).disabled).toBe(true)
  })

  it('microphone failure → clear notice, keypad still works', async () => {
    rec.script = { kind: 'error', error: 'not-allowed' }
    render(<Shell at="/helper/money" />)
    await click(id('bh-scenario-household'))
    await click(id('bh-amount-mic'))
    expect(id('bh-amount-mic-unavailable').dataset.reason).toBe('permission-denied')
    await keys('800')
    await click(id('bh-amount-confirm'))
    expect(id('bh-money').dataset.step).toBe('takenHome')
  })

  it('works in Hindi and Telugu and reads aloud in that language', async () => {
    render(<Shell at="/helper" />)
    await act(async () => app.setLang('hi'))
    expect(id('bh-welcome').textContent).toContain('आज मैं आपके व्यापार में कैसे मदद करूँ?')
    await act(async () => app.setLang('te'))
    expect(id('bh-welcome').textContent).toContain('ఈ రోజు మీ వ్యాపారానికి నేను ఎలా సహాయం చేయను?')
    await click(within(id('helper-home')).getByTestId('tts-play'))
    await act(async () => {
      for (let i = 0; i < 5; i++) await flush()
    })
    expect(synth.spoken.at(-1)?.lang).toBe('te-IN')
  })

  it('lesson links open the right module; Back returns to the helper home', async () => {
    render(<Shell at="/helper/money" />)
    await click(id('bh-step-back'))
    expect(path).toBe('/helper')
    cleanup()
    render(<Shell at="/helper/money" />)
    await click(id('bh-scenario-household'))
    await keys('800')
    await click(id('bh-amount-confirm'))
    await keys('150')
    await click(id('bh-amount-confirm'))
    await click(id('bh-why-link'))
    expect(path).toBe('/lessons/m5')
    expect(id('module-not-ready')).toBeTruthy() // Two pockets is taught with the coach for now: said honestly
  })

  it('nothing from the helper is stored and learner progress is untouched', async () => {
    render(<Shell at="/helper/money" />)
    const before = new Map(store.keys().map((k) => [k, store.getItem(k)]))
    await click(id('bh-scenario-credit'))
    await keys('500')
    await click(id('bh-amount-confirm'))
    await keys('400')
    await click(id('bh-amount-confirm'))
    const after = new Map(store.keys().map((k) => [k, store.getItem(k)]))
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort())
    for (const [k, v] of after) expect(v, k).toBe(before.get(k))
    expect([...after.values()].join(' ')).not.toMatch(/"received"|bh\./)
  })
})
