import { useMemo, useRef, useState } from 'react'
import type { Lang } from '../i18n/strings'
import type { LessonContent, LessonState } from '../learning/types'
import { useExplainService } from './AiContext'
import { createOfflineExplainService } from './explainClient'
import { stageFromState } from './pack'
import type { ExplainMode, ExplainResult, Stage } from './types'

export interface AiAssistState {
  stage: Stage | null
  mode: ExplainMode
  loading: boolean
  result: ExplainResult | null
  /** The machine already swapped in an approved alternative on screen (so a fallback card would repeat it). */
  machineChanged: boolean
}

/**
 * One AI request at a time for the current lesson stage. Results are discarded when the stage changes,
 * and a late reply from an older request never overwrites a newer one.
 */
export function useAiAssist(content: LessonContent, state: LessonState, lang: Lang, offline: boolean) {
  const online = useExplainService()
  const service = useMemo(() => (offline ? createOfflineExplainService('offline') : online), [offline, online])
  const [st, setSt] = useState<AiAssistState | null>(null)
  const seq = useRef(0)
  const stage = stageFromState(state)
  const current = st && st.stage === stage ? st : null

  const request = (mode: ExplainMode, opts: { state?: LessonState; learnerText?: string; machineChanged?: boolean } = {}) => {
    const forState = opts.state ?? state
    const id = ++seq.current
    const base = { stage: stageFromState(forState), mode, machineChanged: !!opts.machineChanged }
    setSt({ ...base, loading: true, result: null })
    service
      .explain({ content, state: forState, lang, mode, learnerText: opts.learnerText })
      .catch(() => null)
      .then((result) => {
        if (id === seq.current) setSt({ ...base, loading: false, result })
      })
  }
  return { ai: current, request, clear: () => setSt(null) }
}
