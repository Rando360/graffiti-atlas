import { useState, useRef } from 'react'
import { t } from './i18n'

/**
 * Measurement tool for moderation — two modes:
 *
 *  • Precise (perspective): mark the 4 corners of a known rectangle on the wall
 *    (window, door, sign, N bricks…), give its real size, then box each graffiti.
 *    A homography flattens the wall, so area is correct even on an angled shot.
 *    Corner click-order doesn't matter (auto-sorted), and boxes that run past the
 *    wall's vanishing line are rejected instead of returning a huge number.
 *
 *  • Quick (line): draw a line along a known object, then box the graffiti.
 *    One flat scale — fine for a straight-on wall.
 *
 * Both modes support multiple boxes (add one per graffiti); the areas sum.
 */

/* ── geometry ────────────────────────────────────────────────────────────── */
function orderQuad(p) {
  // sort 4 points into TL, TR, BR, BL by row then column (robust for normal shots)
  const s = [...p].sort((a, b) => a.y - b.y)
  const top = s.slice(0, 2).sort((a, b) => a.x - b.x)
  const bot = s.slice(2, 4).sort((a, b) => a.x - b.x)
  return [top[0], top[1], bot[1], bot[0]]
}
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
    if (Math.abs(A[p][c]) < 1e-9) return null
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
// Area of an image-space box mapped through H, or null if it crosses the wall's
// vanishing line (denominator changes sign) — which would give a bogus huge value.
function mapBoxArea(H, box) {
  const c = [
    { x: box.x, y: box.y }, { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h },
  ]
  const dens = c.map(p => H[2][0] * p.x + H[2][1] * p.y + H[2][2])
  if (dens.some(d => Math.abs(d) < 1e-6)) return null
  if (!(dens.every(d => d > 0) || dens.every(d => d < 0))) return null
  const a = polyArea(c.map(p => mapPt(H, p.x, p.y)))
  return isFinite(a) && a > 0 ? a : null
}

const REFS = [
  { key: 'door',   meters: 2.0,  labelKey: 'measure.ref.door' },
  { key: 'person', meters: 1.7,  labelKey: 'measure.ref.person' },
  { key: 'window', meters: 1.15, labelKey: 'measure.ref.window' },
  { key: 'custom', meters: null, labelKey: 'measure.ref.custom' },
]
const SHAPES = [
  { key: 'door',   w: 0.9,  h: 2.0,  labelKey: 'measure.shape.door' },
  { key: 'window', w: 1.15, h: 1.15, labelKey: 'measure.shape.window' },
  { key: 'garage', w: 2.4,  h: 2.1,  labelKey: 'measure.shape.garage' },
  { key: 'plate',  w: 0.52, h: 0.11, labelKey: 'measure.shape.plate' },
  { key: 'bricks', w: null, h: null, labelKey: 'measure.shape.bricks' },
  { key: 'custom', w: null, h: null, labelKey: 'measure.shape.custom' },
]
const BRICK_W = 0.225, BRICK_H = 0.075

export default function MeasureEditor({ imageUrl, onDone, onCancel }) {
  const [tool, setTool] = useState('persp')

  // line mode
  const [lineStep, setLineStep] = useState('ref')
  const [refLine, setRefLine] = useState(null)
  const [refType, setRefType] = useState('door')
  const [customM, setCustomM] = useState('')

  // perspective mode
  const [corners, setCorners] = useState([])
  const [shape, setShape] = useState('window')
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')
  const [cols, setCols] = useState('')
  const [rows, setRows] = useState('')

  const [boxes, setBoxes] = useState([])          // graffiti boxes (both modes)
  const [drawing, setDrawing] = useState(null)
  const boxRef = useRef(null)

  const toPx = (e) => {
    const b = boxRef.current.getBoundingClientRect()
    return { x: Math.max(0, Math.min(b.width, e.clientX - b.left)), y: Math.max(0, Math.min(b.height, e.clientY - b.top)) }
  }

  const placingCorners = tool === 'persp' && corners.length < 4
  const drawingLine = tool === 'line' && lineStep === 'ref'
  const drawingBox = (tool === 'line' && lineStep === 'area') || (tool === 'persp' && corners.length === 4)

  const onClickCanvas = (e) => {
    if (!placingCorners) return
    const p = toPx(e)
    setCorners(c => (c.length < 4 ? [...c, p] : c))
  }
  const onMouseDown = (e) => {
    if (!drawingBox && !drawingLine) return
    const p = toPx(e); setDrawing({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  const onMouseMove = (e) => { if (drawing) { const p = toPx(e); setDrawing(d => ({ ...d, x1: p.x, y1: p.y })) } }
  const onMouseUp = () => {
    if (!drawing) return
    const w = Math.abs(drawing.x1 - drawing.x0), h = Math.abs(drawing.y1 - drawing.y0)
    if (drawingLine) {
      if (Math.hypot(drawing.x1 - drawing.x0, drawing.y1 - drawing.y0) > 10) { setRefLine(drawing); setLineStep('area') }
    } else if (drawingBox && w > 8 && h > 8) {
      setBoxes(bs => [...bs, { x: Math.min(drawing.x0, drawing.x1), y: Math.min(drawing.y0, drawing.y1), w, h }])
    }
    setDrawing(null)
  }

  // reference size (perspective)
  let refW = null, refH = null
  const shp = SHAPES.find(s => s.key === shape)
  if (shape === 'custom') { refW = parseFloat(customW) || null; refH = parseFloat(customH) || null }
  else if (shape === 'bricks') { refW = (parseInt(cols) || 0) * BRICK_W || null; refH = (parseInt(rows) || 0) * BRICK_H || null }
  else { refW = shp.w; refH = shp.h }

  // scale (line mode)
  const refMeters = refType === 'custom' ? parseFloat(customM) || null : REFS.find(r => r.key === refType).meters
  const refPx = refLine ? Math.hypot(refLine.x1 - refLine.x0, refLine.y1 - refLine.y0) : null
  const lineScale = refMeters && refPx ? refMeters / refPx : null

  // per-box areas + total
  let H = null
  if (tool === 'persp' && corners.length === 4 && refW && refH) {
    H = solveH(orderQuad(corners), [{ x: 0, y: 0 }, { x: refW, y: 0 }, { x: refW, y: refH }, { x: 0, y: refH }])
  }
  const areaOf = (b) => {
    if (tool === 'persp') return H ? mapBoxArea(H, b) : null
    return lineScale ? b.w * lineScale * b.h * lineScale : null
  }
  const boxAreas = boxes.map(areaOf)
  const anyInvalid = boxAreas.some(a => a == null) && boxes.length > 0
  const total = boxAreas.reduce((s, a) => s + (a || 0), 0)
  const totalArea = boxes.length && total > 0 ? Math.round(total * 10) / 10 : null

  const lineStyle = (l) => {
    const len = Math.hypot(l.x1 - l.x0, l.y1 - l.y0)
    const ang = Math.atan2(l.y1 - l.y0, l.x1 - l.x0) * 180 / Math.PI
    return { left: l.x0, top: l.y0, width: len, transform: `rotate(${ang}deg)` }
  }

  const undoBox = () => setBoxes(bs => bs.slice(0, -1))
  const startOver = () => { setBoxes([]); if (tool === 'persp') setCorners([]); else { setRefLine(null); setLineStep('ref') } }

  const hint = tool === 'persp'
    ? (corners.length < 4 ? t('measure.persp.corners')
      : !refW || !refH ? t('measure.persp.dims')
      : anyInvalid ? t('measure.persp.invalid')
      : t('measure.persp.area'))
    : (lineStep === 'ref' ? t('measure.hint.ref') : t('measure.persp.area'))

  const liveBox = drawing && drawingBox
    ? { x: Math.min(drawing.x0, drawing.x1), y: Math.min(drawing.y0, drawing.y1), w: Math.abs(drawing.x1 - drawing.x0), h: Math.abs(drawing.y1 - drawing.y0) }
    : null

  return (
    <div className="blur-overlay" onClick={onCancel}>
      <div className="blur-modal" onClick={e => e.stopPropagation()}>
        <div className="blur-head">
          <div><h3>{t('measure.title')}</h3><p>{hint}</p></div>
          <button className="blur-close" onClick={onCancel} aria-label={t('common.close')}>✕</button>
        </div>

        <div className="measure-modes">
          <button className={'mod-type' + (tool === 'persp' ? ' on' : '')} onClick={() => { setTool('persp'); setBoxes([]) }}>{t('measure.mode.persp')}</button>
          <button className={'mod-type' + (tool === 'line' ? ' on' : '')} onClick={() => { setTool('line'); setBoxes([]) }}>{t('measure.mode.line')}</button>
        </div>

        {tool === 'persp' ? (
          <div className="measure-refs">
            {SHAPES.map(s => (
              <button key={s.key} className={'mod-type' + (shape === s.key ? ' on' : '')} onClick={() => setShape(s.key)}>
                {t(s.labelKey)}{s.w ? ` (${s.w}×${s.h} m)` : ''}
              </button>
            ))}
            {shape === 'custom' && (<>
              <input className="mod-size-input" type="number" min="0.05" step="0.05" placeholder={t('measure.ref.width')} value={customW} onChange={e => setCustomW(e.target.value)} />
              <input className="mod-size-input" type="number" min="0.05" step="0.05" placeholder={t('measure.ref.height')} value={customH} onChange={e => setCustomH(e.target.value)} />
            </>)}
            {shape === 'bricks' && (<>
              <input className="mod-size-input" type="number" min="1" step="1" placeholder={t('measure.bricks.cols')} value={cols} onChange={e => setCols(e.target.value)} />
              <input className="mod-size-input" type="number" min="1" step="1" placeholder={t('measure.bricks.rows')} value={rows} onChange={e => setRows(e.target.value)} />
            </>)}
          </div>
        ) : (
          <div className="measure-refs">
            {REFS.map(r => (
              <button key={r.key} className={'mod-type' + (refType === r.key ? ' on' : '')} onClick={() => setRefType(r.key)}>
                {t(r.labelKey)}{r.meters ? ` (${r.meters} m)` : ''}
              </button>
            ))}
            {refType === 'custom' && (<input className="mod-size-input" type="number" min="0.05" step="0.05" placeholder="m" value={customM} onChange={e => setCustomM(e.target.value)} />)}
          </div>
        )}

        <div className="blur-canvas" ref={boxRef}
          onClick={onClickCanvas} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
          onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
          style={{ cursor: placingCorners ? 'copy' : 'crosshair' }}>
          <img src={imageUrl} alt="" draggable="false" />

          {tool === 'persp' && corners.length > 0 && (
            <svg className="measure-svg" width="100%" height="100%">
              {corners.length === 4 && <polygon points={orderQuad(corners).map(c => `${c.x},${c.y}`).join(' ')} className="measure-refquad" />}
              {corners.map((c, i) => (<g key={i}><circle cx={c.x} cy={c.y} r="9" className="measure-cnr" /><text x={c.x} y={c.y + 4} textAnchor="middle" className="measure-cnr-t">{i + 1}</text></g>))}
            </svg>
          )}

          {tool === 'line' && refLine && <div className="measure-line" style={lineStyle(refLine)} />}
          {tool === 'line' && drawing && drawingLine && <div className="measure-line live" style={lineStyle(drawing)} />}

          {boxes.map((b, i) => (
            <div key={i} className={'measure-rect' + (boxAreas[i] == null ? ' bad' : '')} style={{ left: b.x, top: b.y, width: b.w, height: b.h }}>
              <span className="measure-badge">{boxAreas[i] == null ? '⚠' : `${Math.round(boxAreas[i] * 10) / 10} m²`}</span>
            </div>
          ))}
          {liveBox && <div className="measure-rect live" style={{ left: liveBox.x, top: liveBox.y, width: liveBox.w, height: liveBox.h }} />}
        </div>

        <div className="blur-actions">
          <span className="blur-count">
            {anyInvalid ? t('measure.persp.invalid')
              : totalArea != null ? `${boxes.length} ${t('measure.boxes')} · ${totalArea} m²`
              : hint}
          </span>
          <div className="blur-btns">
            {boxes.length > 0 && <button className="blur-cancel" onClick={undoBox}>{t('measure.undoBox')}</button>}
            <button className="blur-cancel" onClick={startOver}>{t('measure.redo')}</button>
            <button className="blur-cancel" onClick={onCancel}>{t('common.cancel')}</button>
            <button className="blur-apply" disabled={totalArea == null || anyInvalid} onClick={() => onDone(totalArea)}>{t('measure.use')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
