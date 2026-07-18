import { useNavigate } from 'react-router-dom'
import { t } from './i18n'

/* Lightweight inline renderer for our legal content.
   Content is authored here as structured blocks (headings, paragraphs,
   lists, tables) so it renders cleanly without a Markdown dependency. */

function Logo({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: 'block', borderRadius: '22%' }} aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#E85D26" />
      <path d="M20 9c-4.2 0-7.6 3.2-7.6 7.2 0 5 7.6 14.5 7.6 14.5s7.6-9.5 7.6-14.5C27.6 12.2 24.2 9 20 9Z" fill="#fff" />
      <circle cx="20" cy="16" r="3" fill="#2A2520" />
    </svg>
  )
}

export default function LegalPage({ title, updated, children }) {
  const navigate = useNavigate()
  return (
    <div className="legal">
      <header className="legal-nav">
        <button className="legal-brand" onClick={() => navigate('/')}>
          <Logo size={26} />
          <span>GraffitiAtlas</span>
        </button>
        <button className="legal-back" onClick={() => navigate('/')}>← {t('nav.explore')}</button>
      </header>

      <article className="legal-doc">
        <h1>{title}</h1>
        {updated && <p className="legal-updated">{updated}</p>}
        {children}
      </article>

      <footer className="legal-footer">
        <a href="/politique-confidentialite">{t('set.link.privacy')}</a>
        <a href="/conditions-utilisation">{t('set.link.terms')}</a>
        <a href="/mentions-legales">{t('set.link.legal')}</a>
        <a href="/politique-cookies">{t('cookies.link')}</a>
        <button onClick={() => window.dispatchEvent(new Event('ga:manage-cookies'))}>
          {t('set.link.cookies')}
        </button>
      </footer>
    </div>
  )
}
