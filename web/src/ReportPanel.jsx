import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { t } from './i18n'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

/**
 * Admin data report for the current map area.
 * Props:
 *   bounds  — { north, south, east, west } (the current map view)
 *   onClose — close handler
 */
export default function ReportPanel({ bounds, onClose }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const load = useCallback(async () => {
    if (!bounds) { setError(t('report.noArea')); setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const q = new URLSearchParams({
        north: bounds.north, south: bounds.south,
        east: bounds.east, west: bounds.west,
      })
      const res = await fetch(`${API_URL}/reports/area?${q}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (res.status === 403) throw new Error(t('mod.err.forbidden'))
      if (!res.ok) throw new Error(t('report.err'))
      setData(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [bounds])

  useEffect(() => { load() }, [load])

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  const downloadCSV = () => {
    if (!data?.items?.length) return
    const cols = ['city', 'address', 'style', 'size_m2', 'surface_type', 'lat', 'lng', 'date_observed', 'removed_at', 'source', 'description_fr']
    const esc = (v) => {
      if (v === null || v === undefined) return ''
      const s = String(v).replace(/"/g, '""')
      return /[",\n]/.test(s) ? `"${s}"` : s
    }
    const rows = [cols.join(',')]
    for (const it of data.items) rows.push(cols.map(c => esc(it[c])).join(','))
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `graffiti-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const s = data?.summary

  return (
    <div className="rp-overlay" onClick={onClose}>
      <div className="rp-panel" onClick={e => e.stopPropagation()}>
        <div className="rp-head">
          <h2>{t('report.title')}</h2>
          <button className="rp-close" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        <div className="rp-body">
          {loading ? (
            <div className="rp-empty">{t('common.loading')}</div>
          ) : error ? (
            <div className="rp-error">{error}</div>
          ) : !s || s.total === 0 ? (
            <div className="rp-empty">{t('report.empty')}</div>
          ) : (
            <>
              {/* ── Summary cards ── */}
              <div className="rp-cards">
                <div className="rp-card">
                  <span className="rp-card-num">{s.total}</span>
                  <span className="rp-card-lbl">{t('report.total')}</span>
                </div>
                <div className="rp-card">
                  <span className="rp-card-num">{s.total_m2}</span>
                  <span className="rp-card-lbl">m² {t('report.detected')}</span>
                </div>
                <div className="rp-card">
                  <span className="rp-card-num">{s.active}</span>
                  <span className="rp-card-lbl">{t('report.active')}</span>
                </div>
                <div className="rp-card">
                  <span className="rp-card-num">{s.cleaned}</span>
                  <span className="rp-card-lbl">{t('report.cleaned')}</span>
                </div>
              </div>

              {/* ── Breakdowns ── */}
              <div className="rp-breakdowns">
                <div className="rp-break">
                  <h3>{t('report.byType')}</h3>
                  {Object.entries(s.by_style).map(([k, v]) => (
                    <div className="rp-break-row" key={k}>
                      <span>{k}</span>
                      <span className="rp-break-bar-wrap">
                        <span className="rp-break-bar" style={{ width: `${(v / s.total) * 100}%` }} />
                      </span>
                      <span className="rp-break-n">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="rp-break">
                  <h3>{t('report.bySurface')}</h3>
                  {Object.entries(s.by_surface).map(([k, v]) => (
                    <div className="rp-break-row" key={k}>
                      <span>{k}</span>
                      <span className="rp-break-bar-wrap">
                        <span className="rp-break-bar" style={{ width: `${(v / s.total) * 100}%` }} />
                      </span>
                      <span className="rp-break-n">{v}</span>
                    </div>
                  ))}
                </div>
                {Object.keys(s.by_city).length > 1 && (
                  <div className="rp-break">
                    <h3>{t('report.byCity')}</h3>
                    {Object.entries(s.by_city).map(([k, v]) => (
                      <div className="rp-break-row" key={k}>
                        <span>{k}</span>
                        <span className="rp-break-bar-wrap">
                          <span className="rp-break-bar" style={{ width: `${(v / s.total) * 100}%` }} />
                        </span>
                        <span className="rp-break-n">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Actions ── */}
              <div className="rp-actions">
                <button className="rp-csv" onClick={downloadCSV}>{t('report.csv')}</button>
                <span className="rp-hint">{t('report.viewNote')}</span>
              </div>

              {/* ── Detailed list ── */}
              <div className="rp-table-wrap">
                <table className="rp-table">
                  <thead>
                    <tr>
                      <th>{t('report.col.city')}</th>
                      <th>{t('report.col.address')}</th>
                      <th>{t('report.col.type')}</th>
                      <th>m²</th>
                      <th>{t('report.col.surface')}</th>
                      <th>{t('report.col.date')}</th>
                      <th>{t('report.col.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map(it => (
                      <tr key={it.id}>
                        <td>{it.city}</td>
                        <td>{it.address}</td>
                        <td>{it.style}</td>
                        <td>{it.size_m2 ?? '—'}</td>
                        <td>{it.surface_type}</td>
                        <td>{fmtDate(it.date_observed)}</td>
                        <td>{it.removed_at
                          ? <span className="rp-badge cleaned">{t('report.cleaned')}</span>
                          : <span className="rp-badge active">{t('report.active')}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
