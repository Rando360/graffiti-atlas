/**
 * GraffitiAtlas i18n
 * ──────────────────
 * Simple, dependency-free translation system.
 *
 * - t('key')            → string in the current language
 * - getLanguage()       → current code ('fr' | 'en' | 'es' | 'de' | 'it')
 * - setLanguage(code)   → persists choice + reloads so every module re-reads it
 * - LANGUAGES           → list for pickers (code + native name)
 *
 * Language resolution order:
 *   1. localStorage 'ga_lang' (set by the picker, or synced from the profile)
 *   2. navigator.language (browser)
 *   3. 'fr' (default)
 *
 * Design note: language changes trigger a full reload. This keeps t() usable
 * as a plain imported function everywhere (no React context threading), which
 * keeps the codebase simple. A reload on language switch is standard UX.
 */

export const LANGUAGES = [
  { code: 'fr', name: 'Français' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
]

const SUPPORTED = LANGUAGES.map(l => l.code)

function detect() {
  try {
    const saved = localStorage.getItem('ga_lang')
    if (saved && SUPPORTED.includes(saved)) return saved
  } catch { /* private mode */ }
  const nav = (navigator.language || 'fr').slice(0, 2).toLowerCase()
  return SUPPORTED.includes(nav) ? nav : 'fr'
}

let current = detect()

export function getLanguage() { return current }

export function setLanguage(code) {
  if (!SUPPORTED.includes(code)) return
  try { localStorage.setItem('ga_lang', code) } catch {}
  current = code
  window.location.reload()
}

/** Sync from a logged-in profile without looping reloads. */
export function syncLanguageFromProfile(code) {
  if (!SUPPORTED.includes(code) || code === current) return
  try { localStorage.setItem('ga_lang', code) } catch {}
  current = code
  window.location.reload()
}

export function t(key) {
  const entry = STRINGS[key]
  if (!entry) return key
  return entry[current] ?? entry.fr ?? key
}

/* ════════════════════════════════════════════════════════════════════
   DICTIONARY — fr · en · es · de · it
   ════════════════════════════════════════════════════════════════════ */
const STRINGS = {
  /* ── Header & nav ── */
  'header.search.placeholder': {
    fr: 'Rechercher une ville ou une adresse…',
    en: 'Search for a city or address…',
    es: 'Buscar una ciudad o dirección…',
    de: 'Stadt oder Adresse suchen…',
    it: 'Cerca una città o un indirizzo…',
  },
  'header.search.aria': {
    fr: 'Rechercher un lieu', en: 'Search for a place', es: 'Buscar un lugar',
    de: 'Ort suchen', it: 'Cerca un luogo',
  },
  'header.search.clear': {
    fr: 'Effacer la recherche', en: 'Clear search', es: 'Borrar búsqueda',
    de: 'Suche löschen', it: 'Cancella ricerca',
  },
  'header.settings': {
    fr: 'Paramètres', en: 'Settings', es: 'Ajustes', de: 'Einstellungen', it: 'Impostazioni',
  },
  'header.login': {
    fr: 'Connexion', en: 'Log in', es: 'Iniciar sesión', de: 'Anmelden', it: 'Accedi',
  },
  'header.logout': {
    fr: 'Déconnexion', en: 'Log out', es: 'Cerrar sesión', de: 'Abmelden', it: 'Esci',
  },
  'header.report': {
    fr: '+ Signaler', en: '+ Report', es: '+ Señalar', de: '+ Melden', it: '+ Segnala',
  },
  'header.moderation': {
    fr: 'Modération', en: 'Moderation', es: 'Moderación', de: 'Moderation', it: 'Moderazione',
  },

  /* ── Map sidebar / stats / filters ── */
  'stats.inView': { fr: 'En vue', en: 'In view', es: 'Visibles', de: 'Im Blick', it: 'In vista' },
  'stats.m2': {
    fr: 'm² détectés', en: 'm² detected', es: 'm² detectados', de: 'm² erkannt', it: 'm² rilevati',
  },
  'filter.type': { fr: 'TYPE', en: 'TYPE', es: 'TIPO', de: 'TYP', it: 'TIPO' },
  'filter.size': { fr: 'TAILLE', en: 'SIZE', es: 'TAMAÑO', de: 'GRÖSSE', it: 'DIMENSIONE' },
  'filter.year': { fr: 'ANNÉE', en: 'YEAR', es: 'AÑO', de: 'JAHR', it: 'ANNO' },
  'filter.size.small': { fr: 'Petit', en: 'Small', es: 'Pequeño', de: 'Klein', it: 'Piccolo' },
  'filter.size.medium': { fr: 'Moyen', en: 'Medium', es: 'Mediano', de: 'Mittel', it: 'Medio' },
  'filter.size.large': { fr: 'Grand', en: 'Large', es: 'Grande', de: 'Groß', it: 'Grande' },
  'filter.reset': {
    fr: 'Réinitialiser les filtres', en: 'Reset filters', es: 'Restablecer filtros',
    de: 'Filter zurücksetzen', it: 'Reimposta filtri',
  },

  /* ── Graffiti types ── */
  'style.tag': { fr: 'Tag', en: 'Tag', es: 'Tag', de: 'Tag', it: 'Tag' },
  'style.throwup': { fr: 'Throw-up', en: 'Throw-up', es: 'Throw-up', de: 'Throw-up', it: 'Throw-up' },
  'style.piece': { fr: 'Piece', en: 'Piece', es: 'Piece', de: 'Piece', it: 'Piece' },
  'style.mural': { fr: 'Fresque', en: 'Mural', es: 'Mural', de: 'Wandbild', it: 'Murale' },
  'style.sticker': { fr: 'Sticker', en: 'Sticker', es: 'Sticker', de: 'Sticker', it: 'Sticker' },
  'style.other': { fr: 'Autre', en: 'Other', es: 'Otro', de: 'Sonstiges', it: 'Altro' },

  /* ── Detail panel ── */
  'detail.address': { fr: 'Adresse', en: 'Address', es: 'Dirección', de: 'Adresse', it: 'Indirizzo' },
  'detail.city': { fr: 'Ville', en: 'City', es: 'Ciudad', de: 'Stadt', it: 'Città' },
  'detail.captured': { fr: 'Capturé le', en: 'Captured on', es: 'Capturado el', de: 'Aufgenommen am', it: 'Rilevato il' },
  'detail.surface': { fr: 'Surface', en: 'Surface', es: 'Superficie', de: 'Fläche', it: 'Superficie' },
  'detail.gps': { fr: 'GPS', en: 'GPS', es: 'GPS', de: 'GPS', it: 'GPS' },
  'detail.streetview': {
    fr: 'Google Street View ↗', en: 'Google Street View ↗', es: 'Google Street View ↗',
    de: 'Google Street View ↗', it: 'Google Street View ↗',
  },
  'detail.panoramax': { fr: 'Panoramax ↗', en: 'Panoramax ↗', es: 'Panoramax ↗', de: 'Panoramax ↗', it: 'Panoramax ↗' },
  'detail.share': {
    fr: 'Partager ce graffiti', en: 'Share this graffiti', es: 'Compartir este grafiti',
    de: 'Dieses Graffiti teilen', it: 'Condividi questo graffito',
  },
  'detail.linkCopied': { fr: 'Lien copié ✓', en: 'Link copied ✓', es: 'Enlace copiado ✓', de: 'Link kopiert ✓', it: 'Link copiato ✓' },
  'detail.cubeFace': { fr: 'Face du cube', en: 'Cube face', es: 'Cara del cubo', de: 'Würfelfläche', it: 'Faccia del cubo' },
  'detail.imagesLoading': { fr: 'Chargement des images', en: 'Loading images', es: 'Cargando imágenes', de: 'Bilder werden geladen', it: 'Caricamento immagini' },

  /* ── Lightbox ── */
  'lightbox.enlarged': { fr: 'Image agrandie', en: 'Enlarged image', es: 'Imagen ampliada', de: 'Vergrößertes Bild', it: 'Immagine ingrandita' },
  'lightbox.close': { fr: 'Fermer (Échap)', en: 'Close (Esc)', es: 'Cerrar (Esc)', de: 'Schließen (Esc)', it: 'Chiudi (Esc)' },
  'lightbox.prev': { fr: 'Image précédente', en: 'Previous image', es: 'Imagen anterior', de: 'Vorheriges Bild', it: 'Immagine precedente' },
  'lightbox.next': { fr: 'Image suivante', en: 'Next image', es: 'Imagen siguiente', de: 'Nächstes Bild', it: 'Immagine successiva' },
  'lightbox.graffitiAlt': { fr: 'Graffiti agrandi', en: 'Enlarged graffiti', es: 'Grafiti ampliado', de: 'Vergrößertes Graffiti', it: 'Graffito ingrandito' },
  'lightbox.hint': {
    fr: 'Double-clic ou molette pour zoomer · ← → pour naviguer',
    en: 'Double-click or scroll to zoom · ← → to navigate',
    es: 'Doble clic o rueda para hacer zoom · ← → para navegar',
    de: 'Doppelklick oder Scrollen zum Zoomen · ← → zum Navigieren',
    it: 'Doppio clic o rotella per lo zoom · ← → per navigare',
  },

  /* ── Empty / recovery states ── */
  'empty.noResults': { fr: 'Aucun résultat', en: 'No results', es: 'Sin resultados', de: 'Keine Ergebnisse', it: 'Nessun risultato' },
  'empty.noResults.hint': {
    fr: 'Aucun graffiti ne correspond à vos filtres dans cette zone.',
    en: 'No graffiti matches your filters in this area.',
    es: 'Ningún grafiti coincide con tus filtros en esta zona.',
    de: 'Kein Graffiti entspricht deinen Filtern in diesem Bereich.',
    it: 'Nessun graffito corrisponde ai tuoi filtri in questa zona.',
  },
  'empty.noZone': {
    fr: 'Zone non cartographiée', en: 'Area not yet mapped', es: 'Zona sin cartografiar',
    de: 'Gebiet noch nicht kartiert', it: 'Zona non ancora mappata',
  },
  'empty.cities': { fr: 'Villes disponibles', en: 'Available cities', es: 'Ciudades disponibles', de: 'Verfügbare Städte', it: 'Città disponibili' },
  'empty.noSelection': {
    fr: 'Aucune détection sélectionnée', en: 'No detection selected', es: 'Ninguna detección seleccionada',
    de: 'Keine Erkennung ausgewählt', it: 'Nessun rilevamento selezionato',
  },
  'empty.panel.collapse': { fr: 'Réduire le panneau', en: 'Collapse panel', es: 'Contraer panel', de: 'Panel einklappen', it: 'Riduci pannello' },
  'empty.panel.open': { fr: 'Ouvrir le panneau', en: 'Open panel', es: 'Abrir panel', de: 'Panel öffnen', it: 'Apri pannello' },

  /* ── Errors ── */
  'error.load': {
    fr: 'Impossible de charger les données. Vérifiez votre connexion et réessayez.',
    en: "Couldn't load data. Check your connection and try again.",
    es: 'No se pudieron cargar los datos. Comprueba tu conexión e inténtalo de nuevo.',
    de: 'Daten konnten nicht geladen werden. Prüfe deine Verbindung und versuche es erneut.',
    it: 'Impossibile caricare i dati. Controlla la connessione e riprova.',
  },
  'error.retry': { fr: 'Réessayer', en: 'Retry', es: 'Reintentar', de: 'Erneut versuchen', it: 'Riprova' },
  'common.close': { fr: 'Fermer', en: 'Close', es: 'Cerrar', de: 'Schließen', it: 'Chiudi' },
  'common.cancel': { fr: 'Annuler', en: 'Cancel', es: 'Cancelar', de: 'Abbrechen', it: 'Annulla' },
  'common.loading': { fr: 'Chargement…', en: 'Loading…', es: 'Cargando…', de: 'Wird geladen…', it: 'Caricamento…' },

  /* ── Auth modal ── */
  'auth.signin.sub': {
    fr: 'Connectez-vous pour contribuer', en: 'Log in to contribute', es: 'Inicia sesión para contribuir',
    de: 'Melde dich an, um beizutragen', it: 'Accedi per contribuire',
  },
  'auth.signup.sub': { fr: 'Créez votre compte', en: 'Create your account', es: 'Crea tu cuenta', de: 'Konto erstellen', it: 'Crea il tuo account' },
  'auth.google': {
    fr: 'Continuer avec Google', en: 'Continue with Google', es: 'Continuar con Google',
    de: 'Mit Google fortfahren', it: 'Continua con Google',
  },
  'auth.email': { fr: 'Adresse email', en: 'Email address', es: 'Correo electrónico', de: 'E-Mail-Adresse', it: 'Indirizzo email' },
  'auth.email.placeholder': { fr: 'vous@exemple.com', en: 'you@example.com', es: 'tu@ejemplo.com', de: 'du@beispiel.de', it: 'tu@esempio.com' },
  'auth.password': { fr: 'Mot de passe', en: 'Password', es: 'Contraseña', de: 'Passwort', it: 'Password' },
  'auth.signin.cta': { fr: 'Se connecter', en: 'Log in', es: 'Iniciar sesión', de: 'Anmelden', it: 'Accedi' },
  'auth.signup.cta': { fr: 'Créer un compte', en: 'Create account', es: 'Crear cuenta', de: 'Konto erstellen', it: 'Crea account' },
  'auth.loading': { fr: 'Chargement...', en: 'Loading...', es: 'Cargando...', de: 'Wird geladen...', it: 'Caricamento...' },
  'auth.confirm': {
    fr: 'Vérifiez votre email pour confirmer votre compte.',
    en: 'Check your email to confirm your account.',
    es: 'Revisa tu correo para confirmar tu cuenta.',
    de: 'Prüfe deine E-Mails, um dein Konto zu bestätigen.',
    it: "Controlla l'email per confermare il tuo account.",
  },
  'auth.or': { fr: 'ou', en: 'or', es: 'o', de: 'oder', it: 'o' },
  'auth.noAccount': { fr: 'Pas encore de compte ?', en: 'No account yet?', es: '¿Aún no tienes cuenta?', de: 'Noch kein Konto?', it: 'Non hai un account?' },
  'auth.hasAccount': { fr: 'Déjà un compte ?', en: 'Already have an account?', es: '¿Ya tienes cuenta?', de: 'Schon ein Konto?', it: 'Hai già un account?' },
  'auth.switchSignup': { fr: "S'inscrire", en: 'Sign up', es: 'Registrarse', de: 'Registrieren', it: 'Registrati' },

  /* ── Upload modal ── */
  'upload.title': { fr: 'Signaler un graffiti', en: 'Report a graffiti', es: 'Señalar un grafiti', de: 'Graffiti melden', it: 'Segnala un graffito' },
  'upload.step1': { fr: '1. Photo & lieu', en: '1. Photo & location', es: '1. Foto y lugar', de: '1. Foto & Ort', it: '1. Foto e luogo' },
  'upload.step2': { fr: '2. Détails', en: '2. Details', es: '2. Detalles', de: '2. Details', it: '2. Dettagli' },
  'upload.drop.main': {
    fr: 'Glissez une photo ici ou cliquez pour choisir',
    en: 'Drag a photo here or click to choose',
    es: 'Arrastra una foto aquí o haz clic para elegir',
    de: 'Foto hierher ziehen oder klicken zum Auswählen',
    it: 'Trascina una foto qui o clicca per scegliere',
  },
  'upload.drop.sub': {
    fr: 'JPEG, PNG ou WebP · 15 Mo max', en: 'JPEG, PNG or WebP · 15 MB max',
    es: 'JPEG, PNG o WebP · máx. 15 MB', de: 'JPEG, PNG oder WebP · max. 15 MB', it: 'JPEG, PNG o WebP · max 15 MB',
  },
  'upload.changePhoto': { fr: 'Changer de photo', en: 'Change photo', es: 'Cambiar foto', de: 'Foto ändern', it: 'Cambia foto' },
  'upload.gpsFound': {
    fr: '📍 Position détectée depuis la photo — ajustez si besoin',
    en: '📍 Location detected from the photo — adjust if needed',
    es: '📍 Ubicación detectada desde la foto — ajústala si es necesario',
    de: '📍 Position aus dem Foto erkannt — bei Bedarf anpassen',
    it: '📍 Posizione rilevata dalla foto — regola se necessario',
  },
  'upload.gpsMissing': {
    fr: "📍 Placez le marqueur à l'emplacement du graffiti",
    en: '📍 Place the marker at the graffiti location',
    es: '📍 Coloca el marcador en la ubicación del grafiti',
    de: '📍 Setze den Marker an den Ort des Graffitis',
    it: '📍 Posiziona il segnaposto sul luogo del graffito',
  },
  'upload.mapHint': {
    fr: 'Cliquez sur la carte ou glissez le marqueur pour ajuster.',
    en: 'Click the map or drag the marker to adjust.',
    es: 'Haz clic en el mapa o arrastra el marcador para ajustar.',
    de: 'Klicke auf die Karte oder ziehe den Marker zum Anpassen.',
    it: 'Clicca sulla mappa o trascina il segnaposto per regolare.',
  },
  'upload.continue': { fr: 'Continuer', en: 'Continue', es: 'Continuar', de: 'Weiter', it: 'Continua' },
  'upload.back': { fr: '← Retour', en: '← Back', es: '← Atrás', de: '← Zurück', it: '← Indietro' },
  'upload.type.label': { fr: 'Type de graffiti', en: 'Graffiti type', es: 'Tipo de grafiti', de: 'Graffiti-Typ', it: 'Tipo di graffito' },
  'upload.type.required': { fr: 'obligatoire', en: 'required', es: 'obligatorio', de: 'erforderlich', it: 'obbligatorio' },
  'upload.hint.tag': {
    fr: 'Signature rapide, un seul trait, souvent une couleur.',
    en: 'Quick signature, single stroke, usually one colour.',
    es: 'Firma rápida, un solo trazo, normalmente un color.',
    de: 'Schnelle Signatur, ein Strich, meist eine Farbe.',
    it: 'Firma veloce, un solo tratto, di solito un colore.',
  },
  'upload.hint.throwup': {
    fr: 'Lettres en bulles, contour + remplissage (2 couleurs).',
    en: 'Bubble letters, outline + fill (2 colours).',
    es: 'Letras de burbuja, contorno + relleno (2 colores).',
    de: 'Bubble-Buchstaben, Kontur + Füllung (2 Farben).',
    it: 'Lettere a bolla, contorno + riempimento (2 colori).',
  },
  'upload.hint.piece': {
    fr: 'Œuvre complète et travaillée, multicolore et détaillée.',
    en: 'Full, worked piece — multicoloured and detailed.',
    es: 'Obra completa y elaborada, multicolor y detallada.',
    de: 'Vollständiges, ausgearbeitetes Werk — mehrfarbig und detailliert.',
    it: "Opera completa ed elaborata, multicolore e dettagliata.",
  },
  'upload.desc.label': { fr: 'Description', en: 'Description', es: 'Descripción', de: 'Beschreibung', it: 'Descrizione' },
  'upload.desc.optional': { fr: '(optionnel)', en: '(optional)', es: '(opcional)', de: '(optional)', it: '(facoltativo)' },
  'upload.desc.placeholder': {
    fr: 'Couleurs, style, artiste, contexte…', en: 'Colours, style, artist, context…',
    es: 'Colores, estilo, artista, contexto…', de: 'Farben, Stil, Künstler, Kontext…', it: 'Colori, stile, artista, contesto…',
  },
  'upload.submit': { fr: 'Envoyer', en: 'Submit', es: 'Enviar', de: 'Senden', it: 'Invia' },
  'upload.submitting': { fr: 'Envoi…', en: 'Sending…', es: 'Enviando…', de: 'Wird gesendet…', it: 'Invio…' },
  'upload.done.title': {
    fr: 'Merci pour votre contribution !', en: 'Thanks for your contribution!',
    es: '¡Gracias por tu contribución!', de: 'Danke für deinen Beitrag!', it: 'Grazie per il tuo contributo!',
  },
  'upload.done.body': {
    fr: 'Votre graffiti a bien été envoyé. Il apparaîtra sur la carte après vérification par notre équipe.',
    en: 'Your graffiti was submitted. It will appear on the map once our team has reviewed it.',
    es: 'Tu grafiti se ha enviado. Aparecerá en el mapa cuando nuestro equipo lo revise.',
    de: 'Dein Graffiti wurde übermittelt. Es erscheint auf der Karte, sobald unser Team es geprüft hat.',
    it: 'Il tuo graffito è stato inviato. Apparirà sulla mappa dopo la verifica del nostro team.',
  },
  'upload.err.notImage': { fr: 'Veuillez choisir une image.', en: 'Please choose an image.', es: 'Elige una imagen.', de: 'Bitte wähle ein Bild.', it: "Scegli un'immagine." },
  'upload.err.tooBig': {
    fr: 'Image trop lourde (max 15 Mo).', en: 'Image too large (max 15 MB).',
    es: 'Imagen demasiado grande (máx. 15 MB).', de: 'Bild zu groß (max. 15 MB).', it: 'Immagine troppo grande (max 15 MB).',
  },
  'upload.err.login': { fr: 'Vous devez être connecté.', en: 'You must be logged in.', es: 'Debes iniciar sesión.', de: 'Du musst angemeldet sein.', it: 'Devi effettuare l’accesso.' },
  'upload.err.failed': { fr: "Échec de l'envoi.", en: 'Upload failed.', es: 'Error al enviar.', de: 'Senden fehlgeschlagen.', it: 'Invio non riuscito.' },
  'upload.err.rejected': {
    fr: 'Cette image a été refusée par la modération automatique (contenu inapproprié détecté).',
    en: 'This image was refused by automated moderation (inappropriate content detected).',
    es: 'Esta imagen fue rechazada por la moderación automática (contenido inapropiado detectado).',
    de: 'Dieses Bild wurde von der automatischen Moderation abgelehnt (unangemessener Inhalt erkannt).',
    it: 'Questa immagine è stata rifiutata dalla moderazione automatica (contenuto inappropriato rilevato).',
  },

  /* ── Moderation panel ── */
  'mod.title': { fr: 'Modération', en: 'Moderation', es: 'Moderación', de: 'Moderation', it: 'Moderazione' },
  'mod.tab.uploads': { fr: 'Contributions', en: 'Contributions', es: 'Contribuciones', de: 'Beiträge', it: 'Contributi' },
  'mod.tab.removals': { fr: 'Effacements', en: 'Removals', es: 'Borrados', de: 'Entfernungen', it: 'Rimozioni' },
  'mod.empty.uploads': {
    fr: 'Aucune contribution en attente 🎉', en: 'No pending contributions 🎉',
    es: 'Sin contribuciones pendientes 🎉', de: 'Keine ausstehenden Beiträge 🎉', it: 'Nessun contributo in attesa 🎉',
  },
  'mod.empty.removals': {
    fr: "Aucun signalement d'effacement 🎉", en: 'No removal reports 🎉',
    es: 'Sin informes de borrado 🎉', de: 'Keine Entfernungs-Meldungen 🎉', it: 'Nessuna segnalazione di rimozione 🎉',
  },
  'mod.unknownCity': { fr: 'Ville inconnue', en: 'Unknown city', es: 'Ciudad desconocida', de: 'Unbekannte Stadt', it: 'Città sconosciuta' },
  'mod.noImage': { fr: "Pas d'image", en: 'No image', es: 'Sin imagen', de: 'Kein Bild', it: 'Nessuna immagine' },
  'mod.noPhoto': { fr: 'Sans photo', en: 'No photo', es: 'Sin foto', de: 'Ohne Foto', it: 'Senza foto' },
  'mod.type': { fr: 'Type :', en: 'Type:', es: 'Tipo:', de: 'Typ:', it: 'Tipo:' },
  'mod.approve': { fr: '✓ Approuver', en: '✓ Approve', es: '✓ Aprobar', de: '✓ Genehmigen', it: '✓ Approva' },
  'mod.reject': { fr: '✕ Rejeter', en: '✕ Reject', es: '✕ Rechazar', de: '✕ Ablehnen', it: '✕ Rifiuta' },
  'mod.blur': { fr: 'Flouter', en: 'Blur', es: 'Difuminar', de: 'Unkenntlich machen', it: 'Sfoca' },
  'mod.removal.badge': { fr: 'Effacement signalé', en: 'Removal reported', es: 'Borrado señalado', de: 'Entfernung gemeldet', it: 'Rimozione segnalata' },
  'mod.removal.approve': { fr: "✓ Confirmer l'effacement", en: '✓ Confirm removal', es: '✓ Confirmar borrado', de: '✓ Entfernung bestätigen', it: '✓ Conferma rimozione' },
  'mod.err.forbidden': {
    fr: 'Accès réservé aux modérateurs.', en: 'Moderator access only.',
    es: 'Acceso solo para moderadores.', de: 'Nur für Moderatoren.', it: 'Accesso riservato ai moderatori.',
  },
  'mod.err.failed': { fr: 'Action échouée.', en: 'Action failed.', es: 'La acción falló.', de: 'Aktion fehlgeschlagen.', it: 'Azione non riuscita.' },

  /* ── Blur editor ── */
  'blur.title': {
    fr: 'Flouter les zones sensibles', en: 'Blur sensitive areas', es: 'Difuminar zonas sensibles',
    de: 'Sensible Bereiche unkenntlich machen', it: 'Sfoca le aree sensibili',
  },
  'blur.instructions': {
    fr: "Dessinez un rectangle sur chaque visage ou plaque d'immatriculation.",
    en: 'Draw a rectangle over each face or licence plate.',
    es: 'Dibuja un rectángulo sobre cada cara o matrícula.',
    de: 'Ziehe ein Rechteck über jedes Gesicht oder Kennzeichen.',
    it: 'Disegna un rettangolo su ogni volto o targa.',
  },
  'blur.zone': { fr: 'zone', en: 'area', es: 'zona', de: 'Bereich', it: 'area' },
  'blur.zones': { fr: 'zones', en: 'areas', es: 'zonas', de: 'Bereiche', it: 'aree' },
  'blur.apply': { fr: 'Appliquer le floutage', en: 'Apply blur', es: 'Aplicar difuminado', de: 'Anwenden', it: 'Applica sfocatura' },
  'blur.applying': { fr: 'Application…', en: 'Applying…', es: 'Aplicando…', de: 'Wird angewendet…', it: 'Applicazione…' },
  'blur.failed': { fr: 'Le floutage a échoué.', en: 'Blur failed.', es: 'El difuminado falló.', de: 'Unkenntlichmachen fehlgeschlagen.', it: 'Sfocatura non riuscita.' },
  'blur.imageAlt': { fr: 'À modérer', en: 'To moderate', es: 'Para moderar', de: 'Zu moderieren', it: 'Da moderare' },

  /* ── Settings panel ── */
  'set.title': { fr: 'Paramètres', en: 'Settings', es: 'Ajustes', de: 'Einstellungen', it: 'Impostazioni' },
  'set.account': { fr: 'Compte', en: 'Account', es: 'Cuenta', de: 'Konto', it: 'Account' },
  'set.name.label': { fr: 'Nom affiché', en: 'Display name', es: 'Nombre visible', de: 'Anzeigename', it: 'Nome visualizzato' },
  'set.name.placeholder': { fr: 'Votre nom', en: 'Your name', es: 'Tu nombre', de: 'Dein Name', it: 'Il tuo nome' },
  'set.name.save': { fr: 'Enregistrer', en: 'Save', es: 'Guardar', de: 'Speichern', it: 'Salva' },
  'set.name.hint': {
    fr: 'Ce nom apparaît sur vos contributions.', en: 'This name appears on your contributions.',
    es: 'Este nombre aparece en tus contribuciones.', de: 'Dieser Name erscheint bei deinen Beiträgen.', it: 'Questo nome appare sui tuoi contributi.',
  },
  'set.prefs': { fr: 'Préférences', en: 'Preferences', es: 'Preferencias', de: 'Einstellungen', it: 'Preferenze' },
  'set.language': { fr: 'Langue', en: 'Language', es: 'Idioma', de: 'Sprache', it: 'Lingua' },
  'set.contrib': { fr: 'Mes contributions', en: 'My contributions', es: 'Mis contribuciones', de: 'Meine Beiträge', it: 'I miei contributi' },
  'set.contrib.total': { fr: 'Total', en: 'Total', es: 'Total', de: 'Gesamt', it: 'Totale' },
  'set.contrib.published': { fr: 'Publiés', en: 'Published', es: 'Publicados', de: 'Veröffentlicht', it: 'Pubblicati' },
  'set.contrib.pending': { fr: 'En attente', en: 'Pending', es: 'Pendientes', de: 'Ausstehend', it: 'In attesa' },
  'set.contrib.empty': {
    fr: "Vous n'avez pas encore contribué. Utilisez « + Signaler » pour ajouter un graffiti.",
    en: "You haven't contributed yet. Use \"+ Report\" to add a graffiti.",
    es: 'Aún no has contribuido. Usa «+ Señalar» para añadir un grafiti.',
    de: 'Du hast noch nichts beigetragen. Nutze „+ Melden", um ein Graffiti hinzuzufügen.',
    it: 'Non hai ancora contribuito. Usa «+ Segnala» per aggiungere un graffito.',
  },
  'set.status.approved': { fr: 'Publié', en: 'Published', es: 'Publicado', de: 'Veröffentlicht', it: 'Pubblicato' },
  'set.status.pending': { fr: 'En attente', en: 'Pending', es: 'Pendiente', de: 'Ausstehend', it: 'In attesa' },
  'set.status.rejected': { fr: 'Refusé', en: 'Rejected', es: 'Rechazado', de: 'Abgelehnt', it: 'Rifiutato' },
  'set.unknownPlace': { fr: 'Lieu inconnu', en: 'Unknown place', es: 'Lugar desconocido', de: 'Unbekannter Ort', it: 'Luogo sconosciuto' },
  'set.privacy': { fr: 'Confidentialité & données', en: 'Privacy & data', es: 'Privacidad y datos', de: 'Datenschutz & Daten', it: 'Privacy e dati' },
  'set.link.privacy': { fr: 'Politique de confidentialité', en: 'Privacy policy', es: 'Política de privacidad', de: 'Datenschutzerklärung', it: 'Informativa sulla privacy' },
  'set.link.terms': { fr: "Conditions d'utilisation", en: 'Terms of use', es: 'Condiciones de uso', de: 'Nutzungsbedingungen', it: "Condizioni d'uso" },
  'set.link.legal': { fr: 'Mentions légales', en: 'Legal notice', es: 'Aviso legal', de: 'Impressum', it: 'Note legali' },
  'set.link.cookies': { fr: 'Gérer les cookies', en: 'Manage cookies', es: 'Gestionar cookies', de: 'Cookies verwalten', it: 'Gestisci i cookie' },
  'set.delete': { fr: 'Supprimer mon compte', en: 'Delete my account', es: 'Eliminar mi cuenta', de: 'Mein Konto löschen', it: 'Elimina il mio account' },
  'set.delete.warn1': {
    fr: 'Cette action est', en: 'This action is', es: 'Esta acción es', de: 'Diese Aktion ist', it: 'Questa azione è',
  },
  'set.delete.irreversible': { fr: 'irréversible', en: 'irreversible', es: 'irreversible', de: 'unwiderruflich', it: 'irreversibile' },
  'set.delete.warn2': {
    fr: '. Vos contributions publiées seront anonymisées, le reste sera supprimé. Tapez',
    en: '. Your published contributions will be anonymised; everything else will be deleted. Type',
    es: '. Tus contribuciones publicadas se anonimizarán; el resto se eliminará. Escribe',
    de: '. Deine veröffentlichten Beiträge werden anonymisiert, alles andere wird gelöscht. Tippe',
    it: '. I tuoi contributi pubblicati saranno anonimizzati; il resto sarà eliminato. Digita',
  },
  'set.delete.confirmWord': { fr: 'SUPPRIMER', en: 'DELETE', es: 'ELIMINAR', de: 'LÖSCHEN', it: 'ELIMINA' },
  'set.delete.toConfirm': { fr: 'pour confirmer.', en: 'to confirm.', es: 'para confirmar.', de: 'zum Bestätigen.', it: 'per confermare.' },
  'set.delete.confirm': { fr: 'Confirmer la suppression', en: 'Confirm deletion', es: 'Confirmar eliminación', de: 'Löschen bestätigen', it: 'Conferma eliminazione' },
  'set.delete.deleting': { fr: 'Suppression…', en: 'Deleting…', es: 'Eliminando…', de: 'Wird gelöscht…', it: 'Eliminazione…' },
  'set.delete.failed': { fr: 'La suppression a échoué.', en: 'Deletion failed.', es: 'La eliminación falló.', de: 'Löschen fehlgeschlagen.', it: 'Eliminazione non riuscita.' },
  'set.logout': { fr: 'Déconnexion', en: 'Log out', es: 'Cerrar sesión', de: 'Abmelden', it: 'Esci' },
  'set.loginPrompt': {
    fr: 'Connectez-vous pour gérer votre compte et vos contributions.',
    en: 'Log in to manage your account and contributions.',
    es: 'Inicia sesión para gestionar tu cuenta y tus contribuciones.',
    de: 'Melde dich an, um dein Konto und deine Beiträge zu verwalten.',
    it: 'Accedi per gestire il tuo account e i tuoi contributi.',
  },
  'set.profileError': {
    fr: 'Impossible de charger votre profil.', en: "Couldn't load your profile.",
    es: 'No se pudo cargar tu perfil.', de: 'Profil konnte nicht geladen werden.', it: 'Impossibile caricare il profilo.',
  },

  /* ── Cookie banner ── */
  'cookies.title': { fr: 'Cookies', en: 'Cookies', es: 'Cookies', de: 'Cookies', it: 'Cookie' },
  'cookies.body': {
    fr: "Nous utilisons des cookies strictement nécessaires au fonctionnement du site, et, avec votre accord, des cookies de mesure d'audience. En savoir plus dans notre",
    en: 'We use cookies that are strictly necessary for the site to work and, with your consent, audience-measurement cookies. Learn more in our',
    es: 'Usamos cookies estrictamente necesarias para el funcionamiento del sitio y, con tu consentimiento, cookies de medición de audiencia. Más información en nuestra',
    de: 'Wir verwenden für den Betrieb der Website unbedingt erforderliche Cookies und, mit deiner Zustimmung, Cookies zur Reichweitenmessung. Mehr in unserer',
    it: 'Utilizziamo cookie strettamente necessari al funzionamento del sito e, con il tuo consenso, cookie di misurazione del pubblico. Maggiori informazioni nella nostra',
  },
  'cookies.link': { fr: 'politique des cookies', en: 'cookie policy', es: 'política de cookies', de: 'Cookie-Richtlinie', it: 'politica sui cookie' },
  'cookies.refuse': { fr: 'Refuser', en: 'Decline', es: 'Rechazar', de: 'Ablehnen', it: 'Rifiuta' },
  'cookies.accept': { fr: 'Accepter', en: 'Accept', es: 'Aceptar', de: 'Akzeptieren', it: 'Accetta' },

  /* ── Landing page ── */
  'nav.explore': { fr: 'Explorer', en: 'Explore', es: 'Explorar', de: 'Erkunden', it: 'Esplora' },
  'landing.eyebrow': {
    fr: 'Inventaire du graffiti urbain', en: 'An inventory of urban graffiti',
    es: 'Un inventario del grafiti urbano', de: 'Ein Inventar urbaner Graffiti', it: 'Un inventario dei graffiti urbani',
  },
  'landing.h1': {
    fr: 'Documenter le graffiti, ville par ville.',
    en: 'Documenting graffiti, city by city.',
    es: 'Documentar el grafiti, ciudad a ciudad.',
    de: 'Graffiti dokumentieren, Stadt für Stadt.',
    it: 'Documentare i graffiti, città per città.',
  },
  'landing.sub': {
    fr: 'Un relevé cartographique du graffiti urbain — ce qui apparaît, ce qui est recouvert, ce qui reste.',
    en: 'A cartographic record of urban graffiti — what appears, what gets covered, what remains.',
    es: 'Un registro cartográfico del grafiti urbano — lo que aparece, lo que se cubre, lo que permanece.',
    de: 'Eine kartografische Erfassung urbaner Graffiti — was erscheint, was übermalt wird, was bleibt.',
    it: 'Un rilevamento cartografico dei graffiti urbani — ciò che appare, ciò che viene coperto, ciò che resta.',
  },
  'landing.cta': {
    fr: 'Explorer la carte', en: 'Explore the map', es: 'Explorar el mapa',
    de: 'Karte erkunden', it: 'Esplora la mappa',
  },
  'landing.stat.works': {
    fr: 'graffitis recensés', en: 'graffiti recorded', es: 'grafitis registrados',
    de: 'erfasste Graffiti', it: 'graffiti registrati',
  },
  'landing.stat.cities': { fr: 'villes', en: 'cities', es: 'ciudades', de: 'Städte', it: 'città' },
  'landing.stat.live': {
    fr: 'mis à jour en continu', en: 'continuously updated', es: 'actualizado continuamente',
    de: 'laufend aktualisiert', it: 'aggiornato in continuo',
  },
  'landing.how.title': {
    fr: 'Comment ça marche', en: 'How it works', es: 'Cómo funciona',
    de: "So funktioniert's", it: 'Come funziona',
  },
  'landing.how.1.t': { fr: 'Découvrir', en: 'Discover', es: 'Descubrir', de: 'Entdecken', it: 'Scoprire' },
  'landing.how.1.d': {
    fr: 'Parcourez la carte du graffiti recensé, des tags aux grandes fresques.',
    en: 'Browse the map of recorded graffiti, from tags to large murals.',
    es: 'Recorre el mapa del grafiti registrado, desde tags hasta grandes murales.',
    de: 'Durchsuche die Karte erfasster Graffiti, von Tags bis zu großen Wandbildern.',
    it: 'Sfoglia la mappa dei graffiti registrati, dai tag alle grandi opere murali.',
  },
  'landing.how.2.t': { fr: 'Contribuer', en: 'Contribute', es: 'Contribuir', de: 'Beitragen', it: 'Contribuire' },
  'landing.how.2.d': {
    fr: 'Ajoutez vos trouvailles en quelques secondes. Chaque photo enrichit l\'atlas.',
    en: 'Add your finds in seconds. Every photo enriches the atlas.',
    es: 'Añade tus hallazgos en segundos. Cada foto enriquece el atlas.',
    de: 'Füge deine Funde in Sekunden hinzu. Jedes Foto bereichert den Atlas.',
    it: "Aggiungi le tue scoperte in pochi secondi. Ogni foto arricchisce l'atlante.",
  },
  'landing.how.3.t': { fr: 'Suivre', en: 'Follow', es: 'Seguir', de: 'Verfolgen', it: 'Seguire' },
  'landing.how.3.d': {
    fr: 'Gardez la trace de chaque graffiti — même une fois recouvert. L\'historique reste.',
    en: "Keep a record of every graffiti — even once it's covered. The history stays.",
    es: 'Conserva el registro de cada grafiti — incluso cuando se cubre. El historial permanece.',
    de: 'Behalte jedes Graffiti im Blick — auch wenn es übermalt wird. Die Historie bleibt.',
    it: 'Tieni traccia di ogni graffito — anche dopo che è stato coperto. La storia resta.',
  },
  'landing.muni.eyebrow': { fr: 'Collectivités', en: 'For cities', es: 'Para municipios', de: 'Für Kommunen', it: 'Per i comuni' },
  'landing.muni.title': {
    fr: 'Un outil de suivi pour les villes', en: 'A monitoring tool for municipalities',
    es: 'Una herramienta de seguimiento para las ciudades',
    de: 'Ein Monitoring-Werkzeug für Städte', it: 'Uno strumento di monitoraggio per le città',
  },
  'landing.muni.desc': {
    fr: 'Cartographie automatisée, données de terrain et suivi de la propreté urbaine. Discutons de votre territoire.',
    en: "Automated mapping, field data and urban-cleanliness tracking. Let's talk about your area.",
    es: 'Cartografía automatizada, datos de campo y seguimiento de la limpieza urbana. Hablemos de tu territorio.',
    de: 'Automatisierte Kartierung, Felddaten und Sauberkeits-Monitoring. Sprechen wir über Ihre Region.',
    it: 'Mappatura automatizzata, dati sul campo e monitoraggio della pulizia urbana. Parliamo del tuo territorio.',
  },
  'landing.muni.cta': {
    fr: 'Nous contacter', en: 'Get in touch', es: 'Contáctanos', de: 'Kontakt aufnehmen', it: 'Contattaci',
  },
  'landing.footer.tagline': {
    fr: 'Un inventaire du graffiti urbain, ville par ville.',
    en: 'An inventory of urban graffiti, city by city.',
    es: 'Un inventario del grafiti urbano, ciudad a ciudad.',
    de: 'Ein Inventar urbaner Graffiti, Stadt für Stadt.',
    it: 'Un inventario dei graffiti urbani, città per città.',
  },

  /* ── Location model / history ── */
  'mod.nearby.title': {
    fr: 'À proximité (10 m)', en: 'Nearby (10 m)', es: 'Cerca (10 m)',
    de: 'In der Nähe (10 m)', it: 'Nelle vicinanze (10 m)',
  },
  'mod.nearby.none': {
    fr: 'Aucun graffiti connu à moins de 10 m.', en: 'No known graffiti within 10 m.',
    es: 'Ningún grafiti conocido a menos de 10 m.', de: 'Kein bekanntes Graffiti innerhalb von 10 m.',
    it: 'Nessun graffito noto entro 10 m.',
  },
  'mod.nearby.select': {
    fr: 'Sélectionnez un graffiti proche pour activer ces actions :',
    en: 'Select a nearby graffiti to enable these actions:',
    es: 'Selecciona un grafiti cercano para activar estas acciones:',
    de: 'Wähle ein nahes Graffiti, um diese Aktionen zu aktivieren:',
    it: 'Seleziona un graffito vicino per attivare queste azioni:',
  },
  'mod.samePhoto': {
    fr: '📎 Même graffiti (ajouter la photo)', en: '📎 Same graffiti (add photo)',
    es: '📎 Mismo grafiti (añadir foto)', de: '📎 Gleiches Graffiti (Foto hinzufügen)',
    it: '📎 Stesso graffito (aggiungi foto)',
  },
  'mod.newAtLocation': {
    fr: '🕘 Nouveau graffiti ici (même emplacement)', en: '🕘 New graffiti here (same spot)',
    es: '🕘 Nuevo grafiti aquí (mismo lugar)', de: '🕘 Neues Graffiti hier (gleicher Ort)',
    it: '🕘 Nuovo graffito qui (stesso punto)',
  },
  'mod.cleanedBadge': { fr: 'Effacé', en: 'Cleaned', es: 'Borrado', de: 'Entfernt', it: 'Rimosso' },
  'mod.distAway': { fr: 'm', en: 'm', es: 'm', de: 'm', it: 'm' },
  'filter.state': { fr: 'ÉTAT', en: 'STATE', es: 'ESTADO', de: 'STATUS', it: 'STATO' },
  'filter.state.active': { fr: 'Actifs', en: 'Active', es: 'Activos', de: 'Aktiv', it: 'Attivi' },
  'filter.state.cleaned': { fr: 'Effacés', en: 'Cleaned', es: 'Borrados', de: 'Entfernt', it: 'Rimossi' },
  'filter.state.all': { fr: 'Tous', en: 'All', es: 'Todos', de: 'Alle', it: 'Tutti' },
  'detail.history': { fr: 'Historique du lieu', en: 'Location history', es: 'Historial del lugar', de: 'Ortsverlauf', it: 'Storia del luogo' },
  'detail.current': { fr: 'Actuel', en: 'Current', es: 'Actual', de: 'Aktuell', it: 'Attuale' },

  /* ── Descriptions (data) ── */
  'desc.frenchOnly': {
    fr: '', // not shown in French
    en: 'Description available in French only for now.',
    es: 'Descripción disponible solo en francés por ahora.',
    de: 'Beschreibung derzeit nur auf Französisch verfügbar.',
    it: 'Descrizione al momento disponibile solo in francese.',
  },
}