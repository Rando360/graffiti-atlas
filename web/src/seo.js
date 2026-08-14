import { useEffect } from 'react'

const SITE = 'https://graffitiatlas.io'

function upsertMeta(attr, key, content) {
  if (!content) return
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Per-route <title>, meta description, canonical URL and social (OG/Twitter) tags.
 * React renders client-side, so each page sets its own tags on mount — otherwise
 * every route would share index.html's single title/description.
 */
export function useSeo({ title, description, path }) {
  useEffect(() => {
    const url = SITE + (path ?? (typeof window !== 'undefined' ? window.location.pathname : ''))
    if (title) document.title = title
    upsertMeta('name', 'description', description)
    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', url)
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', description)
    upsertCanonical(url)
  }, [title, description, path])
}
