import { useState, useCallback, useEffect } from 'react'
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps'
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

function Sidebar({ graffiti, allGraffiti, selected, onSelect, loading, filters, onFilterChange }) {
  const [imgExpanded, setImgExpanded] = useState(false)
  const [allImages, setAllImages] = useState([])
  const [activeImageIdx, setActiveImageIdx] = useState(0)
  const [loadingImages, setLoadingImages] = useState(false)

  // Reset when selection changes
  useEffect(() => {
    setImgExpanded(false)
    setAllImages([])
    setActiveImageIdx(0)

    if (!selected) return

    // Fetch all images for this graffiti point
    setLoadingImages(true)
    fetch(API_URL + '/graffiti/' + selected.id + '/images')
      .then(r => r.json())
      .then(data => {
        // Deduplicate by image_url — group classifications under each unique face
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
      .catch(err => console.error(err))
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

  return (
    <div className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-logo">
          <SprayCan color="#E85D26" size={20} />
          <span>GraffitiAtlas</span>
        </div>
        {loading && <span className="loading-dot" />}
      </div>

      <div className="stats-grid">
        <div className="stat-box">
          <span className="stat-num">{total}</span>
          <span className="stat-lbl">En vue</span>
        </div>
        <div className="stat-box">
          <span className="stat-num">{graffiti.reduce((a, g) => a + (g.size_m2 || 0), 0).toFixed(0)}</span>
          <span className="stat-lbl">m&#178; détectés</span>
        </div>
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

            {/* Main image */}
            {loadingImages ? (
              <div className="img-loading">Chargement des images...</div>
            ) : activeImage ? (
              <>
                <div className="detail-img" onClick={() => setImgExpanded(true)}>
                  <img src={activeImage.image_url} alt="Cube face" />
                  {selected.date_observed && (
                    <div className="img-date">{formatDate(selected.date_observed)}</div>
                  )}
                  <div className="img-expand-hint">&#8599; agrandir</div>
                </div>

                {/* Thumbnail strip — only show if more than 1 face */}
                {allImages.length > 1 && (
                  <div className="thumb-strip">
                    {allImages.map((img, idx) => {
                      const primaryStyle = img.detections[0]?.style
                      const color = STYLE_COLORS[primaryStyle] || '#888'
                      return (
                        <div
                          key={idx}
                          className={'thumb-item' + (idx === activeImageIdx ? ' active' : '')}
                          onClick={() => setActiveImageIdx(idx)}
                          style={{ borderColor: idx === activeImageIdx ? color : 'transparent' }}
                        >
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

                {/* Floating overlay */}
                {imgExpanded && (
                  <div className="img-overlay" onClick={() => setImgExpanded(false)}>
                    <div className="img-overlay-inner" onClick={e => e.stopPropagation()}>
                      <button className="img-overlay-close" onClick={() => setImgExpanded(false)}>&#x2715;</button>
                      {allImages.length > 1 && (
                        <button className="img-overlay-arrow left"
                          onClick={e => { e.stopPropagation(); setActiveImageIdx(i => (i - 1 + allImages.length) % allImages.length) }}>
                          &#8592;
                        </button>
                      )}
                      <img src={activeImage.image_url} alt="Agrandie" />
                      {allImages.length > 1 && (
                        <div className="img-overlay-counter">{activeImageIdx + 1} / {allImages.length}</div>
                      )}
                      {allImages.length > 1 && (
                        <button className="img-overlay-arrow right"
                          onClick={e => { e.stopPropagation(); setActiveImageIdx(i => (i + 1) % allImages.length) }}>
                          &#8594;
                        </button>
                      )}
                      {selected.date_observed && (
                        <div className="img-overlay-date">{formatDate(selected.date_observed)}</div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : null}

            <div className="detail-body">
              {/* Show all detections for active face */}
              {activeImage && activeImage.detections.map((det, idx) => (
                <div key={idx} className="detection-item">
                  <span className="style-badge" style={{ background: STYLE_COLORS[det.style] || '#888' }}>
                    {STYLE_LABELS[det.style] || det.style}
                  </span>
                  {det.size_m2 && (
                    <span className="det-size">{det.size_m2} m&#178;</span>
                  )}
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

export default function App() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const [allGraffiti, setAllGraffiti] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ styles: new Set(), sizes: new Set(), years: new Set() })

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
              {filtered.map(g => (
                <AdvancedMarker
                  key={g.id}
                  position={{ lat: g.lat, lng: g.lng }}
                  onClick={() => setSelected(g)}
                  zIndex={selected?.id === g.id ? 100 : 1}
                >
                  <SprayCan
                    color={STYLE_COLORS[g.style] || '#888'}
                    size={selected?.id === g.id ? 32 : 22}
                  />
                </AdvancedMarker>
              ))}
            </Map>
          </APIProvider>
        </div>
      </div>
    </div>
  )
}
