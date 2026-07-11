import { useState, useCallback, useEffect, useRef } from 'react'
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

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
    <svg width={size} height={size * 1.35} viewBox="0 0 24 32" fill="none">
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

// ── SEARCH BAR ────────────────────────────────────────
function SearchBar({ onResult }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  const search = useCallback(async (q) => {
    if (q.length < 3) { setSuggestions([]); return }
    setLoading(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=fr&accept-language=fr`
      )
      const data = await res.json()
      setSuggestions(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (e) => {
    const v = e.target.value
    setQuery(v)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(v), 350)
  }

  const handleSelect = (item) => {
    setQuery(item.display_name.split(',').slice(0, 2).join(','))
    setSuggestions([])
    onResult({ lat: parseFloat(item.lat), lng: parseFloat(item.lon), name: item.display_name })
  }

  return (
    <div className="search-wrap">
      <div className="search-box">
        <span className="search-icon">&#128269;</span>
        <input
          type="text"
          placeholder="Rechercher une ville ou une adresse..."
          value={query}
          onChange={handleChange}
          onKeyDown={e => e.key === 'Escape' && setSuggestions([])}
        />
        {loading && <span className="search-spinner" />}
        {query && <button className="search-clear" onClick={() => { setQuery(''); setSuggestions([]) }}>&#x2715;</button>}
      </div>
      {suggestions.length > 0 && (
        <div className="search-dropdown">
          {suggestions.map((s, i) => (
            <div key={i} className="search-item" onClick={() => handleSelect(s)}>
              <span className="search-item-main">{s.display_name.split(',')[0]}</span>
              <span className="search-item-sub">{s.display_name.split(',').slice(1, 3).join(',')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── HEADER ────────────────────────────────────────────
function Header({ onSearchResult }) {
  return (
    <header className="app-header">
      <div className="header-logo">
        <SprayCan color="#E85D26" size={22} />
        <span className="header-title">GraffitiAtlas</span>
      </div>
      <div className="header-center">
        <SearchBar onResult={onSearchResult} />
      </div>
      <div className="header-right">
        <button className="header-btn">&#9881; Paramètres</button>
        <button className="header-btn primary">Connexion</button>
      </div>
    </header>
  )
}

// ── MAP PAN CONTROLLER ────────────────────────────────
function MapController({ panTo }) {
  const map = useMap()
  useEffect(() => {
    if (!map || !panTo) return
    map.panTo({ lat: panTo.lat, lng: panTo.lng })
    map.setZoom(15)
  }, [map, panTo])
  return null
}

// ── STREET VIEW ───────────────────────────────────────
function StreetViewPanel({ selected, apiKey }) {
  if (!selected) {
    return (
      <div className="sv-empty">
        <SprayCan color="#444" size={36} />
        <p>Sélectionnez un marqueur pour voir Street View</p>
      </div>
    )
  }
  const svUrl = `https://www.google.com/maps/embed/v1/streetview?key=${apiKey}&location=${selected.lat},${selected.lng}&fov=90&pitch=0`
  return (
    <div className="sv-panel">
      <iframe title="Street View" src={svUrl} allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
    </div>
  )
}

// ── ZOOMABLE IMAGE OVERLAY ────────────────────────────
function ZoomableOverlay({ images, activeIdx, onClose, onPrev, onNext, dateStr }) {
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef(null)
  const imgRef = useRef(null)

  // Reset zoom when image changes
  useEffect(() => { setScale(1); setPos({ x: 0, y: 0 }) }, [activeIdx])

  const handleWheel = (e) => {
    e.preventDefault()
    setScale(s => Math.min(5, Math.max(1, s - e.deltaY * 0.005)))
  }

  const handleMouseDown = (e) => {
    if (scale <= 1) return
    setDragging(true)
    dragStart.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
  }

  const handleMouseMove = (e) => {
    if (!dragging) return
    setPos({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y })
  }

  const handleMouseUp = () => setDragging(false)

  const formatDate = (dateStr) => {
    if (!dateStr) return null
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  const activeImage = images[activeIdx]

  return (
    <div className="img-overlay" onClick={onClose}>
      <div className="img-overlay-inner" onClick={e => e.stopPropagation()}>
        <button className="img-overlay-close" onClick={onClose}>&#x2715;</button>

        {images.length > 1 && (
          <button className="img-overlay-arrow left" onClick={e => { e.stopPropagation(); onPrev() }}>&#8592;</button>
        )}

        <div
          className="img-zoom-container"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
        >
          <img
            ref={imgRef}
            src={activeImage.image_url}
            alt="Graffiti agrandi"
            style={{
              transform: `scale(${scale}) translate(${pos.x / scale}px, ${pos.y / scale}px)`,
              transition: dragging ? 'none' : 'transform 0.1s',
            }}
          />
        </div>

        {images.length > 1 && (
          <button className="img-overlay-arrow right" onClick={e => { e.stopPropagation(); onNext() }}>&#8594;</button>
        )}

        <div className="img-overlay-footer">
          {images.length > 1 && (
            <span className="img-overlay-counter">{activeIdx + 1} / {images.length}</span>
          )}
          {dateStr && <span className="img-overlay-date">{formatDate(dateStr)}</span>}
          <span className="img-zoom-hint">Scroll pour zoomer · Glisser pour déplacer</span>
        </div>
      </div>
    </div>
  )
}

// ── SIDEBAR ───────────────────────────────────────────
function Sidebar({ graffiti, allGraffiti, selected, onSelect, loading, filters, onFilterChange }) {
  const [imgExpanded, setImgExpanded] = useState(false)
  const [allImages, setAllImages] = useState([])
  const [activeImageIdx, setActiveImageIdx] = useState(0)
  const [loadingImages, setLoadingImages] = useState(false)

  useEffect(() => {
    setImgExpanded(false)
    setAllImages([])
    setActiveImageIdx(0)
    if (!selected) return
    setLoadingImages(true)
    fetch(API_URL + '/graffiti/' + selected.id + '/images')
      .then(r => r.json())
      .then(data => {
        const seen = {}
        const faces = []
        data.images.forEach(img => {
          if (!seen[img.image_url]) {
            seen[img.image_url] = { ...img, detections: [img] }
            faces.push(seen[img.image_url])
          } else {
            seen[img.image_url].detections.push(img)
          }
        })
        setAllImages(faces)
      })
      .catch(console.error)
      .finally(() => setLoadingImages(false))
  }, [selected])

  const activeImage = allImages[activeImageIdx] || null

  const total = graffiti.length
  const typeCounts = {}
  const sizeCounts = { small: 0, medium: 0, large: 0 }
  const yearSet = new Set()

  allGraffiti.forEach(g => {
    typeCounts[g.style] = (typeCounts[g.style] || 0) + 1
    const s = g.size_m2 || 0
    if (s < 0.5) sizeCounts.small++
    else if (s < 2.0) sizeCounts.medium++
    else sizeCounts.large++
    if (g.year) yearSet.add(g.year)
  })

  const years = Array.from(yearSet).sort()

  const toggleStyle = (style) => onFilterChange(prev => {
    const styles = new Set(prev.styles)
    styles.has(style) ? styles.delete(style) : styles.add(style)
    return { ...prev, styles }
  })

  const toggleSize = (size) => onFilterChange(prev => {
    const sizes = new Set(prev.sizes)
    sizes.has(size) ? sizes.delete(size) : sizes.add(size)
    return { ...prev, sizes }
  })

  const toggleYear = (year) => onFilterChange(prev => {
    const yr = new Set(prev.years)
    yr.has(year) ? yr.delete(year) : yr.add(year)
    return { ...prev, years: yr }
  })

  const formatDate = (dateStr) => {
    if (!dateStr) return null
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  const prevImage = () => setActiveImageIdx(i => (i - 1 + allImages.length) % allImages.length)
  const nextImage = () => setActiveImageIdx(i => (i + 1) % allImages.length)

  return (
    <div className="sidebar">
      <div className="stats-grid">
        <div className="stat-box">
          <span className="stat-num">{total}</span>
          <span className="stat-lbl">En vue</span>
        </div>
        <div className="stat-box">
          <span className="stat-num">{graffiti.reduce((a, g) => a + (g.size_m2 || 0), 0).toFixed(0)}</span>
          <span className="stat-lbl">m&#178; détectés</span>
        </div>
        {loading && <div className="stat-loading"><span className="loading-dot" /></div>}
      </div>

      <div className="filter-section">
        <div className="filter-label">TYPE <span className="filter-hint">filtrer</span></div>
        <div className="filter-row">
          {['tag', 'throwup', 'piece'].map(style => {
            const active = filters.styles.has(style)
            return (
              <button key={style} className={'filter-btn' + (active ? ' active' : '')}
                style={{ borderColor: active ? STYLE_COLORS[style] : '#E0DDCF', background: active ? STYLE_COLORS[style] + '18' : '#fff' }}
                onClick={() => toggleStyle(style)}>
                <span className="filter-dot" style={{ background: STYLE_COLORS[style] }} />
                <span className="filter-count">{typeCounts[style] || 0}</span>
                <span className="filter-name">{STYLE_LABELS[style]}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="filter-section">
        <div className="filter-label">TAILLE <span className="filter-hint">filtrer</span></div>
        <div className="filter-row">
          {[
            { key: 'small', label: 'Petit', sub: '< 0.5 m\u00B2' },
            { key: 'medium', label: 'Moyen', sub: '0.5\u20132 m\u00B2' },
            { key: 'large', label: 'Grand', sub: '\u22652 m\u00B2' },
          ].map(({ key, label, sub }) => {
            const active = filters.sizes.has(key)
            return (
              <button key={key} className={'filter-btn' + (active ? ' active' : '')}
                style={{ borderColor: active ? '#E85D26' : '#E0DDCF', background: active ? '#E85D2618' : '#fff' }}
                onClick={() => toggleSize(key)}>
                <span className="filter-count">{sizeCounts[key]}</span>
                <span className="filter-name">{label}</span>
                <span className="filter-sub">{sub}</span>
              </button>
            )
          })}
        </div>
      </div>

      {years.length > 1 && (
        <div className="filter-section">
          <div className="filter-label">ANNÉE <span className="filter-hint">filtrer</span></div>
          <div className="filter-row">
            {years.map(year => {
              const active = filters.years.has(year)
              return (
                <button key={year} className={'filter-btn' + (active ? ' active' : '')}
                  style={{ borderColor: active ? '#1A1917' : '#E0DDCF', background: active ? '#1A191718' : '#fff' }}
                  onClick={() => toggleYear(year)}>
                  <span className="filter-count">{year}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="detail-wrap">
        {selected ? (
          <div className="detail">
            <button className="back-btn" onClick={() => onSelect(null)}>&#8592; Retour</button>

            {loadingImages ? (
              <div className="img-loading">Chargement des images...</div>
            ) : activeImage ? (
              <>
                <div className="detail-img" onClick={() => setImgExpanded(true)}>
                  <img src={activeImage.image_url} alt="Cube face" />
                  {selected.date_observed && <div className="img-date">{formatDate(selected.date_observed)}</div>}
                  <div className="img-expand-hint">&#8599; agrandir</div>
                </div>

                {allImages.length > 1 && (
                  <div className="thumb-strip">
                    {allImages.map((img, idx) => {
                      const primaryStyle = img.detections[0]?.style
                      const color = STYLE_COLORS[primaryStyle] || '#888'
                      return (
                        <div key={idx}
                          className={'thumb-item' + (idx === activeImageIdx ? ' active' : '')}
                          onClick={() => setActiveImageIdx(idx)}
                          style={{ borderColor: idx === activeImageIdx ? color : 'transparent' }}>
                          <img src={img.image_url} alt={'Face ' + (idx + 1)} />
                          <div className="thumb-dot" style={{ background: color }} />
                          <div className="thumb-count">
                            {img.detections.length > 1 ? img.detections.length + ' détections' : STYLE_LABELS[primaryStyle] || primaryStyle}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {imgExpanded && (
                  <ZoomableOverlay
                    images={allImages}
                    activeIdx={activeImageIdx}
                    onClose={() => setImgExpanded(false)}
                    onPrev={prevImage}
                    onNext={nextImage}
                    dateStr={selected.date_observed}
                  />
                )}
              </>
            ) : null}

            <div className="detail-body">
              {activeImage && activeImage.detections.map((det, idx) => (
                <div key={idx} className="detection-item">
                  <span className="style-badge" style={{ background: STYLE_COLORS[det.style] || '#888' }}>
                    {STYLE_LABELS[det.style] || det.style}
                  </span>
                  {det.size_m2 && <span className="det-size">{det.size_m2} m&#178;</span>}
                  <p className="detail-desc">{det.description_fr}</p>
                </div>
              ))}

              <div className="meta-box">
                {selected.city && (
                  <div className="meta-row">
                    <span className="meta-lbl">Ville</span>
                    <span className="meta-val" style={{ textTransform: 'capitalize' }}>{selected.city}</span>
                  </div>
                )}
                {selected.date_observed && (
                  <div className="meta-row">
                    <span className="meta-lbl">Capturé le</span>
                    <span className="meta-val">{formatDate(selected.date_observed)}</span>
                  </div>
                )}
                {selected.surface_type && (
                  <div className="meta-row">
                    <span className="meta-lbl">Surface</span>
                    <span className="meta-val">{selected.surface_type.replace(/_/g, ' ')}</span>
                  </div>
                )}
                <div className="meta-row">
                  <span className="meta-lbl">GPS</span>
                  <span className="meta-val">{selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}</span>
                </div>
              </div>

              <div className="action-btns">
                <a className="action-btn gsv"
                  href={'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + selected.lat + ',' + selected.lng}
                  target="_blank" rel="noreferrer">Google Street View &#8599;</a>
                <a className="action-btn pano"
                  href={'https://panoramax.ign.fr/#focus=map&map=17/' + selected.lat + '/' + selected.lng}
                  target="_blank" rel="noreferrer">Panoramax &#8599;</a>
              </div>
            </div>
          </div>
        ) : (
          <div className="no-selection">
            <SprayCan color="#D0CEC8" size={36} />
            <p className="no-sel-title">Aucune détection sélectionnée.</p>
            <p className="no-sel-sub">Cliquez sur un marqueur pour voir les images et détails ici.</p>
            <div className="pano-credit">
              <span>Images 360&#176; fournies par <a href="https://panoramax.ign.fr" target="_blank" rel="noreferrer">Panoramax</a> (IGN, données ouvertes), scannées par Rando360. Google Street View est fourni à titre de référence.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── APP ───────────────────────────────────────────────
export default function App() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const [allGraffiti, setAllGraffiti] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ styles: new Set(), sizes: new Set(), years: new Set() })
  const [panTo, setPanTo] = useState(null)

  const fetchGraffiti = useCallback(async (bounds) => {
    if (!bounds) return
    setLoading(true)
    try {
      const { north, south, east, west } = bounds
      const res = await fetch(API_URL + '/map/graffiti?north=' + north + '&south=' + south + '&east=' + east + '&west=' + west)
      const data = await res.json()
      setAllGraffiti(data.features)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  const handleBoundsChanged = useCallback((e) => fetchGraffiti(e.detail.bounds), [fetchGraffiti])

  const filtered = allGraffiti.filter(g => {
    if (filters.styles.size > 0 && !filters.styles.has(g.style)) return false
    if (filters.years.size > 0 && !filters.years.has(g.year)) return false
    if (filters.sizes.size > 0) {
      const s = g.size_m2 || 0
      const ok = (filters.sizes.has('small') && s < 0.5)
        || (filters.sizes.has('medium') && s >= 0.5 && s < 2.0)
        || (filters.sizes.has('large') && s >= 2.0)
      if (!ok) return false
    }
    return true
  })

  return (
    <div className="app">
      <Header onSearchResult={setPanTo} />
      <div className="app-body">
        <Sidebar
          graffiti={filtered}
          allGraffiti={allGraffiti}
          selected={selected}
          onSelect={setSelected}
          loading={loading}
          filters={filters}
          onFilterChange={setFilters}
        />
        <div className="right-panel">
          <StreetViewPanel selected={selected} apiKey={apiKey} />
          <div className="map-wrap">
            <APIProvider apiKey={apiKey}>
              <Map
                defaultZoom={12}
                defaultCenter={{ lat: 45.7640, lng: 4.8357 }}
                mapId="graffiti-atlas-map"
                style={{ width: '100%', height: '100%' }}
                onBoundsChanged={handleBoundsChanged}
                mapTypeControl={false}
                streetViewControl={false}
                fullscreenControl={false}
              >
                <MapController panTo={panTo} />
                {filtered.map(g => (
                  <AdvancedMarker
                    key={g.id}
                    position={{ lat: g.lat, lng: g.lng }}
                    onClick={() => setSelected(g)}
                    zIndex={selected?.id === g.id ? 100 : 1}
                  >
                    <SprayCan color={STYLE_COLORS[g.style] || '#888'} size={selected?.id === g.id ? 32 : 22} />
                  </AdvancedMarker>
                ))}
              </Map>
            </APIProvider>
          </div>
        </div>
      </div>
    </div>
  )
}
