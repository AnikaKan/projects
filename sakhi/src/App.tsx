import { useEffect, useState } from 'react'
import { HashRouter, useLocation } from 'react-router-dom'
import { LayoutGrid } from 'lucide-react'
import { AppStateProvider } from './state/AppState'
import { AppRoutes } from './AppRoutes'
import { Gallery } from './presentation/Gallery'
import { SpeechProvider, StopSpeechOnNavigate } from './speech/SpeechContext'

function LiveLayout() {
  const { pathname } = useLocation()
  // Full-width layouts: Coach View, dev tools and the presentation demo (which draws its own phone frame).
  const coach = pathname.startsWith('/coach') || pathname.startsWith('/dev/') || pathname.startsWith('/demo')
  return (
    <div className="min-h-[100dvh] bg-[#EDE6DC]">
      <StopSpeechOnNavigate />
      {!coach && <a
        href="#/wireframes"
        className="fixed bottom-4 left-4 z-50 hidden items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink shadow ring-1 ring-line md:inline-flex"
      >
        <LayoutGrid size={16} aria-hidden /> Wireframe gallery
      </a>}
      {coach ? (
        <div className="h-[100dvh]">
          <AppRoutes />
        </div>
      ) : (
        <div className="mx-auto h-[100dvh] w-full max-w-[480px] bg-paper md:my-0 md:shadow-xl">
          <AppRoutes />
        </div>
      )}
    </div>
  )
}

function Root() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  if (import.meta.env.VITE_GALLERY_ONLY || hash.startsWith('#/wireframes')) return <Gallery />
  return (
    <HashRouter>
      <LiveLayout />
    </HashRouter>
  )
}

export default function App() {
  return (
    <AppStateProvider>
      <SpeechProvider>
        <Root />
      </SpeechProvider>
    </AppStateProvider>
  )
}
