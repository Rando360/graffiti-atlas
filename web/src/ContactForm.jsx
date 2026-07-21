/**
 * ContactForm.jsx — reusable contact form for GraffitiAtlas.
 *
 * Works in both the main app and the landing page.
 * Drop it in anywhere:
 *
 *   import ContactForm from './ContactForm'
 *   <ContactForm />
 *
 * Optional props:
 *   apiUrl  — override the API base (defaults to VITE_API_URL or localhost:8000)
 *   onClose — called after a successful send (useful inside a modal)
 *   compact — true = tighter padding, smaller headings (for modal use)
 */

import { useState } from 'react'
import './ContactForm.css'

const DEFAULT_API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const EMPTY = { name: '', email: '', subject: '', message: '' }

export default function ContactForm({ apiUrl = DEFAULT_API, onClose, compact = false }) {
  const [fields, setFields]   = useState(EMPTY)
  const [errors, setErrors]   = useState({})
  const [status, setStatus]   = useState('idle') // idle | sending | success | error
  const [serverErr, setServerErr] = useState('')

  const set = (k) => (e) => setFields(f => ({ ...f, [k]: e.target.value }))

  // ── Client-side validation ─────────────────────────────────────────────────
  const validate = () => {
    const e = {}
    if (!fields.name.trim())    e.name    = 'Your name is required.'
    if (!fields.email.trim())   e.email   = 'Your email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email))
                                e.email   = 'Please enter a valid email.'
    if (!fields.message.trim()) e.message = 'A message is required.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setStatus('sending')
    setServerErr('')

    try {
      const res = await fetch(`${apiUrl}/contact`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(fields),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || 'Something went wrong.')
      }

      setStatus('success')
      setFields(EMPTY)
    } catch (err) {
      setServerErr(err.message || 'Could not send your message. Please try again.')
      setStatus('error')
    }
  }

  const reset = () => { setStatus('idle'); setServerErr(''); setErrors({}) }

  // ── Success state ──────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div className="cf-success">
        <div className="cf-success-icon">✓</div>
        <h3>Message sent!</h3>
        <p>Thanks for reaching out — we'll get back to you soon.</p>
        <div className="cf-actions">
          <button className="cf-btn-primary" onClick={reset}>Send another</button>
          {onClose && <button className="cf-btn-secondary" onClick={onClose}>Close</button>}
        </div>
      </div>
    )
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className={`cf-wrap${compact ? ' cf-compact' : ''}`}>
      {!compact && (
        <div className="cf-header">
          <h2>Get in touch</h2>
          <p>Questions, partnership ideas, or just want to say hello?</p>
        </div>
      )}

      <form className="cf-form" onSubmit={handleSubmit} noValidate>

        <div className="cf-row">
          <div className="cf-field">
            <label htmlFor="cf-name">Name <span className="cf-req">*</span></label>
            <input
              id="cf-name"
              type="text"
              placeholder="Your name"
              value={fields.name}
              onChange={set('name')}
              className={errors.name ? 'cf-invalid' : ''}
              disabled={status === 'sending'}
              autoComplete="name"
            />
            {errors.name && <span className="cf-field-err">{errors.name}</span>}
          </div>

          <div className="cf-field">
            <label htmlFor="cf-email">Email <span className="cf-req">*</span></label>
            <input
              id="cf-email"
              type="email"
              placeholder="you@example.com"
              value={fields.email}
              onChange={set('email')}
              className={errors.email ? 'cf-invalid' : ''}
              disabled={status === 'sending'}
              autoComplete="email"
            />
            {errors.email && <span className="cf-field-err">{errors.email}</span>}
          </div>
        </div>

        <div className="cf-field">
          <label htmlFor="cf-subject">Subject <span className="cf-opt">(optional)</span></label>
          <input
            id="cf-subject"
            type="text"
            placeholder="What's it about?"
            value={fields.subject}
            onChange={set('subject')}
            disabled={status === 'sending'}
          />
        </div>

        <div className="cf-field">
          <label htmlFor="cf-message">Message <span className="cf-req">*</span></label>
          <textarea
            id="cf-message"
            rows={compact ? 4 : 6}
            placeholder="Your message…"
            value={fields.message}
            onChange={set('message')}
            className={errors.message ? 'cf-invalid' : ''}
            disabled={status === 'sending'}
          />
          {errors.message && <span className="cf-field-err">{errors.message}</span>}
          <span className="cf-char-count">{fields.message.length} / 5000</span>
        </div>

        {serverErr && (
          <div className="cf-server-err" role="alert">
            ⚠ {serverErr}
          </div>
        )}

        <div className="cf-actions">
          <button
            type="submit"
            className="cf-btn-primary"
            disabled={status === 'sending'}
          >
            {status === 'sending' ? (
              <><span className="cf-spinner" /> Sending…</>
            ) : 'Send message'}
          </button>
          {onClose && (
            <button type="button" className="cf-btn-secondary" onClick={onClose}>
              Cancel
            </button>
          )}
        </div>

      </form>
    </div>
  )
}
