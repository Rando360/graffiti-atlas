import { useState, useRef, useCallback, useEffect } from 'react'
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps'
import exifr from 'exifr'
import { supabase } from './supabase'
import { t } from './i18n'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

const STYLE_OPTIONS = [
  { key: 'tag',     labelKey: 'style.tag',     hintKey: 'upload.hint.tag' },
  { key: 'throwup', labelKey: 'style.throwup', hintKey: 'upload.hint.throwup' },
  { key: 'piece',   labelKey: 'style.piece',   hintKey: 'upload.hint.piece' },
  { key: 'mural',   labelKey: 'style.mural',   hintKey: 'upload.hint.mural' },
]

export default function UploadModal({ onClose, initialCenter }) {
  const [step, setStep] = useState(1)          // 1 = photo+location, 2 = details, 3 = done
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [pin, setPin] = useState(null)          // { lat, lng }
  const [gpsFromPhoto, setGpsFromPhoto] = useState(false)
  const [style, setStyle] = useState(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  const center = initialCenter || { lat: 45.7640, lng: 4.8357 }

  // Handle photo selection → preview + try to read GPS from EXIF
  const handleFile = useCallback(async (f) => {
    if (!f) return
    if (!f.type.startsWith('image/')) { setError(t('upload.err.notImage')); return }
    if (f.size > 15 * 1024 * 1024) { setError(t('upload.err.tooBig')); return }
    setError(null)
    setFile(f)
    setPreview(URL.createObjectURL(f))

    try {
      const gps = await exifr.gps(f)
      if (gps && gps.latitude && gps.longitude) {
        setPin({ lat: gps.latitude, lng: gps.longitude })
        setGpsFromPhoto(true)
      } else {
        setPin(center)          // fall back to current map centre; user drags
        setGpsFromPhoto(false)
      }
    } catch {
      setPin(center)
      setGpsFromPhoto(false)
    }
  }, [center])

  const onDrop = (e) => {
    e.preventDefault()
    handleFile(e.dataTransfer.files?.[0])
  }

  const submit = async () => {
    if (!file || !pin) return
    setSubmitting(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(t('upload.err.login'))

      const form = new FormData()
      form.append('photo', file)
      form.append('lat', pin.lat)
      form.append('lng', pin.lng)
      if (style) form.append('style', style)
      if (note.trim()) form.append('note', note.trim())

      const res = await fetch(`${API_URL}/uploads/graffiti`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (err.detail === 'content_rejected') throw new Error(t('upload.err.rejected'))
        throw new Error(err.detail || t('upload.err.failed'))
      }
      setStep(3)
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  return (
    <div className="ul-overlay" onClick={onClose}>
      <div className="ul-modal" onClick={e => e.stopPropagation()}>
        <button className="ul-close" onClick={onClose} aria-label={t('common.close')}>✕</button>

        {step === 3 ? (
          <div className="ul-done">
            <div className="ul-done-icon">✓</div>
            <h3>{t('upload.done.title')}</h3>
            <p>{t('upload.done.body')}</p>
            <button className="ul-submit" onClick={onClose}>{t('common.close')}</button>
          </div>
        ) : (
          <>
            <div className="ul-head">
              <h3>{t('upload.title')}</h3>
              <div className="ul-steps">
                <span className={step >= 1 ? 'on' : ''}>{t('upload.step1')}</span>
                <span className={step >= 2 ? 'on' : ''}>{t('upload.step2')}</span>
              </div>
            </div>

            {step === 1 && (
              <div className="ul-body">
                {!preview ? (
                  <div
                    className="ul-drop"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={onDrop}
                  >
                    <div className="ul-drop-icon">📷</div>
                    <p className="ul-drop-main">{t('upload.drop.main')}</p>
                    <p className="ul-drop-sub">{t('upload.drop.sub')}</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      onChange={e => handleFile(e.target.files?.[0])}
                    />
                  </div>
                ) : (
                  <>
                    <div className="ul-preview">
                      <img src={preview} alt="" />
                      <button className="ul-change" onClick={() => { setFile(null); setPreview(null); setPin(null) }}>
                        {t('upload.changePhoto')}
                      </button>
                    </div>

                    <div className="ul-loc-label">
                      {gpsFromPhoto ? t('upload.gpsFound') : t('upload.gpsMissing')}
                    </div>

                    <div className="ul-map">
                      <APIProvider apiKey={GOOGLE_KEY}>
                        <Map
                          defaultZoom={gpsFromPhoto ? 17 : 14}
                          defaultCenter={pin || center}
                          mapId="graffiti-atlas-upload"
                          style={{ width: '100%', height: '100%' }}
                          mapTypeControl={false}
                          streetViewControl={false}
                          fullscreenControl={false}
                          onClick={e => e.detail.latLng && setPin({ lat: e.detail.latLng.lat, lng: e.detail.latLng.lng })}
                        >
                          {pin && (
                            <AdvancedMarker
                              position={pin}
                              draggable
                              onDragEnd={e => e.latLng && setPin({ lat: e.latLng.lat(), lng: e.latLng.lng() })}
                            />
                          )}
                        </Map>
                      </APIProvider>
                    </div>
                    <p className="ul-map-hint">{t('upload.mapHint')}</p>
                  </>
                )}

                {error && <div className="ul-error">{error}</div>}

                <div className="ul-actions">
                  <button className="ul-cancel" onClick={onClose}>{t('common.cancel')}</button>
                  <button className="ul-submit" disabled={!file || !pin} onClick={() => setStep(2)}>
                    {t('upload.continue')}
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="ul-body">
                <label className="ul-field-label">{t('upload.type.label')} <span className="req">{t('upload.type.required')}</span></label>
                <div className="ul-styles">
                  {STYLE_OPTIONS.map(o => (
                    <button
                      key={o.key}
                      className={'ul-style-card' + (style === o.key ? ' on' : '')}
                      onClick={() => setStyle(o.key)}
                    >
                      <span className="ul-style-check" aria-hidden="true" />
                      <span className="ul-style-text">
                        <span className="ul-style-name">{t(o.labelKey)}</span>
                        <span className="ul-style-hint">{t(o.hintKey)}</span>
                      </span>
                    </button>
                  ))}
                </div>

                <label className="ul-field-label">{t('upload.desc.label')} <span>{t('upload.desc.optional')}</span></label>
                <textarea
                  className="ul-note"
                  placeholder={t('upload.desc.placeholder')}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  maxLength={500}
                  rows={3}
                />

                {error && <div className="ul-error">{error}</div>}

                <div className="ul-actions">
                  <button className="ul-cancel" onClick={() => setStep(1)}>{t('upload.back')}</button>
                  <button className="ul-submit" disabled={submitting || !style} onClick={submit}>
                    {submitting ? t('upload.submitting') : t('upload.submit')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
