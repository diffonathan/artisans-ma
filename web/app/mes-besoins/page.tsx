/**
 * Mes chantiers — la liste des besoins publiés par le client connecté.
 *
 * Composant SERVEUR, sans une ligne de JavaScript envoyée au navigateur :
 * rien ici ne tient d'état et rien ne réagit à un événement. La seule
 * interaction est de suivre un lien.
 *
 * ── Les trois états, et pourquoi le chargement passe par Suspense ─────────
 * Une liste a trois visages : pleine, vide, et en panne. Un quatrième la
 * précède, le temps que l'API réponde. Next le rendrait par un `loading.tsx`,
 * qui remplacerait TOUTE la page — en-tête et titre compris — par un
 * squelette, et ferait clignoter la navigation à chaque visite. La frontière
 * est donc posée ici, autour de la seule partie qui attend : le titre et le
 * chemin vers « publier un chantier » s'affichent tout de suite, la liste
 * arrive ensuite.
 *
 * C'est aussi ce qui permet de garder `page.tsx` comme seul fichier de cette
 * route : `loading.tsx` n'appartient pas à cet agent.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { CarteLien, Carte } from '@/components/Carte';
import { Squelette } from '@/components/Squelette';
import { BoutonLien } from '@/components/Bouton';
import { CHEMINS, CHEMINS_AVEC_ID } from '@/components/chemins';
import { Etiquette } from '@/components/Etiquette';
import { phraseDErreur, estNonAuthentifie } from '@/lib/erreurs';
import { appelerGraphQLAvecSession } from '@/lib/graphql';
import type { Metier, StatutBesoin, StatutDevis } from '@/lib/domaine';
import { exigerRole } from '@/lib/session';
import { formaterDate } from '@/lib/dates';
import { LIBELLES_METIER } from '@/lib/metiers';
import { compterDevisRecus } from './calculs';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Mes chantiers',
  description:
    'Les chantiers que vous avez publiés, les devis reçus sur chacun, et où en est leur attribution.',
};

/* ── La lecture ──────────────────────────────────────────────────────────── */

interface BesoinDeLaListe {
  _id: string;
  titre: string;
  metier: Metier;
  statut: StatutBesoin;
  createdAt: string;
  /**
   * Seul le STATUT de chaque devis est demandé, pas son montant.
   *
   * La liste n'affiche qu'un compte, et demander `montantCentimes` ferait
   * voyager des montants qu'aucun pixel ne montre. Le `_id` sert de clé de
   * tableau à rien : il n'est donc pas demandé non plus.
   */
  devisRecus: { statut: StatutDevis }[];
}

const REQUETE_MES_BESOINS = `
  query MesBesoins {
    mesBesoins {
      _id
      titre
      metier
      statut
      createdAt
      devisRecus { statut }
    }
  }
`;

/* ── Les trois états de la liste ─────────────────────────────────────────── */

/**
 * L'état vide — et il n'est pas une erreur.
 *
 * Un client qui vient de s'inscrire tombe ici, et c'est l'écran le plus
 * important du parcours : il doit dire quoi faire, pas constater un manque.
 */
function AucunChantier() {
  return (
    <Carte padding="lg" className={styles.vide}>
      <h2 className={styles.videTitre}>Aucun chantier publié</h2>
      <p className={styles.videTexte}>
        Un chantier publié est vu par les artisans de votre métier dont la zone d&apos;intervention
        couvre votre adresse. Ce sont eux qui vous envoient un devis&nbsp;; vous n&apos;avez
        personne à appeler.
      </p>
      <BoutonLien href={CHEMINS.publierBesoin}>Publier un chantier</BoutonLien>
    </Carte>
  );
}

/** L'API a dit non, ou n'a pas répondu. */
function Panne({ phrase }: { phrase: string }) {
  return (
    <Carte padding="lg" className={styles.panne}>
      <h2 className={styles.videTitre}>Vos chantiers n&apos;ont pas pu être lus</h2>
      <p className={styles.videTexte}>{phrase}</p>
      <p className={styles.videTexte}>
        Vos chantiers et vos devis ne sont pas perdus&nbsp;: c&apos;est la lecture qui a échoué, pas
        l&apos;enregistrement. Recharger la page suffit la plupart du temps.
      </p>
    </Carte>
  );
}

/* ── Une ligne ───────────────────────────────────────────────────────────── */

function LigneBesoin({ besoin }: { besoin: BesoinDeLaListe }) {
  const devis = compterDevisRecus(besoin.devisRecus);
  const publieLe = formaterDate(besoin.createdAt);

  return (
    <CarteLien href={CHEMINS_AVEC_ID.besoin(besoin._id)} className={styles.ligne}>
      <div className={styles.ligneHaut}>
        <h2 className={styles.ligneTitre}>{besoin.titre}</h2>
        <Etiquette statut={besoin.statut} dense />
      </div>

      <p className={styles.ligneMetier}>{LIBELLES_METIER[besoin.metier]}</p>

      <div className={styles.ligneBas}>
        {/*
         * Le compte de devis est un NOMBRE : il porte donc la classe globale
         * `.nombre`, c'est-à-dire Azeret Mono, que la charte réserve aux
         * chiffres. Le mot qui le suit reste en DM Sans, comme l'unité « DH »
         * dans `Montant`.
         */}
        <span className={styles.compteur}>
          <span className="nombre">{devis}</span> {devis > 1 ? 'devis reçus' : 'devis reçu'}
        </span>

        {publieLe ? (
          <time className={styles.date} dateTime={besoin.createdAt}>
            Publié le {publieLe}
          </time>
        ) : null}
      </div>
    </CarteLien>
  );
}

/* ── La liste, qui attend l'API ──────────────────────────────────────────── */

async function ListeDesBesoins() {
  let besoins: BesoinDeLaListe[] | null = null;
  let phrase: string | null = null;
  let sessionPerdue = false;

  try {
    const reponse = await appelerGraphQLAvecSession<{ mesBesoins: BesoinDeLaListe[] }>(
      REQUETE_MES_BESOINS,
    );
    besoins = reponse.mesBesoins;
  } catch (erreur) {
    // Un jeton périmé en cours de navigation produit un `UNAUTHENTICATED` au
    // milieu du rendu. Afficher « vos chantiers n'ont pas pu être lus » serait
    // exact et inutile : la seule suite est de se reconnecter.
    if (estNonAuthentifie(erreur)) sessionPerdue = true;
    else phrase = phraseDErreur(erreur);
  }

  // Le `redirect` est appelé HORS du `catch` : il lève une exception de
  // contrôle de flux, et la rattraper ici l'afficherait comme une panne.
  if (sessionPerdue) {
    redirect(`${CHEMINS.connexion}?suite=${encodeURIComponent(CHEMINS.mesBesoins)}`);
  }

  if (phrase !== null) return <Panne phrase={phrase} />;
  if (!besoins || besoins.length === 0) return <AucunChantier />;

  return (
    <ul className={styles.liste}>
      {besoins.map((besoin) => (
        <li key={besoin._id}>
          <LigneBesoin besoin={besoin} />
        </li>
      ))}
    </ul>
  );
}

/* ── La page ─────────────────────────────────────────────────────────────── */

export default async function PageMesBesoins() {
  /*
   * ADMIN est admis en LECTURE, et pas en publication.
   *
   * `mesBesoins` ne porte aucune garde de rôle côté API : un administrateur
   * l'appelle et obtient ses propres besoins, c'est-à-dire aucun. L'en-tête du
   * socle lui donne par ailleurs la navigation du client, donc cette rubrique
   * lui est proposée — le renvoyer à l'accueil ferait d'un lien du menu une
   * impasse. En revanche `publierBesoin` et `accepterDevis` sont réservés à
   * CLIENT par l'API, et les deux écrans qui les portent le disent.
   */
  const session = await exigerRole(['CLIENT', 'ADMIN'], { suite: CHEMINS.mesBesoins });

  return (
    <div className={styles.page}>
      <header className={styles.enTete}>
        <div>
          <p className={styles.surtitre}>Espace client</p>
          <h1 className={styles.titre}>Mes chantiers</h1>
          <p className={styles.phrase}>
            Un chantier reste ouvert jusqu&apos;à ce que vous acceptiez un devis. À ce
            moment-là, les autres sont refusés et une réservation est créée.
          </p>
        </div>

        <BoutonLien href={CHEMINS.publierBesoin}>Publier un chantier</BoutonLien>
      </header>

      <Suspense fallback={<Squelette cartes={3} lignes={2} annonce="Chargement de vos chantiers." />}>
        <ListeDesBesoins />
      </Suspense>
    </div>
  );
}
