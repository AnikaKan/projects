import { Navigate, Route, Routes } from 'react-router-dom'
import { useApp } from './state/AppState'
import { BusinessScreen, LanguageScreen } from './screens/Onboarding'
import { AssessmentFlow } from './assessment/ui/AssessmentFlow'
import { RecommendationScreen } from './assessment/ui/RecommendationScreen'
import { HomeScreen } from './screens/Home'
import { LessonRoute } from './learning/ui/LessonExperience'
import { PracticeQuestion } from './screens/Practice'
import { JourneyScreen } from './screens/Journey'
import { CheckInScreen } from './screens/CheckIn'
import { CoachView } from './coach/CoachView'
import { PresentationDemo } from './demo/PresentationDemo'
import { HelperHome, MoneyTool, PriceTool } from './helper/screens'
import { VoiceLab } from './dev/VoiceLab'

/** The Voice Lab is a development tool: routed only in dev builds or when explicitly enabled. */
export const VOICE_LAB_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_VOICE_LAB === '1'

export function AppRoutes() {
  const { onboarded } = useApp()
  return (
    <Routes>
      <Route path="/" element={<Navigate to={onboarded ? '/home' : '/onboarding/language'} replace />} />
      <Route path="/onboarding/language" element={<LanguageScreen />} />
      <Route path="/onboarding/business" element={<BusinessScreen />} />
      <Route path="/assessment" element={<AssessmentFlow />} />
      <Route path="/assessment/result" element={<RecommendationScreen />} />
      <Route path="/home" element={<HomeScreen />} />
      {/* The Lessons list was merged into My learning (learning-model simplification 2026-11-01). */}
      <Route path="/lessons" element={<Navigate to="/journey" replace />} />
      <Route path="/lessons/:id" element={<LessonRoute />} />
      {/* "My Practice" and "Progress" were merged into My Journey (IA simplification 2026-11-01). */}
      <Route path="/journey" element={<JourneyScreen />} />
      <Route path="/practice" element={<Navigate to="/journey" replace />} />
      <Route path="/practice/:id" element={<PracticeQuestion />} />
      <Route path="/progress" element={<Navigate to="/journey" replace />} />
      <Route path="/checkin" element={<CheckInScreen />} />
      <Route path="/demo" element={<PresentationDemo />} />
      <Route path="/helper" element={<HelperHome />} />
      <Route path="/helper/price" element={<PriceTool />} />
      <Route path="/helper/money" element={<MoneyTool />} />
      <Route path="/coach" element={<CoachView />} />
      <Route path="/coach/learner/:id" element={<CoachView />} />
      <Route path="/coach/learner/:id/session" element={<CoachView session />} />
      {VOICE_LAB_ENABLED && <Route path="/dev/voices" element={<VoiceLab />} />}
      <Route path="/wireframes" element={null} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
