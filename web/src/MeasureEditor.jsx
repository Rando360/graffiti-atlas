import { useState, useRef } from 'react'
import { t } from './i18n'

/**
 * Scale-reference measurement tool for moderation.
 *
 * Step 1: the moderator draws a line along a known object in the photo
 *         (door height, a person, a head…) and picks what it is.
 * Step 2: they draw a rectangle around the graffiti.
 *
 * Since we know the real-world length of the reference, we can convert
 * pixels to meters and estimate the graffiti's surface in m².
 * Assumes reference and graffiti are roughly on the same plane.
 */

const REFS = [
  { key: 'door',   meters: 2.0,  labelKey: 'measure.ref.door' },    // standard door height
  { key: 'person', meters: 1.7,  labelKey: 'measure.ref.person' },  // average adult
  { key: 'head',   meters: 0.23, labelKey: 'measure.ref.head' },    // average head height
  { key: 'window', meters: 1.15, labelKey: 'measure.ref.window' },  // typical window height
  { key: 'custom', meters: null, labelKey: 'measure.ref.custom' },
]

export default function MeasureEditor({ imageUrl, onDone, onCancel }) {
  const [mode, setMode] = useState('ref')        // 'ref' (line) | 'area' (rect)
  const [refLine, setRefLine] = useState(null)   // {x0,y0,x1,y1} px within canvas
  const [rect, setRect] = useState(null)         // {x,y,w,h} px
  const [drawing, setDrawing] = useState(null)
  const [refType, setRefType] = useState('door')
  const [customM, setCustomM] = useState('')
  const boxRef = useRef(null)

  const toPx = (e) => {
    const b = boxRef.current.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(b.width, e.clientX - b.left)),
      y: Math.max(0, Math.min(b.height, e.clientY - b.top)),
    }
  }

  const onMouseDown = (e) => {
    const p = toPx(e)
    setDrawing({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  const onMouseMove = (e) => {
    if (!drawing) return
    const p = toPx(e)
    setDrawing(d => ({ ...d, x1: p.x, y1: p.y }))
  }
  const onMouseUp = () => {
    if (!drawing) return
    const len = Math.hypot(drawing.x1 - drawing.x0, drawing.y1 - drawing.y0)
    if (mode === 'ref') {
      if (len > 10) { setRefLine(drawing); setMode('area') }
    } else {
      const w = Math.abs(drawing.x1 - drawing.x0)
      const h = Math.abs(drawing.y1 - drawing.y0)
      if (w > 10 && h > 10) {
        setRect({
          x: Math.min(drawing.x0, drawing.x1),
          y: Math.min(drawing.y0, drawing.y1),
          w, h,
        })
      }
    }
    setDrawing(null)
  }

  // ── Math ───────────────────────────────────────────────────────────────────
  const refMeters = refType === 'custom' ? parseFloat(customM) || null : REFS.find(r => r.key === refType).meters
  const refPx = refLine ? Math.hypot(refLine.x1 - refLine.x0, refLine.y1 - refLine.y0) : null
  const scale = refMeters && refPx ? refMeters / refPx : null   // meters per pixel

  let area = null, widthM = null, heightM = null
  if (scale && rect) {
    widthM = rect.w * scale
    heightM = rect.h * scale
    area = Math.round(widthM * heightM * 10) / 10
  }

  // Line rendering (rotated div)
  const lineStyle = (l, cls) => {
    const len = Math.hypot(l.x1 - l.x0, l.y1 - l.y0)
    const ang = Math.atan2(l.y1 - l.y0, l.x1 - l.x0) * 180 / Math.PI
    return {
      left: l.x0, top: l.y0, width: len,
      transform: `rotate(${ang}deg)`,
    }
  }

  const reset = () => { setRefLine(null); setRect(null); setMode('ref') }

  return (
    <div className="blur-overlay" onClick={onCancel}>
      <div className="blur-modal" onClick={e => e.stopPropagation()}>
        <div className="blur-head">
          <div>
            <h3>{t('measure.title')}</h3>
            <p>{mode === 'ref' ? t('measure.step1') : rect ? t('measure.done') : t('measure.step2')}</p>
          </div>
          <button className="blur-close" onClick={onCancel} aria-label={t('common.close')}>✕</button>
        </div>

        <div className="measure-refs">
          {REFS.map(r => (
            <button
              key={r.key}
              className={'mod-type' + (refType === r.key ? ' on' : '')}
              onClick={() => setRefType(r.key)}
            >
              {t(r.labelKey)}{r.meters ? ` (${r.meters} m)` : ''}
            </button>
          ))}
          {refType === 'custom' && (
            <input
              className="mod-size-input"
              type="number"
              min="0.05"
              step="0.05"
              placeholder="m"
              value={customM}
              onChange={e => setCustomM(e.target.value)}
            />
          )}
        </div>

        <div
          className="blur-canvas"
          ref={boxRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{ cursor: 'crosshair' }}
        >
          <img src={imageUrl} alt="" draggable="false" />

          {refLine && <div className="measure-line" style={lineStyle(refLine)} />}
          {drawing && mode === 'ref' && <div className="measure-line live" style={lineStyle(drawing)} />}

          {rect && (
            <div
              className="measure-rect"
              style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            >
              {area != null && (
                <span className="measure-badge">
                  {widthM.toFixed(1)} × {heightM.toFixed(1)} m ≈ {area} m²
                </span>
              )}
            </div>
          )}
          {drawing && mode === 'area' && (
            <div
              className="measure-rect live"
              style={{
                left: Math.min(drawing.x0, drawing.x1),
                top: Math.min(drawing.y0, drawing.y1),
                width: Math.abs(drawing.x1 - drawing.x0),
                height: Math.abs(drawing.y1 - drawing.y0),
              }}
            />
          )}
        </div>

        <div className="blur-actions">
          <span className="blur-count">
            {area != null ? `≈ ${area} m²` : mode === 'ref' ? t('measure.hint.ref') : t('measure.hint.area')}
          </span>
          <div className="blur-btns">
            <button className="blur-cancel" onClick={reset}>{t('measure.redo')}</button>
            <button className="blur-cancel" onClick={onCancel}>{t('common.cancel')}</button>
            <button
              className="blur-apply"
              disabled={area == null || !refMeters}
              onClick={() => onDone(area)}
            >
              {t('measure.use')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
