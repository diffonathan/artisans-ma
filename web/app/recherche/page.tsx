/* ══════════════════════════════════════════════════════════════════════════
   /recherche — TROUVER UN ARTISAN QUI ACCEPTE DE VENIR

   Page PUBLIQUE : aucun compte n'est demandé, et la requête part donc par
   `appelerGraphQL` (anonyme) et non par `appelerGraphQLAvecSession`.
   `rechercherArtisans` est marquée `@Public()` dans
   `api/src/domaine/artisans/artisans.resolver.ts` : joindre un jeton ne
   changerait rien au résultat, et obligerait à en avoir un.

   ── Ce que cette page doit DIRE, et pas seulement faire ────────────────────

   Le produit ne répond pas à « quels artisans sont près de moi ? » mais à
   « lesquels acceptent de venir ici ? ». Les deux listes ne se ressemblent
   pas : un peintre d'Essaouira à 170 km sort, le menuisier de Tahannaout à
   30 km ne sort pas, parce que le second a déclaré un rayon de 10 km. Sans
   une phrase qui l'explique, la liste a l'air cassée. Elle est donc écrite en
   haut de l'écran, avant les résultats.

   ── La session, sur une page publique ──────────────────────────────────────

   L'en-tête doit savoir si quelqu'un est connecté, donc cette page lit le
   cookie, donc elle est rendue à la requête. Elle l'était déjà :
   `searchParams` est une API de requête en Next 16 et suffit à elle seule à
   écarter tout prérendu
   (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`).
   La session ne coûte donc rien de plus ici.

   ── Chargement, vide, erreur ───────────────────────────────────────────────

   Les trois sont dans ce fichier, et pas dans un `loading.tsx` : un
   `loading.tsx` remplace TOUTE la page, filtres compris, et on perdrait les
   critères qu'on vient de poser le temps de la requête. Une frontière
   <Suspense> autour des seuls résultats les laisse à l'écran.

   L'erreur est attrapée ici plutôt que laissée filer vers `app/error.tsx`,
   pour la même raison : une API éteinte ne doit pas effacer le formulaire.
   ══════════════════════════════════════════════════════════════════════════ */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';

import { Carte, CarteLien } from '@/components/Carte';
import { Squelette } from '@/components/Squelette';
import { Distance } from '@/components/Distance';
import { Note } from '@/components/Note';
import { CHEMINS, CHEMINS_AVEC_ID } from '@/components/chemins';
import { estApiInjoignable, phraseDErreur } from '@/lib/erreurs';
import { appelerGraphQL } from '@/lib/graphql';
import type { Metier } from '@/lib/domaine';

import { LIBELLES_METIER } from '@/lib/metiers';

import { Filtres } from './Filtres';
import {
  PLAFOND_RECHERCHE_KM,
  estInterrogeable,
  libellePosition,
  lireCriteres,
  positionCherchee,
  type Criteres,
} from './criteres';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Trouver un artisan',
  description:
    "Les artisans qui acceptent de se déplacer jusqu'à l'adresse de votre chantier, " +
    'selon le rayon que chacun déclare. Huit métiers du bâtiment, au Maroc.',
};

/* ── La requête, recopiée de api/schema.graphql ──────────────────────────── */

/**
 * `titulaire` n'est PAS demandé, et ce n'est pas un oubli.
 *
 * Le champ rend un `Compte` entier — adresse électronique et téléphone
 * compris. Sur un écran public, le demander ferait traverser le réseau aux
 * coordonnées de six artisans pour afficher une liste de cartes. Rien ici n'en
 * a besoin : la raison sociale est sur le profil artisan.
 */
const REQUETE_RECHERCHE = `
  query RechercherArtisans($entree: EntreeRecherche!) {
    rechercherArtisans(entree: $entree) {
      _id
      raisonSociale
      metiers
      ville
      noteMoyenne
      nombreAvis
      distanceMetres
      rayonKm
      verifie
    }
  }
`;

interface ArtisanTrouve {
  _id: string;
  raisonSociale: string;
  metiers: Metier[];
  ville: string;
  noteMoyenne: number;
  nombreAvis: number;
  distanceMetres: number | null;
  rayonKm: number;
  verifie: boolean;
}

/**
 * Le plafond de la page.
 *
 * L'API accepte jusqu'à 100 et pagine par curseur (`apres`). La pagination
 * n'est pas câblée ici : le service lui-même note que son curseur sur `_id`
 * ne départage qu'imparfaitement un tri par note puis distance. Vingt
 * résultats affichés, et une phrase qui le dit, valent mieux qu'une page
 * suivante qui peut répéter ou sauter un artisan.
 */
const LIMITE = 20;

/* ── L'en-tête du compte, pour l'enveloppe ───────────────────────────────── */

/* ── Les morceaux d'écran ────────────────────────────────────────────────── */

/** Le badge « vérifié », rôle « valeur » de la charte, donc en or. */
function BadgeVerifie(): ReactNode {
  return (
    <span className={styles.verifie}>
      <svg className={styles.pictoVerifie} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path
          d="M3.5 8.4l2.9 2.9 6.1-6.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Vérifié
    </span>
  );
}

/** L'écran avant toute recherche : il dit ce qui manque, et rien d'autre. */
function Invitation({ criteres }: { criteres: Criteres }): ReactNode {
  const manques: string[] = [];
  if (!criteres.metier) manques.push('le métier dont vous avez besoin');
  if (!positionCherchee(criteres)) manques.push('la ville du chantier, ou votre position');

  return (
    <Carte className={styles.etat} padding="lg">
      <h2 className={styles.etatTitre}>Dites ce que vous cherchez, et où</h2>
      <p className={styles.etatTexte}>
        Il manque {manques.join(' et ')}. La recherche part de l&apos;adresse du chantier, parce que
        c&apos;est elle qui décide quels artisans acceptent de venir.
      </p>
    </Carte>
  );
}

/** La liste vide : ce qu'il faut faire, pas « aucun résultat ». */
function Vide({ criteres }: { criteres: Criteres }): ReactNode {
  const lieu = libellePosition(criteres);
  const metier = criteres.metier ? LIBELLES_METIER[criteres.metier].toLowerCase() : 'ce métier';

  return (
    <Carte className={styles.etat} padding="lg">
      <h2 className={styles.etatTitre}>
        Personne en {metier} n&apos;accepte de venir {lieu === 'votre position' ? 'ici' : `à ${lieu}`}
      </h2>
      <p className={styles.etatTexte}>
        Ce n&apos;est pas qu&apos;il n&apos;y a pas d&apos;artisan de ce métier&nbsp;: c&apos;est
        qu&apos;aucun de ceux qui en font n&apos;a déclaré un rayon qui atteint cet endroit. Ce
        qu&apos;il reste à essayer&nbsp;:
      </p>
      <ul className={styles.etatListe}>
        {criteres.verifieSeulement ? (
          <li>
            Retirer «&nbsp;artisans vérifiés seulement&nbsp;». Le contrôle des pièces est en cours
            pour une partie des inscrits.
          </li>
        ) : null}
        {criteres.noteMinimale !== null ? (
          <li>
            Abaisser la note minimale, ou la retirer. Un artisan sans avis n&apos;a pas de note, et
            un filtre sur la note l&apos;écarte.
          </li>
        ) : null}
        <li>Choisir une ville voisine, plus grande&nbsp;: les rayons déclarés y sont plus longs.</li>
        <li>
          Essayer un métier proche&nbsp;: une installation sanitaire se trouve en plomberie, un
          faux plafond en maçonnerie.
        </li>
      </ul>
      <p className={styles.etatRemarque}>
        Au-delà de <span className="nombre">{PLAFOND_RECHERCHE_KM}</span>&nbsp;km, la recherche ne
        rend plus rien, quel que soit le rayon déclaré.
      </p>
    </Carte>
  );
}

/** La panne : la phrase de l'API, et ce qu'on peut en faire. */
function Panne({ erreur }: { erreur: unknown }): ReactNode {
  return (
    <Carte className={`${styles.etat} ${styles.etatPanne}`} padding="lg">
      <h2 className={styles.etatTitre}>La recherche n&apos;a pas abouti</h2>
      {/* Le message vient de l'API quand elle en a écrit un : elle rédige ses
          refus en français, et les réécrire ici produirait deux vérités. */}
      <p className={styles.etatTexte}>{phraseDErreur(erreur)}</p>
      {estApiInjoignable(erreur) ? (
        <p className={styles.etatRemarque}>
          Vos critères sont conservés dans l&apos;adresse de cette page&nbsp;: recharger suffira
          quand le service répondra.
        </p>
      ) : null}
    </Carte>
  );
}

/** Une carte de résultat. Toute la surface est le lien vers la fiche. */
function Resultat({ artisan }: { artisan: ArtisanTrouve }): ReactNode {
  return (
    <li className={styles.element}>
      {/* CarteLien : rien de cliquable à l'intérieur, un bouton imbriqué dans
          une ancre serait invalide. D'où des métiers en simple texte. */}
      <CarteLien className={styles.resultat} href={CHEMINS_AVEC_ID.ficheArtisan(artisan._id)}>
        <div className={styles.resultatTete}>
          {/* `h2` et non `h3` : le seul titre au-dessus est le `h1` de la
              page, et sauter un niveau fait lire la liste comme imbriquée
              dans une section qui n'existe pas. */}
          <h2 className={styles.raisonSociale}>{artisan.raisonSociale}</h2>
          {artisan.verifie ? <BadgeVerifie /> : null}
        </div>

        <Note note={artisan.noteMoyenne} nombreAvis={artisan.nombreAvis} />

        <p className={styles.metiers}>
          {artisan.metiers.map((metier) => LIBELLES_METIER[metier]).join(' · ')}
        </p>

        <p className={styles.lieu}>
          {artisan.ville}
          {artisan.distanceMetres !== null ? (
            <>
              {' — '}
              <Distance metres={artisan.distanceMetres} />
            </>
          ) : null}
          {', se déplace jusqu’à '}
          <span className="nombre">{artisan.rayonKm}</span>
          &#x202f;km
        </p>
      </CarteLien>
    </li>
  );
}

/* ── Les résultats ───────────────────────────────────────────────────────── */

/**
 * Le seul composant qui attend le réseau, donc le seul sous <Suspense>.
 *
 * Il attrape ses erreurs au lieu de les laisser remonter : voir l'en-tête du
 * fichier.
 */
async function Resultats({ criteres }: { criteres: Criteres }): Promise<ReactNode> {
  const position = positionCherchee(criteres);
  // Le garde est pour TypeScript : la page ne monte ce composant que si
  // `estInterrogeable` l'autorise, mais rien dans le type ne le dit.
  if (!criteres.metier || !position) return <Invitation criteres={criteres} />;

  let artisans: ArtisanTrouve[];
  try {
    const reponse = await appelerGraphQL<{ rechercherArtisans: ArtisanTrouve[] }>(
      REQUETE_RECHERCHE,
      {
        variables: {
          entree: {
            metier: criteres.metier,
            latitude: position.latitude,
            longitude: position.longitude,
            verifieSeulement: criteres.verifieSeulement,
            // Omis — et non `null` — quand il n'y a pas de seuil : le champ est
            // `@IsOptional()` côté API, et `JSON.stringify` retire `undefined`.
            noteMinimale: criteres.noteMinimale ?? undefined,
            limite: LIMITE,
          },
        },
      },
    );
    artisans = reponse.rechercherArtisans;
  } catch (erreur) {
    return <Panne erreur={erreur} />;
  }

  if (artisans.length === 0) return <Vide criteres={criteres} />;

  const lieu = libellePosition(criteres);

  return (
    <section className={styles.resultats} aria-label="Artisans trouvés">
      <p className={styles.compte}>
        <span className="nombre">{artisans.length}</span>
        {artisans.length === 1 ? ' artisan accepte' : ' artisans acceptent'} de venir{' '}
        {lieu === 'votre position' ? 'à votre position' : `à ${lieu}`}, classés par note puis par
        distance.
      </p>

      <ul className={styles.liste}>
        {artisans.map((artisan) => (
          <Resultat artisan={artisan} key={artisan._id} />
        ))}
      </ul>

      {artisans.length === LIMITE ? (
        <p className={styles.etatRemarque}>
          Les <span className="nombre">{LIMITE}</span> premiers seulement. Resserrez les critères —
          une note minimale, les artisans vérifiés — pour voir les autres.
        </p>
      ) : null}
    </section>
  );
}

/* ── La page ─────────────────────────────────────────────────────────────── */

/**
 * Une empreinte des critères, pour remonter les filtres et redémarrer la
 * frontière <Suspense> à chaque nouvelle recherche.
 *
 * Sans elle, React réutiliserait l'instance précédente : les listes
 * garderaient la valeur de l'URL d'avant après un retour en arrière, et le
 * squelette ne réapparaîtrait pas entre deux recherches.
 */
function empreinte(criteres: Criteres): string {
  const position = positionCherchee(criteres);
  return [
    criteres.metier ?? '',
    criteres.ville?.slug ?? '',
    position ? `${position.latitude},${position.longitude}` : '',
    criteres.verifieSeulement ? 'v' : '',
    criteres.noteMinimale ?? '',
  ].join('|');
}

export default async function PageRecherche(props: PageProps<'/recherche'>): Promise<ReactNode> {
  // `searchParams` est une promesse en Next 16 : l'accès synchrone est
  // supprimé, pas déprécié.
  const parametres = await props.searchParams;
  const criteres = lireCriteres(parametres);

  const cle = empreinte(criteres);

  return (
    <div className={styles.page}>
      <section className={styles.ouverture}>
        <h1 className={styles.titre}>Trouver un artisan</h1>

        {/* LA phrase du produit. Sans elle, un résultat à 170 km passe pour
            un défaut et un voisin à 30 km absent passe pour un oubli. */}
        <Carte className={styles.regle} padding="md">
          <p>
            Les artisans affichés sont ceux qui <strong>acceptent de venir à l&apos;adresse
            demandée</strong>, selon le rayon que chacun déclare — et non les plus proches de
            vous.
          </p>
          <p className={styles.regleExemple}>
            Un peintre d&apos;Essaouira qui se déplace à{' '}
            <span className="nombre">200</span>&#x202f;km apparaît pour un chantier à Marrakech,
            à <span className="nombre">170</span>&#x202f;km de chez lui. Un menuisier de
            Tahannaout, à <span className="nombre">30</span>&#x202f;km du même chantier,
            n&apos;apparaît pas&nbsp;: son rayon s&apos;arrête à{' '}
            <span className="nombre">10</span>&#x202f;km.
          </p>
        </Carte>
      </section>

      {/* `Filtres` est un composant CLIENT : une clé le remonte proprement
          quand les critères changent, et c'est ce qu'on veut pour que ses
          listes ne gardent pas la valeur de l'URL précédente après un retour
          en arrière. Elle est préfixée parce que deux frères du même parent ne
          peuvent pas partager une clé — React avertit, et précise que les
          enfants peuvent alors être dupliqués ou omis. */}
      <Filtres criteres={criteres} key={`filtres:${cle}`} />

      {/* ══ PAS DE `key` SUR CETTE FRONTIÈRE ════════════════════════════════

          Elle en portait une, pour « redémarrer le squelette entre deux
          recherches ». Deux raisons de l'avoir retirée.

          D'abord elle était INUTILE : chaque recherche change l'URL, donc le
          serveur re-rend la page et la frontière repart avec elle. Une clé ne
          servait qu'à remonter ce qui était déjà neuf.

          Ensuite elle était RISQUÉE : `<Resultats>` est un composant serveur,
          son rendu arrive dans la charge RSC de la réponse. Une clé demande à
          React de remonter la frontière côté client, où il n'existe aucune
          charge RSC pour cette nouvelle identité — et il ne peut pas en
          fabriquer une.

          Honnêteté sur ce qu'on sait : ce retrait n'a corrigé AUCUN symptôme
          observé — il n'y en avait pas. La page a longtemps paru bloquée sur
          son squelette pendant la vérification, et la cause n'était pas dans
          ce fichier : le volet d'aperçu ne peignait pas, donc le script `$RC`
          que React émet pour échanger le repli contre le contenu ne
          s'appliquait jamais. Le flux serveur était correct depuis le début,
          et l'affichage l'est aussi une fois la fenêtre au premier plan.

          La leçon vaut d'être écrite : un rendu qui reste sur son repli SANS
          la moindre erreur de console, avec le contenu déjà présent dans un
          div caché, accuse l'outil d'observation avant d'accuser le code. */}
      {estInterrogeable(criteres) ? (
        <Suspense
          fallback={
            <Squelette
              cartes={3}
              lignes={3}
              disposition="grille"
              annonce="Recherche des artisans en cours…"
            />
          }
        >
          <Resultats criteres={criteres} />
        </Suspense>
      ) : (
        <Invitation criteres={criteres} />
      )}

      <p className={styles.appui}>
        Vous ne savez pas qui appeler&nbsp;? Décrivez le chantier une fois, et laissez les
        artisans du secteur chiffrer. <Link href={CHEMINS.publierBesoin}>Publier un besoin</Link>
      </p>
    </div>
  );
}
