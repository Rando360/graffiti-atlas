import { useState, useRef, useCallback, useEffect } from 'react'
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps'
import { Capacitor } from '@capacitor/core'
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

const DENSITY_OPTIONS = [
  { key: 'light',  labelKey: 'density.light' },
  { key: 'medium', labelKey: 'density.medium' },
  { key: 'heavy',  labelKey: 'density.heavy' },
]

const SURFACE_OPTIONS = [
  { key: 'bare_wall',    labelKey: 'surface.bare_wall' },
  { key: 'painted_wall', labelKey: 'surface.painted_wall' },
  { key: 'concrete',     labelKey: 'surface.concrete' },
  { key: 'brick',        labelKey: 'surface.brick' },
  { key: 'metal',        labelKey: 'surface.metal' },
  { key: 'glass',        labelKey: 'surface.glass' },
  { key: 'wood',         labelKey: 'surface.wood' },
  { key: 'other',        labelKey: 'surface.other' },
]

export default function UploadModal({ onClose, initialCenter }) {
  const [step, setStep] = useState(1)          // 1 = photo+location, 2 = details, 3 = done
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [pin, setPin] = useState(null)          // { lat, lng }
  const [gpsFromPhoto, setGpsFromPhoto] = useState(false)
  const [styles, setStyles] = useState([])       // multi-select types
  const [density, setDensity] = useState(null)    // 'light' | 'medium' | 'heavy'
  const [surface, setSurface] = useState(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [showSourceChoice, setShowSourceChoice] = useState(false)
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

  // Native: show our own styled chooser, then use the Camera plugin with the
  // chosen source. Web: fall back to the file input.
  const pickImage = () => {
    if (!Capacitor.isNativePlatform()) {
      fileInputRef.current?.click()
      return
    }
    setShowSourceChoice(true)
  }

  const captureFrom = async (which) => {
    setShowSourceChoice(false)
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: which === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      })
      if (!photo?.webPath) return
      const resp = await fetch(photo.webPath)
      const blob = await resp.blob()
      const ext = photo.format || 'jpg'
      const f = new File([blob], `graffiti.${ext}`, { type: blob.type || 'image/jpeg' })
      handleFile(f)
    } catch {
      /* user cancelled */
    }
  }

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
      styles.forEach(s => form.append('styles', s))
      if (density) form.append('density', density)
      if (surface) form.append('surface_type', surface)
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
                    onClick={pickImage}
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
                <p className="ul-field-hint">{t('upload.type.multi')}</p>
                <div className="ul-styles">
                  {STYLE_OPTIONS.map(o => (
                    <button
                      key={o.key}
                      className={'ul-style-card' + (styles.includes(o.key) ? ' on' : '')}
                      onClick={() => setStyles(cur => cur.includes(o.key) ? cur.filter(x => x !== o.key) : [...cur, o.key])}
                    >
                      <span className="ul-style-check" aria-hidden="true" />
                      <span className="ul-style-text">
                        <span className="ul-style-name">{t(o.labelKey)}</span>
                        <span className="ul-style-hint">{t(o.hintKey)}</span>
                      </span>
                    </button>
                  ))}
                </div>

                <label className="ul-field-label">{t('upload.density.label')} <span>{t('upload.desc.optional')}</span></label>
                <div className="ul-surface-chips">
                  {DENSITY_OPTIONS.map(o => (
                    <button
                      key={o.key}
                      type="button"
                      className={'ul-surface-chip' + (density === o.key ? ' on' : '')}
                      onClick={() => setDensity(density === o.key ? null : o.key)}
                    >
                      {t(o.labelKey)}
                    </button>
                  ))}
                </div>

                <label className="ul-field-label">{t('upload.surface.label')} <span>{t('upload.desc.optional')}</span></label>
                <div className="ul-surface-chips">
                  {SURFACE_OPTIONS.map(o => (
                    <button
                      key={o.key}
                      type="button"
                      className={'ul-surface-chip' + (surface === o.key ? ' on' : '')}
                      onClick={() => setSurface(surface === o.key ? null : o.key)}
                    >
                      {t(o.labelKey)}
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
                  <button className="ul-submit" disabled={submitting || styles.length === 0} onClick={submit}>
                    {submitting ? t('upload.submitting') : t('upload.submit')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {showSourceChoice && (
          <div className="ul-source-sheet" onClick={() => setShowSourceChoice(false)}>
            <div className="ul-source-card" onClick={e => e.stopPropagation()}>
              <p className="ul-source-title">{t('upload.source.title')}</p>
              <button className="ul-source-btn" onClick={() => captureFrom('camera')}>
                <span className="ul-source-ico">📷</span>{t('upload.source.camera')}
              </button>
              <button className="ul-source-btn" onClick={() => captureFrom('gallery')}>
                <span className="ul-source-ico">🖼️</span>{t('upload.source.gallery')}
              </button>
              <button className="ul-source-cancel" onClick={() => setShowSourceChoice(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
