// Presentation demo (/demo): ONE abbreviated diagnostic question for a fictional learner, scored by the REAL
// assessment engine and turned into a recommendation and coach guidance by the REAL rules.
//
// · The question is a plain-language demo wording of approved item `rvp_a_is_sales_profit` (same concept, same
//   Yes / No / Not sure options and the same option → outcome rules). It is illustrative: it was not requested
//   by any partner organisation.
// · One question is NOT a full assessment. The demo says so on screen.
// · Demo state lives in memory (+ sessionStorage key below) and never touches real learner records.
import type { Lang } from '../i18n/strings'
import { currentItemId, finalize, renderQuestion, startAssessment, submitAnswer, TIER_GATE } from '../assessment/engine'
import type { AssessmentResult, ScoredAnswer } from '../assessment/types'
import { createProfile, deriveProgress, markOnboarded, recordAssessment } from '../progress/engine'
import type { LearnerProfile } from '../progress/types'
import { buildRecommendation, type CoachingRecommendation } from '../coaching/model'
import { exampleAmounts } from '../coaching/playbook'

export const DEMO_ITEM_ID = 'rvp_a_is_sales_profit'
export const DEMO_STORAGE_KEY = 'hs-presentation-demo.v1' // deliberately outside the app's "hisaab." key space
export const DEMO_LEARNER = { learnerId: 'PD-01', alias: { en: 'Saraswathi', hi: 'सरस्वती', te: 'సరస్వతి' }, business: 'vegetable' as const }
export type DemoLang = 'en' | 'hi' | 'te'

/** Demo wording (en from the brief; hi / te are developer drafts pending native review). */
export const DEMO_QUESTION: Record<DemoLang, string> = {
  en: 'You sold ₹500 worth of vegetables today. Does that mean you made ₹500 in profit?',
  hi: 'आज आपने ₹500 की सब्ज़ियाँ बेचीं। क्या इसका मतलब है कि आपको ₹500 का मुनाफ़ा हुआ?',
  te: 'ఈ రోజు మీరు ₹500 విలువైన కూరగాయలు అమ్మారు. అంటే మీకు ₹500 లాభం వచ్చిందా?',
}

export interface DemoAnswer {
  optionId: string
  source: 'voice' | 'tap'
  /** Words recognised by the browser's speech service; only present when the microphone actually worked. */
  transcript?: string
  lang: DemoLang
  at: string
}

export interface DemoOutcome {
  answer: DemoAnswer
  scored: ScoredAnswer
  result: AssessmentResult
  /** Foundational when the anchor question (sales & profit) is not right — the diagnostic's own gate rule.
   *  null when she answered correctly: one question cannot place her at a level. */
  level: 'foundational' | null
  profile: LearnerProfile
  coaching: CoachingRecommendation
  amounts: { sales: number; cost: number; left: number }
}

export const demoChoices = (lang: Lang) => renderQuestion(DEMO_ITEM_ID, DEMO_LEARNER.business, lang).options

/** Scores the demo answer with the real engine (abbreviated one-item session) and builds the coach's view. */
export function scoreDemo(answer: DemoAnswer): DemoOutcome {
  const base = startAssessment({ learnerId: DEMO_LEARNER.learnerId, business: DEMO_LEARNER.business, attempt: 1, length: 3, now: answer.at })
  const session = { ...base, itemIds: [DEMO_ITEM_ID] } // abbreviated: one question only
  const id = currentItemId(session)!
  const { session: done, scored } = submitAnswer(session, { itemId: id, optionId: answer.optionId, source: answer.source, lang: answer.lang, answeredAt: answer.at })
  const raw = finalize(done, { now: answer.at })
  const anchorRight = done.answers.some((a) => a.concept === TIER_GATE.anchor && a.outcome.kind === 'correct')
  const level = anchorRight ? null : 'foundational'
  const result: AssessmentResult = { ...raw, tier: level ?? undefined }
  let profile = markOnboarded(createProfile({ learnerId: DEMO_LEARNER.learnerId, alias: DEMO_LEARNER.alias, language: answer.lang, business: DEMO_LEARNER.business, now: answer.at }))
  profile = recordAssessment(profile, result, answer.at)
  const coaching = buildRecommendation(profile, deriveProgress(profile))
  return { answer, scored, result, level, profile, coaching, amounts: exampleAmounts(DEMO_LEARNER.business) }
}

// ── Learner-facing result text (en / hi / te; hi / te are drafts) ─────

type Kind = 'misconception' | 'correct' | 'unsure'
export const outcomeKind = (o: DemoOutcome): Kind => (o.scored.outcome.kind === 'misconception' ? 'misconception' : o.scored.outcome.kind === 'correct' ? 'correct' : 'unsure')

export const RESULT_TEXT: Record<DemoLang, Record<string, string>> = {
  en: {
    title: 'Your next step',
    lesson: 'Recommended lesson',
    level: 'Suggested level',
    reason: 'Reason',
    foundational: 'Foundational',
    undetermined: 'Not yet known (one question is not enough)',
    'reason.misconception': 'Saraswathi’s response suggests she may be confusing total sales with profit.',
    'reason.unsure': 'Saraswathi was not sure whether sales and profit are the same.',
    'reason.correct': 'Saraswathi answered correctly: sales are not the same as profit. The next topic in the learning path is everyday costs.',
    sales: 'Sales',
    cost: 'Example cost of vegetables sold',
    left: 'Amount remaining before other expenses',
    leftNote: 'Not final profit: other costs (transport, bags…) still come out.',
    abbreviated: 'Demo: based on 1 question. The full check has 5.',
    coach: 'View Coach Guidance',
    withCoach: 'This lesson is taught with the coach for now.',
  },
  hi: {
    title: 'आपका अगला कदम',
    lesson: 'सुझाया गया पाठ',
    level: 'सुझाया गया स्तर',
    reason: 'कारण',
    foundational: 'बुनियादी',
    undetermined: 'अभी तय नहीं (एक सवाल काफ़ी नहीं)',
    'reason.misconception': 'सरस्वती के जवाब से लगता है कि वे कुल बिक्री को मुनाफ़ा समझ रही हैं।',
    'reason.unsure': 'सरस्वती पक्का नहीं थीं कि बिक्री और मुनाफ़ा एक हैं या नहीं।',
    'reason.correct': 'सरस्वती ने सही कहा: बिक्री और मुनाफ़ा एक नहीं हैं। सीखने के क्रम में अगला विषय रोज़ के खर्च है।',
    sales: 'बिक्री',
    cost: 'बेची गई सब्ज़ियों की उदाहरण कीमत',
    left: 'बाकी खर्चों से पहले बचा पैसा',
    leftNote: 'यह आख़िरी मुनाफ़ा नहीं: बाकी खर्च (ढुलाई, थैलियाँ…) अभी घटने हैं।',
    abbreviated: 'डेमो: 1 सवाल पर आधारित। पूरी जाँच में 5 सवाल हैं।',
    coach: 'कोच के लिए सलाह देखें',
    withCoach: 'यह पाठ अभी कोच के साथ होता है।',
  },
  te: {
    title: 'మీ తర్వాతి అడుగు',
    lesson: 'సూచించిన పాఠం',
    level: 'సూచించిన స్థాయి',
    reason: 'కారణం',
    foundational: 'ప్రాథమిక',
    undetermined: 'ఇంకా తెలియదు (ఒక్క ప్రశ్న సరిపోదు)',
    'reason.misconception': 'సరస్వతి జవాబు చూస్తే, ఆమె మొత్తం అమ్మకాలను లాభంగా భావిస్తున్నట్టు అనిపిస్తోంది.',
    'reason.unsure': 'అమ్మకాలు, లాభం ఒకటేనా అని సరస్వతికి ఖచ్చితంగా తెలియలేదు.',
    'reason.correct': 'సరస్వతి సరిగ్గా చెప్పారు: అమ్మకాలు, లాభం ఒకటి కాదు. నేర్చుకునే క్రమంలో తర్వాతి విషయం రోజువారీ ఖర్చులు.',
    sales: 'అమ్మకాలు',
    cost: 'అమ్మిన కూరగాయల ఉదాహరణ ఖర్చు',
    left: 'ఇతర ఖర్చులకు ముందు మిగిలినది',
    leftNote: 'ఇది చివరి లాభం కాదు: ఇతర ఖర్చులు (రవాణా, సంచులు…) ఇంకా తీసేయాలి.',
    abbreviated: 'డెమో: 1 ప్రశ్న ఆధారంగా. పూర్తి పరీక్షలో 5 ప్రశ్నలు.',
    coach: 'కోచ్ సూచనలు చూడండి',
    withCoach: 'ఈ పాఠం ప్రస్తుతం కోచ్‌తో జరుగుతుంది.',
  },
}

// ── Coach guidance (English: the coordinator's language in the presentation) ──

export interface CoachGuidance {
  why: string
  gap: string
  misconception: string | null
  reinforce: string
  question: string
  goal: string
}

/** Chosen by the scored outcome; amounts come from the item bank (₹500 / ₹300 for a vegetable stall). */
export function coachGuidance(o: DemoOutcome): CoachGuidance {
  const { sales, cost } = o.amounts
  const r = (n: number) => '₹' + new Intl.NumberFormat('en-IN').format(n)
  switch (outcomeKind(o)) {
    case 'misconception':
      return {
        why: `During her diagnostic, Saraswathi answered that ${r(sales)} in vegetable sales meant ${r(sales)} in profit. This suggests she may not yet understand the difference between sales and profit.`,
        gap: 'Understanding that sales revenue is not the same as profit.',
        misconception: 'She did not account for business costs when identifying profit.',
        reinforce: `Use a simple picture showing ${r(sales)} in vegetable sales and ${r(cost)} in the cost of vegetables sold. Ask Saraswathi how much remains after that cost, then discuss other expenses that may reduce profit.`,
        question: 'What are two expenses you pay to run your vegetable stall?',
        goal: 'Help Saraswathi distinguish sales from profit and recognize the impact of business expenses.',
      }
    case 'unsure':
      return {
        why: `During her diagnostic, Saraswathi said she was not sure whether ${r(sales)} in vegetable sales meant ${r(sales)} in profit.`,
        gap: 'Understanding that sales revenue is not the same as profit.',
        misconception: null,
        reinforce: `Use a simple picture showing ${r(sales)} in vegetable sales and ${r(cost)} in the cost of vegetables sold. Ask Saraswathi how much remains after that cost.`,
        question: 'What are two expenses you pay to run your vegetable stall?',
        goal: 'Help Saraswathi feel confident that profit is what remains after costs.',
      }
    case 'correct':
      return {
        why: `During her diagnostic, Saraswathi answered correctly that ${r(sales)} in vegetable sales does not mean ${r(sales)} in profit. The next topic in the learning path is Everyday costs.`,
        gap: 'No difficulty found on this question. One question is not a full check.',
        misconception: null,
        reinforce: 'Ask Saraswathi to explain her answer in her own words, then complete the full 5-question check together.',
        question: 'What are two expenses you pay to run your vegetable stall?',
        goal: 'Confirm her understanding and find her next topic with the full check.',
      }
  }
}

// ── Demo state (sessionStorage, presentation tab only) ────────────────

export type DemoStage = 'language' | 'question' | 'result' | 'coach'
export interface DemoState {
  stage: DemoStage
  lang: DemoLang
  answer: DemoAnswer | null
  submitted: boolean
}
export const INITIAL_DEMO: DemoState = { stage: 'language', lang: 'en', answer: null, submitted: false }

export function loadDemo(store: Pick<Storage, 'getItem'> | undefined): DemoState {
  try {
    const raw = store?.getItem(DEMO_STORAGE_KEY)
    if (!raw) return INITIAL_DEMO
    const s = JSON.parse(raw) as DemoState
    if (!['language', 'question', 'result', 'coach'].includes(s.stage)) return INITIAL_DEMO
    if (s.answer && !demoChoices('en').some((c) => c.id === s.answer!.optionId)) return INITIAL_DEMO
    return { ...INITIAL_DEMO, ...s }
  } catch {
    return INITIAL_DEMO
  }
}
