import { useNavigate } from 'react-router-dom'
import { t, getLanguage } from './i18n'

/* Lightweight inline renderer for our legal content.
   Content is authored as structured blocks (headings, paragraphs, lists,
   tables, quotes) per language, so it renders cleanly without a Markdown
   dependency and follows the user's selected language. */

function Logo({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: 'block', borderRadius: '22%' }} aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#E85D26" />
      <path d="M20 9c-4.2 0-7.6 3.2-7.6 7.2 0 5 7.6 14.5 7.6 14.5s7.6-9.5 7.6-14.5C27.6 12.2 24.2 9 20 9Z" fill="#fff" />
      <circle cx="20" cy="16" r="3" fill="#2A2520" />
    </svg>
  )
}

/* Render a single structured block. Inline HTML (bold, links) is trusted
   because this content is authored by us, not user-supplied. */
function Block({ b, i }) {
  switch (b.t) {
    case 'h2':    return <h2 key={i} dangerouslySetInnerHTML={{ __html: b.html }} />
    case 'h3':    return <h3 key={i} dangerouslySetInnerHTML={{ __html: b.html }} />
    case 'quote': return <blockquote key={i} dangerouslySetInnerHTML={{ __html: b.html }} />
    case 'ul':
      return (
        <ul key={i}>
          {b.items.map((it, j) => <li key={j} dangerouslySetInnerHTML={{ __html: it }} />)}
        </ul>
      )
    case 'table':
      return (
        <table key={i}>
          <thead>
            <tr>{b.head.map((h, j) => <th key={j} dangerouslySetInnerHTML={{ __html: h }} />)}</tr>
          </thead>
          <tbody>
            {b.rows.map((r, j) => (
              <tr key={j}>{r.map((c, k) => <td key={k} dangerouslySetInnerHTML={{ __html: c }} />)}</tr>
            ))}
          </tbody>
        </table>
      )
    case 'p':
    default:      return <p key={i} dangerouslySetInnerHTML={{ __html: b.html }} />
  }
}

/**
 * LegalPage
 * @param {object} content - { [lang]: { title, updated (ISO date), blocks:[...] } }
 *                           Falls back to French, then English.
 */
export default function LegalPage({ content }) {
  const navigate = useNavigate()
  const lang = getLanguage()
  const doc = content[lang] || content.fr || content.en
  const updatedLabel = t('legal.updated')
  const dateStr = doc.updated
    ? new Date(doc.updated).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' })
    : null

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
        <h1>{doc.title}</h1>
        {dateStr && <p className="legal-updated">{updatedLabel} {dateStr}</p>}
        {doc.blocks.map((b, i) => <Block key={i} b={b} i={i} />)}
        {lang !== 'fr' && t('legal.prevails') && (
          <blockquote className="legal-prevails">{t('legal.prevails')}</blockquote>
        )}
      </article>

      <footer className="legal-footer">
        <a href="/politique-confidentialite">{t('set.link.privacy')}</a>
        <a href="/conditions-utilisation">{t('set.link.terms')}</a>
        <a href="/mentions-legales">{t('set.link.legal')}</a>
        <a href="/politique-cookies">{t('cookies.link')}</a>
        <a href="/credits">{t('legal.credits')}</a>
        <button onClick={() => window.dispatchEvent(new Event('ga:manage-cookies'))}>
          {t('set.link.cookies')}
        </button>
      </footer>
    </div>
  )
}
