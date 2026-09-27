import { useEffect, useMemo, useState } from 'react'
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps'
import { t } from './i18n'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
const CLOUDFRONT = 'https://d36hw3x1088tvv.cloudfront.net'
const DUP_M = 10     // highlight any point within 10 m of another
const DROP_M = 25    // drop within 25 m of another point = link them

function haversine(a, b) {
  const R = 6371000, p = Math.PI / 180
  const dLat = (b.lat - a.lat) * p, dLng = (b.lng - a.lng) * p
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

// Pans/zooms the map to a chosen point when you click a photo in the panel below.
function FocusPanner({ focus }) {
  const map = useMap()
  useEffect(() => {
    if (!map || !focus) return
    map.panTo({ lat: focus.lat, lng: focus.lng })
    if ((map.getZoom() || 0) < 19) map.setZoom(19)
  }, [map, focus])
  return null
}

// Frame the map on the two points of the current review pair so both are visible.
function PairFitter({ pair }) {
  const map = useMap()
  const aId = pair && pair[0] ? pair[0].id : null
  const bId = pair && pair[1] ? pair[1].id : null
  useEffect(() => {
    if (!map || !pair || !pair[0] || !pair[1]) return
    const b = new window.google.maps.LatLngBounds()
    b.extend({ lat: pair[0].lat, lng: pair[0].lng })
    b.extend({ lat: pair[1].lat, lng: pair[1].lng })
    map.fitBounds(b, 150)
    const l = window.google.maps.event.addListenerOnce(map, 'idle', () => {
      if ((map.getZoom() || 0) > 20) map.setZoom(20)   // very-close pairs: don't slam to max
    })
    return () => { if (l) l.remove() }
  }, [map, aId, bId])
  return null
}

function BoundsWatcher({ points, onBounds }) {
  const map = useMap()
  useEffect(() => {
    if (!map || !points.length) return
    const b = new window.google.maps.LatLngBounds()
    points.forEach(p => b.extend({ lat: p.lat, lng: p.lng }))
    map.fitBounds(b, 60)
  }, [map, points.length])
  useEffect(() => {
    if (!map) return
    const l = map.addListener('idle', () => {
      const b = map.getBounds()
      if (b) {
        const ne = b.getNorthEast(), sw = b.getSouthWest()
        onBounds({ n: ne.lat(), s: sw.lat(), e: ne.lng(), w: sw.lng() })
      }
    })
    return () => l.remove()
  }, [map, onBounds])
  return null
}

export default function ModerationMap({ points, edges, onLink, onDelete, onIgnorePair }) {
  const [bounds, setBounds] = useState(null)
  const [version, setVersion] = useState(0)   // bump to snap dragged markers back
  const [compare, setCompare] = useState([])  // up to 2 selected points
  const [focus, setFocus] = useState(null)    // point the map is panned to
  const [zoomUrl, setZoomUrl] = useState(null) // enlarged photo (lightbox)
  const [qi, setQi] = useState(0)             // review-queue index

  // Groups come from the stored open pairs (edges), not on-the-fly distance maths.
  // Connected components of the edge graph = clusters of close photos.
  const dupGroups = useMemo(() => {
    const idx = new globalThis.Map(points.map((p, i) => [p.id, i]))  // built-in Map, not vis.gl
    const parent = points.map((_, i) => i)
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
    ;(edges || []).forEach(([a, b]) => {
      const ia = idx.get(a), ib = idx.get(b)
      if (ia != null && ib != null) { const ra = find(ia), rb = find(ib); if (ra !== rb) parent[ra] = rb }
    })
    const inEdge = new Set()
    ;(edges || []).forEach(([a, b]) => { inEdge.add(a); inEdge.add(b) })
    const m = new globalThis.Map()
    for (let i = 0; i < points.length; i++) {
      if (!inEdge.has(points[i].id)) continue
      const r = find(i); if (!m.has(r)) m.set(r, []); m.get(r).push(points[i])
    }
    return Array.from(m.values()).filter(g => g.length > 1).sort((a, b) => b.length - a.length)
  }, [points, edges])

  const dupIds = useMemo(() => {
    const s = new Set()
    ;(edges || []).forEach(([a, b]) => { s.add(a); s.add(b) })
    return s
  }, [edges])

  const compareIds = useMemo(() => new Set(compare.map(p => p.id)), [compare])

  // Only points still involved in an open pair (plus whatever you have selected)
  // get markers — so merged/ignored points drop off the map right away.
  const visible = useMemo(() => {
    const inB = p => !bounds || (p.lat <= bounds.n && p.lat >= bounds.s && p.lng <= bounds.e && p.lng >= bounds.w)
    return points.filter(p =>
      inB(p) && (dupIds.has(p.id) || compareIds.has(p.id) || pairIds.has(p.id) || focus?.id === p.id)).slice(0, 1500)
  }, [points, bounds, dupIds, compareIds, pairIds, focus])
  const center = points.length ? { lat: points[0].lat, lng: points[0].lng } : { lat: 45.188, lng: 5.724 }

  const toggleCompare = (p) => setCompare(cur => {
    if (cur.find(x => x.id === p.id)) return cur.filter(x => x.id !== p.id)
    if (cur.length < 2) return [...cur, p]
    return [cur[1], p]  // keep last picked, replace the oldest
  })

  // Clicking a photo in the panel: locate it on the map and add to the compare pair
  // (without toggling it off if clicked again).
  const selectForCompare = (p) => setCompare(cur =>
    cur.find(x => x.id === p.id) ? cur : (cur.length < 2 ? [...cur, p] : [cur[1], p]))
  const focusOn = (p) => { setFocus({ lat: p.lat, lng: p.lng, id: p.id, k: Date.now() }); selectForCompare(p) }

  // ── Review queue: one close PAIR at a time (two photos side by side) ──
  const pointById = useMemo(() => new globalThis.Map(points.map(p => [p.id, p])), [points])
  const pairs = useMemo(
    () => (edges || []).map(([a, b]) => [pointById.get(a), pointById.get(b)]).filter(pr => pr[0] && pr[1]),
    [edges, pointById]
  )
  const pair = pairs.length ? pairs[Math.min(qi, pairs.length - 1)] : null

  // Pan/zoom to the current pair as the queue advances.
  const pairKey = pair ? pair[0].id + ',' + pair[1].id : ''
  const pairIds = useMemo(() => new Set(pair ? [pair[0].id, pair[1].id] : []), [pairKey])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setFocus(null)   // PairFitter frames both points; Street View falls back to pair[0]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairKey])

  const mergePair = async (pr) => {
    if (!pr || !pr[0] || !pr[1]) return
    if (!window.confirm(t('mod.map.confirmLink'))) return
    await onLink(pr[0].id, pr[1].id)   // left merges into right → the right photo stays
    setCompare([])                     // resolved pair drops out on refresh; next slides in
  }

  const ignoreThisPair = async (pr) => {
    if (!pr || !pr[0] || !pr[1] || !onIgnorePair) return
    await onIgnorePair(pr[0].id, pr[1].id)
    setCompare([])
  }

  const skipPair = () => setQi(i => i + 1)

  const doMerge = async () => {
    if (compare.length !== 2) return
    if (!window.confirm(t('mod.map.confirmLink'))) return
    await onLink(compare[1].id, compare[0].id)   // link the 2nd into the 1st's location
    setCompare([])   // pair resolved — clear selection so both drop off the map
  }

  const doDelete = async (p) => {
    if (!onDelete || !window.confirm(t('mod.map.confirmDelete'))) return
    await onDelete(p.id)
    setCompare(c => c.filter(x => x.id !== p.id))
  }

  const doIgnore = async () => {
    if (compare.length !== 2 || !onIgnorePair) return
    await onIgnorePair(compare[0].id, compare[1].id)   // never flag these two together again
    setCompare([])
  }

  const handleDrop = async (p, e) => {
    const ll = e?.latLng
    const lat = ll ? (typeof ll.lat === 'function' ? ll.lat() : ll.lat) : null
    const lng = ll ? (typeof ll.lng === 'function' ? ll.lng() : ll.lng) : null
    if (lat != null && lng != null) {
      let best = null, bestD = Infinity
      for (const q of points) {
        if (q.id === p.id) continue
        const d = haversine({ lat, lng }, q)
        if (d < bestD) { bestD = d; best = q }
      }
      if (best && bestD <= DROP_M && window.confirm(t('mod.map.confirmLink'))) {
        await onLink(p.id, best.id)
      }
    }
    setVersion(v => v + 1)
  }

  if (!API_KEY) return <div className="mod-empty">{t('mod.map.nokey')}</div>
  if (!points.length) return <div className="mod-empty">{t('mod.map.dupsEmpty')}</div>

  const svPoint = focus || (pair ? pair[0] : null)   // pair[0] drives Street View in the queue

  return (
    <div className="mod-map-wrap">
      <div className="mod-map-bar">
        <span className="mod-map-dup">{(edges || []).length} {t('mod.map.close')}</span>
        <span className="mod-tbl-count">{dupGroups.length} {t('mod.map.dupGroupsShort')}</span>
        <span className="mod-map-hint">{t('mod.map.compareHint')}</span>
      </div>

      <div className="mod-map-layout">
        <div className="mod-map-left">
      {/* Top: the map. */}
      <div className="mod-map">
        <APIProvider apiKey={API_KEY}>
          <Map className="mod-map-canvas" defaultCenter={center} defaultZoom={16} gestureHandling="greedy"
               mapId="graffiti-atlas-map" clickableIcons={false}>
            <BoundsWatcher points={points} onBounds={setBounds} />
            <FocusPanner focus={focus} />
            <PairFitter pair={pair} />
            {visible.map(p => (
              <AdvancedMarker
                key={p.id + ':' + version}
                position={{ lat: p.lat, lng: p.lng }}
                draggable
                onDragEnd={(e) => handleDrop(p, e)}
                title={t('mod.map.dragTip')}
              >
                <div className="mod-map-hit" onClick={() => { toggleCompare(p); setFocus({ lat: p.lat, lng: p.lng, id: p.id, k: Date.now() }) }}>
                  <span className={'mod-map-pin'
                    + (p.status === 'approved' ? ' appr' : '')
                    + (dupIds.has(p.id) ? ' dup' : '')
                    + (compareIds.has(p.id) ? ' sel' : '')
                    + (pairIds.has(p.id) ? ' review' : '')} />
                </div>
              </AdvancedMarker>
            ))}
          </Map>
        </APIProvider>

        <div className="mod-map-legend">
          <span><i className="mod-map-dot dup" /> {t('mod.map.legend.close')}</span>
          <span><i className="mod-map-dot" /> {t('mod.map.legend.iso')}</span>
          <span><i className="mod-map-dot appr" /> {t('mod.map.legend.approved')}</span>
          <span><i className="mod-map-dot sel" /> {t('mod.map.legend.picked')}</span>
        </div>
      </div>

      {/* Bottom: one Street View of the point you last clicked — tells same-side
          from across-the-street. */}
      <div className="mod-map-sv-wrap">
        {svPoint && API_KEY
          ? <iframe
              key={`${svPoint.lat},${svPoint.lng}`}
              className="mod-map-sv"
              title="Street View"
              src={`https://www.google.com/maps/embed/v1/streetview?key=${API_KEY}&location=${svPoint.lat},${svPoint.lng}&fov=90&pitch=0`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          : <div className="mod-map-sv-empty">{t('mod.map.svHint')}</div>}
      </div>
        </div>{/* /mod-map-left */}

        <div className="mod-map-side">
      {/* One-click review queue: current close PAIR side by side, Merge / Ignore / Skip. */}
      <div className="mod-review">
        <div className="mod-review-head">
          <span className="mod-review-title">{t('mod.map.review')}</span>
          <span className="mod-review-count">{pairs.length} {t('mod.map.close')}</span>
        </div>
        {pair ? (
          <>
            <div className="mod-review-photos">
              {pair.map(p => (
                <div className={'mod-review-card' + (p.status === 'approved' ? ' appr' : '')} key={p.id}>
                  {p.key
                    ? <img src={`${CLOUDFRONT}/${p.key}`} alt="" loading="lazy"
                        onClick={() => setZoomUrl(`${CLOUDFRONT}/${p.key}`)} />
                    : <div className="mod-review-noimg">—</div>}
                  {p.status === 'approved' && <span className="mod-dupcard-badge">{t('mod.map.legend.approved')}</span>}
                  {onDelete && (
                    <button className="mod-dupcard-del" title={t('mod.map.delete')}
                      onClick={() => doDelete(p)}>🗑</button>
                  )}
                </div>
              ))}
            </div>
            <div className="mod-review-dist">{Math.round(haversine(pair[0], pair[1]))} m {t('mod.map.apart')}</div>
            <div className="mod-review-actions">
              <button className="mod-tbl-bulk approve" onClick={() => mergePair(pair)}>{t('mod.map.merge')}</button>
              {onIgnorePair && (
                <button className="mod-tbl-loadmore" onClick={() => ignoreThisPair(pair)}>{t('mod.map.ignore')}</button>
              )}
              <button className="mod-tbl-loadmore" onClick={skipPair}>{t('mod.map.skip')}</button>
            </div>
          </>
        ) : (
          <div className="mod-review-done">{t('mod.map.reviewDone')}</div>
        )}
      </div>

      {compare.length > 0 && (
        <div className="mod-map-compare">
          {compare.map(p => (
            <div className="mod-map-cmp" key={p.id}>
              {p.key
                ? <img src={`${CLOUDFRONT}/${p.key}`} alt="" onClick={() => setZoomUrl(`${CLOUDFRONT}/${p.key}`)} />
                : <div className="mod-map-cmp-noimg">—</div>}
              <div className="mod-map-cmp-row">
                <span className="mod-map-cmp-meta">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</span>
                {onDelete && (
                  <button className="mod-map-cmp-del" onClick={() => doDelete(p)}>{t('mod.map.delete')}</button>
                )}
              </div>
            </div>
          ))}
          <div className="mod-map-cmp-actions">
            {compare.length === 2
              ? <div className="mod-map-dist">{Math.round(haversine(compare[0], compare[1]))} m {t('mod.map.apart')}</div>
              : <div className="mod-map-hint">{t('mod.map.pick2')}</div>}
            {compare.length === 2 && (
              <button className="mod-tbl-bulk approve" onClick={doMerge}>{t('mod.map.merge')}</button>
            )}
            {compare.length === 2 && onIgnorePair && (
              <button className="mod-tbl-loadmore" onClick={doIgnore}>{t('mod.map.ignore')}</button>
            )}
            <button className="mod-tbl-loadmore" onClick={() => setCompare([])}>{t('mod.map.clear')}</button>
          </div>
        </div>
      )}

      {/* Every group of too-close photos. Click a photo to locate it + show its
          Street View above; ⤢ enlarges it; 🗑 deletes it. */}
      <div className="mod-map-dups">
        <div className="mod-dups-head">
          {dupGroups.length
            ? `${dupGroups.length} ${t('mod.map.dupGroups')}`
            : t('mod.map.dupsEmpty')}
        </div>
        {dupGroups.map((group, gi) => (
          <div className="mod-dupgroup" key={gi}>
            {group.map(p => (
              <div className={'mod-dupcard'
                + (compareIds.has(p.id) ? ' sel' : '')
                + (p.status === 'approved' ? ' appr' : '')} key={p.id}>
                {p.key
                  ? <img src={`${CLOUDFRONT}/${p.key}`} alt="" loading="lazy" onClick={() => focusOn(p)} />
                  : <div className="mod-dupcard-noimg" onClick={() => focusOn(p)}>—</div>}
                {p.status === 'approved' && <span className="mod-dupcard-badge">{t('mod.map.legend.approved')}</span>}
                {p.key && (
                  <button className="mod-dupcard-zoom" title={t('mod.grid.zoom')}
                    onClick={(e) => { e.stopPropagation(); setZoomUrl(`${CLOUDFRONT}/${p.key}`) }}>⤢</button>
                )}
                {onDelete && (
                  <button className="mod-dupcard-del" title={t('mod.map.delete')} onClick={() => doDelete(p)}>🗑</button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
        </div>{/* /mod-map-side */}
      </div>{/* /mod-map-layout */}

      {zoomUrl && (
        <div className="mod-zoom" onClick={() => setZoomUrl(null)}>
          <img src={zoomUrl} alt="" onClick={(e) => e.stopPropagation()} />
          <button className="mod-zoom-close" onClick={() => setZoomUrl(null)} aria-label={t('common.close')}>✕</button>
        </div>
      )}
    </div>
  )
}
