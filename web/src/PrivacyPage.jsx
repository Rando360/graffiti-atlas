import LegalPage from './LegalPage'

export default function PrivacyPage() {
  return (
    <LegalPage title="Politique de confidentialité" updated="Dernière mise à jour : 18 juillet 2026">
        <p>La présente politique explique quelles données personnelles GraffitiAtlas.io (« nous ») collecte, pourquoi, comment nous les utilisons et quels sont vos droits, conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés.</p>
        <h2>1. Responsable du traitement</h2>
        <p>Le responsable du traitement est l'éditeur du site, identifié dans les Mentions légales : Graffiti Atlas, entreprise individuelle (auto-entrepreneur), 9 F Place Saint-Bruno, 38000 Grenoble.</p>
        <p><strong>Contact pour les questions de données personnelles :</strong> contact@graffitiatlas.io</p>
        <h2>2. Quelles données nous collectons</h2>
        <h3>2.1 Données de compte</h3>
        <p>Lorsque vous créez un compte (par e-mail ou via Google) :</p>
        <ul><li>adresse e-mail ;</li><li>nom d'affichage et, le cas échéant, photo de profil (fournis par vous ou par Google lors de la connexion) ;</li><li>identifiant technique de compte.</li></ul>
        <p>L'authentification est gérée par <strong>Supabase</strong> (hébergé en Europe, région Paris).</p>
        <h3>2.2 Photos que vous déposez</h3>
        <p>Lorsque vous signalez un graffiti, vous téléversez une ou plusieurs photographies. À ce sujet, il est important de comprendre notre traitement :</p>
        <ul><li><strong>Localisation :</strong> au moment du dépôt, votre navigateur peut lire les coordonnées GPS éventuellement enregistrées dans la photo, uniquement pour <strong>pré-positionner un repère sur la carte</strong>. Vous confirmez ou ajustez ensuite ce repère. Seules les coordonnées que vous validez sont enregistrées.</li><li><strong>Suppression des métadonnées :</strong> avant stockage, nous <strong>retirons les métadonnées techniques (EXIF)</strong> de l'image (y compris toute position GPS, modèle d'appareil, date technique). L'image conservée ne contient donc pas ces métadonnées.</li><li><strong>Floutage automatique :</strong> les photos déposées par la communauté sont analysées automatiquement afin de <strong>flouter les visages</strong> avant stockage, et de refuser les contenus manifestement inappropriés. Cette analyse est réalisée par AWS Rekognition (région Europe – Irlande) de manière transitoire ; les images ne sont pas conservées par ce service.</li><li><strong>Contenu de l'image :</strong> une photographie de l'espace public peut contenir des personnes, des plaques d'immatriculation, des façades ou d'autres éléments identifiables. Voir la section 8.</li></ul>
        <h3>2.3 Contributions et signalements</h3>
        <ul><li>le type de graffiti et la description que vous saisissez ;</li><li>les signalements (par exemple « graffiti effacé »), avec photo optionnelle ;</li><li>la date et l'emplacement associés.</li></ul>
        <h3>2.4 Données techniques et de mesure d'audience</h3>
        <ul><li><strong>Vercel Analytics</strong> : mesure d'audience agrégée (pages vues, pays), sans profilage publicitaire.</li><li><strong>Sentry</strong> : détection des erreurs techniques pour améliorer la fiabilité du service.</li><li>Données de connexion inhérentes à tout service web (adresse IP, type de navigateur), traitées par nos hébergeurs.</li></ul>
        <h3>2.5 Cartographie</h3>
        <p>L'affichage de la carte et de Street View fait appel à <strong>Google Maps</strong>. Le géocodage (recherche d'adresse) utilise <strong>Nominatim / OpenStreetMap</strong>. Ces services peuvent recevoir votre adresse IP et les requêtes que vous effectuez. Voir la Politique des cookies.</p>
        <h2>3. Pourquoi nous utilisons ces données (bases légales)</h2>
        <table><thead><tr><th>Finalité</th><th>Base légale (RGPD)</th></tr></thead><tbody><tr><td>Créer et gérer votre compte, fournir le service</td><td>Exécution du contrat</td></tr><tr><td>Publier vos contributions sur la carte (après modération)</td><td>Votre consentement + intérêt légitime</td></tr><tr><td>Modérer les contenus, prévenir les abus</td><td>Intérêt légitime</td></tr><tr><td>Mesurer l'audience (cookies non essentiels)</td><td>Votre consentement</td></tr><tr><td>Détecter et corriger les erreurs techniques</td><td>Intérêt légitime</td></tr><tr><td>Respecter nos obligations légales</td><td>Obligation légale</td></tr></tbody></table>
        <h2>4. Durée de conservation</h2>
        <ul><li><strong>Compte :</strong> conservé tant que le compte est actif ; supprimé sur demande.</li><li><strong>Contributions publiées :</strong> les données relatives aux graffitis (localisation, images, historique) ont une valeur documentaire et peuvent être conservées durablement. Un graffiti retiré de l'espace public n'est pas supprimé mais marqué comme « effacé » (voir CGU).</li><li><strong>Contributions non publiées (en attente ou refusées) :</strong> supprimées, y compris les fichiers image correspondants dans notre stockage.</li><li><strong>Données de mesure d'audience :</strong> conservées pour une durée limitée conformément aux réglages de nos prestataires.</li></ul>
        <h3>4.1 Que se passe-t-il si vous supprimez votre compte</h3>
        <p>Lorsque vous supprimez votre compte :</p>
        <ul><li><strong>Vos contributions non publiées</strong> (en attente ou refusées) sont <strong>entièrement supprimées</strong>, images comprises, de notre base et de notre stockage.</li><li><strong>Vos contributions déjà publiées</strong> restent visibles sur la carte pour leur valeur documentaire, mais sont <strong>anonymisées</strong> : votre nom et le lien vers votre compte sont retirés, de sorte qu'elles ne vous sont plus rattachées.</li><li><strong>Votre profil et votre compte</strong> (nom, e-mail, préférences) sont supprimés.</li></ul>
        <p>Si vous souhaitez la suppression complète d'une contribution déjà publiée (image comprise), vous pouvez en faire la demande à contact@graffitiatlas.io ; nous examinons ces demandes au cas par cas au titre de votre droit à l'effacement.</p>
        <h2>5. Qui a accès à vos données (sous-traitants)</h2>
        <p>Nous faisons appel à des prestataires qui agissent pour notre compte :</p>
        <ul><li><strong>Supabase</strong> — base de données et authentification (UE, Paris) ;</li><li><strong>Amazon Web Services (S3/CloudFront)</strong> — stockage et diffusion des images (UE, Paris) ;</li><li><strong>AWS Rekognition</strong> — floutage automatique des visages et modération des contenus (UE, Irlande ; analyse transitoire, sans conservation des images) ;</li><li><strong>Vercel</strong> — hébergement de l'interface et mesure d'audience ;</li><li><strong>Railway</strong> — hébergement du serveur applicatif ;</li><li><strong>Sentry</strong> — suivi des erreurs ;</li><li><strong>Google (Maps / Street View / connexion Google)</strong> — cartographie et authentification ;</li><li><strong>OpenStreetMap Foundation (Nominatim)</strong> — géocodage.</li></ul>
        <p>Certains de ces prestataires peuvent traiter des données hors de l'Union européenne ; dans ce cas, des garanties appropriées (clauses contractuelles types) s'appliquent.</p>
        <p>Nous ne vendons pas vos données personnelles.</p>
        <h2>6. Vos droits</h2>
        <p>Conformément au RGPD, vous disposez des droits d'<strong>accès</strong>, de <strong>rectification</strong>, d'<strong>effacement</strong>, de <strong>limitation</strong>, d'<strong>opposition</strong> et de <strong>portabilité</strong>. Vous pouvez exercer ces droits à tout moment en écrivant à contact@graffitiatlas.io.</p>
        <p>Vous pouvez également introduire une réclamation auprès de la <strong>CNIL</strong> (www.cnil.fr).</p>
        <h2>7. Sécurité</h2>
        <p>Nous mettons en œuvre des mesures techniques raisonnables (chiffrement des échanges, suppression des métadonnées EXIF, floutage automatique des visages, accès restreint aux données) pour protéger vos informations. Aucun système n'étant infaillible, nous ne pouvons garantir une sécurité absolue.</p>
        <h2>8. Images et vie privée</h2>
        <p>GraffitiAtlas publie des photographies de l'espace public. Ces images peuvent involontairement contenir des personnes ou des éléments identifiables.</p>
        <ul><li>Vous ne devez déposer que des images dont vous détenez les droits et qui ne portent pas atteinte à la vie privée d'autrui (voir CGU).</li><li>Nous modérons les contributions <strong>avant</strong> publication. Les visages sont <strong>floutés automatiquement</strong> au dépôt ; lors de la modération, les visages ou plaques d'immatriculation résiduels peuvent être floutés manuellement, ou l'image refusée.</li><li>Toute personne figurant sur une image peut demander son retrait en écrivant à contact@graffitiatlas.io. Nous traitons ces demandes dans les meilleurs délais.</li></ul>
        <blockquote>Note : le floutage automatique des visages est en place ; le floutage des plaques d'immatriculation repose à ce jour sur la modération manuelle. Ce dispositif doit être validé par un conseil juridique avant l'ouverture au grand public.</blockquote>
        <h2>9. Mineurs</h2>
        <p>Le service n'est pas destiné aux personnes de moins de 15 ans. Nous ne collectons pas sciemment leurs données.</p>
        <h2>10. Modifications</h2>
        <p>Nous pouvons mettre à jour cette politique. La date en tête de page indique la dernière révision. En cas de changement important, nous en informerons les utilisateurs.</p>
    </LegalPage>
  )
}
