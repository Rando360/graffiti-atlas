import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { t, getLanguage, setLanguage, LANGUAGES } from './i18n'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const STATUS_LABELS = () => ({
  approved: t('set.status.approved'),
  pending_review: t('set.status.pending'),
  rejected: t('set.status.rejected'),
})

export default function SettingsPanel({ user, onClose, onLogout }) {
  const [profile, setProfile] = useState(null)
  const [contrib, setContrib] = useState(null)
  const [name, setName] = useState('')
  const [lang, setLang] = useState(getLanguage())
  const [savingName, setSavingName] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const authHeader = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }, [])

  // Load profile + contributions
  useEffect(() => {
    if (!user) return
    ;(async () => {
      try {
        const headers = await authHeader()
        const [p, c] = await Promise.all([
          fetch(`${API_URL}/users/me`, { headers }),
          fetch(`${API_URL}/users/me/contributions`, { headers }),
        ])
        const pj = await p.json()
        const cj = await c.json()
        setProfile(pj); setName(pj.display_name || '')
        setContrib(cj)
      } catch {
        setError(t('set.profileError'))
      }
    })()
  }, [user, authHeader])

  const saveName = async () => {
    setSavingName(true); setError(null); setNameSaved(false)
    try {
      const headers = { ...(await authHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`${API_URL}/users/me`, {
        method: 'PATCH', headers, body: JSON.stringify({ display_name: name }),
      })
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.detail || t('mod.err.failed')) }
      setNameSaved(true); setTimeout(() => setNameSaved(false), 2000)
    } catch (e) { setError(e.message) } finally { setSavingName(false) }
  }

  const saveLang = async (value) => {
    setLang(value)
    try {
      const headers = { ...(await authHeader()), 'Content-Type': 'application/json' }
      await fetch(`${API_URL}/users/me`, {
        method: 'PATCH', headers, body: JSON.stringify({ language: value }),
      })
    } catch { /* non-blocking */ }
    setLanguage(value)   // persists locally + reloads UI in the new language
  }

  const doDelete = async () => {
    setDeleting(true); setError(null)
    try {
      const headers = await authHeader()
      const res = await fetch(`${API_URL}/users/me`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error(t('set.delete.failed'))
      await supabase.auth.signOut()
      window.location.href = '/'
    } catch (e) { setError(e.message); setDeleting(false) }
  }

  const manageCookies = () => {
    window.dispatchEvent(new Event('ga:manage-cookies'))
    onClose()
  }

  return (
    <div className="set-overlay" onClick={onClose}>
      <div className="set-panel" onClick={e => e.stopPropagation()}>
        <div className="set-head">
          <h2>{t('set.title')}</h2>
          <button className="set-close" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        <div className="set-body">
          {error && <div className="set-error">{error}</div>}

          {!user ? (
            <div className="set-section">
              <p className="set-loginprompt">{t('set.loginPrompt')}</p>
              <div className="set-lang">
                <span className="set-lbl">{t('set.language')}</span>
                <div className="set-langbtns">
                  {LANGUAGES.map(l => (
                    <button key={l.code} className={lang === l.code ? 'on' : ''} onClick={() => { setLang(l.code); setLanguage(l.code) }}>
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>
              <SettingsLegal onManageCookies={manageCookies} />
            </div>
          ) : (
            <>
              {/* Account */}
              <div className="set-section">
                <h3 className="set-title">{t('set.account')}</h3>
                <div className="set-account">
                  <div className="set-avatar">
                    {profile?.avatar_url
                      ? <img src={profile.avatar_url} alt="" />
                      : <span>{(name || user.email || '?')[0].toUpperCase()}</span>}
                  </div>
                  <div className="set-email">
                    <span className="set-email-val">{profile?.email || user.email}</span>
                    {profile?.role && profile.role !== 'user' && (
                      <span className="set-role">{profile.role}</span>
                    )}
                  </div>
                </div>

                <label className="set-field-lbl">{t('set.name.label')}</label>
                <div className="set-name-row">
                  <input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder={t('set.name.placeholder')} />
                  <button onClick={saveName} disabled={savingName || !name.trim()}>
                    {savingName ? '…' : nameSaved ? '✓' : t('set.name.save')}
                  </button>
                </div>
                <p className="set-hint">{t('set.name.hint')}</p>
              </div>

              {/* Preferences */}
              <div className="set-section">
                <h3 className="set-title">{t('set.prefs')}</h3>
                <div className="set-lang">
                  <span className="set-lbl">{t('set.language')}</span>
                  <div className="set-langbtns">
                    {LANGUAGES.map(l => (
                      <button key={l.code} className={lang === l.code ? 'on' : ''} onClick={() => saveLang(l.code)}>
                        {l.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Contributions */}
              <div className="set-section">
                <h3 className="set-title">{t('set.contrib')}</h3>
                {contrib ? (
                  <>
                    <div className="set-stats">
                      <div><strong>{contrib.total}</strong><span>{t('set.contrib.total')}</span></div>
                      <div><strong>{contrib.counts.approved || 0}</strong><span>{t('set.contrib.published')}</span></div>
                      <div><strong>{contrib.counts.pending_review || 0}</strong><span>{t('set.contrib.pending')}</span></div>
                    </div>
                    {contrib.contributions.length > 0 ? (
                      <div className="set-contrib-list">
                        {contrib.contributions.slice(0, 6).map(c => (
                          <div key={c.id} className="set-contrib">
                            <span className="set-contrib-city">{c.city || t('set.unknownPlace')}</span>
                            <span className={'set-status ' + c.status}>{STATUS_LABELS()[c.status] || c.status}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="set-hint">{t('set.contrib.empty')}</p>
                    )}
                  </>
                ) : <p className="set-hint">{t('common.loading')}</p>}
              </div>

              {/* Privacy & data */}
              <div className="set-section">
                <h3 className="set-title">{t('set.privacy')}</h3>
                <SettingsLegal onManageCookies={manageCookies} />

                {!confirmDelete ? (
                  <button className="set-danger" onClick={() => setConfirmDelete(true)}>
                    {t('set.delete')}
                  </button>
                ) : (
                  <div className="set-delete-box">
                    <p>{t('set.delete.warn1')} <strong>{t('set.delete.irreversible')}</strong>{t('set.delete.warn2')} <strong>{t('set.delete.confirmWord')}</strong> {t('set.delete.toConfirm')}</p>
                    <input value={deleteText} onChange={e => setDeleteText(e.target.value)} placeholder={t('set.delete.confirmWord')} />
                    <div className="set-delete-actions">
                      <button className="set-cancel" onClick={() => { setConfirmDelete(false); setDeleteText('') }}>{t('common.cancel')}</button>
                      <button className="set-danger" disabled={deleteText !== t('set.delete.confirmWord') || deleting} onClick={doDelete}>
                        {deleting ? t('set.delete.deleting') : t('set.delete.confirm')}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button className="set-logout" onClick={onLogout}>{t('set.logout')}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SettingsLegal({ onManageCookies }) {
  return (
    <div className="set-links">
      <a href="/politique-confidentialite" target="_blank" rel="noreferrer">{t('set.link.privacy')}</a>
      <a href="/conditions-utilisation" target="_blank" rel="noreferrer">{t('set.link.terms')}</a>
      <a href="/mentions-legales" target="_blank" rel="noreferrer">{t('set.link.legal')}</a>
      <button className="set-link-btn" onClick={onManageCookies}>{t('set.link.cookies')}</button>
    </div>
  )
}
