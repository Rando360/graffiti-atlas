import { useState, useRef } from 'react'
import { t } from './i18n'

/**
 * Measurement tool for moderation — two modes:
 *
 *  • Quick (line):  draw a line along a known object, then a box around the
 *    graffiti. One flat meters-per-pixel scale. Fast, but only accurate on a
 *    straight-on wall with the reference at the same distance.
 *
 *  • Precise (perspective): mark the 4 corners of a known rectangle on the wall
 *    (window, door, sign, N bricks…), give its real size, then box the graffiti.
 *    A homography flattens the wall, so the area is correct even on an angled
 *    shot. This is the accurate path.
 */

/* ── homography math ─────────────────────────────────────────────────────── */
function solveH(src, dst) {
  const A = [], b = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v)
  }
  const n = 8
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    if (Math.abs(A[p][c]) < 1e-9) return null           // degenerate (collinear corners)
    ;[A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = A[r][c] / A[c][c]
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]
      b[r] -= f * b[c]
    }
  }
  const h = b.map((v, i) => v / A[i][i])
  return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]]
}
function mapPt(H, x, y) {
  const d = H[2][0] * x + H[2][1] * y + H[2][2]
  return { x: (H[0][0] * x + H[0][1] * y + H[0][2]) / d, y: (H[1][0] * x + H[1][1] * y + H[1][2]) / d }
}
function polyArea(pts) {
  let a = 0
  for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; a += pts[i].x * pts[j].y - pts[j].x * pts[i].y }
  return Math.abs(a) / 2
}

/* ── quick-mode single-length references ─────────────────────────────────── */
const REFS = [
  { key: 'door',   meters: 2.0,  labelKey: 'measure.ref.door' },
  { key: 'person', meters: 1.7,  labelKey: 'measure.ref.person' },
  { key: 'window', meters: 1.15, labelKey: 'measure.ref.window' },
  { key: 'custom', meters: null, labelKey: 'measure.ref.custom' },
]

/* ── precise-mode reference rectangles (real width × height, metres) ──────── */
const SHAPES = [
  { key: 'door',   w: 0.9,  h: 2.0,  labelKey: 'measure.shape.door' },
  { key: 'window', w: 1.15, h: 1.15, labelKey: 'measure.shape.window' },
  { key: 'garage', w: 2.4,  h: 2.1,  labelKey: 'measure.shape.garage' },
  { key: 'plate',  w: 0.52, h: 0.11, labelKey: 'measure.shape.plate' },
  { key: 'bricks', w: null, h: null, labelKey: 'measure.shape.bricks' },
  { key: 'custom', w: null, h: null, labelKey: 'measure.shape.custom' },
]
const BRICK_W = 0.225   // one brick incl. mortar
const BRICK_H = 0.075   // one course incl. mortar

export default function MeasureEditor({ imageUrl, onDone, onCancel }) {
  const [tool, setTool] = useState('persp')      // 'persp' | 'line'

  // quick (line) mode
  const [lineStep, setLineStep] = useState('ref')
  const [refLine, setRefLine] = useState(null)
  const [lineRect, setLineRect] = useState(null)
  const [refType, setRefType] = useState('door')
  const [customM, setCustomM] = useState('')

  // precise (perspective) mode
  const [corners, setCorners] = useState([])     // up to 4 {x,y}
  const [shape, setShape] = useState('window')
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')
  const [cols, setCols] = useState('')
  const [rows, setRows] = useState('')
  const [gRect, setGRect] = useState(null)       // graffiti box

  const [drawing, setDrawing] = useState(null)
  const boxRef = useRef(null)

  const toPx = (e) => {
    const b = boxRef.current.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(b.width, e.clientX - b.left)),
      y: Math.max(0, Math.min(b.height, e.clientY - b.top)),
    }
  }

  const placingCorners = tool === 'persp' && corners.length < 4
  const drawingBox =
    (tool === 'line' && lineStep === 'area') ||
    (tool === 'persp' && corners.length === 4)
  const drawingLine = tool === 'line' && lineStep === 'ref'

  const onClickCanvas = (e) => {
    if (!placingCorners) return
    const p = toPx(e)
    setCorners(c => (c.length < 4 ? [...c, p] : c))
  }
  const onMouseDown = (e) => {
    if (!drawingBox && !drawingLine) return
    const p = toPx(e)
    setDrawing({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  const onMouseMove = (e) => {
    if (!drawing) return
    const p = toPx(e)
    setDrawing(d => ({ ...d, x1: p.x, y1: p.y }))
  }
  const onMouseUp = () => {
    if (!drawing) { return }
    const w = Math.abs(drawing.x1 - drawing.x0), h = Math.abs(drawing.y1 - drawing.y0)
    const box = { x: Math.min(drawing.x0, drawing.x1), y: Math.min(drawing.y0, drawing.y1), w, h }
    if (drawingLine) {
      const len = Math.hypot(drawing.x1 - drawing.x0, drawing.y1 - drawing.y0)
      if (len > 10) { setRefLine(drawing); setLineStep('area') }
    } else if (drawingBox && w > 8 && h > 8) {
      if (tool === 'line') setLineRect(box); else setGRect(box)
    }
    setDrawing(null)
  }

  /* ── reference dimensions (precise mode) ──────────────────────────────── */
  let refW = null, refH = null
  const sh = SHAPES.find(s => s.key === shape)
  if (shape === 'custom') { refW = parseFloat(customW) || null; refH = parseFloat(customH) || null }
  else if (shape === 'bricks') { refW = (parseInt(cols) || 0) * BRICK_W || null; refH = (parseInt(rows) || 0) * BRICK_H || null }
  else { refW = sh.w; refH = sh.h }

  /* ── area ─────────────────────────────────────────────────────────────── */
  let area = null, dimLabel = null
  if (tool === 'persp') {
    if (corners.length === 4 && refW && refH && gRect) {
      const H = solveH(corners, [{ x: 0, y: 0 }, { x: refW, y: 0 }, { x: refW, y: refH }, { x: 0, y: refH }])
      if (H) {
        const box = [
          { x: gRect.x, y: gRect.y }, { x: gRect.x + gRect.w, y: gRect.y },
          { x: gRect.x + gRect.w, y: gRect.y + gRect.h }, { x: gRect.x, y: gRect.y + gRect.h },
        ].map(p => mapPt(H, p.x, p.y))
        const a = polyArea(box)
        if (isFinite(a) && a > 0 && a < 100000) { area = Math.round(a * 10) / 10 }
      }
    }
  } else {
    const refMeters = refType === 'custom' ? parseFloat(customM) || null : REFS.find(r => r.key === refType).meters
    const refPx = refLine ? Math.hypot(refLine.x1 - refLine.x0, refLine.y1 - refLine.y0) : null
    const scale = refMeters && refPx ? refMeters / refPx : null
    if (scale && lineRect) {
      const wM = lineRect.w * scale, hM = lineRect.h * scale
      area = Math.round(wM * hM * 10) / 10
      dimLabel = `${wM.toFixed(1)} × ${hM.toFixed(1)} m`
    }
  }

  const lineStyle = (l) => {
    const len = Math.hypot(l.x1 - l.x0, l.y1 - l.y0)
    const ang = Math.atan2(l.y1 - l.y0, l.x1 - l.x0) * 180 / Math.PI
    return { left: l.x0, top: l.y0, width: len, transform: `rotate(${ang}deg)` }
  }

  const resetPersp = () => { setCorners([]); setGRect(null) }
  const resetLine = () => { setRefLine(null); setLineRect(null); setLineStep('ref') }
  const reset = () => { tool === 'persp' ? resetPersp() : resetLine() }

  const hint = tool === 'persp'
    ? (corners.length < 4 ? t('measure.persp.corners') : !refW || !refH ? t('measure.persp.dims') : !gRect ? t('measure.persp.area') : t('measure.done'))
    : (lineStep === 'ref' ? t('measure.hint.ref') : lineRect ? t('measure.done') : t('measure.hint.area'))

  const liveBox = drawing && drawingBox
    ? { x: Math.min(drawing.x0, drawing.x1), y: Math.min(drawing.y0, drawing.y1), w: Math.abs(drawing.x1 - drawing.x0), h: Math.abs(drawing.y1 - drawing.y0) }
    : null
  const shownBox = tool === 'persp' ? gRect : lineRect

  return (
    <div className="blur-overlay" onClick={onCancel}>
      <div className="blur-modal" onClick={e => e.stopPropagation()}>
        <div className="blur-head">
          <div>
            <h3>{t('measure.title')}</h3>
            <p>{hint}</p>
          </div>
          <button className="blur-close" onClick={onCancel} aria-label={t('common.close')}>✕</button>
        </div>

        <div className="measure-modes">
          <button className={'mod-type' + (tool === 'persp' ? ' on' : '')} onClick={() => setTool('persp')}>{t('measure.mode.persp')}</button>
          <button className={'mod-type' + (tool === 'line' ? ' on' : '')} onClick={() => setTool('line')}>{t('measure.mode.line')}</button>
        </div>

        {tool === 'persp' ? (
          <div className="measure-refs">
            {SHAPES.map(s => (
              <button key={s.key} className={'mod-type' + (shape === s.key ? ' on' : '')} onClick={() => setShape(s.key)}>
                {t(s.labelKey)}{s.w ? ` (${s.w}×${s.h} m)` : ''}
              </button>
            ))}
            {shape === 'custom' && (
              <>
                <input className="mod-size-input" type="number" min="0.05" step="0.05" placeholder={t('measure.ref.width')} value={customW} onChange={e => setCustomW(e.target.value)} />
                <input className="mod-size-input" type="number" min="0.05" step="0.05" placeholder={t('measure.ref.height')} value={customH} onChange={e => setCustomH(e.target.value)} />
              </>
            )}
            {shape === 'bricks' && (
              <>
                <input className="mod-size-input" type="number" min="1" step="1" placeholder={t('measure.bricks.cols')} value={cols} onChange={e => setCols(e.target.value)} />
                <input className="mod-size-input" type="number" min="1" step="1" placeholder={t('measure.bricks.rows')} value={rows} onChange={e => setRows(e.target.value)} />
              </>
            )}
          </div>
        ) : (
          <div className="measure-refs">
            {REFS.map(r => (
              <button key={r.key} className={'mod-type' + (refType === r.key ? ' on' : '')} onClick={() => setRefType(r.key)}>
                {t(r.labelKey)}{r.meters ? ` (${r.meters} m)` : ''}
              </button>
            ))}
            {refType === 'custom' && (
              <input className="mod-size-input" type="number" min="0.05" step="0.05" placeholder="m" value={customM} onChange={e => setCustomM(e.target.value)} />
            )}
          </div>
        )}

        <div
          className="blur-canvas"
          ref={boxRef}
          onClick={onClickCanvas}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{ cursor: placingCorners ? 'copy' : 'crosshair' }}
        >
          <img src={imageUrl} alt="" draggable="false" />

          {/* precise-mode corner markers + reference quad */}
          {tool === 'persp' && corners.length > 0 && (
            <svg className="measure-svg" width="100%" height="100%">
              {corners.length === 4 && (
                <polygon points={corners.map(c => `${c.x},${c.y}`).join(' ')} className="measure-refquad" />
              )}
              {corners.map((c, i) => (
                <g key={i}>
                  <circle cx={c.x} cy={c.y} r="9" className="measure-cnr" />
                  <text x={c.x} y={c.y + 4} textAnchor="middle" className="measure-cnr-t">{i + 1}</text>
                </g>
              ))}
            </svg>
          )}

          {/* line mode reference line */}
          {tool === 'line' && refLine && <div className="measure-line" style={lineStyle(refLine)} />}
          {tool === 'line' && drawing && drawingLine && <div className="measure-line live" style={lineStyle(drawing)} />}

          {/* graffiti box (both modes) */}
          {shownBox && (
            <div className="measure-rect" style={{ left: shownBox.x, top: shownBox.y, width: shownBox.w, height: shownBox.h }}>
              {area != null && (
                <span className="measure-badge">{dimLabel ? dimLabel + ' ≈ ' : '≈ '}{area} m²</span>
              )}
            </div>
          )}
          {liveBox && (
            <div className="measure-rect live" style={{ left: liveBox.x, top: liveBox.y, width: liveBox.w, height: liveBox.h }} />
          )}
        </div>

        <div className="blur-actions">
          <span className="blur-count">{area != null ? `≈ ${area} m²` : hint}</span>
          <div className="blur-btns">
            <button className="blur-cancel" onClick={reset}>{t('measure.redo')}</button>
            <button className="blur-cancel" onClick={onCancel}>{t('common.cancel')}</button>
            <button className="blur-apply" disabled={area == null} onClick={() => onDone(area)}>{t('measure.use')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
