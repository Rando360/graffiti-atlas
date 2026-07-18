import LegalPage from './LegalPage'

export default function CookiesPage() {
  return (
    <LegalPage title="Politique des cookies" updated="Dernière mise à jour : 18 juillet 2026">
        <p>Cette page explique les cookies et technologies similaires utilisés sur GraffitiAtlas.io, édité par Graffiti Atlas (auto-entrepreneur), 9 F Place Saint-Bruno, 38000 Grenoble.</p>
        <h2>1. Qu'est-ce qu'un cookie ?</h2>
        <p>Un cookie est un petit fichier déposé sur votre appareil lors de la visite d'un site. Certains sont nécessaires au fonctionnement du site ; d'autres servent à mesurer l'audience.</p>
        <h2>2. Cookies que nous utilisons</h2>
        <h3>2.1 Cookies strictement nécessaires (toujours actifs)</h3>
        <p>Indispensables au fonctionnement du service ; ils ne nécessitent pas votre consentement.</p>
        <table><thead><tr><th>Cookie / stockage</th><th>Finalité</th><th>Origine</th></tr></thead><tbody><tr><td>Session d'authentification</td><td>Vous garder connecté(e)</td><td>Supabase</td></tr><tr><td>Préférence de consentement</td><td>Mémoriser votre choix sur les cookies</td><td>GraffitiAtlas</td></tr><tr><td>Préférence de langue</td><td>Mémoriser la langue choisie</td><td>GraffitiAtlas</td></tr></tbody></table>
        <h3>2.2 Cookies de mesure d'audience (soumis à consentement)</h3>
        <p>Déposés uniquement si vous les acceptez.</p>
        <table><thead><tr><th>Service</th><th>Finalité</th></tr></thead><tbody><tr><td>Vercel Analytics</td><td>Statistiques de fréquentation agrégées (pages vues, pays), sans publicité ni profilage individuel</td></tr><tr><td>Sentry</td><td>Diagnostic des erreurs techniques</td></tr></tbody></table>
        <h3>2.3 Services tiers de cartographie</h3>
        <p>L'affichage de la carte et de Street View fait appel à <strong>Google Maps</strong>, qui peut déposer ses propres cookies et recevoir votre adresse IP lorsque la carte se charge. Ces traitements relèvent de la politique de confidentialité de Google.</p>
        <h2>3. Votre choix</h2>
        <p>Lors de votre première visite, une bannière vous permet d'<strong>accepter</strong> ou de <strong>refuser</strong> les cookies non essentiels. Vous pouvez modifier votre choix à tout moment via le lien « Gérer les cookies » en bas de page.</p>
        <p>Refuser les cookies non essentiels n'empêche pas l'utilisation du service.</p>
        <h2>4. Gestion via votre navigateur</h2>
        <p>Vous pouvez également configurer votre navigateur pour bloquer ou supprimer les cookies. Le blocage des cookies strictement nécessaires peut toutefois dégrader le fonctionnement du site.</p>
        <h2>5. Contact</h2>
        <p>Pour toute question : contact@graffitiatlas.io</p>
    </LegalPage>
  )
}
