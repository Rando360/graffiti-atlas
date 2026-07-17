import { useState, useRef, useCallback, useEffect } from 'react'
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps'
import exifr from 'exifr'
import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

const STYLE_OPTIONS = [
  { key: 'tag',     label: 'Tag',       hint: 'Signature rapide, un seul trait, souvent une couleur.' },
  { key: 'throwup', label: 'Throw-up',  hint: 'Lettres en bulles, contour + remplissage (2 couleurs).' },
  { key: 'piece',   label: 'Piece',     hint: 'Œuvre complète et travaillée, multicolore et détaillée.' },
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
    if (!f.type.startsWith('image/')) { setError('Veuillez choisir une image.'); return }
    if (f.size > 15 * 1024 * 1024) { setError('Image trop lourde (max 15 Mo).'); return }
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
      if (!session) throw new Error('Vous devez être connecté.')

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
        throw new Error(err.detail || 'Échec de l\'envoi.')
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
        <button className="ul-close" onClick={onClose} aria-label="Fermer">✕</button>

        {step === 3 ? (
          <div className="ul-done">
            <div className="ul-done-icon">✓</div>
            <h3>Merci pour votre contribution&nbsp;!</h3>
            <p>Votre graffiti a bien été envoyé. Il apparaîtra sur la carte après vérification par notre équipe.</p>
            <button className="ul-submit" onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <>
            <div className="ul-head">
              <h3>Signaler un graffiti</h3>
              <div className="ul-steps">
                <span className={step >= 1 ? 'on' : ''}>1. Photo &amp; lieu</span>
                <span className={step >= 2 ? 'on' : ''}>2. Détails</span>
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
                    <p className="ul-drop-main">Glissez une photo ici ou cliquez pour choisir</p>
                    <p className="ul-drop-sub">JPEG, PNG ou WebP · 15 Mo max</p>
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
                      <img src={preview} alt="Aperçu" />
                      <button className="ul-change" onClick={() => { setFile(null); setPreview(null); setPin(null) }}>
                        Changer de photo
                      </button>
                    </div>

                    <div className="ul-loc-label">
                      {gpsFromPhoto
                        ? '📍 Position détectée depuis la photo — ajustez si besoin'
                        : '📍 Placez le marqueur à l\'emplacement du graffiti'}
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
                    <p className="ul-map-hint">Cliquez sur la carte ou glissez le marqueur pour ajuster.</p>
                  </>
                )}

                {error && <div className="ul-error">{error}</div>}

                <div className="ul-actions">
                  <button className="ul-cancel" onClick={onClose}>Annuler</button>
                  <button className="ul-submit" disabled={!file || !pin} onClick={() => setStep(2)}>
                    Continuer
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="ul-body">
                <label className="ul-field-label">Type de graffiti <span className="req">obligatoire</span></label>
                <div className="ul-styles">
                  {STYLE_OPTIONS.map(o => (
                    <button
                      key={o.key}
                      className={'ul-style-card' + (style === o.key ? ' on' : '')}
                      onClick={() => setStyle(o.key)}
                    >
                      <span className="ul-style-check" aria-hidden="true" />
                      <span className="ul-style-text">
                        <span className="ul-style-name">{o.label}</span>
                        <span className="ul-style-hint">{o.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>

                <label className="ul-field-label">Description <span>(optionnel)</span></label>
                <textarea
                  className="ul-note"
                  placeholder="Couleurs, style, artiste, contexte…"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  maxLength={500}
                  rows={3}
                />

                {error && <div className="ul-error">{error}</div>}

                <div className="ul-actions">
                  <button className="ul-cancel" onClick={() => setStep(1)}>← Retour</button>
                  <button className="ul-submit" disabled={submitting || !style} onClick={submit}>
                    {submitting ? 'Envoi…' : 'Envoyer'}
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
