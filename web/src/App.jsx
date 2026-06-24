import { useState, useCallback } from 'react'
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps'
import './App.css'

const API_URL = 'http://127.0.0.1:8000'

const STYLE_COLORS = {
  tag: '#7B5CF5',
  throwup: '#1DB870',
  piece: '#3B82F6',
  mural: '#E85D26',
  sticker: '#F7B84B',
  other: '#888',
}

const STYLE_LABELS = {
  tag: 'Tag',
  throwup: 'Throw-up',
  piece: 'Piece',
  mural: 'Mural',
  sticker: 'Sticker',
  other: 'Other',
}

function SprayCan({ color, size = 28 }) {
  return (
    <svg width={size} height={size * 1.35} viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="4" r="1.2" fill={color} opacity="0.7"/>
      <circle cx="22" cy="7" r="1" fill={color} opacity="0.5"/>
      <circle cx="19" cy="8" r="0.8" fill={color} opacity="0.4"/>
      <rect x="13" y="6" width="5" height="2.5" rx="1" fill="#555"/>
      <rect x="8" y="4" width="7" height="4" rx="2" fill="#333"/>
      <rect x="6" y="8" width="11" height="20" rx="3" fill={color}/>
      <rect x="6" y="14" width="11" height="6" fill="white" opacity="0.2"/>
      <rect x="7" y="27" width="9" height="3" rx="1.5" fill={color} opacity="0.8"/>
      <rect x="8" y="9" width="2" height="12" rx="1" fill="white" opacity="0.25"/>
    </svg>
  )
}

function GraffitiMarker({ graffiti, onClick, isSelected }) {
  const color = STYLE_COLORS[graffiti.style] || '#888'
  return (
    <AdvancedMarker
      position={{ lat: graffiti.lat, lng: graffiti.lng }}
      onClick={() => onClick(graffiti)}
      zIndex={isSelected ? 100 : 1}
    >
      <SprayCan color={color} size={isSelected ? 34 : 24} />
    </AdvancedMarker>
  )
}

function Sidebar({ selected, count, loading, onClose }) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <SprayCan color="#E85D26" size={22} />
          <h1>GraffitiAtlas</h1>
        </div>
        {loading && <span className="loading-text">Loading...</span>}
      </div>

      <div className="stats-bar">
        <div className="stat">
          <span className="stat-value">{count}</span>
          <span className="stat-label">in view</span>
        </div>
        <div className="stat-divider" />
        <div className="legend">
          {Object.entries(STYLE_COLORS).slice(0, 3).map(([style, color]) => (
            <div key={style} className="legend-item">
              <div className="legend-dot" style={{ background: color }} />
              <span>{STYLE_LABELS[style]}</span>
            </div>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="detail">
          <button className="back-btn" onClick={onClose}>
            &larr; Back
          </button>

          {selected.image_url && (
            <div className="detail-image">
              <img src={selected.image_url} alt="Graffiti capture" />
            </div>
          )}

          <div className="detail-body">
            <div className="detail-top">
              <span
                className="style-badge"
                style={{ background: STYLE_COLORS[selected.style] || '#888' }}
              >
                {STYLE_LABELS[selected.style] || selected.style}
              </span>
              <span className="detail-source">&#10003; {selected.source}</span>
            </div>

            <p className="detail-desc">{selected.description_fr}</p>

            <div className="detail-meta">
              {selected.city && (
                <div className="meta-row">
                  <span className="meta-label">City</span>
                  <span className="meta-value" style={{ textTransform: 'capitalize' }}>
                    {selected.city}
                  </span>
                </div>
              )}
              {selected.size_m2 && (
                <div className="meta-row">
                  <span className="meta-label">Size</span>
                  <span className="meta-value">{selected.size_m2} m&#178;</span>
                </div>
              )}
              {selected.surface_type && (
                <div className="meta-row">
                  <span className="meta-label">Surface</span>
                  <span className="meta-value">
                    {selected.surface_type.replace(/_/g, ' ')}
                  </span>
                </div>
              )}
              <div className="meta-row">
                <span className="meta-label">Coordinates</span>
                <span className="meta-value">
                  {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
                </span>
              </div>
            </div>

            <a
              className="gsv-btn"
              href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${selected.lat},${selected.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              View in Street View
            </a>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <SprayCan color="#E0DDCF" size={48} />
          <p>Click a marker on the map to see details</p>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const [graffiti, setGraffiti] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchGraffiti = useCallback(async (bounds) => {
    if (!bounds) return
    setLoading(true)
    try {
      const { north, south, east, west } = bounds
      const res = await fetch(
        `${API_URL}/map/graffiti?north=${north}&south=${south}&east=${east}&west=${west}`
      )
      const data = await res.json()
      setGraffiti(data.features)
    } catch (err) {
      console.error('Failed to fetch graffiti:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleBoundsChanged = useCallback((event) => {
    fetchGraffiti(event.detail.bounds)
  }, [fetchGraffiti])

  return (
    <div className="app">
      <Sidebar
        selected={selected}
        count={graffiti.length}
        loading={loading}
        onClose={() => setSelected(null)}
      />
      <div className="map-wrap">
        <APIProvider apiKey={apiKey}>
          <Map
            defaultZoom={13}
            defaultCenter={{ lat: 45.7640, lng: 4.8357 }}
            mapId="graffiti-atlas-map"
            style={{ width: '100%', height: '100%' }}
            onBoundsChanged={handleBoundsChanged}
          >
            {graffiti.map(g => (
              <GraffitiMarker
                key={g.id}
                graffiti={g}
                onClick={setSelected}
                isSelected={selected?.id === g.id}
              />
            ))}
          </Map>
        </APIProvider>
      </div>
    </div>
  )
}
