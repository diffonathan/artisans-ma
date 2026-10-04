/* ══════════════════════════════════════════════════════════════════════════
   /mon-compte — UN ÉCRAN, DEUX CONTENUS

   Le rôle vient de la session, et c'est lui qui décide ce qui s'affiche :

     • ARTISAN — son profil métier : raison sociale, métiers, ville, rayon,
       note. Puis trois repères chiffrés vers ses trois listes ;
     • CLIENT  — ses coordonnées, et deux repères vers ses chantiers et ses
       réservations ;
     • ADMIN   — ses coordonnées seules. Aucune des listes de cet écran ne lui
       appartient, et les requêtes correspondantes lui sont refusées par
       l'API (`@Roles(Role.CLIENT)` / `@Roles(Role.ARTISAN)`). Lui proposer un
       compteur qui échouera serait pire que de n'en proposer aucun.

   ── Pourquoi deux requêtes, et non une seule ───────────────────────────────

   `besoinsPourMoi`, `mesDevis` et `monPlanning` sont gardés par
   `@Roles(Role.ARTISAN)` ; `mesReservations` par `@Roles(Role.CLIENT)`. Une
   requête unique couvrant les deux rôles reviendrait donc TOUJOURS avec une
   erreur `FORBIDDEN`, pour l'un ou pour l'autre — et GraphQL rendant alors
   `errors` non vide, `appelerGraphQL` lèverait sur une page parfaitement
   saine. L'identité est lue d'abord, les compteurs du rôle ensuite.

   ── Les compteurs sont derrière une frontière de suspense ─────────────────

   Ils agrègent trois listes. L'identité, elle, est une seule lecture : elle
   s'affiche sans attendre, et les chiffres arrivent après. Si leur requête
   échoue, la carte des compteurs porte l'erreur et le reste de la page tient.

   ── Chaque chiffre est un lien, et il est en Azeret Mono ──────────────────

   La classe globale `.nombre` donne la police ; le lien porte la zone
   cliquable entière, pour qu'un pouce sur un téléphone n'ait pas à viser le
   chiffre.
   ══════════════════════════════════════════════════════════════════════════ */

import { Suspense } from 'react';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { estAVenir, formaterDate } from '@/lib/dates';
import { libelleMetier } from '@/lib/metiers';
import { BoutonLien } from '@/components/Bouton';
import { Carte, CarteLien } from '@/components/Carte';
import { CHEMINS } from '@/components/chemins';
import { Note } from '@/components/Note';
import { phraseDErreur } from '@/lib/erreurs';
import { appelerGraphQLAvecSession } from '@/lib/graphql';
import type { Role, StatutBesoin, StatutDevis, StatutReservation } from '@/lib/domaine';
import { exigerSession } from '@/lib/session';

import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Mon compte',
  description: 'Vos coordonnées, votre profil, et un repère vers vos listes.',
};

/* ── Les lectures ───────────────────────────────────────────────────────── */

/**
 * `monProfilArtisan` est demandé pour tous les rôles, et c'est voulu : la
 * requête est autorisée à tout compte connecté et rend `null` à qui n'a pas de
 * profil. Deux requêtes distinctes selon le rôle n'auraient rien gagné, et
 * auraient ajouté un aller-retour.
 */
const REQUETE_IDENTITE = `
  query MonIdentite {
    moi { _id nom email telephone role createdAt }
    monProfilArtisan {
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
  }
`;

const REQUETE_REPERES_ARTISAN = `
  query ReperesArtisan {
    besoinsPourMoi { _id }
    mesDevis { _id statut }
    monPlanning { _id statut creneau { debut fin } }
  }
`;

const REQUETE_REPERES_CLIENT = `
  query ReperesClient {
    mesBesoins { _id statut }
    mesReservations { _id statut creneau { debut fin } }
  }
`;

interface Moi {
  _id: string;
  nom: string;
  email: string;
  telephone: string | null;
  role: Role;
  createdAt: string;
}

interface ProfilArtisan {
  _id: string;
  raisonSociale: string;
  metiers: string[];
  ville: string;
  rayonKm: number;
  noteMoyenne: number;
  nombreAvis: number;
  verifie: boolean;
  actif: boolean;
}

interface ReponseIdentite {
  moi: Moi;
  monProfilArtisan: ProfilArtisan | null;
}

interface ReperesArtisan {
  besoinsPourMoi: { _id: string }[];
  mesDevis: { _id: string; statut: StatutDevis }[];
  monPlanning: { _id: string; statut: StatutReservation; creneau: { debut: string; fin: string } }[];
}

interface ReperesClient {
  mesBesoins: { _id: string; statut: StatutBesoin }[];
  mesReservations: {
    _id: string;
    statut: StatutReservation;
    creneau: { debut: string; fin: string };
  }[];
}

/* ── Un repère chiffré ──────────────────────────────────────────────────── */

/**
 * `chemin` n'est pas un `string` mais l'une des valeurs de `CHEMINS` : Next 16
 * type le `href` de `Link` contre les routes réellement déclarées, et un
 * `string` élargi y serait refusé. La contrainte est utile — elle interdit de
 * glisser ici un littéral inventé.
 */
type CheminConnu = (typeof CHEMINS)[keyof typeof CHEMINS];

interface Repere {
  valeur: number;
  libelle: string;
  precision: string;
  chemin: CheminConnu;
}

function Reperes({ reperes }: { reperes: readonly Repere[] }): ReactNode {
  return (
    <ul className={styles.reperes}>
      {reperes.map((repere) => (
        <li key={repere.chemin + repere.libelle}>
          {/* `CarteLien` et non un `Link` restylé : la recette du verre est une
              identité du projet, et la recopier ici la ferait dériver du jour
              où `components/Carte.module.css` changerait. Le lien enveloppe le
              chiffre ET son libellé, pour que la cible tactile soit la tuile
              entière et non les deux caractères du nombre. */}
          <CarteLien className={styles.repere} href={repere.chemin}>
            <span className={`nombre ${styles.repereValeur}`}>{repere.valeur}</span>
            <span className={styles.repereLibelle}>{repere.libelle}</span>
            <span className={styles.reperePrecision}>{repere.precision}</span>
          </CarteLien>
        </li>
      ))}
    </ul>
  );
}

function SqueletteReperes(): ReactNode {
  return (
    <ul className={styles.reperes} aria-busy="true">
      <li className="lecture-seule">Chargement de vos compteurs…</li>
      {[0, 1, 2].map((rang) => (
        <li key={rang}>
          <span className={styles.repereFantome} aria-hidden="true" />
        </li>
      ))}
    </ul>
  );
}

function EchecReperes({ phrase }: { phrase: string }): ReactNode {
  return (
    <p className={styles.echecReperes} role="alert">
      {phrase} Vos listes restent accessibles depuis le menu.
    </p>
  );
}

/* ── Les repères de l'artisan ───────────────────────────────────────────── */

async function ReperesDeLArtisan(): Promise<ReactNode> {
  let reponse: ReperesArtisan;
  try {
    reponse = await appelerGraphQLAvecSession<ReperesArtisan>(REQUETE_REPERES_ARTISAN);
  } catch (erreur) {
    return <EchecReperes phrase={phraseDErreur(erreur)} />;
  }

  const devisEnAttente = reponse.mesDevis.filter((devis) => devis.statut === 'ENVOYE').length;

  // « À venir » : ni annulée, ni déjà terminée, et dont le créneau n'est pas
  // passé. Une réservation payée dont le créneau est derrière nous attend une
  // déclaration de fin, pas un déplacement : elle ne compte pas ici.
  const aVenir = reponse.monPlanning.filter(
    (reservation) =>
      reservation.statut !== 'ANNULEE' &&
      reservation.statut !== 'TERMINEE' &&
      estAVenir(reservation.creneau.fin),
  );
  const prochaine = aVenir[0];

  return (
    <Reperes
      reperes={[
        {
          valeur: reponse.besoinsPourMoi.length,
          libelle: 'chantiers dans votre rayon',
          precision:
            reponse.besoinsPourMoi.length === 0
              ? 'rien d’ouvert pour vos métiers en ce moment'
              : 'ouverts, et que vous pouvez chiffrer',
          chemin: CHEMINS.chantiers,
        },
        {
          valeur: devisEnAttente,
          libelle: 'devis en attente',
          precision:
            devisEnAttente === 0
              ? 'aucun client ne vous doit de réponse'
              : 'le client ne s’est pas encore prononcé',
          chemin: CHEMINS.mesDevis,
        },
        {
          valeur: aVenir.length,
          libelle: 'interventions à venir',
          precision: prochaine
            ? `la prochaine le ${formaterDate(prochaine.creneau.debut) ?? ''}`
            : 'votre planning est libre',
          chemin: CHEMINS.monPlanning,
        },
      ]}
    />
  );
}

/* ── Les repères du client ──────────────────────────────────────────────── */

async function ReperesDuClient(): Promise<ReactNode> {
  let reponse: ReperesClient;
  try {
    reponse = await appelerGraphQLAvecSession<ReperesClient>(REQUETE_REPERES_CLIENT);
  } catch (erreur) {
    return <EchecReperes phrase={phraseDErreur(erreur)} />;
  }

  const ouverts = reponse.mesBesoins.filter((besoin) => besoin.statut === 'OUVERT').length;
  const aPayer = reponse.mesReservations.filter(
    (reservation) => reservation.statut === 'A_PAYER',
  ).length;
  const aVenir = reponse.mesReservations.filter(
    (reservation) =>
      reservation.statut !== 'ANNULEE' &&
      reservation.statut !== 'TERMINEE' &&
      estAVenir(reservation.creneau.fin),
  );
  const prochaine = aVenir[0];

  return (
    <Reperes
      reperes={[
        {
          valeur: ouverts,
          libelle: 'chantiers ouverts',
          precision:
            ouverts === 0 ? 'aucun chantier en attente de devis' : 'les artisans peuvent y répondre',
          chemin: CHEMINS.mesBesoins,
        },
        {
          valeur: aPayer,
          libelle: 'réservations à payer',
          precision: aPayer === 0 ? 'rien à régler' : 'le chantier attend votre paiement',
          chemin: CHEMINS.mesReservations,
        },
        {
          valeur: aVenir.length,
          libelle: 'interventions à venir',
          precision: prochaine
            ? `la prochaine le ${formaterDate(prochaine.creneau.debut) ?? ''}`
            : 'rien de prévu',
          chemin: CHEMINS.mesReservations,
        },
      ]}
    />
  );
}

/* ── Les coordonnées, communes aux trois rôles ──────────────────────────── */

function Coordonnees({ moi }: { moi: Moi }): ReactNode {
  return (
    <Carte className={styles.bloc}>
      <h2 className={styles.titreBloc}>Vos coordonnées</h2>
      <dl className={styles.paires}>
        <div className={styles.paire}>
          <dt>Nom</dt>
          <dd>{moi.nom}</dd>
        </div>
        <div className={styles.paire}>
          <dt>Adresse électronique</dt>
          <dd>{moi.email}</dd>
        </div>
        <div className={styles.paire}>
          <dt>Téléphone</dt>
          <dd>
            {moi.telephone ? (
              <a className={`nombre ${styles.telephone}`} href={`tel:${moi.telephone.replace(/\s/g, '')}`}>
                {moi.telephone}
              </a>
            ) : (
              <span className={styles.absent}>Non renseigné</span>
            )}
          </dd>
        </div>
        <div className={styles.paire}>
          <dt>Compte ouvert le</dt>
          <dd>{formaterDate(moi.createdAt) ?? ''}</dd>
        </div>
      </dl>
    </Carte>
  );
}

/* ── Le profil de l'artisan ─────────────────────────────────────────────── */

function ProfilMetier({ profil }: { profil: ProfilArtisan }): ReactNode {
  return (
    <Carte className={styles.bloc}>
      <div className={styles.enTeteProfil}>
        <h2 className={styles.titreBloc}>{profil.raisonSociale}</h2>
        {profil.verifie ? (
          <span className={styles.verifie}>
            <span className="lecture-seule">Pièces justificatives&nbsp;: </span>
            Vérifié
          </span>
        ) : (
          <span className={styles.enVerification}>Pièces en cours de contrôle</span>
        )}
      </div>

      <Note note={profil.noteMoyenne} nombreAvis={profil.nombreAvis} />

      <ul className={styles.metiers}>
        {profil.metiers.map((metier) => (
          <li className={styles.metier} key={metier}>
            {libelleMetier(metier)}
          </li>
        ))}
      </ul>

      <dl className={styles.paires}>
        <div className={styles.paire}>
          <dt>Ville</dt>
          <dd>{profil.ville}</dd>
        </div>
        <div className={styles.paire}>
          <dt>Rayon d&apos;intervention</dt>
          <dd>
            <span className="nombre">{profil.rayonKm}</span>
            <span>&#x202f;km</span>
          </dd>
        </div>
      </dl>

      {/* C'est le rayon, et lui seul, qui décide de ce qui arrive dans
          `/chantiers`. Le dire ici évite de chercher ailleurs pourquoi la
          liste est vide. */}
      <p className={styles.explication}>
        Un chantier n&apos;arrive dans votre liste que si son adresse tombe dans ce rayon, et
        s&apos;il relève d&apos;un de ces métiers. C&apos;est votre rayon qui décide, pas une zone
        imposée par le site.
      </p>

      {!profil.actif ? (
        <p className={styles.inactif} role="alert">
          Votre profil est inactif : vous n&apos;apparaissez pas dans les recherches et aucun
          chantier ne vous est présenté.
        </p>
      ) : null}
    </Carte>
  );
}

/* ── La page ────────────────────────────────────────────────────────────── */

export default async function PageMonCompte() {
  // `exigerSession` et non `exigerRole` : les trois rôles ont un compte, et
  // c'est le contenu qui diffère, pas le droit d'être ici.
  const session = await exigerSession({ suite: CHEMINS.monCompte });

  let identite: ReponseIdentite | null = null;
  let phraseEchec: string | null = null;
  try {
    identite = await appelerGraphQLAvecSession<ReponseIdentite>(REQUETE_IDENTITE);
  } catch (erreur) {
    phraseEchec = phraseDErreur(erreur);
  }

  /*
   * Le rôle vient de l'API quand elle répond, et du cookie sinon : cette page
   * change entièrement de contenu selon le rôle, et l'afficher faux serait
   * pire que de l'afficher sans profil. L'en-tête, lui, est résolu une fois
   * par la disposition racine.
   */
  const role = identite ? identite.moi.role : session.role;
  const estArtisan = role === 'ARTISAN';
  const estClient = role === 'CLIENT';

  return (
    <div className={styles.page}>
      <header className={styles.ouverture}>
        <p className={styles.surtitre}>
          {estArtisan ? 'Espace artisan' : estClient ? 'Espace client' : 'Administration'}
        </p>
        <h1 className={styles.titre}>Mon compte</h1>
      </header>

      {phraseEchec || !identite ? (
        <Carte className={styles.etatEchec}>
          <h2 className={styles.titreBloc}>Votre compte n&apos;a pas pu être lu</h2>
          <p className={styles.phraseEchec} role="alert">
            {phraseEchec ?? 'Le compte est revenu vide.'}
          </p>
          <p>
            La navigation reste utilisable : vos listes se chargent indépendamment de cet écran.
          </p>
          <BoutonLien variante="secondaire" taille="sm" href={CHEMINS.accueil}>
            Revenir à l&apos;accueil
          </BoutonLien>
        </Carte>
      ) : (
        <>
          <section className={styles.section}>
            <h2 className={styles.titreSection}>Vos repères</h2>
            {estArtisan ? (
              <Suspense fallback={<SqueletteReperes />}>
                <ReperesDeLArtisan />
              </Suspense>
            ) : estClient ? (
              <Suspense fallback={<SqueletteReperes />}>
                <ReperesDuClient />
              </Suspense>
            ) : (
              <p className={styles.explication}>
                Un compte d&apos;administration ne publie pas de chantier et ne chiffre pas de
                devis : il n&apos;a donc aucune liste à compter ici.
              </p>
            )}
          </section>

          <div className={styles.blocs}>
            {estArtisan ? (
              identite.monProfilArtisan ? (
                <ProfilMetier profil={identite.monProfilArtisan} />
              ) : (
                <Carte className={styles.bloc}>
                  <h2 className={styles.titreBloc}>Profil métier introuvable</h2>
                  <p className={styles.explication}>
                    Votre compte est bien un compte d&apos;artisan, mais aucun profil métier ne
                    lui est rattaché. Sans profil, aucun chantier ne peut vous être présenté.
                  </p>
                </Carte>
              )
            ) : null}

            <Coordonnees moi={identite.moi} />
          </div>
        </>
      )}
    </div>
  );
}
