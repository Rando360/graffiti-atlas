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

export default function ModerationMap({ points, onLink, onDelete }) {
  const [bounds, setBounds] = useState(null)
  const [version, setVersion] = useState(0)   // bump to snap dragged markers back
  const [compare, setCompare] = useState([])  // up to 2 selected points

  const dupIds = useMemo(() => {
    const s = new Set()
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        if (haversine(points[i], points[j]) <= DUP_M) { s.add(points[i].id); s.add(points[j].id) }
      }
    }
    return s
  }, [points])

  const visible = useMemo(() => {
    if (!bounds) return points.slice(0, 500)
    return points.filter(p =>
      p.lat <= bounds.n && p.lat >= bounds.s && p.lng <= bounds.e && p.lng >= bounds.w).slice(0, 1500)
  }, [points, bounds])

  const compareIds = useMemo(() => new Set(compare.map(p => p.id)), [compare])
  const center = points.length ? { lat: points[0].lat, lng: points[0].lng } : { lat: 45.188, lng: 5.724 }

  const toggleCompare = (p) => setCompare(cur => {
    if (cur.find(x => x.id === p.id)) return cur.filter(x => x.id !== p.id)
    if (cur.length < 2) return [...cur, p]
    return [cur[1], p]  // keep last picked, replace the oldest
  })

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

  return (
    <div className="mod-map-wrap">
      <div className="mod-map-bar">
        <span className="mod-tbl-count">{points.length} {t('mod.bulk.pending')}</span>
        <span className="mod-map-dup">{dupIds.size} {t('mod.map.close')}</span>
        <span className="mod-map-hint">{t('mod.map.compareHint')}</span>
      </div>

      <div className="mod-map">
        <APIProvider apiKey={API_KEY}>
          <Map className="mod-map-canvas" defaultCenter={center} defaultZoom={16} gestureHandling="greedy"
               mapId="graffiti-atlas-map" clickableIcons={false}>
            <BoundsWatcher points={points} onBounds={setBounds} />
            {visible.map(p => (
              <AdvancedMarker
                key={p.id + ':' + version}
                position={{ lat: p.lat, lng: p.lng }}
                draggable
                onDragEnd={(e) => handleDrop(p, e)}
                title={t('mod.map.dragTip')}
              >
                {/* Click handled on the DOM element (not the draggable marker, which
                    swallows clicks as drags). Larger transparent hit area, centred on the point. */}
                <div className="mod-map-hit" onClick={() => toggleCompare(p)}>
                  <span className={'mod-map-pin'
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
          <span><i className="mod-map-dot sel" /> {t('mod.map.legend.picked')}</span>
        </div>

        {compare.length > 0 && (
          <div className="mod-map-compare">
            {compare.map(p => (
              <div className="mod-map-cmp" key={p.id}>
                {p.key
                  ? <img src={`${CLOUDFRONT}/${p.key}`} alt="" />
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
              <button className="mod-tbl-loadmore" onClick={() => setCompare([])}>{t('mod.map.clear')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
