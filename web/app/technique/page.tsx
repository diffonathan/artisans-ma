/**
 * LA PAGE TECHNIQUE — celle que lit quelqu'un qui évalue le projet.
 *
 * ── Pourquoi elle ne ressemble pas au README ──────────────────────────────
 * Le README est un document : il se lit du haut vers le bas, et il peut se
 * permettre d'expliquer avant de conclure. Un écran n'a pas ce luxe. Le
 * lecteur arrive par un lien, décide en quelques secondes s'il continue, et
 * cherche ensuite UN sujet précis. D'où trois différences assumées :
 *
 *   • l'ordre est celui de l'intérêt, pas celui de la construction : la
 *     contrainte centrale d'abord, les pièges d'outillage en dernier ;
 *   • chaque section porte sa conclusion dans son titre, pas dans sa chute ;
 *   • les tableaux du README sont repris TELS QUELS, parce qu'un tableau est
 *     déjà la forme la plus courte d'une mesure. Les paragraphes autour, eux,
 *     sont réduits.
 *
 * ── Ce que cette page ne fait pas ─────────────────────────────────────────
 * Elle ne lit aucune donnée du domaine, donc elle n'a ni liste, ni état vide,
 * ni pagination — et plus aucun appel à l'API : le nom du compte est résolu
 * une fois par la disposition racine (`lib/entete.ts`). Une panne de l'API
 * laisse donc cette page entièrement lisible, ce qui est le minimum attendu
 * d'une page dont le sujet est la fiabilité.
 *
 * ── La source des chiffres ────────────────────────────────────────────────
 * Chaque nombre écrit ici est recopié du README ou d'une assertion de
 * `api/test/`, et le fichier est nommé à côté quand il éclaire la mesure.
 * Aucun n'est arrondi : une page qui se vante de mesurer ne peut pas se
 * permettre un « environ ».
 *
 * PAS de clé `icons` dans l'objet metadata ci-dessous : l'icône d'onglet est
 * `app/icon.svg`, par la convention de fichier, et un `icons` déclaré ici la
 * jetterait en silence (le raisonnement complet est dans app/layout.tsx).
 */
import type { Metadata } from 'next';
import { Carte } from '@/components/Carte';
import { Montant } from '@/components/Montant';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Comment ce projet est construit',
  description:
    'Garantir un avis vérifié sans clé étrangère, un défaut de confidentialité ' +
    'trouvé et corrigé en déplaçant la donnée, et les mesures qui remplacent ' +
    'les affirmations.',
};

/**
 * Le dépôt. Le profil et non un chemin de dépôt deviné : même raisonnement
 * que sur l'accueil, un lien mort dans le bloc destiné au lecteur technique
 * coûte plus cher que l'imprécision d'un lien qui, lui, répond.
 */
const DEPOT = 'https://github.com/diffonathan';

/**
 * Le sommaire.
 *
 * Il n'est pas décoratif : les cinq sections ne s'adressent pas au même
 * lecteur, et celui qui vient vérifier une seule chose doit pouvoir y aller
 * sans défiler. Les ancres sont déclarées ici et consommées deux fois — le
 * lien, puis l'`id` de la section — pour qu'un renommage ne puisse pas les
 * désaccorder.
 */
const SOMMAIRE = [
  {
    ancre: 'avis-verifie',
    titre: 'Garantir un avis vérifié sans clé étrangère',
    resume: 'Ce que PostgreSQL ferait, ce que MongoDB n’a pas, et ce qui reste non garanti.',
  },
  {
    ancre: 'confidentialite',
    titre: 'Un défaut de confidentialité, et sa vraie correction',
    resume: 'Déplacer la donnée au lieu d’ajouter un contrôle à oublier.',
  },
  {
    ancre: 'mesures',
    titre: 'Les mesures, pas les affirmations',
    resume: 'Les commandes comptées, la concurrence provoquée, la distance vérifiée.',
  },
  {
    ancre: 'pieges',
    titre: 'Quatre pièges dont le message mentait',
    resume: 'Des erreurs dont le symptôme ne nomme jamais la cause.',
  },
  {
    ancre: 'pile',
    titre: 'La pile, et où lire le code',
    resume: 'Ce qui tourne, ce qui manque, et le dépôt.',
  },
] as const;

/** Le dépôt du droit d'avis : vérification et réservation dans la même écriture. */
const CODE_JETON = `const reservation = await this.reservations.findOneAndUpdate(
  { _id: entree.reservation, client, statut: TERMINEE, avisDeposeA: null },
  { $set: { avisDeposeA: new Date() } },
  { session, returnDocument: 'after' },
);
if (!reservation) throw new ConflictException(/* … */);`;

/** Les deux étages de la recherche : le plafond global, puis le rayon du document. */
const CODE_GEO = `{ $geoNear: { near: …, distanceField: 'distanceMetres',
              maxDistance: PLAFOND_METRES, spherical: true,
              query: { metiers: metier, actif: true } } },
{ $match: { $expr: { $lte: ['$distanceMetres',
                            { $multiply: ['$rayonKm', 1000] }] } } },`;

/**
 * Les trois mécanismes qui remplacent la contrainte référentielle. L'ordre
 * est celui de leur force : le premier suffit, les deux autres sont des
 * filets tendus sous lui.
 */
const MECANISMES = [
  {
    rang: 1,
    titre: 'Le droit d’avis est un jeton',
    texte:
      'La réservation porte un champ qui vaut null tant que personne n’a noté. Déposer un avis ne commence pas par lire la réservation puis décider : ça commence par l’écrire, en exigeant dans le FILTRE que le champ valait null, que la prestation est terminée, et que le demandeur est bien le client.',
    consequence:
      'La vérification et la réservation du droit sont la même écriture, donc indivisibles, sans verrou applicatif.',
  },
  {
    rang: 2,
    titre: 'Un index unique, volontairement redondant',
    texte:
      'Sur le champ qui désigne la réservation, dans la collection des avis. Il ne sert à rien tant que le premier mécanisme est respecté — et c’est exactement pourquoi il est là.',
    consequence:
      'Si un futur chemin de code oublie de consommer le jeton, l’index refuse quand même.',
  },
  {
    rang: 3,
    titre: 'La transaction',
    texte:
      'L’avis, le jeton consommé et la note moyenne de l’artisan forment une seule écriture. MongoDB ne l’autorise que sur un replica set : d’où un replica set à un seul membre, soit le coût d’exploitation d’un nœud pour les garanties transactionnelles d’un cluster.',
    consequence:
      'Jamais d’avis sans jeton consommé, jamais de note qui ne corresponde pas aux avis.',
  },
] as const;

/**
 * Le tableau « qui voit quoi ».
 *
 * En données et non en balisage figé parce qu'il est la pièce la plus citée
 * de la démonstration : une ligne qui dérive du README est une promesse
 * fausse, et une liste se relit plus vite que six `<tr>`.
 */
const LECTEURS = [
  { qui: 'personne (anonyme)', besoin: 'refusé', reservation: '—', retenu: false },
  {
    qui: 'le client propriétaire',
    besoin: 'adresse + ses coordonnées',
    reservation: 'idem',
    retenu: false,
  },
  { qui: 'un autre client', besoin: 'null', reservation: '—', retenu: false },
  {
    qui: 'un artisan qui n’a pas gagné',
    besoin: 'null, et « Fatima B. »',
    reservation: '—',
    retenu: false,
  },
  {
    qui: 'l’artisan retenu',
    besoin: 'null sur le besoin',
    reservation: 'adresse + téléphone',
    retenu: true,
  },
] as const;

/** Les commandes MongoDB comptées sur la même requête GraphQL. */
const COMMANDES = [
  { cas: '20 artisans, résolveur naïf', commandes: 21, bon: false },
  { cas: '20 artisans, chargeur groupé', commandes: 2, bon: true },
  { cas: '20 artisans, chargeur mal utilisé (une attente par élément)', commandes: 21, bon: false },
] as const;

/** La recherche géographique : c'est le plus loin qui doit sortir. */
const RAYONS = [
  { artisan: 'Plomberie de Tahannaout', distanceKm: 30, rayonKm: 10, retenu: false },
  { artisan: 'Plomberie d’Essaouira', distanceKm: 170, rayonKm: 200, retenu: true },
] as const;

/**
 * Les quatre pièges. Un par bloc, et courts : leur intérêt n'est pas la
 * solution, c'est que le message d'erreur ne nomme jamais la cause.
 */
const PIEGES = [
  {
    sujet: 'Model.create avec un objet seul',
    texte:
      'Il perd la session — et ne se contente pas de la perdre : il prend l’objet d’options pour un SECOND document à insérer. Le résultat mesuré est une erreur de validation qui énumère les champs d’un document que personne n’a écrit, sans mentionner ni la session, ni la transaction. Pendant ce temps l’autre document est déjà écrit hors transaction, et survit à l’annulation.',
    fichier: 'unite-de-travail.spec.ts',
  },
  {
    sujet: 'directConnection, obligatoire depuis l’hôte',
    texte:
      'Le replica set s’annonce sous le nom de ses membres, tel qu’il se voit de l’intérieur du conteneur. Le pilote découvre la topologie, lit ce nom, et va s’y connecter — à une adresse qui ne répond pas depuis l’hôte, où le port est publié ailleurs. Les transactions, elles, continuent de fonctionner : c’est l’appartenance du nœud au replica set qui les autorise, pas la façon dont le client s’y connecte.',
    fichier: null,
  },
  {
    sujet: 'Un import de type que le compilateur préserve',
    texte:
      'Le projet est en modules ES, le pilote en CommonJS, et Node ne voit pas tous ses exports. L’import ne servant que comme type, il devrait être effacé — mais la métadonnée de décorateur, indispensable à l’injection de dépendances, a besoin des types des paramètres de constructeur POUR les écrire, et préserve donc l’import. Les tests ne le voient pas : le lanceur fait lui-même l’interopérabilité. La suite passe au vert sur un code qui ne démarre pas une fois construit.',
    fichier: null,
  },
  {
    sujet: 'La « liste blanche » n’est pas le schéma GraphQL',
    texte:
      'Elle est faite des propriétés qui portent un décorateur de validation. Un champ déclaré dans le schéma mais sans validateur est, selon le réglage, silencieusement retiré de l’entrée ou refusé par une erreur qui ne nomme pas le champ coupable. D’où la règle tenue partout : chaque champ d’entrée porte un décorateur, même quand GraphQL contraint déjà son type.',
    fichier: null,
  },
] as const;

/** La pile, telle que le README et package.json la déclarent. */
const PILE = [
  { couche: 'API', detail: 'NestJS 12, GraphQL (Apollo Server 4), TypeScript 6' },
  { couche: 'Base', detail: 'MongoDB 8 en replica set, Mongoose 9' },
  { couche: 'Tests', detail: 'vitest et supertest, contre un vrai MongoDB' },
  { couche: 'Authentification', detail: 'JWT, scrypt (bibliothèque standard de Node, RFC 7914)' },
  { couche: 'Interface', detail: 'Next.js 16, React 19, composants serveur par défaut' },
  { couche: 'Infrastructure', detail: 'Docker Compose, Redis 8' },
] as const;

export default function PageTechnique() {
  return (
    <div className={styles.page}>
      {/* ── L'ouverture et le sommaire ──────────────────────────────── */}
      <section className={styles.ouverture}>
        <p className={styles.surtitre}>Comment ce projet est construit</p>
        <h1 className={styles.titre}>
          La promesse tient parce qu&apos;elle est <em className={styles.appui}>mesurée</em>
        </h1>
        <div className={styles.chapeau}>
          <p>
            Cette application affiche des avis en promettant qu&apos;ils viennent de prestations
            réellement payées. Une promesse de ce genre se tient par la forme des données, pas
            par la bonne volonté du code.
          </p>
          <p>
            Ce qui suit dit comment, avec ce qui a été <strong>compté</strong> plutôt que
            supposé, et ce qui reste <strong>hors garantie</strong>.
          </p>
        </div>

        <nav aria-labelledby="titre-sommaire" className={styles.sommaire}>
          <h2 className={styles.titreSommaire} id="titre-sommaire">
            Ce qui est démontré
          </h2>
          <ol className={styles.listeSommaire}>
            {SOMMAIRE.map((entree, rang) => (
              <li key={entree.ancre}>
                <a className={styles.lienSommaire} href={`#${entree.ancre}`}>
                  <span aria-hidden="true" className={`nombre ${styles.rangSommaire}`}>
                    {rang + 1}
                  </span>
                  <span className={styles.texteSommaire}>
                    <strong className={styles.titreEntree}>{entree.titre}</strong>
                    <span className={styles.resumeEntree}>{entree.resume}</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </section>

      {/* ── 1. L'AVIS VÉRIFIÉ ───────────────────────────────────────── */}
      <section className={styles.section} id="avis-verifie">
        <p className={styles.etiquetteSection}>La contrainte centrale</p>
        <h2 className={styles.titreSection}>Garantir un avis vérifié sans clé étrangère</h2>
        <p className={styles.introSection}>
          Il faut pouvoir répondre à quelqu&apos;un qui demande comment on l&apos;empêche
          d&apos;inventer un avis. Dire « la base refuse » serait faux ici&nbsp;: ce projet ne le
          dit pas.
        </p>

        <div className={styles.paire}>
          <Carte balise="article" className={styles.volet} padding="lg">
            <h3 className={styles.titreVolet}>Ce que PostgreSQL ferait</h3>
            <p className={styles.texteVolet}>
              Une clé étrangère de l&apos;avis vers la réservation, et la base refuserait
              physiquement un avis dont la réservation n&apos;existe pas. Un déclencheur pourrait
              même refuser l&apos;insertion si la prestation n&apos;est pas terminée.
            </p>
          </Carte>

          <Carte balise="article" className={styles.volet} padding="lg">
            <h3 className={styles.titreVolet}>Ce que MongoDB n&apos;a pas</h3>
            <p className={styles.texteVolet}>
              Rien de tout cela. Pas de clé étrangère, pas de contrainte référentielle, pas de
              déclencheur. Le champ qui désigne la réservation fait{' '}
              <span className="nombre">12</span> octets, et la base ne sait pas qu&apos;il
              désigne autre chose.
            </p>
          </Carte>
        </div>

        <h3 className={styles.titreSousPartie}>Les trois mécanismes mis à la place</h3>
        <ol className={styles.mecanismes}>
          {MECANISMES.map((mecanisme) => (
            <Carte balise="li" className={styles.mecanisme} key={mecanisme.rang} padding="lg">
              <span aria-hidden="true" className={`nombre ${styles.rangMecanisme}`}>
                {mecanisme.rang}
              </span>
              <h4 className={styles.titreMecanisme}>{mecanisme.titre}</h4>
              <p className={styles.texteMecanisme}>{mecanisme.texte}</p>
              <p className={styles.consequence}>{mecanisme.consequence}</p>
            </Carte>
          ))}
        </ol>

        <figure className={styles.figure}>
          <figcaption className={styles.legendeCode}>
            Le dépôt du droit d&apos;avis&nbsp;: la lecture et l&apos;écriture sont la même
            commande.
          </figcaption>
          <pre className={styles.bloc}>
            <code>{CODE_JETON}</code>
          </pre>
          <p className={styles.noteFigure}>
            Un test de la valeur suivi d&apos;une écriture laisserait passer deux avis déposés
            dans la même milliseconde. Ici la condition est <em>dans le filtre</em>&nbsp;: la
            seconde écriture ne trouve plus de réservation à mettre à jour, et ce qu&apos;elle
            rend est un conflit, pas un avis de trop.
          </p>
        </figure>

        {/* La limite n'est pas une note de bas de page : c'est elle qui rend
            le reste croyable. D'où le rôle --or, que la charte charge aussi
            de l'attention — jamais --rouge, qui dirait « erreur ». */}
        <Carte balise="aside" className={styles.limite} padding="lg">
          <h3 className={styles.titreLimite}>Ce qui reste non garanti</h3>
          <p className={styles.texteLimite}>
            Quelqu&apos;un qui écrit <strong>directement dans la base</strong> — pas à travers
            l&apos;API — peut insérer un avis pointant vers une réservation inexistante. MongoDB
            l&apos;acceptera. En PostgreSQL, non. La contrainte est donc remplacée par un{' '}
            <strong>contrôle</strong>, pas par une garantie&nbsp;:
          </p>
          <pre className={styles.bloc}>
            <code>npm run verifier-integrite</code>
          </pre>
          <p className={styles.texteLimite}>
            Il recense les avis orphelins, les réservations sans devis, les devis sans artisan,
            et les notes moyennes qui ne correspondent plus aux avis. Il sort en erreur
            s&apos;il trouve quelque chose, ce qui permet de le brancher sur une tâche planifiée.
            C&apos;est strictement plus faible qu&apos;une contrainte, et un test le constate
            explicitement&nbsp;: il insère un avis orphelin, vérifie que MongoDB l&apos;accepte,
            puis vérifie que le contrôle le voit.
          </p>
          <p className={styles.source}>
            <code className={styles.enLigne}>api/test/avis-verifie.spec.ts</code>
          </p>
        </Carte>
      </section>

      {/* ── 2. LA CONFIDENTIALITÉ ───────────────────────────────────── */}
      <section className={styles.section} id="confidentialite">
        <p className={styles.etiquetteSection}>Un défaut trouvé en construisant les écrans</p>
        <h2 className={styles.titreSection}>
          La correction qui compte n&apos;est pas celle qu&apos;on croit
        </h2>
        <p className={styles.introSection}>
          Au moment de dresser l&apos;inventaire des pages, le schéma a révélé un trou&nbsp;: la
          lecture d&apos;un besoin par son identifiant était marquée <strong>publique</strong>.
          Elle rendait l&apos;adresse du chantier, et son demandeur résolvait un compte entier —
          e-mail et téléphone compris. Sans jeton. Le commentaire voisin promettait pourtant que
          l&apos;adresse n&apos;était visible que des artisans du secteur&nbsp;: le code disait
          l&apos;inverse de ce que le commentaire affirmait.
        </p>

        <div className={styles.paire}>
          <Carte balise="article" className={styles.volet} padding="lg">
            <h3 className={styles.titreVolet}>Exiger un compte</h3>
            <p className={styles.texteVolet}>
              Nécessaire, et très insuffisant. Un compte se crée en dix secondes, et aurait suffi
              à moissonner les coordonnées de tous les clients.
            </p>
          </Carte>

          <Carte
            balise="article"
            className={`${styles.volet} ${styles.voletRetenu}`}
            padding="lg"
          >
            <h3 className={styles.titreVolet}>Déplacer la donnée</h3>
            <p className={styles.texteVolet}>
              L&apos;adresse est désormais <strong>recopiée sur la réservation</strong> à
              l&apos;acceptation du devis, exactement comme le montant. L&apos;artisan retenu
              l&apos;a parce qu&apos;elle est chez lui&nbsp;; les autres ne l&apos;ont pas parce
              qu&apos;elle n&apos;y est pas.
            </p>
          </Carte>
        </div>

        <p className={styles.paragraphe}>
          L&apos;intérêt de ce détour n&apos;est pas d&apos;économiser une condition.
          C&apos;est qu&apos;il n&apos;y a plus de condition <em>à oublier</em>&nbsp;: un
          contrôle d&apos;habilitation sur le champ obligerait, pour chaque besoin affiché, à
          demander « existe-t-il une réservation dont l&apos;artisan est le lecteur&nbsp;? » —
          une question à reposer à chaque champ, à chaque écran, et qu&apos;un futur développeur
          peut omettre. La copie supprime la question. Accessoirement, c&apos;est aussi le modèle
          d&apos;affaires&nbsp;: les coordonnées n&apos;apparaissent qu&apos;avec la réservation,
          donc après que la commission est acquise.
        </p>

        <div className={styles.cadreTableau}>
          <table className={styles.tableau}>
            <caption className={styles.legendeTableau}>
              Ce que chaque lecteur obtient, selon où il regarde
            </caption>
            <thead>
              <tr>
                <th scope="col">Qui regarde</th>
                <th scope="col">Sur le besoin</th>
                <th scope="col">Sur sa réservation</th>
              </tr>
            </thead>
            <tbody>
              {LECTEURS.map((ligne) => (
                <tr className={ligne.retenu ? styles.ligneRetenue : undefined} key={ligne.qui}>
                  <th scope="row">{ligne.qui}</th>
                  <td>{ligne.besoin}</td>
                  <td>{ligne.reservation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className={styles.paragraphe}>
          Un champ absent n&apos;est donc pas une panne, c&apos;est un refus — et les écrans le
          disent ainsi&nbsp;: l&apos;adresse exacte sera communiquée à l&apos;artisan si son
          devis est retenu. Le nom d&apos;usage, « Fatima B. », est réduit{' '}
          <strong>côté serveur</strong>&nbsp;: une troncature faite à l&apos;affichage laisserait
          le patronyme entier traverser le réseau, où il se lit dans n&apos;importe quel outil de
          développement.
        </p>

        <Carte balise="aside" className={styles.encart} padding="lg">
          <p className={styles.texteEncart}>
            <span className="nombre">12</span> tests vérifient les <strong>deux sens</strong> de
            chaque règle&nbsp;: ce qui est refusé, et ce qui doit rester accessible. Un test qui
            ne vérifie que le refus laisse passer une correction trop large, qui casse le
            parcours.
          </p>
          <p className={styles.source}>
            <code className={styles.enLigne}>api/test/confidentialite.spec.ts</code>
          </p>
        </Carte>

        <p className={styles.paragraphe}>
          Trois lectures manquaient par ailleurs, et trois écrans étaient impossibles à écrire
          correctement sans elles&nbsp;: la fiche d&apos;un artisan ouverte hors recherche, le
          chantier rattaché à une réservation — pour que le client sache de quel chantier parle
          une ligne à <Montant centimes={45000} /> — et les devis d&apos;un artisan avec le
          chantier de chacun.
        </p>
      </section>

      {/* ── 3. LES MESURES ──────────────────────────────────────────── */}
      <section className={styles.section} id="mesures">
        <p className={styles.etiquetteSection}>Les preuves</p>
        <h2 className={styles.titreSection}>Les mesures, pas les affirmations</h2>
        <p className={styles.introSection}>
          Dire qu&apos;un chargeur groupé évite le N+1 ne prouve rien&nbsp;: c&apos;est sa
          documentation. Le test écoute l&apos;événement de début de commande du pilote et compte
          les commandes réellement envoyées pour une seule requête GraphQL.
        </p>

        <div className={styles.cadreTableau}>
          <table className={styles.tableau}>
            <caption className={styles.legendeTableau}>
              Commandes MongoDB pour une seule requête GraphQL
            </caption>
            <thead>
              <tr>
                <th scope="col">Cas</th>
                <th className={styles.colonneNombre} scope="col">
                  Commandes
                </th>
              </tr>
            </thead>
            <tbody>
              {COMMANDES.map((ligne) => (
                <tr key={ligne.cas}>
                  <th scope="row">{ligne.cas}</th>
                  <td className={styles.colonneNombre}>
                    <span
                      className={`nombre ${ligne.bon ? styles.chiffreBon : styles.chiffreMauvais}`}
                    >
                      {ligne.commandes}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className={styles.paragraphe}>
          La troisième ligne est écrite exprès. Le gain vient du regroupement{' '}
          <strong>dans le même tour de boucle d&apos;événements</strong>&nbsp;: avec une attente
          par élément, le chargeur est là et ne sert à rien. C&apos;est l&apos;erreur la plus
          facile à commettre et la plus silencieuse — rien ne casse, tout ralentit.
        </p>
        <p className={styles.paragraphe}>
          Un autre test demande les identifiants <strong>à rebours</strong> de l&apos;ordre où
          l&apos;index les rendra. Le chargeur associe les valeurs aux clés <em>par position</em>
          &nbsp;: rendre le résultat brut d&apos;une requête ensembliste attribuerait le nom de
          Fatima au devis de Karim, sans aucune erreur. Un test écrit avec deux documents insérés
          dans l&apos;ordre croissant ne le verrait jamais. Sur les écrans, le gain se mesure
          pareil&nbsp;: <span className="nombre">20</span> réservations avec leur chantier et
          leur client coûtent <span className={`nombre ${styles.chiffreBon}`}>3</span> commandes
          au lieu de <span className={`nombre ${styles.chiffreMauvais}`}>41</span>.
        </p>

        <h3 className={styles.titreSousPartie}>C&apos;est le plus loin qui doit sortir</h3>
        <p className={styles.paragraphe}>
          La question n&apos;est pas « quels artisans sont à moins de vingt-cinq kilomètres&nbsp;?
          » mais « quels artisans acceptent de venir <em>ici</em>&nbsp;? ». Le seuil change à
          chaque document, et l&apos;étage géographique de MongoDB ne sait filtrer que sur{' '}
          <strong>une</strong> distance maximale, la même pour tous. D&apos;où deux étages.
        </p>

        <div className={styles.cadreTableau}>
          <table className={styles.tableau}>
            <caption className={styles.legendeTableau}>
              Deux plombiers, un chantier à Marrakech
            </caption>
            <thead>
              <tr>
                <th scope="col">Artisan</th>
                <th className={styles.colonneNombre} scope="col">
                  Distance
                </th>
                <th className={styles.colonneNombre} scope="col">
                  Son rayon
                </th>
                <th scope="col">Retenu</th>
              </tr>
            </thead>
            <tbody>
              {RAYONS.map((ligne) => (
                <tr
                  className={ligne.retenu ? styles.ligneRetenue : undefined}
                  key={ligne.artisan}
                >
                  <th scope="row">{ligne.artisan}</th>
                  <td className={styles.colonneNombre}>
                    <span className="nombre">{ligne.distanceKm}</span> km
                  </td>
                  <td className={styles.colonneNombre}>
                    <span className="nombre">{ligne.rayonKm}</span> km
                  </td>
                  <td className={ligne.retenu ? styles.oui : styles.non}>
                    {ligne.retenu ? 'oui' : 'non'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <figure className={styles.figure}>
          <figcaption className={styles.legendeCode}>
            Le plafond global d&apos;abord, le rayon du document ensuite.
          </figcaption>
          <pre className={styles.bloc}>
            <code>{CODE_GEO}</code>
          </pre>
          <p className={styles.noteFigure}>
            Une distance maximale unique ne peut pas produire ce résultat&nbsp;: réglée à{' '}
            <span className="nombre">30</span> km elle garderait le mauvais, réglée à{' '}
            <span className="nombre">200</span> km elle garderait les deux. Le premier étage
            exige l&apos;index géographique et ne se dégrade pas en balayage complet&nbsp;: un
            test supprime l&apos;index et vérifie que la requête échoue avec un message
            explicite, plutôt que de ralentir en silence.
          </p>
        </figure>

        <h3 className={styles.titreSousPartie}>Deux avis simultanés, un seul passe</h3>
        <p className={styles.paragraphe}>
          Le test est <strong>déterministe</strong>, et ne « tente » pas de provoquer une
          collision en espérant avoir de la chance. Deux dépôts partent ensemble sur la même
          réservation&nbsp;: <span className={`nombre ${styles.chiffreBon}`}>1</span> réussit,{' '}
          <span className={`nombre ${styles.chiffreMauvais}`}>1</span> est refusé,{' '}
          <span className="nombre">1</span> seul avis existe en base, et la note de
          l&apos;artisan est celle de cet avis — pas une moyenne des deux, pas un compteur à{' '}
          <span className="nombre">2</span>.
        </p>
        <p className={styles.paragraphe}>
          MongoDB n&apos;a que trois manières de traiter deux écritures sur le même document, et
          les trois mènent au même résultat&nbsp;: elles se sérialisent et la seconde ne trouve
          plus le jeton libre&nbsp;; ou la seconde heurte l&apos;écriture non validée de la
          première, ce que MongoDB refuse immédiatement par un conflit{' '}
          <em>étiqueté transitoire</em> que le pilote rejoue&nbsp;; ou l&apos;index unique refuse
          l&apos;insertion.
        </p>

        <Carte balise="aside" className={styles.encart} padding="lg">
          <p className={styles.texteEncart}>
            C&apos;est une différence de fond avec PostgreSQL&nbsp;: là, la seconde transaction{' '}
            <strong>attend</strong> sur le verrou de ligne puis réévalue&nbsp;; en MongoDB elle{' '}
            <strong>échoue</strong> tout de suite, et c&apos;est le pilote qui rejoue. Le
            résultat observable est le même&nbsp;; le rejeu automatique est précisément ce qui
            fait tenir la comparaison-et-échange.
          </p>
        </Carte>

        <p className={styles.paragraphe}>
          L&apos;indivisibilité, enfin, est prouvée par l&apos;échec. Accepter un devis fait{' '}
          <span className="nombre">4</span> écritures&nbsp;: besoin attribué, devis accepté,
          concurrents refusés, réservation créée. Le test fait échouer la quatrième et vérifie
          que les trois premières sont annulées. Sans transaction, le besoin resterait attribué à
          un devis accepté qui ne donne droit à aucune prestation, et les concurrents resteraient
          refusés pour rien.
        </p>
      </section>

      {/* ── 4. LES PIÈGES ──────────────────────────────────────────── */}
      <section className={styles.section} id="pieges">
        <p className={styles.etiquetteSection}>Ce qui a coûté du temps</p>
        <h2 className={styles.titreSection}>Quatre pièges dont le message mentait</h2>
        <p className={styles.introSection}>
          Ils ont en commun que leur symptôme ne nomme jamais leur cause. C&apos;est pour cela
          qu&apos;ils sont documentés à l&apos;endroit du code qui les subit, et pas seulement
          corrigés.
        </p>

        <ul className={styles.pieges}>
          {PIEGES.map((piege) => (
            <Carte balise="li" className={styles.piege} key={piege.sujet} padding="lg">
              <h3 className={styles.titrePiege}>{piege.sujet}</h3>
              <p className={styles.textePiege}>{piege.texte}</p>
              {piege.fichier ? (
                <p className={styles.source}>
                  <code className={styles.enLigne}>api/test/{piege.fichier}</code>
                </p>
              ) : null}
            </Carte>
          ))}
        </ul>
      </section>

      {/* ── 5. LA PILE ET LE DÉPÔT ─────────────────────────────────── */}
      <section className={styles.section} id="pile">
        <p className={styles.etiquetteSection}>Pour finir</p>
        <h2 className={styles.titreSection}>La pile, et où lire le code</h2>

        <Carte className={styles.blocPile} padding="lg">
          <dl className={styles.pile}>
            {PILE.map((couche) => (
              <div className={styles.couche} key={couche.couche}>
                <dt className={styles.coucheCle}>{couche.couche}</dt>
                <dd className={styles.coucheValeur}>{couche.detail}</dd>
              </div>
            ))}
          </dl>

          <p className={styles.textePile}>
            <span className="nombre">74</span> tests tournent contre le MongoDB du
            docker-compose, chacun dans sa propre base. Pas de base simulée&nbsp;: la moitié de ce
            qui est testé n&apos;existe que dans un vrai serveur — transactions, index uniques
            partiels, recherche géographique. Une base simulée rendrait les tests verts sans rien
            prouver, ce qui est pire que pas de test.
          </p>

          <p className={styles.textePile}>
            Il manque le paiement&nbsp;: le passage au statut « payée » est déclenché par une
            mutation, alors qu&apos;en production il viendrait de la notification signée du
            prestataire. C&apos;est écrit dans la description de cette mutation plutôt que caché
            — une démonstration qui laisse croire que le client déclare lui-même ses paiements
            est une démonstration trompeuse.
          </p>

          <p className={styles.depot}>
            Le code, les tests et les décisions sont dans le dépôt&nbsp;:{' '}
            <a href={DEPOT} rel="noreferrer noopener" target="_blank">
              github.com/diffonathan
            </a>
          </p>
        </Carte>
      </section>
    </div>
  );
}
