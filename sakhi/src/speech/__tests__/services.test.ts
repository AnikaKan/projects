import { describe, expect, it, vi } from 'vitest'
import { chunkForSpeech, LANGUAGES, toSpeakable } from '../languages'
import { parseSpokenAmount } from '../numbers'
import { matchSpokenAnswer } from '../answerMatching'
import { SpeechRecognitionService, SttError } from '../SpeechRecognitionService'
import { NORMAL_RATE, SLOW_RATE } from '../SpeechSynthesisService'
import { flush, RecognitionHarness, SynthHarness, V } from './fakes'

const code = async (p: Promise<unknown>) => {
  try {
    await p
    return 'resolved'
  } catch (e) {
    return (e as SttError).code
  }
}

describe('central language configuration', () => {
  it('maps the three languages to en-IN, hi-IN, te-IN with native names', () => {
    expect(LANGUAGES.en).toMatchObject({ bcp47: 'en-IN', native: 'English' })
    expect(LANGUAGES.hi).toMatchObject({ bcp47: 'hi-IN', native: 'हिन्दी' })
    expect(LANGUAGES.te).toMatchObject({ bcp47: 'te-IN', native: 'తెలుగు' })
  })

  it('Hindi and Telugu never list an English voice as acceptable', () => {
    expect(LANGUAGES.hi.voiceLangs.every((l) => l.startsWith('hi'))).toBe(true)
    expect(LANGUAGES.te.voiceLangs.every((l) => l.startsWith('te'))).toBe(true)
  })

  it('reads rupee amounts clearly in each language', () => {
    expect(toSpeakable('₹1,500 − ₹300 = ₹1,200', 'en')).toBe('1500 rupees minus 300 rupees equals 1200 rupees')
    expect(toSpeakable('₹500 − ₹300 = ₹200।', 'hi')).toBe('500 रुपये घटा 300 रुपये बराबर 200 रुपये।')
    expect(toSpeakable('లాభం: ₹270.', 'te')).toBe('లాభం: 270 రూపాయలు.')
  })

  it('splits long text into sentence chunks', () => {
    const long = 'One sentence here. '.repeat(20)
    const chunks = chunkForSpeech(long, 60)
    expect(chunks.length).toBeGreaterThan(3)
    expect(chunks.every((c) => c.length <= 60)).toBe(true)
  })
})

describe('recognising spoken financial amounts', () => {
  it.each([
    ['₹1,500', 1500],
    ['200 rupees', 200],
    ['five hundred', 500],
    ['two hundred and fifty', 250],
    ['fifteen hundred', 1500],
    ['one thousand five hundred rupees', 1500],
    ['पाँच सौ', 500],
    ['पांच सौ रुपये', 500],
    ['दो सौ पचास', 250],
    ['तीन सौ सत्तर', 370],
    ['पंद्रह सौ', 1500],
    ['एक हज़ार पाँच सौ', 1500],
    ['डेढ़ हज़ार', 1500],
    ['ढाई सौ', 250],
    ['do sau rupees', 200],
    ['ఐదు వందలు', 500],
    ['ఐదొందలు', 500],
    ['రెండు వందల యాభై', 250],
    ['మూడు వందల డెబ్బై రూపాయలు', 370],
    ['వెయ్యి ఐదు వందలు', 1500],
    ['వంద', 100],
    ['aidu vandalu', 500],
    ['రెండు వందల fifty', 250],
  ])('“%s” → %i', (spoken, amount) => {
    expect(parseSpokenAmount(spoken)).toBe(amount)
  })

  it.each(['hello', 'नमस्ते', 'నమస్తే', ''])('no amount in “%s”', (spoken) => {
    expect(parseSpokenAmount(spoken)).toBeNull()
  })
})

describe('matching a transcript to on-screen options', () => {
  const amounts = [
    { id: 'left', label: '₹200', amount: 200 },
    { id: 'sales', label: '₹500', amount: 500 },
    { id: 'added', label: '₹800', amount: 800 },
    { id: 'unsure', label: 'Not sure' },
  ]
  const yesNo = (lang: 'en' | 'hi' | 'te') => [
    { id: 'yes', label: { en: 'Yes', hi: 'हाँ', te: 'అవును' }[lang] },
    { id: 'no', label: { en: 'No', hi: 'नहीं', te: 'లేదు' }[lang] },
    { id: 'unsure', label: { en: 'I’m not sure', hi: 'पता नहीं', te: 'తెలియదు' }[lang] },
  ]

  it('spoken amounts in all three languages pick the same option', () => {
    expect(matchSpokenAnswer('two hundred', 'en', amounts)).toMatchObject({ status: 'match', optionId: 'left' })
    expect(matchSpokenAnswer('दो सौ', 'hi', amounts)).toMatchObject({ status: 'match', optionId: 'left' })
    expect(matchSpokenAnswer('రెండు వందలు', 'te', amounts)).toMatchObject({ status: 'match', optionId: 'left' })
  })

  it('amount said but not among the options → no match (never guesses)', () => {
    expect(matchSpokenAnswer('three hundred', 'en', amounts)).toMatchObject({ status: 'no_match', reason: 'amount_not_offered' })
    expect(matchSpokenAnswer('profit is good', 'en', amounts)).toEqual({ status: 'no_match', reason: 'no_amount' })
  })

  it.each([
    ['en', 'yes it is', 'yes'],
    ['en', 'no', 'no'],
    ['hi', 'हाँ', 'yes'],
    ['hi', 'nahi', 'no'],
    ['te', 'అవును', 'yes'],
    ['te', 'లేదు', 'no'],
    ['hi', 'पता नहीं', 'unsure'],
    ['te', 'teliyadu', 'unsure'],
  ] as const)('%s “%s” → %s', (lang, said, id) => {
    expect(matchSpokenAnswer(said, lang, yesNo(lang))).toMatchObject({ status: 'match', optionId: id })
  })

  it('contradictory or empty speech is not matched', () => {
    expect(matchSpokenAnswer('yes no', 'en', yesNo('en'))).toMatchObject({ status: 'no_match' })
    expect(matchSpokenAnswer('   ', 'en', yesNo('en'))).toEqual({ status: 'no_match', reason: 'empty' })
  })

  it('accepts natural Hindi/Telugu words and English loanwords for text options', () => {
    const check = [
      { id: 'up', label: 'हाँ, क्योंकि बिक्री बढ़ी' },
      { id: 'down', label: 'नहीं, मुनाफ़ा घटा' },
    ]
    expect(matchSpokenAnswer('मुनाफ़ा कम हुआ', 'hi', check)).toMatchObject({ optionId: 'down' })
    expect(matchSpokenAnswer('profit taggindi', 'te', [{ id: 'up', label: 'అవును' }, { id: 'down', label: 'లేదు' }])).toMatchObject({ optionId: 'down' })
  })
})

describe('SpeechRecognitionService', () => {
  it('reports unsupported browsers without touching the microphone', async () => {
    const s = new SpeechRecognitionService({ setTimeout, clearTimeout })
    expect(s.isSupported()).toBe(false)
    expect(await code(s.listen('hi'))).toBe('unsupported')
  })

  it.each([
    ['en', 'en-IN'],
    ['hi', 'hi-IN'],
    ['te', 'te-IN'],
  ] as const)('%s uses recognition language %s, single utterance, interim results', async (lang, tag) => {
    const h = new RecognitionHarness()
    h.script = { kind: 'result', transcript: 'x' }
    await h.service().listen(lang)
    expect(h.started).toEqual([{ lang: tag, continuous: false, interimResults: true }])
  })

  it('permission granted: returns final words, alternatives and interim updates', async () => {
    const h = new RecognitionHarness()
    h.script = { kind: 'result', transcript: 'దో సౌ', interim: 'దో', alternatives: ['do sau'] }
    const onInterim = vi.fn()
    const onStart = vi.fn()
    const r = await h.service().listen('te', { onStart, onInterim })
    expect(onStart).toHaveBeenCalledOnce()
    expect(onInterim).toHaveBeenCalledWith('దో')
    expect(r).toMatchObject({ transcript: 'దో సౌ', lang: 'te-IN' })
    expect(r.alternatives.map((a) => a.transcript)).toEqual(['దో సౌ', 'do sau'])
  })

  it('permission denied → permission-denied', async () => {
    const h = new RecognitionHarness()
    h.script = { kind: 'error', error: 'not-allowed' }
    expect(await code(h.service().listen('en'))).toBe('permission-denied')
  })

  it('silence → no-speech; nothing understood → no-match', async () => {
    const h = new RecognitionHarness()
    h.script = { kind: 'error', error: 'no-speech' }
    expect(await code(h.service().listen('hi'))).toBe('no-speech')
    h.script = { kind: 'silence' }
    expect(await code(h.service().listen('hi'))).toBe('no-match')
    h.script = { kind: 'result', transcript: '   ' }
    expect(await code(h.service().listen('hi'))).toBe('no-match')
  })

  it('times out to no-speech if the engine never answers', async () => {
    const h = new RecognitionHarness()
    h.script = { kind: 'hang' }
    expect(await code(h.service().listen('en', {}, 20))).toBe('no-speech')
  })

  it('an engine that never starts capturing is reported (not left spinning)', async () => {
    const h = new RecognitionHarness()
    h.script = { kind: 'dead' }
    expect(await code(h.service().listen('hi', {}, 1000, 20))).toBe('unknown')
  })

  it('never falls back to English when Telugu is rejected', async () => {
    const h = new RecognitionHarness()
    h.script = { kind: 'rejectLangs', langs: ['te-IN'], then: { kind: 'result', transcript: 'ok' } }
    expect(await code(h.service().listen('te'))).toBe('language-unsupported')
    expect(h.started.map((s) => s.lang)).toEqual(['te-IN'])
  })

  it('offline → network error without starting', async () => {
    const h = new RecognitionHarness()
    expect(await code(h.service({ navigator: { onLine: false } }).listen('en'))).toBe('network')
    expect(h.started).toEqual([])
  })

  it('abort cancels the current capture; a second listen while busy is refused', async () => {
    const h = new RecognitionHarness()
    h.script = { kind: 'hang' }
    const s = h.service()
    const p = s.listen('en')
    expect(await code(s.listen('en'))).toBe('busy')
    await flush()
    s.abort()
    expect(await code(p)).toBe('aborted')
    expect(s.isListening()).toBe(false)
  })

  it('reads microphone permission state without prompting', async () => {
    const h = new RecognitionHarness()
    const denied = h.service({ navigator: { onLine: true, permissions: { query: async () => ({ state: 'denied' }) } } })
    expect(await denied.microphonePermission()).toBe('denied')
    expect(await h.service().microphonePermission()).toBe('unknown')
    expect(h.started).toEqual([])
  })
})

describe('SpeechSynthesisService', () => {
  it('picks a voice for the exact language, accepting hi / te_IN tag variants', async () => {
    const h = new SynthHarness([V.enUS, V.hi, V.teIN])
    const s = h.service()
    expect((await s.voiceFor('hi'))?.name).toBe('espeak hi')
    expect((await s.voiceFor('te'))?.name).toBe('Telugu India')
    expect((await s.voiceFor('en'))?.lang).toBe('en-US')
  })

  it('prefers en-IN and local voices when several match', async () => {
    const s = new SynthHarness([V.enUS, V.enIN, V.hiIN, { ...V.hiIN, name: 'local hi', localService: true }]).service()
    expect((await s.voiceFor('en'))?.lang).toBe('en-IN')
    expect((await s.voiceFor('hi'))?.name).toBe('local hi')
  })

  it('no Telugu voice → reports no-voice and stays silent (no English voice substitution)', async () => {
    const h = new SynthHarness([V.enIN, V.enUS])
    const r = await h.service().speak('మీ లాభం ₹200', 'te')
    expect(r).toEqual({ ok: false, reason: 'no-voice' })
    expect(h.spoken).toEqual([])
  })

  it('unsupported browser → unsupported', async () => {
    const r = await new (await import('../SpeechSynthesisService')).SpeechSynthesisService({ setTimeout }).speak('hi', 'en')
    expect(r).toEqual({ ok: false, reason: 'unsupported' })
  })

  it('waits for voices that load late (voiceschanged)', async () => {
    const h = new SynthHarness([V.hiIN], { lateVoices: true })
    const s = h.service()
    const p = s.voiceFor('hi')
    h.loadVoicesNow()
    expect((await p)?.lang).toBe('hi-IN')
  })

  it('speaks Hindi with the Hindi voice, hi-IN tag, amounts as words, normal and slow rate', async () => {
    const h = new SynthHarness([V.enIN, V.hiIN])
    const s = h.service()
    expect(await s.speak('लाभ ₹200 है।', 'hi')).toEqual({ ok: true })
    expect(h.spoken[0]).toMatchObject({ text: 'लाभ 200 रुपये है।', lang: 'hi-IN', rate: NORMAL_RATE })
    expect(h.spoken[0].voice?.lang).toBe('hi-IN')
    await s.speak('फिर से', 'hi', { slow: true })
    expect(h.spoken[1].rate).toBe(SLOW_RATE)
  })

  it('prevents overlap: new speech cancels the old one', async () => {
    const h = new SynthHarness([V.enIN])
    h.hold = true
    const s = h.service()
    const first = s.speak('First text.', 'en', { owner: 'a' })
    await flush()
    expect(s.getState()).toEqual({ state: 'speaking', owner: 'a' })
    const second = s.speak('Second text.', 'en', { owner: 'b' })
    expect(await first).toEqual({ ok: false, reason: 'interrupted' })
    await flush()
    expect(h.cancels).toBeGreaterThan(0)
    expect(s.getState().owner).toBe('b')
    h.finish()
    expect(await second).toEqual({ ok: true })
    expect(s.getState().state).toBe('idle')
  })

  it('pause, resume and stop', async () => {
    const h = new SynthHarness([V.teIN])
    h.hold = true
    const s = h.service()
    const p = s.speak('ఈ రోజు అమ్మకాలు.', 'te')
    await flush()
    s.pause()
    expect(s.getState().state).toBe('paused')
    expect(h.pauses).toBe(1)
    s.resume()
    expect(s.getState().state).toBe('speaking')
    s.stop()
    expect(s.getState().state).toBe('idle')
    expect(await p).toEqual({ ok: false, reason: 'interrupted' })
  })

  it('reads long text as a sequence of sentence chunks, one at a time', async () => {
    const h = new SynthHarness([V.enIN])
    const text = Array.from({ length: 8 }, (_, i) => `This is sentence number ${i + 1} about sales and profit.`).join(' ')
    expect(await h.service().speak(text, 'en')).toEqual({ ok: true })
    expect(h.spoken.length).toBeGreaterThan(1)
    expect(h.spoken.map((u) => u.text).join(' ')).toBe(toSpeakable(text, 'en'))
  })
})
