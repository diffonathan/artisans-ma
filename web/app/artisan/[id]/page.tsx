/* ══════════════════════════════════════════════════════════════════════════
   /artisan/[id] — LA FICHE PUBLIQUE D'UN ARTISAN

   Page PUBLIQUE : `artisan(id)` et `avisDArtisan(artisan)` sont toutes deux
   marquées `@Public()` côté API. La requête part donc anonyme, par
   `appelerGraphQL`.

   ── Un lien partagé ne doit jamais mourir ──────────────────────────────────

   `actif: false` veut dire « ne plus apparaître dans les résultats », pas
   « n'a jamais existé » : l'API rend la fiche quand même, et le dit dans
   `artisans.service.ts`. Cet écran reste donc entièrement lisible, et ajoute
   une ligne qui prévient qu'il ne prend pas de nouveaux chantiers. Un 404
   aurait fait mentir tous les liens déjà envoyés.

   ── Zéro avis n'est pas zéro sur cinq ──────────────────────────────────────

   L'API rend `noteMoyenne: 0` quand il n'y a aucun avis. Afficher « 0,0 »
   accuserait un artisan qui n'a pas encore travaillé par ici. Le composant
   `Note` du socle traite déjà ce cas ; l'écran complète par une phrase qui
   dit ce qu'il faut en conclure, c'est-à-dire rien.

   ── Une seule lecture pour deux consommateurs ──────────────────────────────

   `generateMetadata` et la page ont besoin des mêmes données. Le client
   GraphQL du socle pose `cache: 'no-store'`, donc rien n'est mémoïsé pour
   lui : sans précaution, chaque affichage ferait deux fois la même requête.
   `cache()` de React mémoïse l'appel pour la durée d'UNE requête entrante,
   ce qui est exactement la portée voulue.
   ══════════════════════════════════════════════════════════════════════════ */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import type { ReactNode } from 'react';

import { BoutonLien } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { Note } from '@/components/Note';
import { CHEMINS } from '@/components/chemins';
import { formaterDate } from '@/lib/dates';
import type { Metier } from '@/lib/domaine';
import { estApiInjoignable, phraseDErreur } from '@/lib/erreurs';
import { appelerGraphQL } from '@/lib/graphql';
import { LIBELLES_METIER } from '@/lib/metiers';

import { estIdentifiantMongo } from './fiche';
import styles from './page.module.css';

/* ── La requête, recopiée de api/schema.graphql ──────────────────────────── */

/**
 * Les deux lectures dans UN document GraphQL : un seul aller-retour réseau.
 *
 * `Artisan.titulaire` n'est pas demandé — il rend un `Compte` entier, avec
 * l'adresse électronique et le téléphone de l'artisan, et cette page est
 * publique.
 *
 * `Avis` ne porte plus de champ `auteur` du tout. Il en portait un, et c'était
 * une fuite : cette requête étant publique, il suffisait de demander
 * `auteur { email telephone }` pour moissonner les coordonnées de tous les
 * clients ayant laissé un avis. L'API rend désormais `nomAuteur`, déjà réduit
 * à « Fatima B. » côté serveur — la confidentialité ne dépend donc plus de la
 * discipline de celui qui écrit la requête.
 */
const REQUETE_FICHE = `
  query FicheArtisan($id: ID!) {
    artisan(id: $id) {
      _id
      raisonSociale
      metiers
      ville
      rayonKm
      noteMoyenne
      nombreAvis
      verifie
      actif
    }
    avisDArtisan(artisan: $id) {
      _id
      note
      commentaire
      createdAt
      nomAuteur
    }
  }
`;

interface ArtisanFiche {
  _id: string;
  raisonSociale: string;
  metiers: Metier[];
  ville: string;
  rayonKm: number;
  noteMoyenne: number;
  nombreAvis: number;
  verifie: boolean;
  actif: boolean;
}

interface AvisAffiche {
  _id: string;
  note: number;
  commentaire: string;
  createdAt: string;
  /** Prénom et initiale, réduits par l'API. Les coordonnées n'y sont plus. */
  nomAuteur: string;
}

interface Fiche {
  artisan: ArtisanFiche;
  avis: AvisAffiche[];
}

/**
 * La lecture, mémoïsée pour la requête en cours.
 *
 * Elle REND l'erreur au lieu de la lever : `generateMetadata` et la page la
 * traitent différemment — un titre de repli d'un côté, une carte explicative
 * de l'autre — et une exception traversant `generateMetadata` ferait tomber
 * la page entière sur `app/error.tsx`.
 */
const chargerFiche = cache(
  async (id: string): Promise<{ fiche: Fiche | null; erreur: unknown }> => {
    try {
      const reponse = await appelerGraphQL<{
        artisan: ArtisanFiche;
        avisDArtisan: AvisAffiche[];
      }>(REQUETE_FICHE, { variables: { id } });
      return { fiche: { artisan: reponse.artisan, avis: reponse.avisDArtisan }, erreur: null };
    } catch (erreur) {
      return { fiche: null, erreur };
    }
  },
);

/* ── Le titre de l'onglet et le partage ──────────────────────────────────── */

export async function generateMetadata(props: PageProps<'/artisan/[id]'>): Promise<Metadata> {
  // `params` est une promesse en Next 16, ici comme dans la page.
  const { id } = await props.params;
  if (!estIdentifiantMongo(id)) return { title: 'Artisan introuvable' };

  const { fiche } = await chargerFiche(id);
  if (!fiche) return { title: 'Artisan introuvable' };

  const metiers = fiche.artisan.metiers.map((metier) => LIBELLES_METIER[metier]).join(', ');
  return {
    title: fiche.artisan.raisonSociale,
    description:
      `${metiers} à ${fiche.artisan.ville}. Se déplace jusqu'à ${fiche.artisan.rayonKm} km. ` +
      'Les avis affichés viennent de prestations réellement payées.',
  };
}

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

/**
 * Ce qui s'affiche quand la lecture a échoué.
 *
 * Elle couvre deux cas que le front NE PEUT PAS distinguer : l'artisan
 * n'existe pas (404 côté API) et l'API est en panne (500). Le pilote Apollo
 * de NestJS traduit les deux en `INTERNAL_SERVER_ERROR` — c'est documenté
 * dans `lib/graphql.ts`. On affiche donc la phrase que l'API a écrite, qui
 * sait de quoi elle parle, plutôt que de deviner laquelle des deux et de se
 * tromper une fois sur deux.
 */
function Panne({ erreur }: { erreur: unknown }): ReactNode {
  return (
    <Carte className={`${styles.etat} ${styles.etatPanne}`} padding="lg">
      <h1 className={styles.etatTitre}>Cette fiche ne s&apos;affiche pas</h1>
      <p className={styles.etatTexte}>{phraseDErreur(erreur)}</p>
      {estApiInjoignable(erreur) ? (
        <p className={styles.etatRemarque}>
          Le service ne répond pas pour l&apos;instant. L&apos;adresse de cette page reste
          valable&nbsp;: recharger suffira.
        </p>
      ) : null}
      <div className={styles.etatActions}>
        <BoutonLien href={CHEMINS.recherche}>Chercher un artisan</BoutonLien>
        <BoutonLien variante="secondaire" href={CHEMINS.accueil}>
          Revenir à l&apos;accueil
        </BoutonLien>
      </div>
    </Carte>
  );
}

/** Un avis : qui, quand, combien, et ce qu'il a écrit. */
function Avis({ avis }: { avis: AvisAffiche }): ReactNode {
  const date = formaterDate(avis.createdAt);

  return (
    <Carte balise="li" className={styles.avis}>
      <div className={styles.avisTete}>
        {/*
         * `nombreAvis={1}` n'est pas un contournement du cas « pas encore
         * d'avis » : un avis porte exactement une note, donc un avis. C'est
         * `avecNombreAvis` qui masque le « (1 avis) », inutile ici puisque
         * c'est précisément cet avis-là qu'on lit.
         */}
        <Note note={avis.note} nombreAvis={1} avecNombreAvis={false} />
        <p className={styles.avisAuteur}>
          {avis.nomAuteur}
          {date ? (
            <>
              {', '}
              {/* `<time>` porte la date lisible par une machine ; le texte
                  reste celui qu'on lit. L'attribut est la valeur brute de
                  l'API, déjà en ISO 8601. */}
              <time className={styles.avisDate} dateTime={avis.createdAt}>
                {date}
              </time>
            </>
          ) : null}
        </p>
      </div>
      <p className={styles.avisCommentaire}>{avis.commentaire}</p>
    </Carte>
  );
}

/* ── La page ─────────────────────────────────────────────────────────────── */

export default async function PageFicheArtisan(
  props: PageProps<'/artisan/[id]'>,
): Promise<ReactNode> {
  const { id } = await props.params;

  // Une URL qui ne peut pas désigner d'artisan : 404 sans interroger l'API.
  // `notFound()` lève, donc il est appelé avant tout rendu.
  if (!estIdentifiantMongo(id)) notFound();

  const { fiche, erreur } = await chargerFiche(id);

  if (!fiche) {
    return (
      <div className={styles.page}>
        <Panne erreur={erreur} />
      </div>
    );
  }

  const { artisan, avis } = fiche;

  return (
    <div className={styles.page}>
      <nav className={styles.retour} aria-label="Fil de retour">
        <Link href={CHEMINS.recherche}>← Retour à la recherche</Link>
      </nav>

      <article className={styles.fiche}>
        <header className={styles.tete}>
          <div className={styles.titreLigne}>
            <h1 className={styles.raisonSociale}>{artisan.raisonSociale}</h1>
            {artisan.verifie ? <BadgeVerifie /> : null}
          </div>

          <p className={styles.metiers}>
            {artisan.metiers.map((metier) => LIBELLES_METIER[metier]).join(' · ')}
          </p>

          <Note
            note={artisan.noteMoyenne}
            nombreAvis={artisan.nombreAvis}
            taille="grand"
            className={styles.noteFiche}
          />
        </header>

        {/*
         * La ligne « ne prend plus de chantiers » n'est ni une erreur ni une
         * alerte : c'est un fait. Elle reste donc en teintes de texte, sans
         * emprunter --or, qui porte déjà le badge « vérifié » juste
         * au-dessus — deux blocs dorés sur la même fiche feraient lire une
         * mise en garde là où il y a une information.
         */}
        {!artisan.actif ? (
          <Carte className={styles.inactif} padding="md">
            <p>
              <strong>Cet artisan ne prend pas de nouveaux chantiers.</strong> Sa fiche et ses
              avis restent consultables&nbsp;; il n&apos;apparaît plus dans les résultats de
              recherche et ne reçoit plus les besoins publiés.
            </p>
          </Carte>
        ) : null}

        <Carte className={styles.faits} padding="lg">
          <dl className={styles.liste}>
            <div className={styles.fait}>
              <dt className={styles.cle}>Point d&apos;attache</dt>
              <dd className={styles.valeur}>{artisan.ville}</dd>
            </div>
            <div className={styles.fait}>
              <dt className={styles.cle}>Rayon d&apos;intervention</dt>
              <dd className={styles.valeur}>
                jusqu&apos;à <span className="nombre">{artisan.rayonKm}</span>&#x202f;km
              </dd>
            </div>
            <div className={styles.fait}>
              <dt className={styles.cle}>Métiers déclarés</dt>
              <dd className={styles.valeur}>
                <span className="nombre">{artisan.metiers.length}</span>
                {artisan.metiers.length === 1 ? ' métier' : ' métiers'}
              </dd>
            </div>
          </dl>

          <p className={styles.explication}>
            C&apos;est ce rayon, et non une zone imposée, qui décide si cet artisan voit votre
            chantier. Un chantier plus loin que{' '}
            <span className="nombre">{artisan.rayonKm}</span>&#x202f;km de{' '}
            {artisan.ville} ne lui sera pas proposé.
          </p>
        </Carte>

        <section className={styles.sectionAvis} aria-labelledby="titre-avis">
          <h2 className={styles.titreAvis} id="titre-avis">
            {artisan.nombreAvis > 0 ? (
              <>
                Les avis <span className={`nombre ${styles.compteAvis}`}>{artisan.nombreAvis}</span>
              </>
            ) : (
              'Les avis'
            )}
          </h2>

          {avis.length === 0 ? (
            /*
             * L'état vide dit ce qu'il faut en conclure : rien. Un artisan
             * sans avis n'est pas un artisan mal noté, et c'est la seule
             * lecture possible sur une plateforme où un avis exige une
             * prestation payée puis terminée.
             */
            <Carte className={styles.etat} padding="lg">
              <h3 className={styles.etatTitre}>Pas encore d&apos;avis</h3>
              <p className={styles.etatTexte}>
                Personne ne l&apos;a encore noté ici. Ce n&apos;est pas une mauvaise note&nbsp;:
                un avis ne peut être déposé qu&apos;après une prestation payée puis déclarée
                terminée, et il n&apos;y en a pas eu.
              </p>
            </Carte>
          ) : (
            <>
              <p className={styles.garantie}>
                Chaque avis ci-dessous vient d&apos;une prestation payée sur la plateforme puis
                déclarée terminée par l&apos;artisan. Un client, une prestation, un avis — du plus
                récent au plus ancien.
              </p>
              <ul className={styles.avisListe}>
                {avis.map((element) => (
                  <Avis avis={element} key={element._id} />
                ))}
              </ul>
            </>
          )}
        </section>

        <Carte className={styles.suite} padding="lg">
          <h2 className={styles.titreSuite}>Faire chiffrer votre chantier</h2>
          <p className={styles.texteSuite}>
            {artisan.actif ? (
              <>
                Décrivez votre chantier une fois. Il part vers les artisans de ce métier dont le
                rayon couvre votre adresse — celui-ci compris, si vous êtes à moins de{' '}
                <span className="nombre">{artisan.rayonKm}</span>&#x202f;km de {artisan.ville}.
              </>
            ) : (
              <>
                Cet artisan ne recevra pas votre besoin, mais les autres artisans du métier dont
                le rayon couvre votre adresse le recevront.
              </>
            )}
          </p>
          <div className={styles.actionsSuite}>
            <BoutonLien href={CHEMINS.publierBesoin}>Publier un besoin</BoutonLien>
            <BoutonLien variante="secondaire" href={CHEMINS.recherche}>
              Voir d&apos;autres artisans
            </BoutonLien>
          </div>
        </Carte>
      </article>
    </div>
  );
}
