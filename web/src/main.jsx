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
import StatsPage from './StatsPage.jsx'
import CookieBanner, { getConsent } from './CookieBanner.jsx'
import { Analytics } from '@vercel/analytics/react'

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
        <Route path="/stats" element={<StatsPage />} />
      </Routes>
      <CookieBanner />
      {getConsent() === 'accepted' && <Analytics />}
    </BrowserRouter>
  </StrictMode>,
)
