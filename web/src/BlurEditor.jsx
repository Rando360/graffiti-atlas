import { useState, useRef, useCallback } from 'react'
import { supabase } from './supabase'
import { t } from './i18n'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

/**
 * Lets a moderator draw blur rectangles over a photo (faces, plates).
 * Rectangles are stored normalised (0..1) and sent to the backend, which
 * does the actual blurring. Displaying the image needs no CORS/canvas.
 */
export default function BlurEditor({ graffitiId, imageUrl, onDone, onCancel }) {
  const [rects, setRects] = useState([])          // {x,y,w,h} normalised
  const [drawing, setDrawing] = useState(null)    // in-progress rect (pixels)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const boxRef = useRef(null)
  const imgRef = useRef(null)

  const clamp01 = (v) => Math.max(0, Math.min(1, v))
  const toNorm = (px) => {
    const el = imgRef.current || boxRef.current
    const b = el.getBoundingClientRect()
    return {
      x: clamp01((px.x - b.left) / b.width),
      y: clamp01((px.y - b.top) / b.height),
    }
  }

  const onMouseDown = (e) => {
    const start = toNorm({ x: e.clientX, y: e.clientY })
    setDrawing({ x0: start.x, y0: start.y, x1: start.x, y1: start.y })
  }
  const onMouseMove = (e) => {
    if (!drawing) return
    const p = toNorm({ x: e.clientX, y: e.clientY })
    setDrawing(d => ({ ...d, x1: p.x, y1: p.y }))
  }
  const onMouseUp = () => {
    if (!drawing) return
    const x = Math.min(drawing.x0, drawing.x1)
    const y = Math.min(drawing.y0, drawing.y1)
    const w = Math.abs(drawing.x1 - drawing.x0)
    const h = Math.abs(drawing.y1 - drawing.y0)
    if (w > 0.02 && h > 0.02) setRects(r => [...r, { x, y, w, h }])
    setDrawing(null)
  }

  const removeRect = (i) => setRects(r => r.filter((_, idx) => idx !== i))

  const apply = useCallback(async () => {
    if (rects.length === 0) return
    setSaving(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${API_URL}/moderation/graffiti/${graffitiId}/blur`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rects }),
      })
      if (!res.ok) throw new Error(t('blur.failed'))
      onDone()   // parent refreshes the thumbnail
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }, [rects, graffitiId, onDone])

  // live preview rect while dragging
  const live = drawing && {
    left: `${Math.min(drawing.x0, drawing.x1) * 100}%`,
    top: `${Math.min(drawing.y0, drawing.y1) * 100}%`,
    width: `${Math.abs(drawing.x1 - drawing.x0) * 100}%`,
    height: `${Math.abs(drawing.y1 - drawing.y0) * 100}%`,
  }

  return (
    <div className="blur-overlay" onClick={onCancel}>
      <div className="blur-modal" onClick={e => e.stopPropagation()}>
        <div className="blur-head">
          <div>
            <h3>{t('blur.title')}</h3>
            <p>{t('blur.instructions')}</p>
          </div>
          <button className="blur-close" onClick={onCancel} aria-label="Fermer">✕</button>
        </div>

        <div
          className="blur-canvas"
          ref={boxRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <img ref={imgRef} src={imageUrl} alt={t('blur.imageAlt')} draggable="false" />
          {rects.map((r, i) => (
            <div
              key={i}
              className="blur-rect"
              style={{ left: `${r.x*100}%`, top: `${r.y*100}%`, width: `${r.w*100}%`, height: `${r.h*100}%` }}
            >
              <button className="blur-rect-del" onClick={(e) => { e.stopPropagation(); removeRect(i) }}>✕</button>
            </div>
          ))}
          {live && <div className="blur-rect live" style={live} />}
        </div>

        {error && <div className="blur-error">{error}</div>}

        <div className="blur-actions">
          <span className="blur-count">{rects.length} {rects.length !== 1 ? t('blur.zones') : t('blur.zone')}</span>
          <div className="blur-btns">
            <button className="blur-cancel" onClick={onCancel}>{t('common.cancel')}</button>
            <button className="blur-apply" disabled={saving || rects.length === 0} onClick={apply}>
              {saving ? t('blur.applying') : t('blur.apply')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
