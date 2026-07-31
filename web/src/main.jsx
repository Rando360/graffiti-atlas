import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import './landing.css'
import App from './App.jsx'
import Landing from './Landing.jsx'
import PrivacyPage from './PrivacyPage.jsx'
import TermsPage from './TermsPage.jsx'
import LegalNoticePage from './LegalNoticePage.jsx'
import CookiesPage from './CookiesPage.jsx'
import CreditsPage from './CreditsPage.jsx'
import DeleteAccountPage from './DeleteAccountPage.jsx'
import StatsPage from './StatsPage.jsx'
import CookieBanner, { getConsent } from './CookieBanner.jsx'
import { Analytics } from '@vercel/analytics/react'
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase.js'

// ── Native status bar (Android/iOS) ──────────────────────────────────────
// Draw the OS status bar as its own bar above the webview so the app header
// never overlaps the clock/signal icons. env(safe-area-inset) is unreliable
// in the Android webview, so we handle it natively instead.
if (Capacitor.isNativePlatform()) {
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {})
    StatusBar.setBackgroundColor({ color: '#2A2520' }).catch(() => {})
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {}) // light icons on dark bar
  }).catch(() => {})

  // ── OAuth deep-link return ──────────────────────────────────────────────
  // After Google sign-in, Supabase redirects to our custom scheme
  // (io.graffitiatlas.app://login-callback?code=...). Catch that, exchange
  // the code for a session, and close the in-app browser so we land back in
  // the app already logged in.
  import('@capacitor/app').then(({ App: CapApp }) => {
    CapApp.addListener('appUrlOpen', async ({ url }) => {
      if (!url || !url.includes('login-callback')) return
      try {
        const code = new URL(url).searchParams.get('code')
        if (code) await supabase.auth.exchangeCodeForSession(code)
      } catch { /* ignore malformed callback */ }
      try {
        const { Browser } = await import('@capacitor/browser')
        await Browser.close()
      } catch { /* browser may already be closed */ }
    })
  }).catch(() => {})
}

// ── Deploy-staleness guard ──────────────────────────────────────────────
// After a new deploy, chunk filenames change. A tab that was open before the
// deploy will fail to fetch an old lazy chunk (e.g. clicking Login). Catch
// that specific error and reload once so the user lands on the fresh build.
// A short-lived sessionStorage flag prevents an infinite reload loop.
function isChunkLoadError(msg) {
  return typeof msg === 'string' && (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Importing a module script failed')
  )
}
function reloadOncePerDeploy() {
  try {
    if (sessionStorage.getItem('ga_chunk_reloaded')) return
    sessionStorage.setItem('ga_chunk_reloaded', '1')
  } catch { /* private mode — reload anyway */ }
  window.location.reload()
}
window.addEventListener('error', (e) => {
  if (isChunkLoadError(e?.message)) reloadOncePerDeploy()
})
window.addEventListener('unhandledrejection', (e) => {
  if (isChunkLoadError(e?.reason?.message)) reloadOncePerDeploy()
})

// ── Analytics load ONLY after the user accepts non-essential cookies ──
if (getConsent() === 'accepted') {
  import('@sentry/react').then((Sentry) => {
    const dsn = import.meta.env.VITE_SENTRY_DSN
    if (dsn) Sentry.init({ dsn, sendDefaultPii: false, tracesSampleRate: 0.1 })
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/map" element={<App />} />
        <Route path="/politique-confidentialite" element={<PrivacyPage />} />
        <Route path="/conditions-utilisation" element={<TermsPage />} />
        <Route path="/mentions-legales" element={<LegalNoticePage />} />
        <Route path="/politique-cookies" element={<CookiesPage />} />
        <Route path="/credits" element={<CreditsPage />} />
        <Route path="/suppression-compte" element={<DeleteAccountPage />} />
        <Route path="/stats" element={<StatsPage />} />
      </Routes>
      <CookieBanner />
      {getConsent() === 'accepted' && <Analytics />}
    </BrowserRouter>
  </StrictMode>,
)
