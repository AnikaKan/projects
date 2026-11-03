// Coach View: coaching assistant for NGO field coordinators (prototype). Separate from the learner screens:
// reached only by pressing and holding the ₹ logo, or #/coach. Its language is the coach's own choice
// (en / hi / te), independent of each learner's language. All learners shown are fictional demo learners
// stored on this device. There is no sign-in or access control (see docs/COACH_VIEW_DESIGN.md).
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FlaskConical, LogOut, RotateCcw, ShieldCheck } from 'lucide-react'
import { LANGS } from '../i18n/strings'
import { PREVIEW_LANGS } from '../i18n/previewLanguages'
import { useApp } from '../state/AppState'
import { useOnline } from '../speech/SpeechContext'
import { STATUS_ORDER, homeCounts, type CoachSummary } from '../coaching/model'
import { LearnerProfileView } from './LearnerProfile'
import { CoachingSession } from './Session'
import { CoachHome } from './CoachHome'

export function CoachView({ session = false }: { session?: boolean }) {
  const { id } = useParams()
  const { tc, learners, coachSummaryOf } = useApp()
  const [confirmReset, setConfirmReset] = useState(false)
  const rows = useMemo(
    () =>
      learners
        .map((p) => ({ p, s: coachSummaryOf(p.learnerId)! }))
        .sort((a, b) => STATUS_ORDER[a.s.status] - STATUS_ORDER[b.s.status] || a.p.learnerId.localeCompare(b.p.learnerId)),
    [learners, coachSummaryOf],
  )
  const selected = rows.find((r) => r.p.learnerId === id)
  const counts = useMemo(() => homeCounts(rows.map((r) => r.s as CoachSummary)), [rows])

  return (
    <div className="flex h-full flex-col bg-paper text-ink" data-testid="coach-view">
      <CoachHeader onReset={() => setConfirmReset(true)} />
      <div className="flex items-center gap-2 bg-marigold-soft px-4 py-1 text-xs font-semibold text-[#7A4A0E]" role="note" data-testid="prototype-banner">
        <FlaskConical size={14} aria-hidden /> {tc('coach.prototype')} · {tc('cv.noSync')}
      </div>
      {confirmReset && <ResetDialog onClose={() => setConfirmReset(false)} />}

      <div className="mx-auto grid w-full max-w-6xl flex-1 overflow-hidden md:grid-cols-[minmax(340px,400px)_1fr]">
        <div className={`${selected ? 'hidden md:flex' : 'flex'} flex-col overflow-hidden border-line md:border-r`}>
          <CoachHome rows={rows} counts={counts} selectedId={id} />
        </div>
        <div className={`${selected ? 'flex' : 'hidden md:flex'} flex-col overflow-y-auto`}>
          {selected ? (
            session ? (
              <CoachingSession key={`s-${selected.p.learnerId}`} p={selected.p} s={selected.s} />
            ) : (
              <LearnerProfileView key={selected.p.learnerId} p={selected.p} s={selected.s} />
            )
          ) : (
            <div className="m-auto max-w-sm p-8 text-center text-muted">
              <ShieldCheck className="mx-auto mb-2" size={28} aria-hidden />
              {tc('coach.privacyLong')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CoachHeader({ onReset }: { onReset: () => void }) {
  const { tc, coachLang, setCoachLang } = useApp()
  const online = useOnline()
  const [more, setMore] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  return (
    <header className="bg-brand px-4 py-2.5 text-white">
      <div className="flex items-center gap-2">
        <div className="mr-auto min-w-0">
          <div className="truncate text-xs font-semibold uppercase tracking-wider text-white/80">Sakhi · {tc('cv.subtitle')}</div>
          <h1 className="text-xl font-bold leading-snug">{tc('cv.title')}</h1>
        </div>
        <button data-testid="coach-reset" onClick={onReset} aria-label={tc('coach.reset')} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full px-3 text-sm font-semibold text-white ring-1 ring-white/50 hover:bg-white/10">
          <RotateCcw size={18} aria-hidden /> <span className="hidden sm:inline">{tc('coach.reset')}</span>
        </button>
        <Link to="/home" aria-label={tc('coach.exit')} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full px-3 text-sm font-semibold text-white ring-1 ring-white/50 hover:bg-white/10">
          <LogOut size={18} aria-hidden /> <span className="hidden sm:inline">{tc('coach.exit')}</span>
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex rounded-full bg-white/15 p-1" role="group" aria-label="Coach language">
          {LANGS.map((l) => (
            <button
              key={l.code}
              lang={l.bcp47}
              data-testid={`coach-lang-${l.code}`}
              aria-pressed={coachLang === l.code}
              onClick={() => setCoachLang(l.code)}
              className={`min-h-[40px] rounded-full px-3 text-sm font-bold leading-normal ${coachLang === l.code ? 'bg-white text-brand' : 'text-white'}`}
            >
              {l.native}
            </button>
          ))}
          <button data-testid="coach-lang-more" aria-expanded={open} aria-label={tc('cv.moreLangs')} onClick={() => setOpen(!open)} className="min-h-[40px] rounded-full px-3 text-sm font-bold text-white">
            +
          </button>
        </div>
        <p className="flex items-center gap-1 text-xs text-white/90" data-testid="coach-sync" data-online={online}>
          <span aria-hidden>{online ? '💾' : '📴'}</span> {online ? tc('cv.saved') : tc('cv.offline')}
          <span className="sr-only"> · {tc('cv.noSync')}</span>
        </p>
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-white/10 p-2" data-testid="coach-more-langs">
          <span className="text-sm font-semibold">{tc('cv.moreLangs')}:</span>
          {PREVIEW_LANGS.map((l) => (
            <button
              key={l.code}
              lang={l.bcp47}
              data-testid={`coach-lang-soon-${l.code}`}
              onClick={() => setMore(l.native)}
              className="min-h-[40px] rounded-full border-2 border-dashed border-white/60 px-3 text-sm font-bold"
            >
              {l.native} · {tc('lang.preview')}
            </button>
          ))}
          {more && (
            <p className="w-full text-sm" role="status" data-testid="coach-lang-soon-note">
              {tc('cv.soonLang', { lang: more })}
            </p>
          )}
        </div>
      )}
    </header>
  )
}

function ResetDialog({ onClose }: { onClose: () => void }) {
  const { tc, resetDemo } = useApp()
  const navigate = useNavigate()
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="reset-title">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="reset-title" className="text-lg font-bold leading-snug">
          {tc('coach.resetConfirm')}
        </h2>
        <p className="mt-2 text-sm text-muted">{tc('coach.privacyLong')}</p>
        <div className="mt-4 flex gap-2">
          <button
            data-testid="coach-reset-yes"
            onClick={() => {
              resetDemo()
              onClose()
              navigate('/coach')
            }}
            className="min-h-[52px] flex-1 rounded-xl bg-clay px-4 font-bold text-white"
          >
            {tc('coach.resetYes')}
          </button>
          <button onClick={onClose} className="min-h-[52px] flex-1 rounded-xl bg-line px-4 font-bold">
            {tc('coach.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
