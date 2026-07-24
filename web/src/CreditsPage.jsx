import LegalPage from './LegalPage'

export default function CreditsPage() {
  return (
    <LegalPage title="Crédits & licences" updated="Dernière mise à jour : 24 juillet 2026">
      <p>GraffitiAtlas s'appuie sur des données et des images ouvertes. Cette page recense les sources utilisées et leurs licences respectives, conformément aux obligations d'attribution.</p>

      <h2>Imagerie de rue — Panoramax</h2>
      <p>Une partie des vues de rue et des images de référence provient de <strong>Panoramax</strong>, plateforme ouverte d'imagerie géolocalisée. Les images sont utilisées, recadrées et analysées dans le respect des licences de chaque instance :</p>
      <ul>
        <li><strong>Instance OpenStreetMap France</strong> — images sous licence <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" target="_blank" rel="noreferrer">Creative Commons BY-SA 4.0</a>. Les données non photographiques dérivées (localisations, mesures, classifications) sont générées sous licence <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a>.</li>
        <li><strong>Instance IGN</strong> — images sous <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" target="_blank" rel="noreferrer">Licence Ouverte / Etalab 2.0</a>.</li>
      </ul>
      <p>Chaque image affichée conserve un lien vers sa source Panoramax. Les images issues d'instances CC-BY-SA sont créditées à leur auteur d'origine lorsque cette information est disponible, et peuvent avoir été modifiées (recadrage, traitement). Plus d'informations : <a href="https://panoramax.fr" target="_blank" rel="noreferrer">panoramax.fr</a>.</p>

      <h2>Cartographie</h2>
      <ul>
        <li><strong>Google Maps &amp; Street View</strong> — fonds de carte et vues immersives fournis par Google, utilisés via l'API Google Maps Platform, soumis aux <a href="https://cloud.google.com/maps-platform/terms" target="_blank" rel="noreferrer">conditions d'utilisation de Google</a>.</li>
        <li><strong>OpenStreetMap</strong> — certaines données géographiques © les contributeurs OpenStreetMap, sous licence <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a>.</li>
      </ul>

      <h2>Contributions des utilisateurs</h2>
      <p>Les photographies déposées par la communauté restent la propriété de leurs auteurs, qui concèdent à GraffitiAtlas une licence d'utilisation dans les conditions prévues par les <a href="/conditions-utilisation">Conditions Générales d'Utilisation</a>. Les visages et éléments personnels sont floutés avant publication.</p>

      <h2>Technologies</h2>
      <p>Le site est construit avec des logiciels libres et open source, notamment React, Vite, FastAPI et de nombreuses bibliothèques communautaires. Merci à leurs auteurs et mainteneurs.</p>

      <h2>Contact</h2>
      <p>Pour toute question relative aux crédits, aux licences ou à une demande d'attribution : contact@graffitiatlas.io</p>
    </LegalPage>
  )
}
