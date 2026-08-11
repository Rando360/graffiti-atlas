import { useEffect, useMemo, useState } from 'react'
import { APIProvider, Map, AdvancedMarker, InfoWindow, useMap } from '@vis.gl/react-google-maps'
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

export default function ModerationMap({ points, onLink }) {
  const [bounds, setBounds] = useState(null)
  const [version, setVersion] = useState(0)   // bump to snap dragged markers back
  const [selected, setSelected] = useState(null)  // point whose photo is shown

  // ids that have a neighbour within DUP_M — the likely duplicates
  const dupIds = useMemo(() => {
    const s = new Set()
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        if (haversine(points[i], points[j]) <= DUP_M) { s.add(points[i].id); s.add(points[j].id) }
      }
    }
    return s
  }, [points])

  // only render markers inside the viewport (keeps it fast with thousands)
  const visible = useMemo(() => {
    if (!bounds) return points.slice(0, 500)
    const inB = points.filter(p =>
      p.lat <= bounds.n && p.lat >= bounds.s && p.lng <= bounds.e && p.lng >= bounds.w)
    return inB.slice(0, 1500)
  }, [points, bounds])

  const center = points.length ? { lat: points[0].lat, lng: points[0].lng } : { lat: 45.188, lng: 5.724 }
  const dupCount = dupIds.size

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
    setVersion(v => v + 1)  // re-key markers so any un-dropped drag snaps back
  }

  if (!API_KEY) return <div className="mod-empty">{t('mod.map.nokey')}</div>
  if (!points.length) return <div className="mod-empty">{t('mod.empty.bulk')}</div>

  return (
    <div className="mod-map-wrap">
      <div className="mod-map-bar">
        <span className="mod-tbl-count">{points.length} {t('mod.bulk.pending')}</span>
        <span className="mod-map-dup">{dupCount} {t('mod.map.close')}</span>
        <span className="mod-map-hint">{t('mod.map.hint')}</span>
      </div>
      <div className="mod-map">
        <APIProvider apiKey={API_KEY}>
          <Map defaultCenter={center} defaultZoom={16} gestureHandling="greedy"
               mapId="graffiti-atlas-map" clickableIcons={false}>
            <BoundsWatcher points={points} onBounds={setBounds} />
            {visible.map(p => (
              <AdvancedMarker
                key={p.id + ':' + version}
                position={{ lat: p.lat, lng: p.lng }}
                draggable
                onDragEnd={(e) => handleDrop(p, e)}
                onClick={() => setSelected(p)}
                title={t('mod.map.dragTip')}
              >
                <div className={'mod-map-pin' + (dupIds.has(p.id) ? ' dup' : '')} />
              </AdvancedMarker>
            ))}

            {selected && selected.key && (
              <InfoWindow position={{ lat: selected.lat, lng: selected.lng }} onCloseClick={() => setSelected(null)}>
                <img className="mod-map-photo" src={`${CLOUDFRONT}/${selected.key}`} alt="" />
              </InfoWindow>
            )}
          </Map>
        </APIProvider>
      </div>
    </div>
  )
}
