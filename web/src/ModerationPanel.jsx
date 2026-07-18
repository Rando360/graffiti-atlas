import { useState, useEffect, useCallback } from 'react'
import BlurEditor from './BlurEditor'
import { t } from './i18n'
import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const CLOUDFRONT = 'https://d36hw3x1088tvv.cloudfront.net'

export default function ModerationPanel({ onClose }) {
  const [tab, setTab] = useState('uploads')      // 'uploads' | 'removals'
  const [pending, setPending] = useState([])
  const [removals, setRemovals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [typeOverride, setTypeOverride] = useState({})  // { graffitiId: style }
  const [blurTarget, setBlurTarget] = useState(null)    // { id, url }
  const [bust, setBust] = useState({})                  // cache-buster per id

  const authHeader = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const headers = await authHeader()
      const [p, r] = await Promise.all([
        fetch(`${API_URL}/moderation/pending`, { headers }),
        fetch(`${API_URL}/moderation/removals`, { headers }),
      ])
      if (p.status === 403 || r.status === 403) throw new Error(t('mod.err.forbidden'))
      const pj = await p.json()
      const rj = await r.json()
      setPending(pj.pending || [])
      setRemovals(rj.removals || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [authHeader])

  useEffect(() => { load() }, [load])

  const act = async (url, id, body) => {
    setBusyId(id)
    try {
      const headers = await authHeader()
      const opts = { method: 'POST', headers }
      if (body) {
        opts.headers = { ...headers, 'Content-Type': 'application/json' }
        opts.body = JSON.stringify(body)
      }
      const res = await fetch(url, opts)
      if (!res.ok) throw new Error(t('mod.err.failed'))
      setPending(p => p.filter(x => x.id !== id))
      setRemovals(r => r.filter(x => x.id !== id))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  const STYLES = [
    { key: 'tag', label: t('style.tag') },
    { key: 'throwup', label: t('style.throwup') },
    { key: 'piece', label: t('style.piece') },
  ]

  const formatDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''

  return (
    <div className="mod-overlay" onClick={onClose}>
      <div className="mod-panel" onClick={e => e.stopPropagation()}>
        <div className="mod-head">
          <h2>{t('mod.title')}</h2>
          <button className="mod-close" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        <div className="mod-tabs">
          <button className={tab === 'uploads' ? 'on' : ''} onClick={() => setTab('uploads')}>
            {t('mod.tab.uploads')} {pending.length > 0 && <span className="mod-badge">{pending.length}</span>}
          </button>
          <button className={tab === 'removals' ? 'on' : ''} onClick={() => setTab('removals')}>
            {t('mod.tab.removals')} {removals.length > 0 && <span className="mod-badge">{removals.length}</span>}
          </button>
        </div>

        <div className="mod-body">
          {error && <div className="mod-error">{error}</div>}
          {loading ? (
            <div className="mod-empty">{t('common.loading')}</div>
          ) : tab === 'uploads' ? (
            pending.length === 0 ? (
              <div className="mod-empty">{t('mod.empty.uploads')}</div>
            ) : (
              pending.map(g => (
                <div key={g.id} className="mod-card">
                  <div className="mod-thumb">
                    {g.s3_key_thumb
                      ? <img src={`${CLOUDFRONT}/${g.s3_key_thumb}${bust[g.id] ? '?t=' + bust[g.id] : ''}`} alt="" />
                      : <div className="mod-thumb-empty">{t('mod.noImage')}</div>}
                  </div>
                  <div className="mod-info">
                    <div className="mod-info-top">
                      <span className="mod-city">{g.city || t('mod.unknownCity')}</span>
                    </div>
                    {g.description_fr && <p className="mod-desc">{g.description_fr}</p>}
                    <p className="mod-meta">
                      {g.lat?.toFixed(5)}, {g.lng?.toFixed(5)} · {formatDate(g.created_at)}
                    </p>

                    <div className="mod-type-row">
                      <span className="mod-type-lbl">{t('mod.type')}</span>
                      {STYLES.map(s => {
                        const current = typeOverride[g.id] ?? g.style
                        return (
                          <button
                            key={s.key}
                            className={'mod-type' + (current === s.key ? ' on' : '')}
                            onClick={() => setTypeOverride(prev => ({ ...prev, [g.id]: s.key }))}
                          >
                            {s.label}
                          </button>
                        )
                      })}
                    </div>

                    <div className="mod-actions">
                      <button
                        className="mod-approve"
                        disabled={busyId === g.id}
                        onClick={() => act(
                          `${API_URL}/moderation/graffiti/${g.id}/approve`,
                          g.id,
                          { style: typeOverride[g.id] ?? g.style }
                        )}
                      >
                        {t('mod.approve')}
                      </button>
                      <button
                        className="mod-blur"
                        disabled={!g.s3_key_thumb}
                        onClick={() => setBlurTarget({
                          id: g.id,
                          url: `${CLOUDFRONT}/${g.s3_key_thumb.replace('thumb.jpg','medium.jpg')}`,
                        })}
                      >
                        {t('mod.blur')}
                      </button>
                      <button
                        className="mod-reject"
                        disabled={busyId === g.id}
                        onClick={() => act(`${API_URL}/moderation/graffiti/${g.id}/reject`, g.id)}
                      >
                        {t('mod.reject')}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )
          ) : (
            removals.length === 0 ? (
              <div className="mod-empty">{t('mod.empty.removals')}</div>
            ) : (
              removals.map(r => (
                <div key={r.id} className="mod-card">
                  <div className="mod-thumb">
                    {r.photo_url
                      ? <img src={r.photo_url} alt="" />
                      : <div className="mod-thumb-empty">{t('mod.noPhoto')}</div>}
                  </div>
                  <div className="mod-info">
                    <div className="mod-info-top">
                      <span className="mod-style removal">{t('mod.removal.badge')}</span>
                    </div>
                    {r.note && <p className="mod-desc">{r.note}</p>}
                    <p className="mod-meta">{formatDate(r.created_at)}</p>
                    <div className="mod-actions">
                      <button
                        className="mod-approve"
                        disabled={busyId === r.id}
                        onClick={() => act(`${API_URL}/moderation/removal/${r.id}/approve`, r.id)}
                      >
                        {t('mod.removal.approve')}
                      </button>
                      <button
                        className="mod-reject"
                        disabled={busyId === r.id}
                        onClick={() => act(`${API_URL}/moderation/removal/${r.id}/reject`, r.id)}
                      >
                        {t('mod.reject')}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )
          )}
        </div>

        {blurTarget && (
          <BlurEditor
            graffitiId={blurTarget.id}
            imageUrl={blurTarget.url}
            onCancel={() => setBlurTarget(null)}
            onDone={() => {
              setBust(b => ({ ...b, [blurTarget.id]: Date.now() }))
              setBlurTarget(null)
            }}
          />
        )}
      </div>
    </div>
  )
}
