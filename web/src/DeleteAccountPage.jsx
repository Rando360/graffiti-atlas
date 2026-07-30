import LegalPage from './LegalPage'

const CONTENT = {
  fr: {
    title: 'Supprimer votre compte',
    updated: '2026-07-30',
    blocks: [
      { t: 'p', html: 'Vous pouvez supprimer votre compte GraffitiAtlas et les données associées à tout moment. Cette page explique comment procéder et ce qu\'il advient de vos données.' },
      { t: 'h2', html: '1. Supprimer votre compte depuis l\'application' },
      { t: 'p', html: 'La méthode la plus simple :' },
      { t: 'ul', items: [
        'Connectez-vous à l\'application ou au site GraffitiAtlas.',
        'Ouvrez <strong>Paramètres</strong>.',
        'Sélectionnez <strong>Supprimer le compte</strong> et confirmez.',
      ] },
      { t: 'h2', html: '2. Ce qui est supprimé' },
      { t: 'ul', items: [
        '<strong>Votre profil et votre compte</strong> (nom, e-mail, préférences) sont supprimés.',
        '<strong>Vos contributions non publiées</strong> (en attente ou refusées) sont entièrement supprimées, images comprises.',
        '<strong>Vos contributions déjà publiées</strong> sont conservées pour leur valeur documentaire mais <strong>anonymisées</strong> : votre nom et le lien vers votre compte sont retirés.',
      ] },
      { t: 'h2', html: '3. Suppression complète d\'une contribution publiée' },
      { t: 'p', html: 'Si vous souhaitez la suppression complète d\'une contribution déjà publiée (image comprise), écrivez à <strong>contact@graffitiatlas.io</strong>. Nous examinons ces demandes au cas par cas au titre de votre droit à l\'effacement.' },
      { t: 'p', html: 'Pour plus de détails sur le traitement de vos données, consultez notre <a href="/politique-confidentialite">Politique de confidentialité</a>.' },
    ],
  },
  en: {
    title: 'Delete your account',
    updated: '2026-07-30',
    blocks: [
      { t: 'p', html: 'You can delete your GraffitiAtlas account and associated data at any time. This page explains how, and what happens to your data.' },
      { t: 'h2', html: '1. Delete your account from the app' },
      { t: 'p', html: 'The simplest way:' },
      { t: 'ul', items: [
        'Sign in to the GraffitiAtlas app or website.',
        'Open <strong>Settings</strong>.',
        'Select <strong>Delete account</strong> and confirm.',
      ] },
      { t: 'h2', html: '2. What gets deleted' },
      { t: 'ul', items: [
        '<strong>Your profile and account</strong> (name, email, preferences) are deleted.',
        '<strong>Your unpublished contributions</strong> (pending or rejected) are entirely deleted, including images.',
        '<strong>Your already published contributions</strong> are kept for their documentary value but <strong>anonymized</strong>: your name and the link to your account are removed.',
      ] },
      { t: 'h2', html: '3. Full deletion of a published contribution' },
      { t: 'p', html: 'If you want the complete deletion of an already published contribution (including the image), write to <strong>contact@graffitiatlas.io</strong>. We review these requests on a case-by-case basis under your right to erasure.' },
      { t: 'p', html: 'For full details on how we handle your data, see our <a href="/politique-confidentialite">Privacy Policy</a>.' },
    ],
  },
  es: {
    title: 'Eliminar su cuenta',
    updated: '2026-07-30',
    blocks: [
      { t: 'p', html: 'Puede eliminar su cuenta de GraffitiAtlas y los datos asociados en cualquier momento. Esta página explica cómo hacerlo y qué ocurre con sus datos.' },
      { t: 'h2', html: '1. Eliminar su cuenta desde la aplicación' },
      { t: 'p', html: 'La forma más sencilla:' },
      { t: 'ul', items: [
        'Inicie sesión en la aplicación o el sitio de GraffitiAtlas.',
        'Abra <strong>Ajustes</strong>.',
        'Seleccione <strong>Eliminar cuenta</strong> y confirme.',
      ] },
      { t: 'h2', html: '2. Qué se elimina' },
      { t: 'ul', items: [
        '<strong>Su perfil y su cuenta</strong> (nombre, correo, preferencias) se eliminan.',
        '<strong>Sus contribuciones no publicadas</strong> (pendientes o rechazadas) se eliminan por completo, imágenes incluidas.',
        '<strong>Sus contribuciones ya publicadas</strong> se conservan por su valor documental pero se <strong>anonimizan</strong>: se retiran su nombre y el enlace a su cuenta.',
      ] },
      { t: 'h2', html: '3. Eliminación completa de una contribución publicada' },
      { t: 'p', html: 'Si desea la eliminación completa de una contribución ya publicada (imagen incluida), escriba a <strong>contact@graffitiatlas.io</strong>. Examinamos estas solicitudes caso por caso en virtud de su derecho de supresión.' },
      { t: 'p', html: 'Para más detalles sobre el tratamiento de sus datos, consulte nuestra <a href="/politique-confidentialite">Política de privacidad</a>.' },
    ],
  },
  de: {
    title: 'Ihr Konto löschen',
    updated: '2026-07-30',
    blocks: [
      { t: 'p', html: 'Sie können Ihr GraffitiAtlas-Konto und die zugehörigen Daten jederzeit löschen. Diese Seite erklärt, wie das geht und was mit Ihren Daten geschieht.' },
      { t: 'h2', html: '1. Ihr Konto in der App löschen' },
      { t: 'p', html: 'Der einfachste Weg:' },
      { t: 'ul', items: [
        'Melden Sie sich in der GraffitiAtlas-App oder auf der Website an.',
        'Öffnen Sie die <strong>Einstellungen</strong>.',
        'Wählen Sie <strong>Konto löschen</strong> und bestätigen Sie.',
      ] },
      { t: 'h2', html: '2. Was gelöscht wird' },
      { t: 'ul', items: [
        '<strong>Ihr Profil und Ihr Konto</strong> (Name, E-Mail, Präferenzen) werden gelöscht.',
        '<strong>Ihre nicht veröffentlichten Beiträge</strong> (ausstehend oder abgelehnt) werden vollständig gelöscht, einschließlich der Bilder.',
        '<strong>Ihre bereits veröffentlichten Beiträge</strong> werden aufgrund ihres dokumentarischen Werts aufbewahrt, aber <strong>anonymisiert</strong>: Ihr Name und die Verknüpfung mit Ihrem Konto werden entfernt.',
      ] },
      { t: 'h2', html: '3. Vollständige Löschung eines veröffentlichten Beitrags' },
      { t: 'p', html: 'Wenn Sie die vollständige Löschung eines bereits veröffentlichten Beitrags (einschließlich des Bildes) wünschen, schreiben Sie an <strong>contact@graffitiatlas.io</strong>. Wir prüfen diese Anfragen im Einzelfall im Rahmen Ihres Rechts auf Löschung.' },
      { t: 'p', html: 'Weitere Einzelheiten zur Verarbeitung Ihrer Daten finden Sie in unserer <a href="/politique-confidentialite">Datenschutzrichtlinie</a>.' },
    ],
  },
  it: {
    title: 'Eliminare il tuo account',
    updated: '2026-07-30',
    blocks: [
      { t: 'p', html: 'Puoi eliminare il tuo account GraffitiAtlas e i dati associati in qualsiasi momento. Questa pagina spiega come farlo e cosa succede ai tuoi dati.' },
      { t: 'h2', html: '1. Eliminare il tuo account dall\'app' },
      { t: 'p', html: 'Il modo più semplice:' },
      { t: 'ul', items: [
        'Accedi all\'app o al sito GraffitiAtlas.',
        'Apri <strong>Impostazioni</strong>.',
        'Seleziona <strong>Elimina account</strong> e conferma.',
      ] },
      { t: 'h2', html: '2. Cosa viene eliminato' },
      { t: 'ul', items: [
        '<strong>Il tuo profilo e il tuo account</strong> (nome, e-mail, preferenze) vengono eliminati.',
        '<strong>I tuoi contributi non pubblicati</strong> (in attesa o rifiutati) vengono eliminati completamente, immagini comprese.',
        '<strong>I tuoi contributi già pubblicati</strong> vengono conservati per il loro valore documentale ma <strong>anonimizzati</strong>: il tuo nome e il collegamento al tuo account vengono rimossi.',
      ] },
      { t: 'h2', html: '3. Eliminazione completa di un contributo pubblicato' },
      { t: 'p', html: 'Se desideri l\'eliminazione completa di un contributo già pubblicato (immagine compresa), scrivi a <strong>contact@graffitiatlas.io</strong>. Esaminiamo queste richieste caso per caso in virtù del tuo diritto alla cancellazione.' },
      { t: 'p', html: 'Per maggiori dettagli sul trattamento dei tuoi dati, consulta la nostra <a href="/politique-confidentialite">Informativa sulla privacy</a>.' },
    ],
  },
}

export default function DeleteAccountPage() {
  return <LegalPage content={CONTENT} />
}
