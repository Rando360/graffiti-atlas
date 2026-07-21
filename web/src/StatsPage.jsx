import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { t } from './i18n'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const STYLE_COLORS = {
  tag: '#7B5CF5', throwup: '#1DB870', piece: '#3B82F6',
  mural: '#E85D26', sticker: '#F7B84B', other: '#888',
}

function Logo({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: 'block', borderRadius: '22%' }} aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#E85D26" />
      <path d="M20 9c-4.2 0-7.6 3.2-7.6 7.2 0 5 7.6 14.5 7.6 14.5s7.6-9.5 7.6-14.5C27.6 12.2 24.2 9 20 9Z" fill="#fff" />
      <circle cx="20" cy="16" r="3" fill="#2A2520" />
    </svg>
  )
}

function StatCard({ label, value, accent }) {
  return (
    <div className="stats-card">
      <span className="stats-card-num" style={accent ? { color: accent } : undefined}>{value ?? '—'}</span>
      <span className="stats-card-lbl">{label}</span>
    </div>
  )
}

function BarRow({ label, n, max, color }) {
  const pct = max > 0 ? Math.round((n / max) * 100) : 0
  return (
    <div className="stats-bar-row">
      <span className="stats-bar-label">{label}</span>
      <div className="stats-bar-track">
        <div className="stats-bar-fill" style={{ width: `${pct}%`, background: color || '#E85D26' }} />
      </div>
      <span className="stats-bar-num">{n}</span>
    </div>
  )
}

export default function StatsPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [status, setStatus] = useState('loading')   // loading | ok | forbidden | error

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { if (alive) setStatus('forbidden'); return }
      try {
        const res = await fetch(`${API_URL}/moderation/stats`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (res.status === 403) { if (alive) setStatus('forbidden'); return }
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const data = await res.json()
        if (alive) { setStats(data); setStatus('ok') }
      } catch {
        if (alive) setStatus('error')
      }
    })()
    return () => { alive = false }
  }, [])

  const maxCity = stats?.by_city?.[0]?.n || 0
  const maxType = Math.max(1, ...(stats?.by_type?.map(x => x.n) || [1]))
  const maxDay = Math.max(1, ...(stats?.uploads_recent?.map(x => x.n) || [1]))

  return (
    <div className="stats-page">
      <header className="stats-nav">
        <button className="stats-brand" onClick={() => navigate('/map')}>
          <Logo size={26} />
          <span>GraffitiAtlas · Admin</span>
        </button>
        <button className="stats-back" onClick={() => navigate('/map')}>← {t('nav.explore')}</button>
      </header>

      <div className="stats-body">
        {status === 'loading' && <p className="stats-msg">{t('common.loading')}</p>}
        {status === 'forbidden' && <p className="stats-msg">{t('mod.err.forbidden')}</p>}
        {status === 'error' && <p className="stats-msg">{t('error.load')}</p>}

        {status === 'ok' && stats && (
          <>
            <h1 className="stats-h1">Tableau de bord</h1>

            <section className="stats-grid-cards">
              <StatCard label="Graffitis publiés" value={stats.graffiti_total} />
              <StatCard label="Lieux" value={stats.locations_total} />
              <StatCard label="Utilisateurs" value={stats.users_total} />
              <StatCard label="En attente" value={stats.graffiti_pending} accent="#E8A317" />
              <StatCard label="Effacements à valider" value={stats.removals_pending} accent="#E8A317" />
              <StatCard label="Contributions communauté" value={stats.source_community} />
              <StatCard label="Scans Rando360" value={stats.source_rando360} />
              <StatCard label="Effacés" value={stats.cleaned_total} accent="#8A8378" />
              <StatCard label="Rejetés" value={stats.graffiti_rejected} accent="#d64545" />
            </section>

            <section className="stats-section">
              <h2>Uploads communauté — 30 derniers jours</h2>
              {stats.uploads_recent?.length > 0 ? (
                <div className="stats-spark">
                  {stats.uploads_recent.map(d => (
                    <div key={d.day} className="stats-spark-col" title={`${d.day}: ${d.n}`}>
                      <div className="stats-spark-bar" style={{ height: `${Math.max(4, (d.n / maxDay) * 100)}%` }} />
                    </div>
                  ))}
                </div>
              ) : <p className="stats-empty">Aucun upload sur la période.</p>}
            </section>

            <section className="stats-section">
              <h2>Par type</h2>
              {stats.by_type?.map(row => (
                <BarRow key={row.style} label={row.style} n={row.n} max={maxType} color={STYLE_COLORS[row.style] || '#888'} />
              ))}
            </section>

            <section className="stats-section">
              <h2>Par ville</h2>
              {stats.by_city?.map(row => (
                <BarRow key={row.city} label={row.city} n={row.n} max={maxCity} />
              ))}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
