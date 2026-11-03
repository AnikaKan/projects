// "What should we work on today?" — the rules' recommendation, the playbook's coaching action, an optional
// "Why this lesson?" built only from her saved evidence, and the coach's accept / change controls.
import { useState } from 'react'
import { LESSON_CATALOG } from '../assessment/bank'
import type { LessonId } from '../assessment/types'
import { useApp, moduleOfLesson } from '../state/AppState'
import { MODULE_EMOJI } from '../components/moduleVisuals'
import { LESSONS } from '../learning/storage'
import { NoteRejected } from '../progress/engine'
import { OVERRIDE_REASONS, type CoachLevel, type LearnerProfile, type LevelReason, type OverrideReason } from '../progress/types'
import { DEFAULT_EVIDENCE_SHOWN, type CoachSummary } from '../coaching/model'
import { explain } from '../coaching/explain'
import { requestSimplerWording } from '../coaching/aiWording'
import { LevelChip } from './parts'

const LEVEL_REASON_OF: Record<OverrideReason, LevelReason> = {
  alreadyKnows: 'showedUnderstanding',
  needsReview: 'needsBasics',
  learnerRequest: 'learnerRequest',
  businessFit: 'other',
  shortOnTime: 'other',
  other: 'other',
}

export function RecommendationCard({ p, s }: { p: LearnerProfile; s: CoachSummary }) {
  const { tc, coachLang, acceptRecommendation } = useApp()
  const r = s.recommendation
  const [why, setWhy] = useState(false)
  const [all, setAll] = useState(false)
  const [adjust, setAdjust] = useState(false)
  const [ai, setAi] = useState<{ state: 'idle' | 'loading' | 'ai' | 'off'; text?: string }>({ state: 'idle' })
  const name = p.alias[coachLang]
  const x = explain(r, { lang: coachLang, name, business: p.business })
  const m = moduleOfLesson(r.recommendedLessonId)
  const inApp = !!LESSONS[r.recommendedLessonId]
  const shown = all ? x.allEvidence : x.evidence

  const simpler = async () => {
    setAi({ state: 'loading' })
    const res = await requestSimplerWording(x.action, { lang: coachLang, name })
    setAi(res.ok ? { state: 'ai', text: res.text } : { state: 'off' })
  }

  return (
    <section
      className="rounded-2xl bg-brand-soft p-4 ring-1 ring-brand/30"
      data-testid="coach-recommended"
      data-lesson={r.recommendedLessonId}
      data-source={r.override ? 'coach' : 'rules'}
      data-rule={r.recommendationRuleId}
      data-level={r.recommendedLevel}
    >
      <h3 className="text-lg font-bold text-brand">💡 {tc('cv.today')}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-3xl" aria-hidden>
          {MODULE_EMOJI[m]}
        </span>
        <span className="text-2xl font-bold leading-snug" data-testid="rec-lesson">
          {tc(`${m}.title`)}
        </span>
        <LevelChip level={r.recommendedLevel} />
      </div>
      {!inApp && r.suggestedCoachingAction.topic !== 'start' && <p className="mt-1 text-sm font-semibold text-[#7A4A0E]">👩‍🏫 {tc('cv.noLessonYet')}</p>}
      {r.override && (
        <p className="mt-1 text-sm" data-testid="rec-override">
          <span className="font-semibold">{tc('coach.byCoach')}</span>: {tc(`override.${r.override.reason}`)}
          {r.override.note ? ` — “${r.override.note}”` : ''} · {tc('coach.appSuggested', { m: tc(`${moduleOfLesson(r.rules.lessonId)}.title`) })}
        </p>
      )}

      <div className="mt-3 space-y-2 rounded-xl bg-white p-3" data-testid="rec-action">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-muted">🎯 {tc('cv.action')}</div>
          <p className="text-lg font-bold leading-snug" data-testid="rec-action-text" data-ai={ai.state === 'ai'}>
            {ai.state === 'ai' ? ai.text : x.action}
          </p>
          {ai.state === 'ai' && (
            <p className="text-xs text-muted">
              ✨ {tc('cv.simplerNote')}{' '}
              <button className="font-semibold text-brand underline" onClick={() => setAi({ state: 'idle' })}>
                {tc('cv.simplerBack')}
              </button>
            </p>
          )}
          {ai.state === 'off' && (
            <p className="text-xs text-muted" data-testid="rec-ai-off">
              {tc('cv.simplerOff')}
            </p>
          )}
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-muted">🖼️ {tc('cv.activity')}</div>
          <p className="text-base leading-relaxed" data-testid="rec-activity">
            {x.activity}
          </p>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-muted">❓ {tc('cv.followQ')}</div>
          <p className="text-base leading-relaxed" data-testid="rec-question">
            {x.question}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          data-testid="why-toggle"
          aria-expanded={why}
          onClick={() => setWhy(!why)}
          className="inline-flex min-h-[48px] items-center gap-1.5 rounded-full bg-white px-4 text-base font-bold text-brand ring-2 ring-brand/40"
        >
          ❔ {why ? tc('cv.whyHide') : tc('cv.why')}
        </button>
        <button
          data-testid="accept-rec"
          disabled={!!r.acceptedAt}
          onClick={() => acceptRecommendation(p.learnerId)}
          className="inline-flex min-h-[48px] items-center gap-1.5 rounded-full bg-brand px-4 text-base font-bold text-white disabled:bg-leaf"
        >
          {r.acceptedAt ? `✓ ${tc('cv.accepted')}` : `✓ ${tc('cv.accept')}`}
        </button>
        <button data-testid="coach-adjust" onClick={() => setAdjust(!adjust)} className="inline-flex min-h-[48px] items-center gap-1.5 rounded-full bg-white px-4 text-base font-bold text-brand ring-1 ring-brand/40">
          ✏️ {tc('cv.change')}
        </button>
        {ai.state !== 'ai' && (
          <button data-testid="rec-simpler" disabled={ai.state === 'loading'} onClick={simpler} className="inline-flex min-h-[48px] items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted ring-1 ring-line disabled:opacity-60">
            ✨ {tc('cv.simpler')}
          </button>
        )}
      </div>

      {why && (
        <div className="mt-3 space-y-3 rounded-xl bg-white p-3 ring-1 ring-line" data-testid="why-panel" data-rule={r.recommendationRuleId} data-strength={r.evidenceStrength}>
          <p className="text-base font-semibold leading-relaxed" data-testid="why-headline">
            {x.headline}
          </p>
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-muted">📋 {tc('cv.whyEvidence')}</div>
            <ul className="mt-1 space-y-1.5" data-testid="why-evidence">
              {shown.map((t, i) => (
                <li key={i} className="flex gap-2 text-base leading-relaxed">
                  <span aria-hidden>•</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            {x.allEvidence.length > DEFAULT_EVIDENCE_SHOWN && (
              <button data-testid="why-more" onClick={() => setAll(!all)} className="mt-1 min-h-[40px] text-sm font-semibold text-brand underline">
                {all ? tc('cv.whyLess') : tc('cv.whyMore', { n: x.allEvidence.length })}
              </button>
            )}
          </div>
          {x.insufficient && (
            <p className="rounded-lg bg-marigold-soft p-2 text-sm font-semibold" data-testid="why-insufficient">
              ⚠️ {x.insufficient}
            </p>
          )}
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-muted">📘 {tc('cv.whyLearn')}</div>
            <p className="text-base leading-relaxed" data-testid="why-learn">
              {x.learn}
            </p>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-muted">⬆️ {tc('cv.whyFirst')}</div>
            <p className="text-base leading-relaxed" data-testid="why-priority">
              {x.priority}
            </p>
          </div>
          <p className="text-xs text-muted">{tc('cv.rule', { id: r.recommendationRuleId })}</p>
        </div>
      )}

      {adjust && <AdjustForm p={p} s={s} onDone={() => setAdjust(false)} />}
    </section>
  )
}

/** Coach changes the lesson and/or the difficulty level. A reason is required; the original evidence is kept. */
function AdjustForm({ p, s, onDone }: { p: LearnerProfile; s: CoachSummary; onDone: () => void }) {
  const { tc, changeRecommendation, overrideNextLesson, setLevel } = useApp()
  const r = s.recommendation
  const [to, setTo] = useState<LessonId>(r.recommendedLessonId)
  const [level, setLvl] = useState<CoachLevel>(r.recommendedLevel)
  const [reason, setReason] = useState<OverrideReason | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const changed = to !== r.recommendedLessonId || level !== r.recommendedLevel

  const save = () => {
    if (!reason) return
    try {
      if (to !== r.recommendedLessonId) changeRecommendation(p.learnerId, { toLessonId: to, reason, note })
      if (level !== r.recommendedLevel) setLevel(p.learnerId, level, LEVEL_REASON_OF[reason], note)
      onDone()
    } catch (e) {
      if (e instanceof NoteRejected) setError(tc(e.message === 'personal' ? 'coach.noteRejected' : 'coach.noteTooLong'))
      else throw e
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-white p-3 ring-1 ring-line" data-testid="adjust-form">
      <fieldset>
        <legend className="text-sm font-bold">{tc('coach.adjustTo')}</legend>
        <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
          {LESSON_CATALOG.filter((l) => l.status === 'approved').map((l) => (
            <label key={l.id} className={`flex min-h-[48px] items-center gap-2 rounded-xl px-2 text-base ring-1 ${to === l.id ? 'bg-brand-soft ring-brand' : 'ring-line'}`}>
              <input type="radio" name="to" value={l.id} checked={to === l.id} onChange={() => setTo(l.id)} data-testid={`adjust-to-${l.id}`} />
              <span aria-hidden>{MODULE_EMOJI[l.moduleId]}</span> {tc(`${l.moduleId}.title`)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-bold">{tc('cv.adjustLevel')}</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(['foundational', 'intermediate'] as CoachLevel[]).map((l) => (
            <label key={l} className={`flex min-h-[48px] items-center gap-2 rounded-xl px-3 text-base ring-1 ${level === l ? 'bg-brand-soft ring-brand' : 'ring-line'}`}>
              <input type="radio" name="lvl" checked={level === l} onChange={() => setLvl(l)} data-testid={`adjust-level-${l}`} />
              {tc(`cv.level.${l}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-bold">{tc('coach.adjustReason')}</legend>
        <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
          {OVERRIDE_REASONS.map((x) => (
            <label key={x} className={`flex min-h-[48px] items-center gap-2 rounded-xl px-2 text-base ring-1 ${reason === x ? 'bg-brand-soft ring-brand' : 'ring-line'}`}>
              <input type="radio" name="reason" value={x} checked={reason === x} onChange={() => setReason(x)} data-testid={`adjust-reason-${x}`} />
              {tc(`override.${x}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="text-sm font-bold">{tc('coach.adjustNote')}</span>
        <input
          data-testid="adjust-note"
          value={note}
          maxLength={200}
          onChange={(e) => {
            setNote(e.target.value)
            setError(null)
          }}
          className="mt-1 min-h-[48px] w-full rounded-xl px-3 text-base ring-1 ring-line focus:ring-2 focus:ring-brand"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-clay-soft p-2 text-sm" data-testid="adjust-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button data-testid="adjust-save" disabled={!reason || !changed} onClick={save} className="min-h-[48px] rounded-full bg-brand px-5 text-base font-bold text-white disabled:bg-disabled disabled:text-disabled-ink">
          {tc('coach.save')}
        </button>
        {r.override && (
          <button
            data-testid="adjust-revert"
            disabled={!reason}
            onClick={() => {
              if (!reason) return
              overrideNextLesson(p.learnerId, null, reason, note)
              onDone()
            }}
            className="min-h-[48px] rounded-full bg-white px-4 text-base font-bold text-brand ring-1 ring-brand/40 disabled:opacity-50"
          >
            ↩ {tc('coach.revert')}
          </button>
        )}
        <button onClick={onDone} className="min-h-[48px] rounded-full px-4 text-base font-semibold text-muted">
          {tc('coach.cancel')}
        </button>
      </div>
    </div>
  )
}
