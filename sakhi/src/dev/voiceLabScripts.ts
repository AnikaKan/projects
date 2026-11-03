// Identical sample scripts for comparing voices across engines. Fictional content only.
// Lesson lines are taken from the real lesson text so we evaluate what learners will actually hear.
import type { Lang } from '../i18n/strings'
import { REVENUE_VS_PROFIT as C } from '../learning/content/revenueVsProfit'
import { text, valuesFor } from '../learning/render'

export interface TtsScript {
  id: string
  title: string
  /** What this line is testing. */
  focus: string
  text: Record<Lang, string>
}

const lesson = (key: string, b: 'vegetable' | 'grocery' = 'vegetable') =>
  ({ en: text(C, 'en', b, key, valuesFor(C, b, 'example')), hi: text(C, 'hi', b, key, valuesFor(C, b, 'example')), te: text(C, 'te', b, key, valuesFor(C, b, 'example')) }) as Record<Lang, string>

export const TTS_SCRIPTS: TtsScript[] = [
  {
    id: 'greeting',
    title: 'Warm greeting',
    focus: 'Warmth, respectful tone',
    text: {
      en: 'Namaste! Today we will look at your shop’s money together.',
      hi: 'नमस्ते! आज हम साथ में आपकी दुकान के पैसों को समझेंगे।',
      te: 'నమస్తే! ఈ రోజు మనం కలిసి మీ దుకాణం డబ్బు గురించి చూద్దాం.',
    },
  },
  { id: 'example', title: 'Lesson example (₹500 / ₹300 / ₹200)', focus: 'Small rupee amounts, pacing', text: lesson('example.0') },
  { id: 'grocery', title: 'Larger amounts (₹1,500 / ₹1,200)', focus: 'Thousands with Indian grouping', text: lesson('example.0', 'grocery') },
  {
    id: 'equation',
    title: 'Worked sum',
    focus: 'Operators read as words, number clarity',
    text: { en: '₹800 − ₹450 − ₹50 − ₹30 = ₹270.', hi: '₹800 − ₹450 − ₹50 − ₹30 = ₹270।', te: '₹800 − ₹450 − ₹50 − ₹30 = ₹270.' },
  },
  {
    id: 'codemix',
    title: 'Code-mixed sentence',
    focus: 'English finance words inside Hindi/Telugu',
    text: {
      en: 'Your profit, that is your munafa, is ₹200 today.',
      hi: 'आज आपका profit 200 रुपये है, और stock का खर्च 300 रुपये था।',
      te: 'ఈ రోజు మీ profit 200 రూపాయలు, stock ఖర్చు 300 రూపాయలు.',
    },
  },
  { id: 'feedback', title: 'Encouraging correction', focus: 'Gentle tone on a mistake', text: { en: text(C, 'en', 'vegetable', 'fb.response.revenue', valuesFor(C, 'vegetable', 'response')), hi: text(C, 'hi', 'vegetable', 'fb.response.revenue', valuesFor(C, 'vegetable', 'response')), te: text(C, 'te', 'vegetable', 'fb.response.revenue', valuesFor(C, 'vegetable', 'response')) } },
]

export interface SttPrompt {
  id: string
  /** What the evaluator should say aloud (shown on screen). */
  say: Record<Lang, string>
  /** Amount we expect the app to recognise. */
  expectAmount: number
  kind: 'digits' | 'words' | 'colloquial' | 'codemix'
}

export const STT_PROMPTS: SttPrompt[] = [
  { id: 'two-hundred', kind: 'words', expectAmount: 200, say: { en: 'two hundred rupees', hi: 'दो सौ रुपये', te: 'రెండు వందల రూపాయలు' } },
  { id: 'two-fifty', kind: 'words', expectAmount: 250, say: { en: 'two hundred and fifty', hi: 'दो सौ पचास', te: 'రెండు వందల యాభై' } },
  { id: 'fifteen-hundred', kind: 'colloquial', expectAmount: 1500, say: { en: 'fifteen hundred', hi: 'पंद्रह सौ / डेढ़ हज़ार', te: 'వెయ్యి ఐదు వందలు' } },
  { id: 'three-seventy', kind: 'words', expectAmount: 370, say: { en: 'three hundred seventy', hi: 'तीन सौ सत्तर', te: 'మూడు వందల డెబ్బై' } },
  { id: 'codemix', kind: 'codemix', expectAmount: 200, say: { en: 'my profit is two hundred', hi: 'मेरा profit दो सौ rupees है', te: 'నా profit రెండు వందలు' } },
]
