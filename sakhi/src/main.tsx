import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled (no CDN) so Telugu/Devanagari render offline.
import '@fontsource/noto-sans/latin-400.css'
import '@fontsource/noto-sans/latin-500.css'
import '@fontsource/noto-sans/latin-600.css'
import '@fontsource/noto-sans/latin-700.css'
import '@fontsource/noto-sans-devanagari/devanagari-400.css'
import '@fontsource/noto-sans-devanagari/devanagari-500.css'
import '@fontsource/noto-sans-devanagari/devanagari-600.css'
import '@fontsource/noto-sans-devanagari/devanagari-700.css'
import '@fontsource/noto-sans-telugu/telugu-400.css'
import '@fontsource/noto-sans-telugu/telugu-500.css'
import '@fontsource/noto-sans-telugu/telugu-600.css'
import '@fontsource/noto-sans-telugu/telugu-700.css'
// Preview languages (বাংলা, অসমীয়া, தமிழ்): one bold weight, only for their names and greetings in the selector.
import '@fontsource/noto-sans-bengali/bengali-700.css'
import '@fontsource/noto-sans-tamil/tamil-700.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline app shell (public/sw.js): after one online visit the app opens without a connection.
// Production builds only, so development never serves stale code.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline shell unavailable (e.g. insecure origin): the app still works online */
    })
  })
}
