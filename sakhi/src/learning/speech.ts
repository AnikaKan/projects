// What each lesson step reads aloud. Pure builders shared by the UI and the audio pre-generation script,
// so pre-generated (cached) audio matches exactly what the app asks to speak.
import type { Lang } from '../i18n/strings'
import type { Business } from '../lib/calc'
import { initialState, replay } from './machine'
import { hasText, renderFeedback, renderQuestion, text, valuesFor, type RenderedFeedback } from './render'
import type { LessonContent, LessonEvent, LessonResult, QuestionId } from './types'

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

export const lessonSpeech = {
  result: (c: LessonContent, lang: Lang, b: Business, misconception: boolean) => text(c, lang, b, misconception ? 'result.misconception' : 'result.generic'),
  intro: (c: LessonContent, lang: Lang, b: Business, variant = 0) => clean(`${text(c, lang, b, 'h.intro')}. ${text(c, lang, b, `intro.${variant}`)}`),
  example: (c: LessonContent, lang: Lang, b: Business, variant = 0) => {
    const v = valuesFor(c, b, 'example')
    return clean(
      [text(c, lang, b, `example.${variant}`, v), text(c, lang, b, 'example.more', v), hasText(c, lang, b, 'example.note') ? text(c, lang, b, 'example.note', v) : ''].join(' '),
    )
  },
  question: (c: LessonContent, lang: Lang, b: Business, q: QuestionId) => {
    const rq = renderQuestion(c, q, b, lang)
    return clean([rq.stem, ...rq.options.map((o) => o.label)].join('. '))
  },
  feedback: (fb: RenderedFeedback) => clean([fb.message, fb.closing ?? ''].join(' ')),
  challenge: (c: LessonContent, lang: Lang, b: Business) => clean(`${text(c, lang, b, 'challenge.title')}. ${text(c, lang, b, 'challenge')}`),
  complete: (c: LessonContent, lang: Lang, b: Business, result: LessonResult) =>
    clean(`${text(c, lang, b, 'complete.title')}. ${text(c, lang, b, `complete.${result}`)} ${text(c, lang, b, 'complete.rule')}`),
}

const N: LessonEvent = { type: 'NEXT' }
const PREFIX: Record<QuestionId, LessonEvent[]> = {
  response: [N, N, N],
  practice: [N, N, N, { type: 'ANSWER', optionId: 'left' }, N],
  check: [N, N, N, { type: 'ANSWER', optionId: 'left' }, N, { type: 'ANSWER', optionId: 'profit' }, N],
}

/** Every standard (non-personal) text a lesson can speak, for pre-generating audio. */
export function standardLessonSpeech(c: LessonContent): { lang: Lang; business: Business; text: string }[] {
  const out = new Map<string, { lang: Lang; business: Business; text: string }>()
  const add = (lang: Lang, business: Business, t: string) => out.set(`${lang}|${t}`, { lang, business, text: t })
  for (const lang of ['en', 'hi', 'te'] as Lang[])
    for (const b of Object.keys(c.scenarios) as Business[]) {
      add(lang, b, lessonSpeech.result(c, lang, b, true))
      add(lang, b, lessonSpeech.result(c, lang, b, false))
      for (let i = 0; i < (c.explainVariants.intro ?? 1); i++) add(lang, b, lessonSpeech.intro(c, lang, b, i))
      for (let i = 0; i < (c.explainVariants.example ?? 1); i++) add(lang, b, lessonSpeech.example(c, lang, b, i))
      for (const q of ['response', 'practice', 'check'] as QuestionId[]) {
        add(lang, b, lessonSpeech.question(c, lang, b, q))
        const init = initialState({ content: c, business: b, now: 'pregen' })
        for (const o of c.questions[q].options) {
          const s = replay(init, [...PREFIX[q], { type: 'ANSWER', optionId: o.id }], c)
          const fb = renderFeedback(c, s, q, lang)
          if (fb) add(lang, b, lessonSpeech.feedback(fb))
          if (q === 'response' && fb?.tone === 'corrective') {
            const alt = renderFeedback(c, replay(s, [{ type: 'EXPLAIN_ANOTHER_WAY' }], c), q, lang)
            if (alt) add(lang, b, lessonSpeech.feedback(alt))
          }
          if (fb?.canRetry)
            for (const o2 of c.questions[q].options) {
              const s2 = replay(s, [{ type: 'RETRY' }, { type: 'ANSWER', optionId: o2.id }], c)
              const fb2 = renderFeedback(c, s2, q, lang)
              if (fb2) add(lang, b, lessonSpeech.feedback(fb2))
            }
        }
      }
      add(lang, b, lessonSpeech.challenge(c, lang, b))
      for (const r of ['understood', 'developing', 'needs_review'] as LessonResult[]) add(lang, b, lessonSpeech.complete(c, lang, b, r))
    }
  return [...out.values()]
}
