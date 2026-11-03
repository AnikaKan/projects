// Approved weekly challenges (practical activities at the stall) and the deterministic follow-up rules.
// Hindi and Telugu wording: drafts pending native-speaker review, like all other learner copy.
// Activities never ask the learner to write down or share real amounts, names or records.
import type { Lang } from '../i18n/strings'
import type { Business } from '../lib/calc'
import type { Concept, LessonId } from '../assessment/types'
import { LESSONS } from '../learning/storage'
import { text } from '../learning/render'
import type { CheckInStatus, Difficulty } from './types'

export type ChallengeKind = 'main' | 'smaller' | 'easier' | 'stretch'

export interface ChallengeSpec {
  id: string
  concept: Concept
  lessonId: LessonId
  kind: ChallengeKind
  status: 'approved' | 'draft'
  /** Wording: either taken from the approved lesson text, or written here per language. */
  text: { lessonKey: string } | Record<Lang, string>
  followUps: Partial<Record<Exclude<ChallengeKind, 'main'>, string>>
}

export const CHALLENGES: ChallengeSpec[] = [
  {
    id: 'rvp.main',
    concept: 'revenue_vs_profit',
    lessonId: 'revenue_vs_profit',
    kind: 'main',
    status: 'approved',
    text: { lessonKey: 'challenge' }, // business-specific activity from the lesson itself
    followUps: { smaller: 'rvp.oneEvening', easier: 'rvp.explain', stretch: 'exp.oneExpense' },
  },
  {
    id: 'rvp.oneEvening',
    concept: 'revenue_vs_profit',
    lessonId: 'revenue_vs_profit',
    kind: 'smaller',
    status: 'approved',
    text: {
      en: 'On just one evening this week, count your sales money. Then take away what you paid for the goods you sold. Notice what is left.',
      hi: 'इस हफ़्ते बस एक शाम अपनी बिक्री का पैसा गिनें। फिर बेचे गए माल के पैसे घटाएँ। देखें कि कितना बचा।',
      te: 'ఈ వారం ఒక్క సాయంత్రం మాత్రమే మీ అమ్మకాల డబ్బు లెక్కపెట్టండి. తర్వాత అమ్మిన సరుకు కోసం చెల్లించింది తీసేయండి. ఎంత మిగిలిందో గమనించండి.',
    },
    followUps: { easier: 'rvp.explain', stretch: 'rvp.main' },
  },
  {
    id: 'rvp.explain',
    concept: 'revenue_vs_profit',
    lessonId: 'revenue_vs_profit',
    kind: 'easier',
    status: 'approved',
    text: {
      en: 'Explain to someone at home the difference between sales and profit, using one day at your stall as the example.',
      hi: 'घर पर किसी को बिक्री और मुनाफ़े का फ़र्क समझाएँ। उदाहरण के लिए अपनी दुकान का एक दिन लें।',
      te: 'ఇంట్లో ఎవరికైనా అమ్మకాలకు, లాభానికి తేడా వివరించండి. ఉదాహరణగా మీ దుకాణంలో ఒక రోజు తీసుకోండి.',
    },
    followUps: { smaller: 'rvp.oneEvening', stretch: 'rvp.main' },
  },
  {
    id: 'exp.oneExpense',
    concept: 'business_expenses',
    lessonId: 'business_expenses',
    kind: 'main',
    status: 'approved',
    text: {
      en: 'Find one cost of running your business that you usually forget, like spoiled goods, gas, bags or auto fare. Tell your coach about it at the next visit.',
      hi: 'अपने व्यापार का एक ऐसा खर्च पहचानें जो आप अक्सर भूल जाती हैं, जैसे खराब माल, गैस, थैलियाँ या ऑटो का किराया। अगली मुलाक़ात में कोच को बताएँ।',
      te: 'మీరు సాధారణంగా మర్చిపోయే ఒక వ్యాపార ఖర్చును గుర్తించండి, ఉదాహరణకు పాడైన సరుకు, గ్యాస్, సంచులు లేదా ఆటో ఛార్జీ. తర్వాతి కలయికలో కోచ్‌కు చెప్పండి.',
    },
    followUps: { smaller: 'exp.oneExpense' },
  },
  {
    id: 'sep.twoPlaces',
    concept: 'business_household_separation',
    lessonId: 'business_household_separation',
    kind: 'main',
    status: 'approved',
    text: {
      en: 'On 3 days this week, keep business money and household money in two separate places, like two tins or two pouches.',
      hi: 'इस हफ़्ते 3 दिन व्यापार का पैसा और घर का पैसा दो अलग जगह रखें, जैसे दो डिब्बे या दो थैलियाँ।',
      te: 'ఈ వారం 3 రోజులు వ్యాపారం డబ్బు, ఇంటి డబ్బు రెండు వేర్వేరు చోట్ల ఉంచండి, ఉదాహరణకు రెండు డబ్బాలు లేదా రెండు సంచులు.',
    },
    followUps: { smaller: 'sep.oneDay' },
  },
  {
    id: 'sep.oneDay',
    concept: 'business_household_separation',
    lessonId: 'business_household_separation',
    kind: 'smaller',
    status: 'approved',
    text: {
      en: 'For just one day, keep business money and household money in two separate places.',
      hi: 'बस एक दिन के लिए व्यापार का पैसा और घर का पैसा दो अलग जगह रखें।',
      te: 'ఒక్క రోజు మాత్రమే వ్యాపారం డబ్బు, ఇంటి డబ్బు రెండు వేర్వేరు చోట్ల ఉంచండి.',
    },
    followUps: { stretch: 'sep.twoPlaces' },
  },
]

export const CHALLENGES_BY_ID: Record<string, ChallengeSpec> = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]))

/** The main activity offered at the end of a lesson (only approved ones). */
export function mainChallengeFor(lessonId: LessonId): ChallengeSpec | null {
  return CHALLENGES.find((c) => c.lessonId === lessonId && c.kind === 'main' && c.status === 'approved') ?? null
}

export function challengeWording(id: string, lang: Lang, business: Business): string {
  const spec = CHALLENGES_BY_ID[id]
  if (!spec) throw new Error(`Unknown challenge ${id}`)
  if ('lessonKey' in spec.text) {
    const content = LESSONS[spec.lessonId]
    if (!content) throw new Error(`Challenge ${id} needs lesson content for ${spec.lessonId}`)
    return text(content, lang, business, spec.text.lessonKey)
  }
  return spec.text[lang]
}

export interface FollowUpPlan {
  /** Approved activity to offer next (learner can accept or say "not now"). */
  challengeId: string | null
  /** Learner-facing response, chosen by rule. Never critical of incomplete work. */
  messageKey: 'ci.msg.done' | 'ci.msg.partly' | 'ci.msg.notYetBusy' | 'ci.msg.notYetUnclear'
  /** Suggest replaying the lesson when the activity itself was unclear. */
  suggestReplay: boolean
}

const UNCLEAR: Difficulty[] = ['notClear', 'hardToCount']

/**
 * Deterministic follow-up rule:
 * - done → stretch activity (if any)
 * - unclear / hard to count (any status except done) → easier activity + offer to replay the lesson
 * - partly, or not yet for practical reasons (time, forgot, shop closed) → a smaller version
 * Falls back to the same activity when no variant exists.
 */
export function planFollowUp(challengeId: string, status: CheckInStatus, difficulties: Difficulty[]): FollowUpPlan {
  const spec = CHALLENGES_BY_ID[challengeId]
  const pick = (k: keyof ChallengeSpec['followUps']) => spec?.followUps[k] ?? null
  if (status === 'done') return { challengeId: pick('stretch'), messageKey: 'ci.msg.done', suggestReplay: false }
  if (difficulties.some((d) => UNCLEAR.includes(d)))
    return { challengeId: pick('easier') ?? pick('smaller') ?? challengeId, messageKey: 'ci.msg.notYetUnclear', suggestReplay: true }
  return {
    challengeId: pick('smaller') ?? challengeId,
    messageKey: status === 'partly' ? 'ci.msg.partly' : 'ci.msg.notYetBusy',
    suggestReplay: false,
  }
}
