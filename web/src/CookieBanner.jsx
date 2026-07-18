import { useState, useEffect } from 'react'
import { t } from './i18n'

const STORAGE_KEY = 'ga_cookie_consent'   // 'accepted' | 'refused'

// Read current consent (used by main.jsx to decide whether to load analytics)
export function getConsent() {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

export default function CookieBanner() {
  const [choice, setChoice] = useState(() => getConsent())

  // Re-show when the user clicks a "Gérer les cookies" link that sets this flag
  useEffect(() => {
    const handler = () => setChoice(null)
    window.addEventListener('ga:manage-cookies', handler)
    return () => window.removeEventListener('ga:manage-cookies', handler)
  }, [])

  if (choice) return null   // already decided

  const decide = (value) => {
    try { localStorage.setItem(STORAGE_KEY, value) } catch {}
    setChoice(value)
    // Let the app react (e.g. load analytics) without a full reload
    window.dispatchEvent(new CustomEvent('ga:consent', { detail: value }))
    // Analytics that were blocked need a reload to initialise cleanly
    if (value === 'accepted') window.location.reload()
  }

  return (
    <div className="cookie-banner" role="dialog" aria-label="Consentement aux cookies">
      <div className="cookie-text">
        <strong>{t('cookies.title')}</strong>
        <span>
          {t('cookies.body')}{' '}
          <a href="/politique-cookies" target="_blank" rel="noreferrer">{t('cookies.link')}</a>.
        </span>
      </div>
      <div className="cookie-actions">
        <button className="cookie-refuse" onClick={() => decide('refused')}>{t('cookies.refuse')}</button>
        <button className="cookie-accept" onClick={() => decide('accepted')}>{t('cookies.accept')}</button>
      </div>
    </div>
  )
}
