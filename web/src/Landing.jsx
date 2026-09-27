import { useState, useEffect, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { t, getLanguage, setLanguage, LANGUAGES } from './i18n'
import { supabase } from './supabase'
import { useSeo } from './seo'

const AuthModal = lazy(() => import('./AuthModal'))
const SettingsPanel = lazy(() => import('./SettingsPanel'))
const UploadModal = lazy(() => import('./UploadModal'))
const ModerationPanel = lazy(() => import('./ModerationPanel'))

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

/* Fallback shown only if the live count can't be fetched. */
const STATS_FALLBACK = { works: '1 000+', cities: '2' }

/* Google Play listing — update if the store URL differs. */
const PLAY_URL = 'https://play.google.com/store/apps/details?id=io.graffitiatlas.app'

/* Marker colours mirror the real map (tag / throwup / piece / mural). */
const PIN_COLORS = ['#7B5CF5', '#1DB870', '#3B82F6', '#E85D26']

/* Colours for the live data section (mirror the map pins). */
const D_COLORS = {
  type:    { tag:'#7B5CF5', throwup:'#1DB870', piece:'#3B82F6', mural:'#E85D26', sticker:'#F5C542', other:'#9AA0A6' },
  density: { light:'#9CC7F5', medium:'#3B82F6', heavy:'#1E40AF' },
  surface: { concrete:'#8A8F98', brick:'#C2603F', metal:'#5B6570', painted_wall:'#14B8A6', wood:'#B98B4E', glass:'#7FB8C9', other:'#9AA0A6' },
}
const prettyKey = (k) => String(k).replace(/_/g, ' ')
/* Localised label for a type / density / surface value (falls back to prettified key). */
const labelFor = (tab, key) => {
  const ns = tab === 'type' ? 'style.' : tab === 'density' ? 'density.' : 'surface.'
  const l = t(ns + key)
  return (l && !l.includes('.')) ? l : prettyKey(key)
}

/* Live "by the numbers" section — fetches aggregates and updates as data grows. */
function DataSection() {
  const [d, setD] = useState(null)
  const [tab, setTab] = useState('type')
  useEffect(() => {
    fetch(`${API_URL}/map/stats`)
      .then(r => (r.ok ? r.json() : null))
      .then(x => { if (x && x.works != null) setD(x) })
      .catch(() => { /* section stays hidden if it can't load */ })
  }, [])
  if (!d) return null

  const fmt = (n) => Number(n || 0).toLocaleString(getLanguage())
  const withPct = (items) => {
    const tot = (items || []).reduce((s, i) => s + i.count, 0) || 1
    return (items || []).map(i => ({ ...i, p: Math.round((i.count / tot) * 100) }))
  }
  const SETS = { type: d.by_type, density: d.by_density, surface: d.by_surface }
  const tabs = ['type', 'density', 'surface'].filter(k => (SETS[k] || []).length)
  const active = withPct((SETS[tab] || []).slice(0, 6))
  let acc = 0
  const stops = active.map(it => {
    const c = D_COLORS[tab][it.key] || '#9AA0A6'
    const s = `${c} ${acc}% ${acc + it.p}%`; acc += it.p; return s
  })
  if (acc < 100) stops.push(`#ecebe4 ${acc}% 100%`)
  const cities = withPct(d.by_city || [])
  const cmax = Math.max(1, ...cities.map(c => c.count))
  const years = d.by_year || []
  const ymax = Math.max(1, ...years.map(y => y.count))

  return (
    <section className="lpd">
      <p className="lpd-eyebrow">{t('landing.data.eyebrow')}</p>
      <h2 className="lpd-title">{t('landing.data.title')}</h2>

      <div className="lpd-counters">
        <div className="lpd-stat"><div className="lpd-num">{fmt(d.works)}</div><div className="lpd-lbl">{t('landing.data.works')}</div></div>
        <div className="lpd-stat"><div className="lpd-num">{fmt(d.photos)}</div><div className="lpd-lbl">{t('landing.data.photos')}</div></div>
        <div className="lpd-stat"><div className="lpd-num">{fmt(d.cities)}</div><div className="lpd-lbl">{t('landing.data.cities')}</div></div>
      </div>

      <div className="lpd-grid">
        <div className="lpd-card">
          <div className="lpd-card-head">
            <span className="lpd-card-title">{t('landing.data.breakdown')}</span>
            {tabs.length > 1 && (
              <div className="lpd-toggle">
                {tabs.map(k => (
                  <button key={k} className={k === tab ? 'on' : ''} onClick={() => setTab(k)}>{t('landing.data.' + k)}</button>
                ))}
              </div>
            )}
          </div>
          {active.length ? (
            <div className="lpd-donutwrap">
              <div className="lpd-donut" style={{ background: `conic-gradient(${stops.join(',')})` }}>
                <div className="lpd-hole"><span>{active[0].p}%</span><small>{labelFor(tab, active[0].key)}</small></div>
              </div>
              <div className="lpd-legend">
                {active.map(it => (
                  <div className="lpd-leg" key={it.key}>
                    <span className="lpd-dot" style={{ background: D_COLORS[tab][it.key] || '#9AA0A6' }} />
                    <span className="nm">{labelFor(tab, it.key)}</span><span className="pc">{it.p}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="lpd-empty">—</div>}
        </div>

        <div className="lpd-card">
          <div className="lpd-card-head"><span className="lpd-card-title">{t('landing.data.topcities')}</span></div>
          <div className="lpd-bars">
            {cities.map(c => (
              <div className="lpd-bar" key={c.key}>
                <span className="nm">{c.key}</span>
                <div className="lpd-track"><div className="lpd-fill" style={{ width: (c.count / cmax * 100) + '%' }} /></div>
                <span className="vv">{fmt(c.count)}</span>
              </div>
            ))}
          </div>
          {years.length > 1 && (
            <>
              <div className="lpd-card-head" style={{ marginTop: 14 }}><span className="lpd-card-title">{t('landing.data.byyear')}</span></div>
              <div className="lpd-years">
                {years.map(y => (
                  <div className="lpd-yr" key={y.key}>
                    <span className="yv">{fmt(y.count)}</span>
                    <div className="yb" style={{ height: (y.count / ymax * 60) + 'px' }} />
                    <span className="yl">{y.key}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

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
  useSeo({
    title: 'GraffitiAtlas — Carte collaborative des graffitis de Lyon et Grenoble',
    description: 'Découvrez et explorez les graffitis de Lyon, Grenoble et bientôt toute la France. Détections par IA, imagerie de terrain et données ouvertes Panoramax.',
    path: '/',
  })
  const goMap = () => navigate('/map')

  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [showMod, setShowMod] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // Start from the last count we saw (cached) so a refresh shows the real number
  // immediately instead of flashing the "1 000+" placeholder, then updates live.
  const [stats, setStats] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('ga_stats'))
      if (s && s.works) return s
    } catch { /* ignore */ }
    return STATS_FALLBACK
  })

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
        const next = {
          works: total.toLocaleString(getLanguage()),
          cities: String(cities.length),
        }
        setStats(next)
        try { localStorage.setItem('ga_stats', JSON.stringify(next)) } catch { /* ignore */ }
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

        </div>
      </header>

      {/* ── Live data section ── */}
      <DataSection />

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

      {/* ── Android app ── */}
      <section className="lp-app">
        <div className="lp-app-inner">
          <div className="lp-app-text">
            <p className="lp-app-eyebrow">{t('landing.app.eyebrow')}</p>
            <h2 className="lp-app-title">{t('landing.app.title')}</h2>
            <p className="lp-app-desc">{t('landing.app.desc')}</p>
            <a className="lp-app-badge" href={PLAY_URL} target="_blank" rel="noopener noreferrer">
              <svg width="24" height="26" viewBox="0 0 24 26" aria-hidden="true">
                <path d="M2 1.5 13.8 13 2 24.5c-.4-.3-.7-.8-.7-1.5V3c0-.7.3-1.2.7-1.5Z" fill="#00D4FF"/>
                <path d="M17.9 9.1 15 12 3.2 1.1C3.7.9 4.3 1 5 1.4l12.9 7.7Z" fill="#00F076"/>
                <path d="M17.9 16.9 5 24.6c-.7.4-1.3.5-1.8.3L15 14l2.9 2.9Z" fill="#FF3A44"/>
                <path d="m22 11.3-3.4-2L15.4 13l3.2 3.7 3.4-2c1-.8 1-2.6 0-3.4Z" fill="#FFC900"/>
              </svg>
              <span className="lp-app-badge-t">
                <small>{t('landing.app.badge.top')}</small>
                <strong>Google Play</strong>
              </span>
            </a>
          </div>

          <div className="lp-app-phone">
            <div className="lp-phone-frame">
              <img className="lp-phone-shot" src="/app-mobile.webp" alt="GraffitiAtlas on Android" loading="lazy" />
            </div>
          </div>
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
