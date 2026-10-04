/**
 * La page d'accueil.
 *
 * Elle a deux lecteurs qui ne cherchent pas la même chose : un particulier
 * qui veut faire venir un artisan, et quelqu'un qui évalue le projet. L'ordre
 * des sections sert le premier — le problème, le parcours, la garantie, les
 * deux portes d'entrée — et le second est servi en DERNIER, dans un bloc à
 * part. L'inverse (la pile technique en haut) ferait fuir le particulier pour
 * impressionner un lecteur qui, lui, lira jusqu'en bas de toute façon.
 *
 * ── L'enveloppe et la visite guidée ne sont PLUS montées ici ─────────────
 * Elles l'étaient, parce que cette page était la seule à exister. Le contrat
 * posé alors — « le jour où une deuxième route est écrite, ces deux lignes
 * DOIVENT remonter dans la disposition racine » — est tenu : elles sont dans
 * `app/layout.tsx`, et avec elles la résolution du compte de l'en-tête, qui
 * est passée dans `lib/entete.ts`.
 */
import { BoutonLien } from '@/components/Bouton';
import { Carte, CarteLien } from '@/components/Carte';
import { CHEMINS } from '@/components/chemins';
import { Etiquette } from '@/components/Etiquette';
import { Montant } from '@/components/Montant';
import { Note } from '@/components/Note';
import type { Role } from '@/lib/domaine';
import { lireSession } from '@/lib/session';
import styles from './page.module.css';

/**
 * La porte d'entrée du côté artisan.
 *
 * Elle pointait sur `/artisan`, une page « qui explique le côté artisan et qui
 * mènera au formulaire » — personne ne l'a écrite, et le lien rendait donc un
 * 404 depuis l'accueil. Pire : `/artisan/[id]` existe désormais, donc `/artisan`
 * est un segment de route réel dont aucune page ne répond.
 *
 * Elle mène au formulaire d'inscription, qui explique lui-même le rayon et les
 * métiers. Une page intermédiaire qui existe vaudra mieux qu'un 404 ; en
 * attendant, c'est le formulaire qui reçoit.
 */
const CHEMIN_COTE_ARTISAN = CHEMINS.inscriptionArtisan;

/**
 * Le dépôt. Pointe sur le profil et non sur un chemin de dépôt deviné : un
 * lien mort dans le bloc destiné au lecteur technique coûte plus cher que
 * l'imprécision d'un lien qui, lui, répond.
 */
const DEPOT = 'https://github.com/diffonathan';

/** Un devis fictif, pour montrer ce que « figé » et « refusé » veulent dire. */
const DEVIS_DEMONSTRATION = [
  { artisan: 'Plomberie Karim', centimes: 45000, statut: 'ACCEPTE' },
  { artisan: 'Sanitaires Atlas', centimes: 62000, statut: 'REFUSE' },
] as const;

/**
 * Où reprendre, selon le rôle — ou nulle part.
 *
 * ADMIN ne suit PAS le client, contrairement à ce que faisait la première
 * version. Les opérations du client sont annotées `@Roles(Role.CLIENT)` dans
 * l'API : un administrateur qui cliquait sur « Voir mes chantiers » se faisait
 * refuser par le proxy, et l'aurait été par l'API s'il était passé. On
 * proposait une action impossible, et le refus arrivait après le clic.
 *
 * Il n'y a pas d'écran d'administration dans ce projet. Le plus honnête est
 * donc de ne rien proposer à ce rôle plutôt que de le router vers un espace
 * qui n'est pas le sien : il voit la page publique, comme un visiteur.
 */
function repriseDuRole(role: Role): { chemin: string; libelle: string; phrase: string } | null {
  if (role === 'ADMIN') return null;

  if (role === 'ARTISAN') {
    return {
      chemin: CHEMINS.chantiers,
      libelle: 'Voir les chantiers à chiffrer',
      phrase: 'Les chantiers ouverts dans votre rayon vous attendent.',
    };
  }
  return {
    chemin: CHEMINS.mesBesoins,
    libelle: 'Voir mes chantiers',
    phrase: 'Vos chantiers et les devis reçus sont dans votre espace.',
  };
}

export default async function PageAccueil() {
  /*
   * Le rôle vient du COOKIE et non de la requête `moi`, qui est désormais
   * faite une seule fois par la disposition racine.
   *
   * Ce que ça change, et c'est borné : un jeton révoqué mais non expiré
   * laisserait le bloc « reprendre » visible alors que l'en-tête serait
   * retombé en visiteur. L'écart dure jusqu'au premier clic, qui mène à une
   * page privée dont l'API refuse la requête — et cette page-là, elle, le dit.
   * Refaire la requête ici pour fermer ce cas coûterait un aller-retour sur
   * la page la plus visitée du site.
   */
  const session = await lireSession();
  const reprise = session ? repriseDuRole(session.role) : null;

  return (
    <div className={styles.accueil}>
      {/* ── 1. Le problème, avant toute solution ─────────────────────── */}
      <section className={styles.ouverture}>
        <p className={styles.surtitre}>Particuliers et artisans du bâtiment, au Maroc</p>
        <h1 className={styles.titre}>
          Trouver un artisan qui accepte de venir <em className={styles.chezVous}>chez vous</em>
        </h1>
        <div className={styles.probleme}>
          <p>
            Pour faire venir un plombier chez soi, on appelle un numéro recopié sur un bout de
            papier, puis un deuxième, puis un troisième.
          </p>
          <p>
            On ne sait pas lequel se déplacera jusqu&apos;à son adresse, et on ne sait pas
            combien il demandera avant d&apos;avoir raccroché.
          </p>
          <p>
            Quant aux étoiles affichées ailleurs, elles ne disent jamais d&apos;où elles
            viennent.
          </p>
        </div>
      </section>

      {/* La reprise du parcours passe avant l'argumentaire : quelqu'un de
          connecté ne revient pas sur l'accueil pour relire la promesse. */}
      {reprise ? (
        <Carte className={styles.reprise} padding="md">
          <p className={styles.reprisePhrase}>{reprise.phrase}</p>
          <BoutonLien variante="secondaire" taille="sm" href={reprise.chemin}>
            {reprise.libelle}
          </BoutonLien>
        </Carte>
      ) : null}

      {/* ── 2. Le parcours, en quatre fois ───────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.titreSection}>Ce qui se passe, en quatre fois</h2>
        <p className={styles.chapeau}>
          Vous écrivez votre chantier une fois. Tout le reste vient à vous.
        </p>

        <ol className={styles.etapes}>
          <Carte balise="li" className={styles.etape}>
            <span className={`nombre ${styles.rang}`}>1</span>
            <h3 className={styles.titreEtape}>Le besoin</h3>
            <p className={styles.texteEtape}>
              Le métier, une description, l&apos;adresse du chantier, un budget si vous en avez
              un. Il part vers les artisans de ce métier dont la zone d&apos;intervention couvre
              votre adresse — et vers eux seuls.
            </p>
            <Etiquette statut="OUVERT" />
          </Carte>

          <Carte balise="li" className={styles.etape}>
            <span className={`nombre ${styles.rang}`}>2</span>
            <h3 className={styles.titreEtape}>Les devis</h3>
            <p className={styles.texteEtape}>
              Ceux que le chantier intéresse répondent par un montant, un délai et un mot sur ce
              qu&apos;ils comptent faire. Chacun n&apos;a qu&apos;un devis vivant chez vous : la
              liste que vous lisez est bien la liste de vos options.
            </p>
            <Etiquette statut="ENVOYE" />
          </Carte>

          <Carte balise="li" className={styles.etape}>
            <span className={`nombre ${styles.rang}`}>3</span>
            <h3 className={styles.titreEtape}>La réservation</h3>
            <p className={styles.texteEtape}>
              Vous en acceptez un. Les autres passent à « refusé » sans que vous ayez à les
              décliner, et le montant est recopié sur la réservation : si l&apos;artisan modifie
              son devis ensuite, votre réservation ne change pas.
            </p>

            <ul className={styles.comparatif}>
              {DEVIS_DEMONSTRATION.map((devis) => (
                <li className={styles.ligneComparatif} key={devis.artisan}>
                  <span className={styles.nomComparatif}>{devis.artisan}</span>
                  <Montant centimes={devis.centimes} />
                  <Etiquette statut={devis.statut} dense />
                </li>
              ))}
            </ul>
          </Carte>

          <Carte balise="li" className={styles.etape}>
            <span className={`nombre ${styles.rang}`}>4</span>
            <h3 className={styles.titreEtape}>L&apos;avis</h3>
            <p className={styles.texteEtape}>
              Une fois la prestation payée et déclarée terminée par l&apos;artisan, vous pouvez
              le noter. Une seule fois, et c&apos;est ce qui donne sa valeur à la note affichée
              sur sa fiche.
            </p>
            <Etiquette statut="TERMINEE" />
          </Carte>
        </ol>
      </section>

      {/* ── 3. Ce qui rend les avis vérifiables ──────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.titreSection}>Pourquoi ces étoiles-là veulent dire quelque chose</h2>

        <Carte className={styles.garantie} padding="lg">
          <div className={styles.garantieNote}>
            <Note note={5} nombreAvis={12} taille="grand" />
            <p className={styles.garantieLegende}>
              La note d&apos;un artisan est recalculée à partir de ses avis, au moment même où un
              avis la change. Elle ne peut pas s&apos;écarter de ce que vous lisez juste en
              dessous.
            </p>
          </div>

          <ul className={styles.points}>
            <li className={styles.point}>
              <strong>Un avis n&apos;existe que si la prestation a été payée</strong>, puis
              déclarée terminée par l&apos;artisan. Avant cela, personne ne peut en écrire.
            </li>
            <li className={styles.point}>
              <strong>Il n&apos;y a aucun formulaire d&apos;avis ouvert.</strong> Le droit de
              noter naît de la réservation, appartient au client de cette réservation, et ne
              sert qu&apos;une fois.
            </li>
            <li className={styles.point}>
              <strong>On ne peut pas noter un artisan chez qui on n&apos;a rien fait faire.</strong>{' '}
              C&apos;est la seule raison pour laquelle un 5 sur 5 signifie ici autre chose
              qu&apos;ailleurs.
            </li>
          </ul>
        </Carte>
      </section>

      {/* ── 4. Les deux entrées ──────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.titreSection}>De quel côté êtes-vous&nbsp;?</h2>

        <div className={styles.entrees}>
          {/* CarteLien : toute la surface est le lien, donc rien de
              cliquable à l'intérieur — pas de bouton imbriqué. */}
          <CarteLien className={styles.entree} href={CHEMINS.recherche} padding="lg">
            <h3 className={styles.titreEntree}>Je cherche un artisan</h3>
            <p className={styles.texteEntree}>
              Huit métiers, de la plomberie à la menuiserie. La recherche ne vous montre que
              ceux qui acceptent de se déplacer jusqu&apos;à votre adresse, classés par note
              puis par distance.
            </p>
            <span className={styles.appel} aria-hidden="true">
              Chercher près de chez moi →
            </span>
          </CarteLien>

          <CarteLien className={styles.entree} href={CHEMIN_COTE_ARTISAN} padding="lg">
            <h3 className={styles.titreEntree}>Je suis artisan</h3>
            <p className={styles.texteEntree}>
              Vous déclarez vos métiers, votre point d&apos;attache et le rayon que vous
              acceptez. Vous ne voyez que les chantiers qui tombent dedans, et vous chiffrez ce
              qui vous intéresse.
            </p>
            <span className={styles.appel} aria-hidden="true">
              Voir comment ça marche →
            </span>
          </CarteLien>
        </div>
      </section>

      {/* ── 5. Pour le lecteur technique ─────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.titreSection}>Sous le capot</h2>
        <p className={styles.chapeau}>
          Ce site est un projet de démonstration. Les personnes sont inventées, les villes et
          les distances sont réelles.
        </p>

        <Carte className={styles.technique} padding="lg">
          <dl className={styles.faits}>
            <div className={styles.fait}>
              <dt className={styles.faitCle}>API</dt>
              <dd className={styles.faitValeur}>
                NestJS, GraphQL (Apollo Server), MongoDB en replica set — les transactions
                multi-documents l&apos;exigent.
              </dd>
            </div>
            <div className={styles.fait}>
              <dt className={styles.faitCle}>Interface</dt>
              <dd className={styles.faitValeur}>
                Next.js <span className="nombre">16</span> (App Router, Turbopack), React{' '}
                <span className="nombre">19</span>, composants serveur par défaut.
              </dd>
            </div>
            <div className={styles.fait}>
              <dt className={styles.faitCle}>Tests</dt>
              <dd className={styles.faitValeur}>
                {/* 74 et non 62 : le comptage réel des `it(` dans `api/test/`
                    donne 74 (9+10+12+7+15+7+8+6). /technique affichait déjà 74,
                    l'accueil 62, et les deux pages se contredisaient. */}
                <span className="nombre">74</span> tests contre un vrai serveur MongoDB. Aucune
                base simulée : transactions, index uniques partiels et recherche géographique
                n&apos;existent pas ailleurs.
              </dd>
            </div>
            <div className={styles.fait}>
              <dt className={styles.faitCle}>Le droit d&apos;avis</dt>
              <dd className={styles.faitValeur}>
                Un jeton sur la réservation, consommé par comparaison-et-échange dans une
                transaction, doublé d&apos;un index unique. Deux dépôts simultanés&nbsp;: exactement{' '}
                <span className="nombre">1</span> passe, et c&apos;est mesuré.
              </dd>
            </div>
            <div className={styles.fait}>
              <dt className={styles.faitCle}>La recherche</dt>
              <dd className={styles.faitValeur}>
                Le seuil de distance appartient à chaque artisan, pas à la requête.{' '}
                <code className={styles.code}>$geoNear</code> n&apos;en sait filtrer
                qu&apos;un&nbsp;: d&apos;où un second étage qui compare la distance calculée au
                rayon du document.
              </dd>
            </div>
            <div className={styles.fait}>
              <dt className={styles.faitCle}>Ce qui manque</dt>
              <dd className={styles.faitValeur}>
                Le passage au statut « payée » est déclenché par une mutation. En production il
                viendrait de la notification signée du prestataire de paiement&nbsp;: c&apos;est
                écrit dans le schéma plutôt que caché.
              </dd>
            </div>
          </dl>

          <p className={styles.depot}>
            Le code, les tests et les décisions sont documentés dans le dépôt&nbsp;:{' '}
            <a href={DEPOT} rel="noreferrer noopener" target="_blank">
              github.com/diffonathan
            </a>
          </p>
        </Carte>
      </section>
    </div>
  );
}
