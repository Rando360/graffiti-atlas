import LegalPage from './LegalPage'

export default function LegalNoticePage() {
  return (
    <LegalPage title="Mentions légales" updated="Dernière mise à jour : 18 juillet 2026">
        <p>Conformément à l'article 6 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN), les présentes mentions légales sont portées à la connaissance des utilisateurs du site <strong>GraffitiAtlas.io</strong>.</p>
        <h2>1. Éditeur du site</h2>
        <p>Le site GraffitiAtlas.io est édité par :</p>
        <ul><li><strong>Éditeur :</strong> Graffiti Atlas — entreprise individuelle (auto-entrepreneur)</li><li><strong>Représentant légal / Directeur de la publication :</strong> Zachary Root</li><li><strong>Adresse :</strong> 9 F Place Saint-Bruno, 38000 Grenoble, France</li><li><strong>SIRET :</strong> 893 404 830 00018</li><li><strong>TVA :</strong> non applicable, article 293 B du CGI (franchise en base)</li><li><strong>Adresse e-mail de contact :</strong> contact@graffitiatlas.io</li></ul>
        <h2>2. Hébergement</h2>
        <p>Le site et ses données s'appuient sur plusieurs prestataires techniques :</p>
        <ul><li><strong>Interface web (frontend) :</strong> Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis.</li><li><strong>Serveur applicatif (backend) :</strong> Railway Corp.</li><li><strong>Base de données & authentification :</strong> Supabase (hébergement dans la région Europe — Paris, `eu-west-3`).</li><li><strong>Stockage des images :</strong> Amazon Web Services (AWS S3 / CloudFront), région Europe (Paris, `eu-west-3`).</li></ul>
        <h2>3. Propriété intellectuelle</h2>
        <p>La structure du site, son code, son identité visuelle (logo, charte graphique) et les textes originaux sont la propriété de l'éditeur, sauf mention contraire.</p>
        <p>Les images de rue à 360° proviennent notamment de <strong>Panoramax</strong> (plateforme ouverte de l'IGN, données ouvertes) et sont utilisées dans le respect de leurs licences. Les vues <strong>Google Street View</strong> sont fournies à titre de référence via les services de Google.</p>
        <p>Les photographies déposées par les utilisateurs restent la propriété de leurs auteurs, qui concèdent à GraffitiAtlas une licence d'utilisation dans les conditions prévues par les [Conditions Générales d'Utilisation](conditions-utilisation.md).</p>
        <h2>4. Responsabilité</h2>
        <p>GraffitiAtlas s'efforce d'assurer l'exactitude des informations diffusées mais ne saurait garantir l'exhaustivité ou l'absence d'erreur des données cartographiques et des contributions. L'utilisation du site se fait sous la seule responsabilité de l'utilisateur.</p>
        <h2>5. Contact</h2>
        <p>Pour toute question relative au site : contact@graffitiatlas.io</p>
    </LegalPage>
  )
}
