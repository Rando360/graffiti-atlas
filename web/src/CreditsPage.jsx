import LegalPage from './LegalPage'

const CONTENT = {
  fr: {
    title: 'Crédits & licences',
    updated: '2026-07-24',
    blocks: [
      { t: 'p', html: "GraffitiAtlas s'appuie sur des données et des images ouvertes. Cette page recense les sources utilisées et leurs licences respectives, conformément aux obligations d'attribution." },
      { t: 'h2', html: 'Imagerie de rue — Panoramax' },
      { t: 'p', html: "Une partie des vues de rue et des images de référence provient de <strong>Panoramax</strong>, plateforme ouverte d'imagerie géolocalisée. Les images sont utilisées, recadrées et analysées dans le respect des licences de chaque instance :" },
      { t: 'ul', items: [
        '<strong>Instance OpenStreetMap France</strong> — images sous licence <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" target="_blank" rel="noreferrer">Creative Commons BY-SA 4.0</a>. Les données non photographiques dérivées (localisations, mesures, classifications) sont générées sous licence <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a>.',
        '<strong>Instance IGN</strong> — images sous <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" target="_blank" rel="noreferrer">Licence Ouverte / Etalab 2.0</a>.',
      ] },
      { t: 'p', html: 'Chaque image affichée conserve un lien vers sa source Panoramax. Les images issues d\'instances CC-BY-SA sont créditées à leur auteur d\'origine lorsque cette information est disponible, et peuvent avoir été modifiées (recadrage, traitement). Plus d\'informations : <a href="https://panoramax.fr" target="_blank" rel="noreferrer">panoramax.fr</a>.' },
      { t: 'h2', html: 'Cartographie' },
      { t: 'ul', items: [
        '<strong>Google Maps &amp; Street View</strong> — fonds de carte et vues immersives fournis par Google, utilisés via l\'API Google Maps Platform, soumis aux <a href="https://cloud.google.com/maps-platform/terms" target="_blank" rel="noreferrer">conditions d\'utilisation de Google</a>.',
        '<strong>OpenStreetMap</strong> — certaines données géographiques © les contributeurs OpenStreetMap, sous licence <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a>.',
      ] },
      { t: 'h2', html: 'Contributions des utilisateurs' },
      { t: 'p', html: 'Les photographies déposées par la communauté restent la propriété de leurs auteurs, qui concèdent à GraffitiAtlas une licence d\'utilisation dans les conditions prévues par les <a href="/conditions-utilisation">Conditions Générales d\'Utilisation</a>. Les visages et éléments personnels sont floutés avant publication.' },
      { t: 'h2', html: 'Technologies' },
      { t: 'p', html: 'Le site est construit avec des logiciels libres et open source, notamment React, Vite, FastAPI et de nombreuses bibliothèques communautaires. Merci à leurs auteurs et mainteneurs.' },
      { t: 'h2', html: 'Contact' },
      { t: 'p', html: "Pour toute question relative aux crédits, aux licences ou à une demande d'attribution : contact@graffitiatlas.io" },
    ],
  },
  en: {
    title: 'Credits & licenses',
    updated: '2026-07-24',
    blocks: [
      { t: 'p', html: 'GraffitiAtlas is built on open data and open imagery. This page lists the sources used and their respective licenses, in line with attribution requirements.' },
      { t: 'h2', html: 'Street imagery — Panoramax' },
      { t: 'p', html: 'Some of the street views and reference images come from <strong>Panoramax</strong>, an open geolocated imagery platform. Images are used, cropped and analyzed in compliance with each instance’s license:' },
      { t: 'ul', items: [
        '<strong>OpenStreetMap France instance</strong> — images under the <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">Creative Commons BY-SA 4.0</a> license. Derived non-photographic data (locations, measurements, classifications) is generated under the <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a> license.',
        '<strong>IGN instance</strong> — images under the <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" target="_blank" rel="noreferrer">Open License / Etalab 2.0</a>.',
      ] },
      { t: 'p', html: 'Each displayed image keeps a link to its Panoramax source. Images from CC-BY-SA instances are credited to their original author where that information is available, and may have been modified (cropping, processing). More information: <a href="https://panoramax.fr" target="_blank" rel="noreferrer">panoramax.fr</a>.' },
      { t: 'h2', html: 'Mapping' },
      { t: 'ul', items: [
        '<strong>Google Maps &amp; Street View</strong> — base maps and immersive views provided by Google, used via the Google Maps Platform API, subject to <a href="https://cloud.google.com/maps-platform/terms" target="_blank" rel="noreferrer">Google’s terms of service</a>.',
        '<strong>OpenStreetMap</strong> — some geographic data © OpenStreetMap contributors, under the <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a> license.',
      ] },
      { t: 'h2', html: 'User contributions' },
      { t: 'p', html: 'Photographs uploaded by the community remain the property of their authors, who grant GraffitiAtlas a license to use them under the conditions set out in the <a href="/conditions-utilisation">Terms of Use</a>. Faces and personal elements are blurred before publication.' },
      { t: 'h2', html: 'Technologies' },
      { t: 'p', html: 'The site is built with free and open source software, notably React, Vite, FastAPI and many community libraries. Thanks to their authors and maintainers.' },
      { t: 'h2', html: 'Contact' },
      { t: 'p', html: 'For any question about credits, licenses or an attribution request: contact@graffitiatlas.io' },
    ],
  },
  es: {
    title: 'Créditos y licencias',
    updated: '2026-07-24',
    blocks: [
      { t: 'p', html: 'GraffitiAtlas se basa en datos e imágenes abiertos. Esta página enumera las fuentes utilizadas y sus respectivas licencias, conforme a las obligaciones de atribución.' },
      { t: 'h2', html: 'Imágenes de calle — Panoramax' },
      { t: 'p', html: 'Parte de las vistas de calle y de las imágenes de referencia proceden de <strong>Panoramax</strong>, plataforma abierta de imágenes geolocalizadas. Las imágenes se utilizan, recortan y analizan respetando la licencia de cada instancia:' },
      { t: 'ul', items: [
        '<strong>Instancia OpenStreetMap Francia</strong> — imágenes bajo licencia <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.es" target="_blank" rel="noreferrer">Creative Commons BY-SA 4.0</a>. Los datos no fotográficos derivados (ubicaciones, mediciones, clasificaciones) se generan bajo licencia <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a>.',
        '<strong>Instancia IGN</strong> — imágenes bajo <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" target="_blank" rel="noreferrer">Licencia Abierta / Etalab 2.0</a>.',
      ] },
      { t: 'p', html: 'Cada imagen mostrada conserva un enlace a su fuente de Panoramax. Las imágenes procedentes de instancias CC-BY-SA se atribuyen a su autor original cuando esa información está disponible, y pueden haber sido modificadas (recorte, procesamiento). Más información: <a href="https://panoramax.fr" target="_blank" rel="noreferrer">panoramax.fr</a>.' },
      { t: 'h2', html: 'Cartografía' },
      { t: 'ul', items: [
        '<strong>Google Maps y Street View</strong> — mapas base y vistas inmersivas proporcionados por Google, utilizados a través de la API de Google Maps Platform, sujetos a las <a href="https://cloud.google.com/maps-platform/terms" target="_blank" rel="noreferrer">condiciones de uso de Google</a>.',
        '<strong>OpenStreetMap</strong> — algunos datos geográficos © los colaboradores de OpenStreetMap, bajo licencia <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a>.',
      ] },
      { t: 'h2', html: 'Contribuciones de los usuarios' },
      { t: 'p', html: 'Las fotografías subidas por la comunidad siguen siendo propiedad de sus autores, quienes conceden a GraffitiAtlas una licencia de uso en las condiciones previstas por las <a href="/conditions-utilisation">Condiciones de uso</a>. Los rostros y elementos personales se difuminan antes de la publicación.' },
      { t: 'h2', html: 'Tecnologías' },
      { t: 'p', html: 'El sitio está construido con software libre y de código abierto, en particular React, Vite, FastAPI y numerosas bibliotecas de la comunidad. Gracias a sus autores y mantenedores.' },
      { t: 'h2', html: 'Contacto' },
      { t: 'p', html: 'Para cualquier consulta sobre créditos, licencias o una solicitud de atribución: contact@graffitiatlas.io' },
    ],
  },
  de: {
    title: 'Danksagungen & Lizenzen',
    updated: '2026-07-24',
    blocks: [
      { t: 'p', html: 'GraffitiAtlas basiert auf offenen Daten und offenen Bildern. Diese Seite listet die verwendeten Quellen und ihre jeweiligen Lizenzen gemäß den Attributionspflichten auf.' },
      { t: 'h2', html: 'Straßenbilder — Panoramax' },
      { t: 'p', html: 'Ein Teil der Straßenansichten und Referenzbilder stammt von <strong>Panoramax</strong>, einer offenen Plattform für georeferenzierte Bilder. Die Bilder werden unter Einhaltung der Lizenz jeder Instanz verwendet, zugeschnitten und analysiert:' },
      { t: 'ul', items: [
        '<strong>Instanz OpenStreetMap Frankreich</strong> — Bilder unter der Lizenz <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.de" target="_blank" rel="noreferrer">Creative Commons BY-SA 4.0</a>. Abgeleitete nicht-fotografische Daten (Standorte, Messungen, Klassifizierungen) werden unter der <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a>-Lizenz erzeugt.',
        '<strong>IGN-Instanz</strong> — Bilder unter der <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" target="_blank" rel="noreferrer">Open License / Etalab 2.0</a>.',
      ] },
      { t: 'p', html: 'Jedes angezeigte Bild behält einen Link zu seiner Panoramax-Quelle. Bilder aus CC-BY-SA-Instanzen werden ihrem ursprünglichen Urheber zugeschrieben, sofern diese Information verfügbar ist, und können bearbeitet worden sein (Zuschnitt, Verarbeitung). Weitere Informationen: <a href="https://panoramax.fr" target="_blank" rel="noreferrer">panoramax.fr</a>.' },
      { t: 'h2', html: 'Kartografie' },
      { t: 'ul', items: [
        '<strong>Google Maps &amp; Street View</strong> — Basiskarten und immersive Ansichten von Google, genutzt über die Google Maps Platform API, unterliegen den <a href="https://cloud.google.com/maps-platform/terms" target="_blank" rel="noreferrer">Nutzungsbedingungen von Google</a>.',
        '<strong>OpenStreetMap</strong> — einige geografische Daten © OpenStreetMap-Mitwirkende, unter der <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a>-Lizenz.',
      ] },
      { t: 'h2', html: 'Nutzerbeiträge' },
      { t: 'p', html: 'Von der Community hochgeladene Fotos bleiben Eigentum ihrer Urheber, die GraffitiAtlas eine Nutzungslizenz unter den in den <a href="/conditions-utilisation">Nutzungsbedingungen</a> festgelegten Bedingungen einräumen. Gesichter und persönliche Elemente werden vor der Veröffentlichung unkenntlich gemacht.' },
      { t: 'h2', html: 'Technologien' },
      { t: 'p', html: 'Die Website ist mit freier und Open-Source-Software erstellt, insbesondere React, Vite, FastAPI und zahlreichen Community-Bibliotheken. Dank an ihre Autoren und Betreuer.' },
      { t: 'h2', html: 'Kontakt' },
      { t: 'p', html: 'Bei Fragen zu Danksagungen, Lizenzen oder einer Attributionsanfrage: contact@graffitiatlas.io' },
    ],
  },
  it: {
    title: 'Crediti e licenze',
    updated: '2026-07-24',
    blocks: [
      { t: 'p', html: 'GraffitiAtlas si basa su dati e immagini aperti. Questa pagina elenca le fonti utilizzate e le rispettive licenze, in conformità agli obblighi di attribuzione.' },
      { t: 'h2', html: 'Immagini stradali — Panoramax' },
      { t: 'p', html: 'Una parte delle viste stradali e delle immagini di riferimento proviene da <strong>Panoramax</strong>, piattaforma aperta di immagini geolocalizzate. Le immagini sono utilizzate, ritagliate e analizzate nel rispetto della licenza di ciascuna istanza:' },
      { t: 'ul', items: [
        '<strong>Istanza OpenStreetMap Francia</strong> — immagini con licenza <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.it" target="_blank" rel="noreferrer">Creative Commons BY-SA 4.0</a>. I dati non fotografici derivati (localizzazioni, misurazioni, classificazioni) sono generati con licenza <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a>.',
        '<strong>Istanza IGN</strong> — immagini con <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" target="_blank" rel="noreferrer">Licenza Aperta / Etalab 2.0</a>.',
      ] },
      { t: 'p', html: 'Ogni immagine visualizzata conserva un link alla sua fonte Panoramax. Le immagini provenienti da istanze CC-BY-SA sono attribuite al loro autore originale quando tale informazione è disponibile, e possono essere state modificate (ritaglio, elaborazione). Maggiori informazioni: <a href="https://panoramax.fr" target="_blank" rel="noreferrer">panoramax.fr</a>.' },
      { t: 'h2', html: 'Cartografia' },
      { t: 'ul', items: [
        '<strong>Google Maps e Street View</strong> — mappe di base e viste immersive fornite da Google, utilizzate tramite l’API Google Maps Platform, soggette ai <a href="https://cloud.google.com/maps-platform/terms" target="_blank" rel="noreferrer">termini di servizio di Google</a>.',
        '<strong>OpenStreetMap</strong> — alcuni dati geografici © i collaboratori di OpenStreetMap, con licenza <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a>.',
      ] },
      { t: 'h2', html: 'Contributi degli utenti' },
      { t: 'p', html: 'Le fotografie caricate dalla comunità restano di proprietà dei rispettivi autori, che concedono a GraffitiAtlas una licenza d’uso alle condizioni previste dalle <a href="/conditions-utilisation">Condizioni d’uso</a>. I volti e gli elementi personali vengono sfocati prima della pubblicazione.' },
      { t: 'h2', html: 'Tecnologie' },
      { t: 'p', html: 'Il sito è realizzato con software libero e open source, in particolare React, Vite, FastAPI e numerose librerie della comunità. Grazie ai loro autori e manutentori.' },
      { t: 'h2', html: 'Contatto' },
      { t: 'p', html: 'Per qualsiasi domanda su crediti, licenze o una richiesta di attribuzione: contact@graffitiatlas.io' },
    ],
  },
}

export default function CreditsPage() {
  return <LegalPage content={CONTENT} />
}
