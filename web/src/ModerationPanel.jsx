import { useState, useEffect, useCallback } from 'react'
import BlurEditor from './BlurEditor'
import MeasureEditor from './MeasureEditor'
import ModerationMap from './ModerationMap'
import { t } from './i18n'
import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const CLOUDFRONT = 'https://d36hw3x1088tvv.cloudfront.net'

export default function ModerationPanel({ onClose }) {
  const [tab, setTab] = useState('uploads')      // 'uploads' | 'removals'
  const [viewMode, setViewMode] = useState('cards') // 'cards' | 'table'
  const [pending, setPending] = useState([])
  const [removals, setRemovals] = useState([])
  const [bulk, setBulk] = useState([])            // self-imported YOLO scans (table view)
  const [bulkTotal, setBulkTotal] = useState(0)
  const [bulkLimit, setBulkLimit] = useState(100) // how many of the pending pool to load
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkLoaded, setBulkLoaded] = useState(false)
  const [bulkKind, setBulkKind] = useState('pending')  // 'pending' | 'approved' (reclassify)
  const [classifyLayout, setClassifyLayout] = useState('table')  // reclassify: 'table' | 'grid'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [stylesSel, setStylesSel] = useState({})   // key -> array of types (multi-select)
  const [densitySel, setDensitySel] = useState({}) // key -> 'light'|'medium'|'heavy'
  const [surfaceSel, setSurfaceSel] = useState({}) // pending id -> surface_type
  const [sizeSel, setSizeSel] = useState({})       // pending id -> size in m²
  const [nearbySel, setNearbySel] = useState({})   // pending id -> selected nearby graffiti
  const [zoomImg, setZoomImg] = useState(null)     // { url } enlarged for comparison  // { graffitiId: style }
  const [blurTarget, setBlurTarget] = useState(null)    // { id, url }
  const [measureTarget, setMeasureTarget] = useState(null)  // { id, url }
  const [bust, setBust] = useState({})                  // cache-buster per id
  const [mapPoints, setMapPoints] = useState([])        // pending coords for the map view
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const [selected, setSelected] = useState(() => new Set()) // table: checked row ids
  const [bulkBusy, setBulkBusy] = useState(false)          // bulk approve/reject running

  const authHeader = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const headers = await authHeader()
      const [p, r] = await Promise.all([
        fetch(`${API_URL}/moderation/pending`, { headers }),
        fetch(`${API_URL}/moderation/removals`, { headers }),
      ])
      if (p.status === 403 || r.status === 403) throw new Error(t('mod.err.forbidden'))
      const pj = await p.json()
      const rj = await r.json()
      setPending(pj.pending || [])
      setRemovals(rj.removals || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [authHeader])

  useEffect(() => { load() }, [load])

  // Bulk pending list (self-imported YOLO scans) for the fast table view.
  // Skips the per-item nearby lookup and paginates server-side.
  const loadBulk = useCallback(async (limit = 100, kind = 'pending') => {
    setBulkLoading(true); setError(null)
    try {
      const headers = await authHeader()
      const path = kind === 'approved' ? 'approved-fast' : 'pending-fast'
      const res = await fetch(`${API_URL}/moderation/${path}?limit=${limit}&offset=0`, { headers })
      if (res.status === 403) throw new Error(t('mod.err.forbidden'))
      const j = await res.json()
      setBulk(j.pending || [])
      setBulkTotal(j.total || 0)
      setBulkLimit(limit)
      setBulkLoaded(true)
      setBulkKind(kind)
      setSelected(new Set())
    } catch (e) {
      setError(e.message)
    } finally {
      setBulkLoading(false)
    }
  }, [authHeader])

  // Load the right dataset for the current view: pending for table/grid,
  // approved for reclassify. Reload when the required kind changes.
  useEffect(() => {
    const wantApproved = viewMode === 'reclassify'
    const wantTable = viewMode === 'table' || viewMode === 'grid' || viewMode === 'reclassify'
    if (!wantTable || bulkLoading) return
    const kind = wantApproved ? 'approved' : 'pending'
    if (!bulkLoaded || bulkKind !== kind) loadBulk(100, kind)
  }, [viewMode, bulkLoaded, bulkKind, bulkLoading, loadBulk])

  // Load all pending coordinates for the map view.
  const loadMapPoints = useCallback(async () => {
    setMapLoading(true); setError(null)
    try {
      const headers = await authHeader()
      const res = await fetch(`${API_URL}/moderation/pending-points`, { headers })
      if (res.status === 403) throw new Error(t('mod.err.forbidden'))
      const j = await res.json()
      setMapPoints(j.points || [])
      setMapLoaded(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setMapLoading(false)
    }
  }, [authHeader])

  useEffect(() => {
    if (viewMode === 'map' && !mapLoaded && !mapLoading) loadMapPoints()
  }, [viewMode, mapLoaded, mapLoading, loadMapPoints])

  // Link one point into another's location (consolidate — nothing deleted).
  const linkPoints = useCallback(async (srcId, targetId) => {
    try {
      const headers = await authHeader()
      const res = await fetch(`${API_URL}/moderation/graffiti/${srcId}/link-to/${targetId}`,
        { method: 'POST', headers })
      if (!res.ok) throw new Error(t('mod.err.failed'))
      // consolidated — drop the dragged point from the map
      setMapPoints(ps => ps.filter(p => p.id !== srcId))
    } catch (e) {
      setError(e.message)
    }
  }, [authHeader])

  // Reject/delete a pending point straight from the map view.
  const deleteMapPoint = useCallback(async (id) => {
    try {
      const headers = await authHeader()
      const res = await fetch(`${API_URL}/moderation/graffiti/${id}/reject`,
        { method: 'POST', headers })
      if (!res.ok) throw new Error(t('mod.err.failed'))
      setMapPoints(ps => ps.filter(p => p.id !== id))
    } catch (e) {
      setError(e.message)
    }
  }, [authHeader])

  const act = async (url, id, body) => {
    setBusyId(id)
    try {
      const headers = await authHeader()
      const opts = { method: 'POST', headers }
      if (body) {
        opts.headers = { ...headers, 'Content-Type': 'application/json' }
        opts.body = JSON.stringify(body)
      }
      const res = await fetch(url, opts)
      if (!res.ok) throw new Error(t('mod.err.failed'))
      setPending(p => p.filter(x => x.id !== id))
      setRemovals(r => r.filter(x => x.id !== id))
      setBulk(b => b.filter(x => x.id !== id))
      setBulkTotal(n => (n > 0 ? n - 1 : 0))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  // Reject a single photo (keep the marker + its other photo). If it was the
  // last photo, the marker goes too.
  const rejectPhoto = async (imageId, gid) => {
    setBusyId(gid); setError(null)
    try {
      const headers = await authHeader()
      const res = await fetch(`${API_URL}/moderation/image/${imageId}/reject`, { method: 'POST', headers })
      if (!res.ok) throw new Error(t('mod.err.failed'))
      const j = await res.json()
      setBulk(b => b.flatMap(x => {
        if (x.id !== gid) return [x]
        const imgs = (x.images || []).filter(im => im.id !== imageId)
        if (j.marker_deleted || imgs.length === 0) return []
        return [{ ...x, images: imgs, s3_key_thumb: imgs[0]?.key ?? x.s3_key_thumb }]
      }))
      if (j.marker_deleted) setBulkTotal(n => (n > 0 ? n - 1 : 0))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  // Current types for a photo: local edit → existing styles[] → legacy single style.
  const stylesFor = (k, im) => stylesSel[k] ?? im?.styles ?? (im?.style ? [im.style] : [])
  const toggleStyle = (k, s, current) => setStylesSel(prev => {
    const cur = prev[k] ?? current ?? []
    return { ...prev, [k]: cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s] }
  })
  const setDensity = (k, d) => setDensitySel(prev => ({ ...prev, [k]: prev[k] === d ? undefined : d }))

  // Build the approve payload for a marker: per-photo classifications when it
  // has real image ids, else a single marker-level classification.
  const approveBodyFor = (g) => {
    const imgs = (g.images && g.images.length) ? g.images : []
    const photos = imgs.filter(im => im.id).map(im => ({
      image_id: im.id,
      styles: stylesFor(im.id, im),
      density: densitySel[im.id] ?? im.density ?? null,
      surface_type: surfaceSel[im.id] ?? im.surface_type ?? null,
      size_m2: sizeSel[im.id] ?? im.size_m2 ?? null,
    }))
    if (photos.length) return { photos }
    return {
      styles: stylesFor(g.id, g),
      density: densitySel[g.id] ?? null,
      surface_type: surfaceSel[g.id] ?? g.surface_type ?? null,
      size_m2: sizeSel[g.id] ?? null,
    }
  }

  const approveMarker = (g) =>
    act(`${API_URL}/moderation/graffiti/${g.id}/approve`, g.id, approveBodyFor(g))

  // Reclassify: only types + density (never size or status).
  const reclassifyBodyFor = (g) => {
    const imgs = (g.images && g.images.length) ? g.images : []
    const photos = imgs.filter(im => im.id).map(im => ({
      image_id: im.id,
      styles: stylesFor(im.id, im),
      density: densitySel[im.id] ?? im.density ?? null,
      surface_type: surfaceSel[im.id] ?? im.surface_type ?? null,
    }))
    if (photos.length) return { photos }
    return {
      styles: stylesFor(g.id, g),
      density: densitySel[g.id] ?? null,
      surface_type: surfaceSel[g.id] ?? g.surface_type ?? null,
    }
  }
  const saveReclassify = (g) =>
    act(`${API_URL}/moderation/graffiti/${g.id}/reclassify`, g.id, reclassifyBodyFor(g))

  // ── Table multi-select ──────────────────────────────────────────────────
  const toggleRow = (id) => setSelected(s => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  const allPageSelected = bulk.length > 0 && bulk.every(g => selected.has(g.id))
  const toggleAllPage = () => setSelected(s => {
    const n = new Set(s)
    if (bulk.every(g => n.has(g.id))) bulk.forEach(g => n.delete(g.id))
    else bulk.forEach(g => n.add(g.id))
    return n
  })
  const selectedCount = bulk.reduce((a, g) => a + (selected.has(g.id) ? 1 : 0), 0)

  // Approve or reject every selected row (limited concurrency), applying each
  // row's own type/surface/size for approvals.
  const runBulk = async (kind) => {
    const ids = bulk.filter(g => selected.has(g.id)).map(g => g.id)
    if (!ids.length || bulkBusy) return
    if (kind === 'reject' && !window.confirm(t(classify ? 'mod.reclassify.confirmDelete' : 'mod.bulk.confirmReject'))) return
    if (kind === 'approve' && !window.confirm(`${t('mod.bulk.confirmApprove')} (${ids.length})`)) return
    setBulkBusy(true); setError(null)
    const headers = await authHeader()
    let i = 0
    const worker = async () => {
      while (i < ids.length) {
        const id = ids[i++]
        const g = bulk.find(x => x.id === id)
        try {
          const action = kind === 'approve' ? 'approve' : kind === 'reclassify' ? 'reclassify' : 'reject'
          let url = `${API_URL}/moderation/graffiti/${id}/${action}`
          const opts = { method: 'POST', headers }
          if (kind === 'approve') {
            opts.headers = { ...headers, 'Content-Type': 'application/json' }
            opts.body = JSON.stringify(g ? approveBodyFor(g) : {})
          } else if (kind === 'reclassify') {
            opts.headers = { ...headers, 'Content-Type': 'application/json' }
            opts.body = JSON.stringify(g ? reclassifyBodyFor(g) : {})
          }
          const res = await fetch(url, opts)
          if (res.ok) {
            setBulk(b => b.filter(x => x.id !== id))
            setBulkTotal(n => (n > 0 ? n - 1 : 0))
            setSelected(s => { const n = new Set(s); n.delete(id); return n })
          }
        } catch { /* keep going */ }
      }
    }
    await Promise.all(Array.from({ length: Math.min(6, ids.length) }, worker))
    setBulkBusy(false)
  }

  const STYLES = [
    { key: 'tag', label: t('style.tag') },
    { key: 'throwup', label: t('style.throwup') },
    { key: 'piece', label: t('style.piece') },
    { key: 'mural', label: t('style.mural') },
  ]

  const DENSITIES = [
    { key: 'light', label: t('density.light') },
    { key: 'medium', label: t('density.medium') },
    { key: 'heavy', label: t('density.heavy') },
  ]

  const SURFACES = [
    { key: 'bare_wall', label: t('surface.bare_wall') },
    { key: 'painted_wall', label: t('surface.painted_wall') },
    { key: 'concrete', label: t('surface.concrete') },
    { key: 'brick', label: t('surface.brick') },
    { key: 'metal', label: t('surface.metal') },
    { key: 'glass', label: t('surface.glass') },
    { key: 'wood', label: t('surface.wood') },
    { key: 'other', label: t('surface.other') },
  ]

  // Preset surface estimates (m²); custom input overrides.
  const SIZE_PRESETS = [
    { key: 'xs', label: '< 1 m²', value: 0.5 },
    { key: 's',  label: '1–5 m²', value: 3 },
    { key: 'm',  label: '5–20 m²', value: 12 },
    { key: 'l',  label: '> 20 m²', value: 30 },
  ]

  const formatDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  const classify = viewMode === 'reclassify'   // reclassifying approved photos (types + density only)
  const showGrid = viewMode === 'grid' || (classify && classifyLayout === 'grid')

  return (
    <div className="mod-overlay" onClick={onClose}>
      <div className="mod-panel" onClick={e => e.stopPropagation()}>
        <div className="mod-head">
          <h2>{t('mod.title')}</h2>
          <button className="mod-close" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        <div className="mod-tabs">
          <button className={tab === 'uploads' ? 'on' : ''} onClick={() => setTab('uploads')}>
            {t('mod.tab.uploads')} {pending.length > 0 && <span className="mod-badge">{pending.length}</span>}
          </button>
          <button className={tab === 'removals' ? 'on' : ''} onClick={() => setTab('removals')}>
            {t('mod.tab.removals')} {removals.length > 0 && <span className="mod-badge">{removals.length}</span>}
          </button>
          {tab === 'uploads' && (
            <div className="mod-viewtoggle">
              <button className={viewMode === 'cards' ? 'on' : ''} onClick={() => setViewMode('cards')}>{t('mod.view.cards')}</button>
              <button className={viewMode === 'table' ? 'on' : ''} onClick={() => setViewMode('table')}>{t('mod.view.table')}</button>
              <button className={viewMode === 'grid' ? 'on' : ''} onClick={() => setViewMode('grid')}>{t('mod.view.grid')}</button>
              <button className={viewMode === 'map' ? 'on' : ''} onClick={() => setViewMode('map')}>{t('mod.view.map')}</button>
              <button className={viewMode === 'reclassify' ? 'on' : ''} onClick={() => setViewMode('reclassify')}>{t('mod.view.reclassify')}</button>
            </div>
          )}
        </div>

        <div className="mod-body">
          {error && <div className="mod-error">{error}</div>}
          {loading ? (
            <div className="mod-empty">{t('common.loading')}</div>
          ) : tab === 'uploads' ? (
            viewMode === 'map' ? (
              mapLoading ? (
                <div className="mod-empty">{t('common.loading')}</div>
              ) : (
                <ModerationMap points={mapPoints} onLink={linkPoints} onDelete={deleteMapPoint} />
              )
            ) : (viewMode === 'table' || viewMode === 'grid' || viewMode === 'reclassify') ? (
              bulkLoading && bulk.length === 0 ? (
                <div className="mod-empty">{t('common.loading')}</div>
              ) : bulk.length === 0 ? (
                <div className="mod-empty">{t('mod.empty.bulk')}</div>
              ) : showGrid ? (
                <div className="mod-grid-wrap">
                  <div className="mod-tbl-bar">
                    <span className="mod-tbl-count">{bulk.length} / {bulkTotal} {classify ? t('mod.reclassify.count') : t('mod.bulk.pending')}</span>
                    {classify && (
                      <div className="mod-viewtoggle">
                        <button className={classifyLayout === 'table' ? 'on' : ''} onClick={() => setClassifyLayout('table')}>{t('mod.view.table')}</button>
                        <button className={classifyLayout === 'grid' ? 'on' : ''} onClick={() => setClassifyLayout('grid')}>{t('mod.view.grid')}</button>
                      </div>
                    )}
                    {selectedCount > 0 ? (
                      <>
                        <span className="mod-tbl-selcount">{selectedCount} {t('mod.bulk.selected')}</span>
                        {classify ? (
                          <button className="mod-tbl-bulk approve" disabled={bulkBusy} onClick={() => runBulk('reclassify')}>
                            {bulkBusy ? t('common.loading') : `${t('mod.reclassify.save')} (${selectedCount})`}
                          </button>
                        ) : (
                          <button className="mod-tbl-bulk approve" disabled={bulkBusy} onClick={() => runBulk('approve')}>
                            {t('mod.approve')} ({selectedCount})
                          </button>
                        )}
                        <button className="mod-tbl-bulk reject" disabled={bulkBusy} onClick={() => runBulk('reject')}>
                          {bulkBusy ? t('common.loading') : `${classify ? t('mod.reclassify.delete') : t('mod.reject')} (${selectedCount})`}
                        </button>
                        <button className="mod-tbl-loadmore" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
                          {t('mod.bulk.clearSel')}
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="mod-grid-hint">{classify ? t('mod.reclassify.hint') : t('mod.grid.hint')}</span>
                        {bulk.length < bulkTotal && (
                          <button className="mod-tbl-loadmore" disabled={bulkLoading} onClick={() => loadBulk(bulkLimit + 100, bulkKind)}>
                            {bulkLoading ? t('common.loading') : t('mod.bulk.loadmore')}
                          </button>
                        )}
                        <button className="mod-tbl-loadmore" disabled={bulkLoading} onClick={() => loadBulk(bulkLimit, bulkKind)}>
                          {t('mod.bulk.refresh')}
                        </button>
                      </>
                    )}
                  </div>
                  <div className="mod-grid">
                    {bulk.map(g => {
                      const key = (g.images && g.images[0]?.key) || g.s3_key_thumb
                      const on = selected.has(g.id)
                      return (
                        <div key={g.id} className={'mod-grid-tile' + (on ? ' sel' : '')} onClick={() => toggleRow(g.id)}>
                          {key
                            ? <img src={`${CLOUDFRONT}/${key}`} alt="" loading="lazy" />
                            : <div className="mod-grid-noimg">—</div>}
                          {g.images && g.images.length > 1 && <span className="mod-grid-count">{g.images.length}</span>}
                          <button
                            className="mod-grid-zoom"
                            title={t('mod.grid.zoom')}
                            onClick={(e) => { e.stopPropagation(); if (key) setZoomImg({ url: `${CLOUDFRONT}/${key}` }) }}
                          >⤢</button>
                          {classify && (
                            <button
                              className="mod-grid-del"
                              title={t('mod.reclassify.delete')}
                              disabled={busyId === g.id}
                              onClick={(e) => { e.stopPropagation(); if (window.confirm(t('mod.reclassify.confirmDelete'))) act(`${API_URL}/moderation/graffiti/${g.id}/reject`, g.id) }}
                            >🗑</button>
                          )}
                          {on && <span className="mod-grid-check">✓</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
              <div className="mod-table-wrap">
                <div className="mod-tbl-bar">
                  <span className="mod-tbl-count">{bulk.length} / {bulkTotal} {classify ? t('mod.reclassify.count') : t('mod.bulk.pending')}</span>
                  {classify && (
                    <div className="mod-viewtoggle">
                      <button className={classifyLayout === 'table' ? 'on' : ''} onClick={() => setClassifyLayout('table')}>{t('mod.view.table')}</button>
                      <button className={classifyLayout === 'grid' ? 'on' : ''} onClick={() => setClassifyLayout('grid')}>{t('mod.view.grid')}</button>
                    </div>
                  )}
                  {classify && <span className="mod-grid-hint">{t('mod.reclassify.hint')}</span>}
                  {selectedCount > 0 ? (
                    <>
                      <span className="mod-tbl-selcount">{selectedCount} {t('mod.bulk.selected')}</span>
                      {classify ? (
                        <>
                          <button className="mod-tbl-bulk approve" disabled={bulkBusy}
                            onClick={() => runBulk('reclassify')}>
                            {bulkBusy ? t('common.loading') : `${t('mod.reclassify.save')} (${selectedCount})`}
                          </button>
                          <button className="mod-tbl-bulk reject" disabled={bulkBusy}
                            onClick={() => runBulk('reject')}>
                            {t('mod.reclassify.delete')} ({selectedCount})
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="mod-tbl-bulk approve" disabled={bulkBusy}
                            onClick={() => runBulk('approve')}>
                            {bulkBusy ? t('common.loading') : `${t('mod.approve')} (${selectedCount})`}
                          </button>
                          <button className="mod-tbl-bulk reject" disabled={bulkBusy}
                            onClick={() => runBulk('reject')}>
                            {t('mod.reject')} ({selectedCount})
                          </button>
                        </>
                      )}
                      <button className="mod-tbl-loadmore" disabled={bulkBusy}
                        onClick={() => setSelected(new Set())}>
                        {t('mod.bulk.clearSel')}
                      </button>
                    </>
                  ) : (
                    <>
                      {bulk.length < bulkTotal && (
                        <button
                          className="mod-tbl-loadmore"
                          disabled={bulkLoading}
                          onClick={() => loadBulk(bulkLimit + 100, bulkKind)}
                        >
                          {bulkLoading ? t('common.loading') : t('mod.bulk.loadmore')}
                        </button>
                      )}
                      <button className="mod-tbl-loadmore" disabled={bulkLoading} onClick={() => loadBulk(bulkLimit, bulkKind)}>
                        {t('mod.bulk.refresh')}
                      </button>
                    </>
                  )}
                </div>
                <table className="mod-table">
                  <thead>
                    <tr>
                      <th className="mod-tbl-checkcol">
                        <input
                          type="checkbox"
                          checked={allPageSelected}
                          onChange={toggleAllPage}
                          aria-label={t('mod.bulk.selectAll')}
                        />
                      </th>
                      <th>{t('mod.col.photo')}</th>
                      <th>{t('report.col.city')}</th>
                      <th>{t('mod.type')}</th>
                      <th>{t('mod.density')}</th>
                      <th>{t('mod.surface')}</th>
                      <th>m²</th>
                      <th>{t('mod.col.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulk.map(g => {
                      const imgs = (g.images && g.images.length)
                        ? g.images
                        : [{ id: null, key: g.s3_key_thumb }]
                      const rs = imgs.length
                      const multi = rs > 1
                      return imgs.map((im, j) => {
                        const k = im.id ?? g.id      // per-photo state key (falls back to marker)
                        const curSize = sizeSel[k] ?? im.size_m2
                        return (
                          <tr key={g.id + ':' + (im.id || j)}
                              className={(busyId === g.id ? 'busy' : '') + (selected.has(g.id) ? ' sel' : '') + (j === 0 ? ' mk-first' : '')}>
                            {j === 0 && (
                              <td className="mod-tbl-checkcol" rowSpan={rs}>
                                <input type="checkbox" checked={selected.has(g.id)}
                                  onChange={() => toggleRow(g.id)} aria-label={t('mod.bulk.selectRow')} />
                              </td>
                            )}
                            <td>
                              {im.key ? (
                                <div className="mod-tbl-photo">
                                  <img className="mod-tbl-thumb" src={`${CLOUDFRONT}/${im.key}`} alt="" loading="lazy"
                                    onClick={() => setZoomImg({
                                      url: `${CLOUDFRONT}/${im.key}`,
                                      imageId: (im.id && multi) ? im.id : null, graffitiId: g.id,
                                    })} />
                                  {im.id && multi && (
                                    <button className="mod-tbl-photo-x" title={t('mod.rejectPhoto')}
                                      disabled={busyId === g.id} onClick={() => rejectPhoto(im.id, g.id)}>✕</button>
                                  )}
                                </div>
                              ) : <span className="mod-tbl-noimg">—</span>}
                            </td>
                            {j === 0 && (
                              <td rowSpan={rs}>
                                <div className="mod-tbl-city">{g.city || t('mod.unknownCity')}</div>
                                <div className="mod-tbl-coords">{g.lat?.toFixed(4)}, {g.lng?.toFixed(4)}</div>
                              </td>
                            )}
                            <td>
                              <div className="mod-tbl-types">
                                {STYLES.map(s => {
                                  const cur = stylesFor(k, im)
                                  return (
                                    <button
                                      key={s.key}
                                      className={'mod-tbl-type' + (cur.includes(s.key) ? ' on' : '')}
                                      onClick={() => toggleStyle(k, s.key, cur)}
                                    >
                                      {s.label}
                                    </button>
                                  )
                                })}
                              </div>
                            </td>
                            <td>
                              <div className="mod-tbl-types">
                                {DENSITIES.map(d => {
                                  const cur = densitySel[k] ?? im.density
                                  return (
                                    <button
                                      key={d.key}
                                      className={'mod-tbl-type dens' + (cur === d.key ? ' on' : '')}
                                      onClick={() => setDensity(k, d.key)}
                                    >
                                      {d.label}
                                    </button>
                                  )
                                })}
                              </div>
                            </td>
                            <td>
                              <div className="mod-tbl-types">
                                {SURFACES.map(s => {
                                  const cur = surfaceSel[k] ?? im.surface_type
                                  return (
                                    <button
                                      key={s.key}
                                      className={'mod-tbl-type surf' + (cur === s.key ? ' on' : '')}
                                      onClick={() => setSurfaceSel(prev => ({ ...prev, [k]: prev[k] === s.key ? undefined : s.key }))}
                                    >
                                      {s.label}
                                    </button>
                                  )
                                })}
                              </div>
                            </td>
                            <td>
                              <div className="mod-tbl-size-cell">
                                <select className="mod-tbl-select mod-tbl-size"
                                  value={curSize ?? ''}
                                  onChange={e => setSizeSel(prev => ({ ...prev, [k]: e.target.value ? Number(e.target.value) : undefined }))}>
                                  <option value="">—</option>
                                  {SIZE_PRESETS.map(p => <option key={p.key} value={p.value}>{p.label}</option>)}
                                  {curSize != null && !SIZE_PRESETS.some(p => p.value === curSize) && (
                                    <option value={curSize}>{curSize} m²</option>
                                  )}
                                </select>
                                <button className="mod-tbl-measure" title={t('mod.measure')} disabled={!im.key}
                                  onClick={() => setMeasureTarget({ id: k, url: `${CLOUDFRONT}/${im.key}` })}>📏</button>
                              </div>
                            </td>
                            {j === 0 && (
                              <td className="mod-tbl-actions" rowSpan={rs}>
                                {classify ? (
                                  <>
                                    <button className="mod-approve sm" disabled={busyId === g.id}
                                      title={t('mod.reclassify.save')} onClick={() => saveReclassify(g)}>💾</button>
                                    <button className="mod-reject sm" disabled={busyId === g.id}
                                      title={t('mod.reclassify.delete')}
                                      onClick={() => { if (window.confirm(t('mod.reclassify.confirmDelete'))) act(`${API_URL}/moderation/graffiti/${g.id}/reject`, g.id) }}>🗑</button>
                                  </>
                                ) : (
                                  <>
                                    <button className="mod-approve sm" disabled={busyId === g.id}
                                      onClick={() => approveMarker(g)}>✓</button>
                                    <button className="mod-reject sm" disabled={busyId === g.id}
                                      onClick={() => act(`${API_URL}/moderation/graffiti/${g.id}/reject`, g.id)}>✕</button>
                                  </>
                                )}
                              </td>
                            )}
                          </tr>
                        )
                      })
                    })}
                  </tbody>
                </table>
              </div>
              )
            ) : pending.length === 0 ? (
              <div className="mod-empty">{t('mod.empty.uploads')}</div>
            ) : (
              pending.map(g => (
                <div key={g.id} className="mod-card">
                  <div className="mod-thumb">
                    {g.s3_key_thumb
                      ? <img
                          src={`${CLOUDFRONT}/${g.s3_key_thumb}${bust[g.id] ? '?t=' + bust[g.id] : ''}`}
                          alt=""
                          onClick={() => setZoomImg({ url: `${CLOUDFRONT}/${g.s3_key_thumb.replace('thumb.jpg','medium.jpg')}${bust[g.id] ? '?t=' + bust[g.id] : ''}` })}
                          style={{ cursor: 'zoom-in' }}
                        />
                      : <div className="mod-thumb-empty">{t('mod.noImage')}</div>}
                  </div>
                  <div className="mod-info">
                    <div className="mod-info-top">
                      <span className="mod-city">{g.city || t('mod.unknownCity')}</span>
                    </div>
                    {g.description_fr && <p className="mod-desc">{g.description_fr}</p>}
                    <p className="mod-meta">
                      {g.lat?.toFixed(5)}, {g.lng?.toFixed(5)} · {formatDate(g.created_at)}
                    </p>

                    <div className="mod-type-row">
                      <span className="mod-type-lbl">{t('mod.type')}</span>
                      {STYLES.map(s => {
                        const cur = stylesFor(g.id, g)
                        return (
                          <button
                            key={s.key}
                            className={'mod-type' + (cur.includes(s.key) ? ' on' : '')}
                            onClick={() => toggleStyle(g.id, s.key, cur)}
                          >
                            {s.label}
                          </button>
                        )
                      })}
                    </div>

                    <div className="mod-type-row">
                      <span className="mod-type-lbl">{t('mod.density')}</span>
                      {DENSITIES.map(d => {
                        const cur = densitySel[g.id] ?? g.density
                        return (
                          <button
                            key={d.key}
                            className={'mod-type' + (cur === d.key ? ' on' : '')}
                            onClick={() => setDensity(g.id, d.key)}
                          >
                            {d.label}
                          </button>
                        )
                      })}
                    </div>

                    <div className="mod-type-row">
                      <span className="mod-type-lbl">{t('mod.surface')}</span>
                      {SURFACES.map(s => {
                        const current = surfaceSel[g.id] ?? g.surface_type
                        return (
                          <button
                            key={s.key}
                            className={'mod-type' + (current === s.key ? ' on' : '')}
                            onClick={() => setSurfaceSel(prev => ({ ...prev, [g.id]: prev[g.id] === s.key ? undefined : s.key }))}
                          >
                            {s.label}
                          </button>
                        )
                      })}
                    </div>

                    <div className="mod-type-row">
                      <span className="mod-type-lbl">{t('mod.size')}</span>
                      {SIZE_PRESETS.map(p => (
                        <button
                          key={p.key}
                          className={'mod-type' + (sizeSel[g.id] === p.value ? ' on' : '')}
                          onClick={() => setSizeSel(prev => ({
                            ...prev, [g.id]: prev[g.id] === p.value ? undefined : p.value,
                          }))}
                        >
                          {p.label}
                        </button>
                      ))}
                      <input
                        className="mod-size-input"
                        type="number"
                        min="0.1"
                        max="10000"
                        step="0.5"
                        placeholder="m²"
                        value={typeof sizeSel[g.id] === 'number' && !SIZE_PRESETS.some(p => p.value === sizeSel[g.id]) ? sizeSel[g.id] : ''}
                        onChange={e => {
                          const v = parseFloat(e.target.value)
                          setSizeSel(prev => ({ ...prev, [g.id]: isNaN(v) ? undefined : v }))
                        }}
                      />
                      <button
                        className="mod-type"
                        disabled={!g.s3_key_thumb}
                        title={t('measure.title')}
                        onClick={() => setMeasureTarget({
                          id: g.id,
                          url: `${CLOUDFRONT}/${g.s3_key_thumb.replace('thumb.jpg','medium.jpg')}`,
                        })}
                      >
                        📏 {t('mod.measure')}
                      </button>
                    </div>

                    {Array.isArray(g.nearby) && g.nearby.length > 0 && (
                      <div className="mod-nearby">
                        <span className="mod-nearby-title">{t('mod.nearby.title')}</span>
                        <div className="mod-nearby-row">
                          {g.nearby.map(n => (
                            <button
                              key={n.id}
                              className={'mod-nearby-item' + (nearbySel[g.id]?.id === n.id ? ' on' : '')}
                              onClick={() => setNearbySel(prev => ({
                                ...prev, [g.id]: prev[g.id]?.id === n.id ? null : n,
                              }))}
                              title={`${Math.round(n.distance_m)} m`}
                            >
                              {n.image_key
                                ? <img
                                    src={`${CLOUDFRONT}/${n.image_key}`}
                                    alt=""
                                    loading="lazy"
                                    onClick={(ev) => {
                                      ev.stopPropagation()
                                      const big = n.image_key.replace('thumb.jpg','medium.jpg')
                                      setZoomImg({ url: `${CLOUDFRONT}/${big}` })
                                    }}
                                    style={{ cursor: 'zoom-in' }}
                                  />
                                : <span className="mod-nearby-noimg">?</span>}
                              <span className="mod-nearby-dist">{Math.round(n.distance_m)} {t('mod.distAway')}</span>
                              {n.removed_at && <span className="mod-nearby-cleaned">{t('mod.cleanedBadge')}</span>}
                            </button>
                          ))}
                        </div>
                        <div className="mod-loc-actions">
                          <button
                            className="mod-loc-btn"
                            disabled={!nearbySel[g.id] || busyId === g.id}
                            onClick={() => act(
                              `${API_URL}/moderation/graffiti/${g.id}/attach-photo`,
                              g.id, { target_id: nearbySel[g.id].id }
                            )}
                          >
                            {t('mod.samePhoto')}
                          </button>
                          <button
                            className="mod-loc-btn"
                            disabled={!nearbySel[g.id] || busyId === g.id}
                            onClick={() => act(
                              `${API_URL}/moderation/graffiti/${g.id}/approve-at-location`,
                              g.id, { target_id: nearbySel[g.id].id, styles: stylesFor(g.id, g), density: densitySel[g.id] ?? null, surface_type: surfaceSel[g.id] ?? g.surface_type ?? null, size_m2: sizeSel[g.id] ?? null }
                            )}
                          >
                            {t('mod.newAtLocation')}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mod-actions">
                      <button
                        className="mod-approve"
                        disabled={busyId === g.id}
                        onClick={() => approveMarker(g)}
                      >
                        {t('mod.approve')}
                      </button>
                      <button
                        className="mod-blur"
                        disabled={!g.s3_key_thumb}
                        onClick={() => setBlurTarget({
                          id: g.id,
                          url: `${CLOUDFRONT}/${g.s3_key_thumb.replace('thumb.jpg','medium.jpg')}`,
                        })}
                      >
                        {t('mod.blur')}
                      </button>
                      <button
                        className="mod-reject"
                        disabled={busyId === g.id}
                        onClick={() => act(`${API_URL}/moderation/graffiti/${g.id}/reject`, g.id)}
                      >
                        {t('mod.reject')}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )
          ) : (
            removals.length === 0 ? (
              <div className="mod-empty">{t('mod.empty.removals')}</div>
            ) : (
              removals.map(r => (
                <div key={r.id} className="mod-card">
                  <div className="mod-thumb">
                    {r.photo_url
                      ? <img src={r.photo_url} alt="" />
                      : <div className="mod-thumb-empty">{t('mod.noPhoto')}</div>}
                  </div>
                  <div className="mod-info">
                    <div className="mod-info-top">
                      <span className="mod-style removal">{t('mod.removal.badge')}</span>
                    </div>
                    {r.note && <p className="mod-desc">{r.note}</p>}
                    <p className="mod-meta">{formatDate(r.created_at)}</p>

                    <div className="mod-actions">
                      <button
                        className="mod-approve"
                        disabled={busyId === r.id}
                        onClick={() => act(`${API_URL}/moderation/removal/${r.id}/approve`, r.id)}
                      >
                        {t('mod.removal.approve')}
                      </button>
                      <button
                        className="mod-reject"
                        disabled={busyId === r.id}
                        onClick={() => act(`${API_URL}/moderation/removal/${r.id}/reject`, r.id)}
                      >
                        {t('mod.reject')}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )
          )}
        </div>

        {zoomImg && (
        <div className="mod-zoom" onClick={() => setZoomImg(null)}>
          <img src={zoomImg.url} alt="" onClick={(e) => e.stopPropagation()} />
          <button className="mod-zoom-close" onClick={() => setZoomImg(null)} aria-label={t('common.close')}>✕</button>
          {zoomImg.imageId && (
            <button
              className="mod-zoom-reject"
              onClick={(e) => {
                e.stopPropagation()
                rejectPhoto(zoomImg.imageId, zoomImg.graffitiId)
                setZoomImg(null)
              }}
            >
              {t('mod.rejectPhoto')}
            </button>
          )}
        </div>
      )}
      {measureTarget && (
          <MeasureEditor
            imageUrl={measureTarget.url}
            onCancel={() => setMeasureTarget(null)}
            onDone={(area) => {
              setSizeSel(prev => ({ ...prev, [measureTarget.id]: area }))
              setMeasureTarget(null)
            }}
          />
        )}
      {blurTarget && (
          <BlurEditor
            graffitiId={blurTarget.id}
            imageUrl={blurTarget.url}
            onCancel={() => setBlurTarget(null)}
            onDone={() => {
              setBust(b => ({ ...b, [blurTarget.id]: Date.now() }))
              setBlurTarget(null)
            }}
          />
        )}
      </div>
    </div>
  )
}
