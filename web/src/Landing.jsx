import { useState, useEffect, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { t, getLanguage, setLanguage, LANGUAGES } from './i18n'
import { supabase } from './supabase'

const AuthModal = lazy(() => import('./AuthModal'))
const SettingsPanel = lazy(() => import('./SettingsPanel'))
const UploadModal = lazy(() => import('./UploadModal'))
const ModerationPanel = lazy(() => import('./ModerationPanel'))

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

/* Fallback shown only if the live count can't be fetched. */
const STATS_FALLBACK = { works: '1 000+', cities: '2' }

/* Marker colours mirror the real map (tag / throwup / piece / mural). */
const PIN_COLORS = ['#7B5CF5', '#1DB870', '#3B82F6', '#E85D26']

/* Scattered pins for the hero "living map" — fixed positions so it reads as a place. */
const PINS = [
  { x: 12, y: 30, c: 0, d: 0.0 }, { x: 26, y: 62, c: 3, d: 0.6 },
  { x: 34, y: 22, c: 1, d: 1.2 }, { x: 48, y: 48, c: 3, d: 0.3 },
  { x: 58, y: 28, c: 2, d: 0.9 }, { x: 67, y: 66, c: 0, d: 1.5 },
  { x: 76, y: 38, c: 3, d: 0.4 }, { x: 88, y: 56, c: 1, d: 1.1 },
  { x: 20, y: 80, c: 2, d: 0.7 }, { x: 82, y: 78, c: 3, d: 0.2 },
  { x: 44, y: 78, c: 0, d: 1.3 }, { x: 62, y: 84, c: 1, d: 0.5 },
]

function Logo({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: 'block', borderRadius: '22%' }} aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#E85D26" />
      <path d="M20 9c-4.2 0-7.6 3.2-7.6 7.2 0 5 7.6 14.5 7.6 14.5s7.6-9.5 7.6-14.5C27.6 12.2 24.2 9 20 9Z" fill="#fff" />
      <circle cx="20" cy="16" r="3" fill="#2A2520" />
    </svg>
  )
}

function Pin({ color, size = 30 }) {
  return (
    <svg width={size} height={size * 1.3} viewBox="0 0 24 32" aria-hidden="true">
      <path d="M12 2C7 2 3 6 3 11c0 6.5 9 19 9 19s9-12.5 9-19c0-5-4-9-9-9Z" fill={color} />
      <circle cx="12" cy="11" r="3.4" fill="#fff" fillOpacity="0.9" />
    </svg>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const goMap = () => navigate('/map')

  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [showMod, setShowMod] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [stats, setStats] = useState(STATS_FALLBACK)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])

  // Live counts for the hero stat strip — updates automatically as data grows.
  useEffect(() => {
    fetch(`${API_URL}/map/cities`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const cities = d?.cities || []
        if (!cities.length) return
        const total = cities.reduce((sum, c) => sum + (c.count || 0), 0)
        setStats({
          works: total.toLocaleString(getLanguage()),
          cities: String(cities.length),
        })
      })
      .catch(() => { /* keep fallback */ })
  }, [])

  useEffect(() => {
    if (!user) { setIsAdmin(false); return }
    supabase.from('profiles').select('role').eq('id', user.id).single()
      .then(({ data }) => setIsAdmin(data?.role === 'admin' || data?.role === 'moderator'))
      .catch(() => setIsAdmin(false))
  }, [user])

  return (
    <div className="lp">
      {/* ── Nav ── */}
      <nav className="lp-nav">
        <div className="lp-brand">
          <Logo size={30} />
          <span className="lp-brand-name">GraffitiAtlas</span>
        </div>
        <div className="lp-nav-right">
          <div className={'lp-nav-menu' + (menuOpen ? ' open' : '')}>
            <select
              className="lp-lang"
              value={getLanguage()}
              onChange={e => setLanguage(e.target.value)}
              aria-label="Language"
            >
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
            {user && (
              <button className="lp-nav-login" onClick={() => { setShowUpload(true); setMenuOpen(false) }}>{t('header.report')}</button>
            )}
            {isAdmin && (
              <button className="lp-nav-login" onClick={() => { setShowMod(true); setMenuOpen(false) }}>{t('header.moderation')}</button>
            )}
            {isAdmin && (
              <a className="lp-nav-login" href="/stats">{t('header.stats')}</a>
            )}
            <button className="lp-nav-login" onClick={() => { setShowSettings(true); setMenuOpen(false) }}>{t('header.settings')}</button>
            {user ? (
              <button className="lp-nav-login" onClick={() => { supabase.auth.signOut(); setMenuOpen(false) }}>
                {t('header.logout')}
              </button>
            ) : (
              <button className="lp-nav-login" onClick={() => { setShowAuth(true); setMenuOpen(false) }}>{t('header.login')}</button>
            )}
          </div>
          <button className="lp-nav-cta" onClick={goMap}>{t('nav.explore')}</button>
          <button
            className="lp-nav-burger"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menu"
            aria-expanded={menuOpen}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="lp-hero">
        <div className="lp-map" aria-hidden="true">
          <div className="lp-grid" />
          {PINS.map((p, i) => (
            <span
              key={i}
              className="lp-pin"
              style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${p.d}s` }}
            >
              <Pin color={PIN_COLORS[p.c]} size={26} />
            </span>
          ))}
          <div className="lp-map-fade" />
        </div>

        <div className="lp-hero-inner">
          <p className="lp-eyebrow">{t('landing.eyebrow')}</p>
          <h1 className="lp-h1">{t('landing.h1')}</h1>
          <p className="lp-sub">{t('landing.sub')}</p>
          <button className="lp-cta" onClick={goMap}>
            {t('landing.cta')}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4 9h10M10 5l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="lp-stats">
            <div><strong>{stats.works}</strong><span>{t('landing.stat.works')}</span></div>
            <div className="lp-stats-div" />
            <div><strong>{stats.cities}</strong><span>{t('landing.stat.cities')}</span></div>
            <div className="lp-stats-div" />
            <div><strong>●</strong><span>{t('landing.stat.live')}</span></div>
          </div>
        </div>
      </header>

      {/* ── How it works ── */}
      <section className="lp-how">
        <h2 className="lp-section-title">{t('landing.how.title')}</h2>
        <div className="lp-cards">
          {[1, 2, 3].map(n => (
            <div className="lp-card" key={n}>
              <span className="lp-card-num">0{n}</span>
              <h3>{t(`landing.how.${n}.t`)}</h3>
              <p>{t(`landing.how.${n}.d`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Municipal band ── */}
      <section className="lp-muni">
        <div className="lp-muni-inner">
          <p className="lp-muni-eyebrow">{t('landing.muni.eyebrow')}</p>
          <h2 className="lp-muni-title">{t('landing.muni.title')}</h2>
          <p className="lp-muni-desc">{t('landing.muni.desc')}</p>
          <a className="lp-muni-cta" href="mailto:contact@graffitiatlas.io?subject=GraffitiAtlas%20—%20Collectivité">
            {t('landing.muni.cta')}
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <Logo size={26} />
          <span>GraffitiAtlas</span>
        </div>
        <p className="lp-footer-tag">{t('landing.footer.tagline')}</p>
        <div className="lp-footer-links">
          <a href="/politique-confidentialite">{t('set.link.privacy')}</a>
          <a href="/conditions-utilisation">{t('set.link.terms')}</a>
          <a href="/mentions-legales">{t('set.link.legal')}</a>
          <a href="/politique-cookies">{t('cookies.link')}</a>
          <a href="/credits">{t('legal.credits')}</a>
          <button onClick={() => window.dispatchEvent(new Event('ga:manage-cookies'))}>
            {t('set.link.cookies')}
          </button>
        </div>
      </footer>

      <Suspense fallback={null}>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
        {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
        {showMod && <ModerationPanel onClose={() => setShowMod(false)} />}
        {showSettings && (
          <SettingsPanel
            user={user}
            onClose={() => setShowSettings(false)}
            onLogout={() => { supabase.auth.signOut(); setShowSettings(false) }}
          />
        )}
      </Suspense>
    </div>
  )
}
