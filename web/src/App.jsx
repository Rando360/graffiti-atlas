import { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react'
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps'
import AuthModal from './AuthModal'
import UploadModal from './UploadModal'
import ModerationPanel from './ModerationPanel'
import SettingsPanel from './SettingsPanel'
import { t, syncLanguageFromProfile } from './i18n'
import { supabase } from './supabase'
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
  tag: () => t('style.tag'),
  throwup: () => t('style.throwup'),
  piece: () => t('style.piece'),
  mural: () => t('style.mural'),
  sticker: () => t('style.sticker'),
  other: () => t('style.other'),
}

/* ══════════════════════════════════════════════════════
   ICONS
   ══════════════════════════════════════════════════════ */
function SprayCan({ color, size = 28 }) {
  return (
    <svg width={size} height={size * 1.35} viewBox="0 0 24 32" fill="none" aria-hidden="true">
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

function Logo({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" style={{ display: 'block', borderRadius: '22%' }}>
      <rect width="40" height="40" rx="10" fill="#E85D26" />
      <path d="M20 9c-4.2 0-7.6 3.2-7.6 7.2 0 5 7.6 14.5 7.6 14.5s7.6-9.5 7.6-14.5C27.6 12.2 24.2 9 20 9Z" fill="#fff" />
      <circle cx="20" cy="16" r="3" fill="#2A2520" />
    </svg>
  )
}

function Chevron({ open }) {
  return (
    <svg className={'chev' + (open ? ' open' : '')} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// Memoized marker — only re-renders when its own data or selection changes
const GraffitiMarker = memo(function GraffitiMarker({ g, isSelected, onSelect }) {
  return (
    <AdvancedMarker
      position={{ lat: g.lat, lng: g.lng }}
      onClick={() => onSelect(g)}
      zIndex={isSelected ? 100 : 1}
      title={(STYLE_LABELS[g.style] ? STYLE_LABELS[g.style]() : g.style) || g.style}
    >
      <div className={'marker-can' + (isSelected ? ' selected' : '')}>
        <SprayCan color={STYLE_COLORS[g.style] || '#888'} size={24} />
      </div>
    </AdvancedMarker>
  )
})

/* Renders whatever the server sent: cluster bubbles (zoom out) or individual
   markers (zoom in). Clustering is done server-side in PostGIS, so the browser
   only ever draws what's in view — this scales to very large datasets.
   Clicking a cluster zooms the map in toward it, which re-fetches finer data. */
function ServerMarkers({ points, selectedId, onSelect, onClusterClick }) {
  return points
    .filter(g => typeof g.lat === 'number' && typeof g.lng === 'number')
    .map((g, idx) => {
    if (g.cluster) {
      const n = g.count
      const size = n < 10 ? 40 : n < 50 ? 48 : n < 100 ? 56 : 64
      return (
        <AdvancedMarker
          key={`c-${idx}-${g.lat.toFixed(5)}-${g.lng.toFixed(5)}`}
          position={{ lat: g.lat, lng: g.lng }}
          onClick={() => onClusterClick(g)}
          zIndex={50}
        >
          <div
            className="cluster-bubble"
            style={{ width: size, height: size }}
          >
            {n}
          </div>
        </AdvancedMarker>
      )
    }
    return (
      <AdvancedMarker
        key={g.id}
        position={{ lat: g.lat, lng: g.lng }}
        onClick={() => onSelect(g)}
        zIndex={selectedId === g.id ? 100 : 1}
        title={(STYLE_LABELS[g.style] ? STYLE_LABELS[g.style]() : g.style) || g.style}
      >
        <div className={'marker-can' + (selectedId === g.id ? ' selected' : '') + (g.cleaned ? ' cleaned' : '')}>
          <SprayCan color={g.cleaned ? '#D8D1C2' : (STYLE_COLORS[g.style] || '#888')} size={24} />
        </div>
      </AdvancedMarker>
    )
  })
}

/* ══════════════════════════════════════════════════════
   SEARCH
   ══════════════════════════════════════════════════════ */
function SearchBar({ onResult }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const debounceRef = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    const close = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setSuggestions([]) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const search = useCallback(async (q) => {
    if (q.length < 3) { setSuggestions([]); return }
    setLoading(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=fr&accept-language=fr`
      )
      setSuggestions(await res.json())
      setActiveIdx(-1)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
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
    onResult({ lat: parseFloat(item.lat), lng: parseFloat(item.lon), zoom: 15 })
  }

  // Keyboard navigation of the dropdown
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setSuggestions([]); e.target.blur(); return }
    if (!suggestions.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % suggestions.length) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => (i - 1 + suggestions.length) % suggestions.length) }
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSelect(suggestions[activeIdx >= 0 ? activeIdx : 0])
    }
  }

  return (
    <div className="search-wrap" ref={wrapRef}>
      <div className="search-box">
        <svg className="search-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6" fill="none"/>
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          placeholder={t('header.search.placeholder')}
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label={t('header.search.aria')}
        />
        {loading && <span className="search-spinner" />}
        {query && !loading && (
          <button className="search-clear" onClick={() => { setQuery(''); setSuggestions([]) }} aria-label={t('header.search.clear')}>✕</button>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="search-dropdown" role="listbox">
          {suggestions.map((s, i) => (
            <div
              key={i}
              className={'search-item' + (i === activeIdx ? ' active' : '')}
              onClick={() => handleSelect(s)}
              onMouseEnter={() => setActiveIdx(i)}
              role="option"
              aria-selected={i === activeIdx}
            >
              <span className="search-item-main">{s.display_name.split(',')[0]}</span>
              <span className="search-item-sub">{s.display_name.split(',').slice(1, 3).join(',')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   SETTINGS
   ══════════════════════════════════════════════════════ */
function SettingsMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [])

  return (
    <div className="settings-wrap" ref={ref}>
      <button className="header-btn icon-btn" onClick={() => setOpen(o => !o)} aria-label={t('header.settings')} aria-expanded={open}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8L3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <span className="btn-text">{t('header.settings')}</span>
      </button>
      {open && (
        <div className="settings-dropdown">
          <div className="settings-row">
            <span className="settings-lbl">{t('set.language')}</span>
            <span className="settings-val">Français</span>
          </div>
          <div className="settings-note">{''}</div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   HEADER
   ══════════════════════════════════════════════════════ */
function Header({ onSearchResult, user, onLoginClick, onLogout, onUploadClick, isAdmin, onModClick, onSettingsClick }) {
  return (
    <header className="app-header">
      <a className="header-logo" href="/" aria-label="Accueil">
        <Logo size={26} />
        <span className="header-title">GraffitiAtlas</span>
      </a>
      <div className="header-center">
        <SearchBar onResult={onSearchResult} />
      </div>
      <div className="header-right">
        {user && (
          <button className="header-btn upload" onClick={onUploadClick}>
            {t('header.report')}
          </button>
        )}
        {isAdmin && (
          <button className="header-btn mod" onClick={onModClick}>
            {t('header.moderation')}
          </button>
        )}
        <button className="header-btn icon-btn" onClick={onSettingsClick} aria-label={t('header.settings')}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8L3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <span className="btn-text">{t('header.settings')}</span>
        </button>
        {user ? (
          <div className="header-user">
            <span className="header-username">
              {user.user_metadata?.full_name || user.email?.split('@')[0]}
            </span>
            <button className="header-btn" onClick={onLogout}>{t('header.logout')}</button>
          </div>
        ) : (
          <button className="header-btn primary" onClick={onLoginClick}>{t('header.login')}</button>
        )}
      </div>
    </header>
  )
}

/* ══════════════════════════════════════════════════════
   MAP CONTROLLER — pan + deselect on background click
   ══════════════════════════════════════════════════════ */
function MapController({ panTo, onBackgroundClick, zoomRef, onZoomReady }) {
  const map = useMap()

  useEffect(() => {
    if (!map || !panTo) return
    map.panTo({ lat: panTo.lat, lng: panTo.lng })
    if (panTo.zoom) map.setZoom(panTo.zoom)
  }, [map, panTo])

  // Keep the shared zoom ref current so fetches always send the real zoom.
  useEffect(() => {
    if (!map || !zoomRef) return
    const sync = () => { zoomRef.current = map.getZoom() }
    sync()
    const l = map.addListener('zoom_changed', sync)
    return () => l.remove()
  }, [map, zoomRef])

  // Clicking empty map deselects — standard expectation
  useEffect(() => {
    if (!map) return
    const listener = map.addListener('click', () => onBackgroundClick())
    return () => listener.remove()
  }, [map, onBackgroundClick])

  return null
}

/* ══════════════════════════════════════════════════════
   STREET VIEW
   ══════════════════════════════════════════════════════ */
function StreetViewPanel({ selected, apiKey }) {
  if (!selected) {
    return (
      <div className="sv-empty">
        <SprayCan color="#5a5751" size={34} />
        <p>Sélectionnez un marqueur sur la carte pour ouvrir Street View</p>
      </div>
    )
  }
  const svUrl = `https://www.google.com/maps/embed/v1/streetview?key=${apiKey}&location=${selected.lat},${selected.lng}&fov=90&pitch=0`
  return (
    <div className="sv-panel">
      <iframe key={svUrl} title="Street View" src={svUrl} className="fade-img" allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   LIGHTBOX — scroll zoom, pinch zoom, drag, keyboard
   ══════════════════════════════════════════════════════ */
function ZoomableOverlay({ images, activeIdx, onClose, onPrev, onNext, dateStr }) {
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef(null)
  const pinchStart = useRef(null)

  useEffect(() => { setScale(1); setPos({ x: 0, y: 0 }) }, [activeIdx])

  // Keyboard: Esc closes, arrows navigate, +/- zoom
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && images.length > 1) onPrev()
      else if (e.key === 'ArrowRight' && images.length > 1) onNext()
      else if (e.key === '+' || e.key === '=') setScale(s => Math.min(5, s + 0.5))
      else if (e.key === '-') setScale(s => Math.max(1, s - 0.5))
      else if (e.key === '0') { setScale(1); setPos({ x: 0, y: 0 }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext, images.length])

  const handleWheel = (e) => {
    e.preventDefault()
    setScale(s => {
      const next = Math.min(5, Math.max(1, s - e.deltaY * 0.005))
      if (next === 1) setPos({ x: 0, y: 0 })
      return next
    })
  }

  const handleDoubleClick = () => {
    if (scale > 1) { setScale(1); setPos({ x: 0, y: 0 }) }
    else setScale(2.5)
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

  // Touch: pinch to zoom, one-finger drag when zoomed
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      pinchStart.current = { d: dist(e.touches), scale }
    } else if (e.touches.length === 1 && scale > 1) {
      setDragging(true)
      dragStart.current = { x: e.touches[0].clientX - pos.x, y: e.touches[0].clientY - pos.y }
    }
  }
  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && pinchStart.current) {
      e.preventDefault()
      const ratio = dist(e.touches) / pinchStart.current.d
      setScale(Math.min(5, Math.max(1, pinchStart.current.scale * ratio)))
    } else if (e.touches.length === 1 && dragging) {
      setPos({ x: e.touches[0].clientX - dragStart.current.x, y: e.touches[0].clientY - dragStart.current.y })
    }
  }
  const handleTouchEnd = () => { pinchStart.current = null; setDragging(false) }

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null
  const activeImage = images[activeIdx]

  return (
    <div className="img-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('lightbox.enlarged')}>
      <div className="img-overlay-inner" onClick={e => e.stopPropagation()}>
        <button className="img-overlay-close" onClick={onClose} aria-label={t('lightbox.close')}>✕</button>

        {images.length > 1 && (
          <button className="img-overlay-arrow left" onClick={e => { e.stopPropagation(); onPrev() }} aria-label={t('lightbox.prev')}>←</button>
        )}

        <div
          className="img-zoom-container"
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
        >
          <img
            key={activeImage.image_url}
            src={activeImage.image_url}
            alt={t('lightbox.graffitiAlt')}
            draggable="false"
            style={{
              transform: `scale(${scale}) translate(${pos.x / scale}px, ${pos.y / scale}px)`,
              transition: dragging ? 'none' : 'transform 0.12s ease-out',
            }}
          />
        </div>

        {images.length > 1 && (
          <button className="img-overlay-arrow right" onClick={e => { e.stopPropagation(); onNext() }} aria-label={t('lightbox.next')}>→</button>
        )}

        {scale > 1 && (
          <button className="zoom-reset" onClick={e => { e.stopPropagation(); setScale(1); setPos({ x: 0, y: 0 }) }}>
            Réinitialiser le zoom
          </button>
        )}

        <div className="img-overlay-footer">
          {images.length > 1 && <span className="img-overlay-counter">{activeIdx + 1} / {images.length}</span>}
          {dateStr && <span className="img-overlay-date">{formatDate(dateStr)}</span>}
          <span className="img-zoom-hint">{t('lightbox.hint')}</span>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   COLLAPSIBLE FILTER SECTION
   ══════════════════════════════════════════════════════ */
function FilterSection({ title, activeCount, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="filter-section">
      <button className="filter-label" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span>{title}</span>
        {activeCount > 0 && <span className="filter-active-badge">{activeCount}</span>}
        <Chevron open={open} />
      </button>
      {open && <div className="filter-row">{children}</div>}
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   SIDEBAR
   ══════════════════════════════════════════════════════ */
function Sidebar({
  graffiti, allGraffiti, inViewTotal, hasClusters, timeline, selected, onSelect, loading, error,
  filters, onFilterChange, onResetFilters, cities, sheetOpen, onToggleSheet,
}) {
  const [imgExpanded, setImgExpanded] = useState(false)
  const [allImages, setAllImages] = useState([])
  const [activeImageIdx, setActiveImageIdx] = useState(0)
  const [loadingImages, setLoadingImages] = useState(false)
  const [copied, setCopied] = useState(false)
  const [address, setAddress] = useState(null)

  // Load all faces + reverse-geocode the street address on selection
  useEffect(() => {
    setImgExpanded(false); setAllImages([]); setActiveImageIdx(0); setAddress(null)
    if (!selected) return

    setLoadingImages(true)
    fetch(`${API_URL}/graffiti/${selected.id}/images`)
      .then(r => r.json())
      .then(data => {
        const seen = {}, faces = []
        data.images.forEach(img => {
          if (!seen[img.image_url]) { seen[img.image_url] = { ...img, detections: [img] }; faces.push(seen[img.image_url]) }
          else seen[img.image_url].detections.push(img)
        })
        setAllImages(faces)
      })
      .catch(console.error)
      .finally(() => setLoadingImages(false))

    // Street name is far more meaningful to a user than raw GPS
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${selected.lat}&lon=${selected.lng}&format=json&accept-language=fr&zoom=17`)
      .then(r => r.json())
      .then(d => {
        const a = d.address || {}
        const street = a.road || a.pedestrian || a.footway || a.neighbourhood
        const area = a.suburb || a.city_district || a.town || a.village
        if (street) setAddress(area ? `${street}, ${area}` : street)
      })
      .catch(() => {})
  }, [selected])

  const activeImage = allImages[activeImageIdx] || null

  const { typeCounts, sizeCounts, years } = useMemo(() => {
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
    return { typeCounts, sizeCounts, years: Array.from(yearSet).sort() }
  }, [allGraffiti])

  const toggle = (key, val) => onFilterChange(prev => {
    const set = new Set(prev[key])
    set.has(val) ? set.delete(val) : set.add(val)
    return { ...prev, [key]: set }
  })

  const activeFilterCount = filters.styles.size + filters.sizes.size + filters.years.size
  const totalM2 = useMemo(() => graffiti.reduce((a, g) => a + (g.size_m2 || 0), 0), [graffiti])

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null
  const formatShortDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : null

  const prevImage = useCallback(() => setActiveImageIdx(i => (i - 1 + allImages.length) % allImages.length), [allImages.length])
  const nextImage = useCallback(() => setActiveImageIdx(i => (i + 1) % allImages.length), [allImages.length])

  // Which body state are we in?
  const noDataInArea = !loading && !error && allGraffiti.length === 0
  const noFilterResults = !loading && !hasClusters && allGraffiti.length > 0 && graffiti.length === 0

  return (
    <aside className={'sidebar' + (sheetOpen ? ' sheet-open' : '')}>
      {/* Mobile drag handle */}
      <button className="sheet-handle" onClick={onToggleSheet} aria-label={sheetOpen ? t('empty.panel.collapse') : t('empty.panel.open')}>
        <span className="sheet-grip" />
      </button>

      <div className="stats-grid">
        <div className="stat-box">
          <span className="stat-num">{inViewTotal}</span>
          <span className="stat-lbl">{t('stats.inView')}</span>
        </div>
        <div className="stat-box">
          <span className="stat-num">{totalM2.toFixed(0)}</span>
          <span className="stat-lbl">{t('stats.m2')}</span>
        </div>
        {loading && <div className="stat-loading"><span className="loading-dot" /></div>}
      </div>

      <div className="filters-block">
        <FilterSection title={t('filter.type')} activeCount={filters.styles.size}>
          {['tag', 'throwup', 'piece'].map(style => {
            const active = filters.styles.has(style)
            return (
              <button key={style}
                className={'filter-btn' + (active ? ' active' : '')}
                style={{ borderColor: active ? STYLE_COLORS[style] : '#E9E5DA', background: active ? STYLE_COLORS[style] + '18' : '#fff' }}
                onClick={() => toggle('styles', style)}
                aria-pressed={active}
              >
                <span className="filter-dot" style={{ background: STYLE_COLORS[style] }} />
                <span className="filter-count">{typeCounts[style] || 0}</span>
                <span className="filter-name">{(STYLE_LABELS[style] ? STYLE_LABELS[style]() : style)}</span>
              </button>
            )
          })}
        </FilterSection>

        <FilterSection title={t('filter.state')} activeCount={filters.state !== 'all' ? 1 : 0}>
          {['all', 'active', 'cleaned'].map(sk => {
            const active = filters.state === sk
            const dot = sk === 'cleaned' ? '#D8D1C2' : sk === 'active' ? '#1DB870' : '#8A8378'
            return (
              <button key={sk}
                className={'filter-btn' + (active ? ' active' : '')}
                style={{ borderColor: active ? dot : '#E9E5DA', background: active ? dot + '22' : '#fff' }}
                onClick={() => onFilterChange(prev => ({ ...prev, state: sk }))}
                aria-pressed={active}
              >
                <span className="filter-dot" style={{ background: dot }} />
                <span className="filter-name">{t('filter.state.' + sk)}</span>
              </button>
            )
          })}
        </FilterSection>

        <FilterSection title={t('filter.size')} activeCount={filters.sizes.size}>
          {[
            { key: 'small', label: t('filter.size.small'), sub: '< 0,5 m²' },
            { key: 'medium', label: t('filter.size.medium'), sub: '0,5–2 m²' },
            { key: 'large', label: t('filter.size.large'), sub: '≥ 2 m²' },
          ].map(({ key, label, sub }) => {
            const active = filters.sizes.has(key)
            return (
              <button key={key}
                className={'filter-btn' + (active ? ' active' : '')}
                style={{ borderColor: active ? '#E85D26' : '#E9E5DA', background: active ? '#E85D2618' : '#fff' }}
                onClick={() => toggle('sizes', key)}
                aria-pressed={active}
              >
                <span className="filter-count">{sizeCounts[key]}</span>
                <span className="filter-name">{label}</span>
                <span className="filter-sub">{sub}</span>
              </button>
            )
          })}
        </FilterSection>

        {years.length > 1 && (
          <FilterSection title={t('filter.year')} activeCount={filters.years.size}>
            {years.map(year => {
              const active = filters.years.has(year)
              return (
                <button key={year}
                  className={'filter-btn' + (active ? ' active' : '')}
                  style={{ borderColor: active ? '#2A2520' : '#E9E5DA', background: active ? '#2A252018' : '#fff' }}
                  onClick={() => toggle('years', year)}
                  aria-pressed={active}
                >
                  <span className="filter-count">{year}</span>
                </button>
              )
            })}
          </FilterSection>
        )}

        {activeFilterCount > 0 && (
          <button className="reset-filters" onClick={onResetFilters}>
            Réinitialiser les filtres ({activeFilterCount})
          </button>
        )}
      </div>

      <div className="detail-wrap">
        {/* 1. A detection is selected */}
        {selected ? (
          <div className="detail">
            <button className="back-btn" onClick={() => onSelect(null)}>← Retour</button>

            {loadingImages ? (
              <div className="img-loading skeleton" aria-label={t('detail.imagesLoading')} />
            ) : activeImage ? (
              <>
                <div className="detail-img" onClick={() => setImgExpanded(true)} role="button" tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setImgExpanded(true)}>
                  <img key={activeImage.image_url} src={activeImage.image_url} alt={t('detail.cubeFace')} className="fade-img" />
                  {selected.date_observed && <div className="img-date">{formatDate(selected.date_observed)}</div>}
                  <div className="img-expand-hint">↗ agrandir</div>
                </div>

                {allImages.length > 1 && (
                  <div className="thumb-strip">
                    {allImages.map((img, idx) => {
                      const primaryStyle = img.detections[0]?.style
                      const color = STYLE_COLORS[primaryStyle] || '#888'
                      return (
                        <button key={idx}
                          className={'thumb-item' + (idx === activeImageIdx ? ' active' : '')}
                          onClick={() => setActiveImageIdx(idx)}
                          style={{ borderColor: idx === activeImageIdx ? color : 'transparent' }}
                          aria-label={`Face ${idx + 1} sur ${allImages.length}`}
                        >
                          <img src={img.image_url} alt="" />
                          <div className="thumb-dot" style={{ background: color }} />
                          <div className="thumb-count">
                            {img.detections.length > 1 ? `${img.detections.length} détections` : ((STYLE_LABELS[primaryStyle] ? STYLE_LABELS[primaryStyle]() : primaryStyle) || primaryStyle)}
                          </div>
                          {selected.date_observed && <div className="thumb-date">{formatShortDate(selected.date_observed)}</div>}
                        </button>
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
              {activeImage?.detections.map((det, idx) => (
                <div key={idx} className="detection-item">
                  <div className="detection-head">
                    <span className="style-badge" style={{ background: STYLE_COLORS[det.style] || '#888' }}>
                      {(STYLE_LABELS[det.style] ? STYLE_LABELS[det.style]() : det.style) || det.style}
                    </span>
                    {det.size_m2 && <span className="det-size">{det.size_m2} m²</span>}
                  </div>
                </div>
              ))}

              {Array.isArray(timeline) && timeline.length > 1 && (
                <div className="loc-history">
                  <span className="loc-history-title">{t('detail.history')}</span>
                  {timeline.map((e2, i2) => (
                    <div key={e2.id} className={'loc-entry' + (e2.removed_at ? ' cleaned' : '')}>
                      {e2.image_url
                        ? <img src={e2.image_url} alt="" loading="lazy" />
                        : <div className="loc-entry-noimg" />}
                      <div className="loc-entry-meta">
                        <span className="loc-entry-date">
                          {e2.date_observed ? e2.date_observed.slice(0, 4) : '—'}
                          {i2 === 0 && !e2.removed_at && <em> · {t('detail.current')}</em>}
                        </span>
                        {e2.removed_at && <span className="loc-entry-badge">{t('mod.cleanedBadge')} {e2.removed_at.slice(0, 4)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="meta-box">
                {address && (
                  <div className="meta-row">
                    <span className="meta-lbl">{t('detail.address')}</span>
                    <span className="meta-val">{address}</span>
                  </div>
                )}
                {selected.city && (
                  <div className="meta-row">
                    <span className="meta-lbl">{t('detail.city')}</span>
                    <span className="meta-val" style={{ textTransform: 'capitalize' }}>{selected.city}</span>
                  </div>
                )}
                {selected.date_observed && (
                  <div className="meta-row">
                    <span className="meta-lbl">{t('detail.captured')}</span>
                    <span className="meta-val">{formatDate(selected.date_observed)}</span>
                  </div>
                )}
                {selected.surface_type && (
                  <div className="meta-row">
                    <span className="meta-lbl">{t('detail.surface')}</span>
                    <span className="meta-val">{selected.surface_type.replace(/_/g, ' ')}</span>
                  </div>
                )}
                <div className="meta-row">
                  <span className="meta-lbl">{t('detail.gps')}</span>
                  <span className="meta-val mono">{selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}</span>
                </div>
              </div>

              <div className="action-btns">
                <a className="action-btn gsv"
                  href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${selected.lat},${selected.lng}`}
                  target="_blank" rel="noreferrer">{t('detail.streetview')}</a>
                <a className="action-btn pano"
                  href={`https://panoramax.ign.fr/#focus=map&map=17/${selected.lat}/${selected.lng}`}
                  target="_blank" rel="noreferrer">{t('detail.panoramax')}</a>
                <button className="action-btn share"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}>
                  {copied ? t('detail.linkCopied') : t('detail.share')}
                </button>
              </div>
            </div>
          </div>

        /* 2. Filters returned nothing — dead end, give them a way out */
        ) : noFilterResults ? (
          <div className="no-selection">
            <SprayCan color="#D0CEC8" size={34} />
            <p className="no-sel-title">{t('empty.noResults')}</p>
            <p className="no-sel-sub">
              {t('empty.noResults.hint')}
              Il y en a {allGraffiti.length} au total ici.
            </p>
            <button className="reset-filters block" onClick={onResetFilters}>{t('filter.reset')}</button>
          </div>

        /* 3. This area simply isn't mapped yet — the biggest "looks broken" trap */
        ) : noDataInArea ? (
          <div className="no-selection">
            <SprayCan color="#D0CEC8" size={34} />
            <p className="no-sel-title">{t('empty.noZone')}</p>
            <p className="no-sel-sub">
              Nous n'avons pas encore scanné cette zone. GraffitiAtlas se déploie ville par ville.
            </p>
            {cities.length > 0 && (
              <div className="city-list">
                <span className="city-list-lbl">{t('empty.cities')}</span>
                {cities.map(c => (
                  <button key={c.name} className="city-link" onClick={() => onSelect(null, c)}>
                    <span className="city-link-name">{c.name}</span>
                    <span className="city-link-count">{c.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

        /* 4. Default idle state */
        ) : (
          <div className="no-selection">
            <SprayCan color="#D0CEC8" size={34} />
            <p className="no-sel-title">{t('empty.noSelection')}</p>
            <p className="no-sel-sub">Cliquez sur un marqueur pour voir les images et les détails ici.</p>
            <p className="no-sel-tagline">
              GraffitiAtlas recense et documente le graffiti des villes françaises à partir
              d'images de rue à 360° — un inventaire cartographique, pas une galerie.
            </p>
            <div className="pano-credit">
              <span>
                Images 360° fournies par <a href="https://panoramax.ign.fr" target="_blank" rel="noreferrer">Panoramax</a> (IGN,
                données ouvertes), scannées par Rando360. Google Street View est fourni à titre de référence.
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

/* ══════════════════════════════════════════════════════
   APP
   ══════════════════════════════════════════════════════ */
const CITY_CENTERS = {
  lyon: { lat: 45.7640, lng: 4.8357 },
  grenoble: { lat: 45.1885, lng: 5.7245 },
}

export default function App() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  const [allGraffiti, setAllGraffiti] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ styles: new Set(), sizes: new Set(), years: new Set(), state: 'all' })
  const [panTo, setPanTo] = useState(null)
  const [user, setUser] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [showMod, setShowMod] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const mapCenterRef = useRef({ lat: 45.7640, lng: 4.8357 })
  const [cities, setCities] = useState([])
  const [sheetOpen, setSheetOpen] = useState(false)

  const boundsDebounceRef = useRef(null)
  const lastZoomRef = useRef(12)
  const lastBoundsRef = useRef(null)
  const abortRef = useRef(null)

  /* Lock the viewport to full-height only while the map is mounted,
     so other routes (landing) can scroll normally. */
  useEffect(() => {
    document.documentElement.classList.add('map-locked')
    return () => document.documentElement.classList.remove('map-locked')
  }, [])

  /* Auth */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])

  /* Moderator / admin role */
  useEffect(() => {
    if (!user) { setIsAdmin(false); return }
    supabase.from('profiles').select('role, language').eq('id', user.id).single()
      .then(({ data }) => {
        setIsAdmin(data?.role === 'admin' || data?.role === 'moderator')
        if (data?.language) syncLanguageFromProfile(data.language)
      })
      .catch(() => setIsAdmin(false))
  }, [user])

  /* Covered cities — powers the "zone non cartographiée" recovery state */
  useEffect(() => {
    fetch(`${API_URL}/map/cities`)
      .then(r => r.json())
      .then(d => setCities(d.cities || []))
      .catch(() => {})
  }, [])

  /* Deep link ?g=<id> */
  useEffect(() => {
    const gid = new URLSearchParams(window.location.search).get('g')
    if (!gid) return
    fetch(`${API_URL}/graffiti/${gid}`)
      .then(r => r.ok ? r.json() : null)
      .then(g => {
        if (g?.id) { setSelected(g); setPanTo({ lat: g.lat, lng: g.lng, zoom: 17 }) }
      })
      .catch(() => {})
  }, [])

  /* Keep URL shareable */
  useEffect(() => {
    const url = new URL(window.location)
    if (selected) url.searchParams.set('g', selected.id)
    else url.searchParams.delete('g')
    window.history.replaceState({}, '', url)
  }, [selected])

  /* Global Esc — closes auth modal */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && showAuth) setShowAuth(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showAuth])

  /* Selecting a marker centres it and opens the mobile sheet */
  const handleSelect = useCallback((g, city) => {
    if (city) {
      const c = CITY_CENTERS[city.name]
      if (c) setPanTo({ ...c, zoom: 14 })
      setSelected(null)
      return
    }
    setSelected(g)
    if (g) {
      setPanTo({ lat: g.lat, lng: g.lng })   // centre without changing zoom
      setSheetOpen(true)
    }
  }, [])

  /* Clicking a server cluster zooms in toward it, revealing finer clusters or
     individual markers (a new fetch runs at the higher zoom). */
  const handleClusterClick = useCallback((c) => {
    const current = Math.round(lastZoomRef.current ?? 12)
    const nextZoom = Math.min(current + 3, 18)
    setPanTo({ lat: c.lat, lng: c.lng, zoom: nextZoom })
  }, [])

  /* Data fetching — server clusters by zoom. Skip only when the view is
     already covered AND zoom hasn't changed; any zoom change refetches. */
  const loadedRef = useRef(null)   // { bounds, zoom }
  const fetchGraffiti = useCallback(async (bounds, zoom) => {
    if (!bounds) return

    const z0 = Math.round(zoom ?? 12)
    const done = loadedRef.current
    if (done && done.zoom === z0 &&
        bounds.north <= done.bounds.north && bounds.south >= done.bounds.south &&
        bounds.east <= done.bounds.east && bounds.west >= done.bounds.west) {
      return
    }

    const padLat = (bounds.north - bounds.south) * 0.2
    const padLng = (bounds.east - bounds.west) * 0.2
    const padded = {
      north: bounds.north + padLat, south: bounds.south - padLat,
      east: bounds.east + padLng, west: bounds.west - padLng,
    }

    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const { north, south, east, west } = padded
      const z = Math.round(zoom ?? 12)
      const res = await fetch(
        `${API_URL}/map/graffiti?north=${north}&south=${south}&east=${east}&west=${west}&zoom=${z}`,
        { signal: controller.signal }
      )
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const data = await res.json()
      setAllGraffiti(data.features)
      loadedRef.current = { bounds: padded, zoom: z }
      setError(null)
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error(err)
      setError(t('error.load'))
    } finally {
      setLoading(false)
    }
  }, [])

  const handleBoundsChanged = useCallback((e) => {
    const bounds = e.detail.bounds
    const zoom = lastZoomRef.current ?? e.detail.zoom ?? 12
    mapCenterRef.current = {
      lat: (bounds.north + bounds.south) / 2,
      lng: (bounds.east + bounds.west) / 2,
    }
    lastZoomRef.current = zoom
    lastBoundsRef.current = bounds
    clearTimeout(boundsDebounceRef.current)
    boundsDebounceRef.current = setTimeout(() => fetchGraffiti(bounds, zoom), 250)
  }, [fetchGraffiti])

  const retryFetch = useCallback(() => {
    if (lastBoundsRef.current) fetchGraffiti(lastBoundsRef.current, lastZoomRef.current)
  }, [fetchGraffiti])

  const filtered = useMemo(() => allGraffiti.filter(g => {
    // Clusters are aggregates with no style/size/year — never filter them out.
    if (g.cluster) return true
    if (filters.state === 'active' && g.cleaned) return false
    if (filters.state === 'cleaned' && !g.cleaned) return false
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
  }), [allGraffiti, filters])

  // Only individual markers count as selectable graffiti (for the sidebar list).
  const individuals = useMemo(() => filtered.filter(g => !g.cluster), [filtered])

  // True number of graffiti in view = individual markers + everything inside clusters.
  const hasClusters = useMemo(() => allGraffiti.some(g => g.cluster), [allGraffiti])

  const inViewTotal = useMemo(
    () => allGraffiti.reduce((sum, g) => sum + (g.cluster ? g.count : 1), 0),
    [allGraffiti]
  )

  const selectedId = selected?.id ?? null

  const resetFilters = useCallback(() => {
    setFilters({ styles: new Set(), sizes: new Set(), years: new Set(), state: 'all' })
  }, [])

  const deselect = useCallback(() => setSelected(null), [])

  /* Location history (timeline) for the selected marker's spot. */
  const [timeline, setTimeline] = useState([])
  useEffect(() => {
    const lid = selected?.location_id
    if (!lid) { setTimeline([]); return }
    let alive = true
    fetch(`${API_URL}/map/location/${lid}`)
      .then(r => r.ok ? r.json() : { timeline: [] })
      .then(d => { if (alive) setTimeline(d.timeline || []) })
      .catch(() => { if (alive) setTimeline([]) })
    return () => { alive = false }
  }, [selected?.location_id])

  return (
    <div className="app">
      <Header
        onSearchResult={setPanTo}
        user={user}
        onLoginClick={() => setShowAuth(true)}
        onLogout={() => supabase.auth.signOut()}
        onUploadClick={() => setShowUpload(true)}
        isAdmin={isAdmin}
        onModClick={() => setShowMod(true)}
        onSettingsClick={() => setShowSettings(true)}
      />

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          initialCenter={mapCenterRef.current}
        />
      )}
      {showMod && <ModerationPanel onClose={() => setShowMod(false)} />}
      {showSettings && (
        <SettingsPanel
          user={user}
          onClose={() => setShowSettings(false)}
          onLogout={() => { supabase.auth.signOut(); setShowSettings(false) }}
        />
      )}

      {error && (
        <div className="error-banner" role="alert">
          <span>⚠ {error}</span>
          <button onClick={() => { setError(null); retryFetch() }}>{t('error.retry')}</button>
        </div>
      )}

      <div className="app-body">
        <Sidebar
          graffiti={individuals}
          inViewTotal={inViewTotal}
          hasClusters={hasClusters}
          timeline={timeline}
          allGraffiti={allGraffiti}
          selected={selected}
          onSelect={handleSelect}
          loading={loading}
          error={error}
          filters={filters}
          onFilterChange={setFilters}
          onResetFilters={resetFilters}
          cities={cities}
          sheetOpen={sheetOpen}
          onToggleSheet={() => setSheetOpen(o => !o)}
        />

        <div className="right-panel">
          <StreetViewPanel selected={selected} apiKey={apiKey} />
          <div className="map-wrap">
            <APIProvider apiKey={apiKey}>
              <Map
                defaultZoom={12}
                defaultCenter={CITY_CENTERS.lyon}
                mapId="graffiti-atlas-map"
                style={{ width: '100%', height: '100%' }}
                onBoundsChanged={handleBoundsChanged}
                mapTypeControl={false}
                streetViewControl={false}
                fullscreenControl={false}
                clickableIcons={false}
              >
                <MapController panTo={panTo} onBackgroundClick={deselect} zoomRef={lastZoomRef} />
                <ServerMarkers
                  points={filtered}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                  onClusterClick={handleClusterClick}
                />
              </Map>
            </APIProvider>
          </div>
        </div>
      </div>
    </div>
  )
}
