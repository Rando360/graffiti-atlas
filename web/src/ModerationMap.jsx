import { useEffect, useMemo, useState } from 'react'
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps'
import { t } from './i18n'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
const CLOUDFRONT = 'https://d36hw3x1088tvv.cloudfront.net'
const DUP_M = 8      // highlight any point within 8 m of another
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

const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a)

export default function ModerationMap({ points, onLink, onDelete, ignoredPairs, onIgnorePair }) {
  const ignored = ignoredPairs || new Set()
  const [bounds, setBounds] = useState(null)
  const [version, setVersion] = useState(0)   // bump to snap dragged markers back
  const [compare, setCompare] = useState([])  // up to 2 selected points
  const [focus, setFocus] = useState(null)    // point the map is panned to
  const [zoomUrl, setZoomUrl] = useState(null) // enlarged photo (lightbox)

  // Group points that are within DUP_M of each other into clusters (connected
  // components). Each group of 2+ is a set of "too close" photos to review together.
  const dupGroups = useMemo(() => {
    const n = points.length
    const parent = new Array(n)
    for (let i = 0; i < n; i++) parent[i] = i
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (haversine(points[i], points[j]) <= DUP_M
            && !ignored.has(pairKey(points[i].id, points[j].id))) {   // skip dismissed pairs
          const a = find(i), b = find(j); if (a !== b) parent[a] = b
        }
    const m = new globalThis.Map()   // NB: `Map` here is the vis.gl component, use the built-in
    for (let i = 0; i < n; i++) { const r = find(i); if (!m.has(r)) m.set(r, []); m.get(r).push(points[i]) }
    return Array.from(m.values()).filter(g => g.length > 1).sort((a, b) => b.length - a.length)
  }, [points, ignored])

  const dupIds = useMemo(() => {
    const s = new Set()
    dupGroups.forEach(g => g.forEach(p => s.add(p.id)))
    return s
  }, [dupGroups])

  const compareIds = useMemo(() => new Set(compare.map(p => p.id)), [compare])

  // Only flagged (too-close) points + whatever you've selected get individual
  // markers — rendering all ~1400 points as draggable markers hangs the browser.
  const visible = useMemo(() => {
    const inB = p => !bounds || (p.lat <= bounds.n && p.lat >= bounds.s && p.lng <= bounds.e && p.lng >= bounds.w)
    return points.filter(p =>
      inB(p) && (dupIds.has(p.id) || compareIds.has(p.id) || focus?.id === p.id)).slice(0, 1500)
  }, [points, bounds, dupIds, compareIds, focus])
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

  const doMerge = async () => {
    if (compare.length !== 2) return
    if (!window.confirm(t('mod.map.confirmLink'))) return
    await onLink(compare[1].id, compare[0].id)   // link the 2nd into the 1st's location
    setCompare(c => c.filter(x => x.id !== compare[1].id))
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
  if (!points.length) return <div className="mod-empty">{t('mod.empty.bulk')}</div>

  const svPoint = focus   // the last point you clicked drives the single Street View

  return (
    <div className="mod-map-wrap">
      <div className="mod-map-bar">
        <span className="mod-tbl-count">{points.length} {t('mod.bulk.pending')}</span>
        <span className="mod-map-dup">{dupIds.size} {t('mod.map.close')}</span>
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
                    + (compareIds.has(p.id) ? ' sel' : '')} />
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
