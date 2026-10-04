/**
 * Un chantier et ses devis — l'écran de décision du parcours client.
 *
 * ── `params` est asynchrone ───────────────────────────────────────────────
 * `PageProps<'/mes-besoins/[id]'>` est un type GLOBAL, produit par
 * `npx next typegen` : il n'est pas importé, et il porte le `params` de cette
 * route exacte. L'accès synchrone a été SUPPRIMÉ en Next 16 — d'où le
 * `await props.params`. Lu dans
 * `03-api-reference/03-file-conventions/page.md`.
 *
 * ── Ce qui est lu, et ce qui ne l'est pas ─────────────────────────────────
 * `besoin(id)` est accessible à tout compte connecté, mais ses champs
 * sensibles ne le sont pas : `adresse` et `demandeur` ne sont rendus qu'au
 * propriétaire du besoin, et valent `null` pour tout le monde d'autre
 * (`besoins.resolver.ts`, et la section « Un défaut trouvé en construisant
 * les écrans » du README). Cette page est celle du propriétaire : elle
 * demande donc l'adresse, et se sert de `demandeur` comme TÉMOIN
 * d'appartenance. Un `null` n'y est pas une erreur, c'est un refus, et
 * l'écran le dit.
 *
 * `Reservation` n'est pas lue ici : l'adresse et le téléphone de la
 * réservation sont la vue de l'ARTISAN retenu. Le client, lui, a déjà les
 * deux — ce sont les siens.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { BoutonLien } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { CHEMINS, CHEMINS_AVEC_ID } from '@/components/chemins';
import { Etiquette } from '@/components/Etiquette';
import { Montant } from '@/components/Montant';
import { estNonAuthentifie, phraseDErreur } from '@/lib/erreurs';
import { appelerGraphQLAvecSession } from '@/lib/graphql';
import type { Metier, StatutBesoin, StatutDevis } from '@/lib/domaine';
import { exigerRole } from '@/lib/session';
import { formaterDate } from '@/lib/dates';
import { LIBELLES_METIER } from '@/lib/metiers';
import { ordonnerParArrivee } from '../calculs';
import { ChoixDuDevis } from './ChoixDuDevis';
import type { DevisAComparer } from './ChoixDuDevis';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Mon chantier',
  description: 'Les devis reçus sur ce chantier, et le choix de celui que vous retenez.',
};

/* ── La lecture ──────────────────────────────────────────────────────────── */

interface DevisRecu {
  _id: string;
  montantCentimes: number;
  delaiJours: number;
  message: string;
  statut: StatutDevis;
  createdAt: string;
  auteur: {
    _id: string;
    raisonSociale: string;
    noteMoyenne: number;
    nombreAvis: number;
    verifie: boolean;
  } | null;
}

interface BesoinDetaille {
  _id: string;
  titre: string;
  description: string;
  metier: Metier;
  statut: StatutBesoin;
  createdAt: string;
  /** `null` pour quiconque n'est pas le propriétaire. Ce n'est pas une erreur. */
  adresse: string | null;
  budgetMaxCentimes: number | null;
  /** Témoin d'appartenance : non nul au seul propriétaire du besoin. */
  demandeur: { _id: string } | null;
  devisRecus: DevisRecu[];
}

const REQUETE_BESOIN = `
  query Besoin($id: ID!) {
    besoin(id: $id) {
      _id
      titre
      description
      metier
      statut
      createdAt
      adresse
      budgetMaxCentimes
      demandeur { _id }
      devisRecus {
        _id
        montantCentimes
        delaiJours
        message
        statut
        createdAt
        auteur {
          _id
          raisonSociale
          noteMoyenne
          nombreAvis
          verifie
        }
      }
    }
  }
`;

/* ── Les écrans de refus ─────────────────────────────────────────────────── */

function Panne({ phrase }: { phrase: string }) {
  return (
    <div className={styles.page}>
      <Carte padding="lg" className={styles.panne}>
        <h1 className={styles.panneTitre}>Ce chantier n&apos;a pas pu être affiché</h1>
        <p className={styles.panneTexte}>{phrase}</p>
        <BoutonLien variante="secondaire" href={CHEMINS.mesBesoins}>
          Revenir à mes chantiers
        </BoutonLien>
      </Carte>
    </div>
  );
}

/**
 * Le besoin existe, et il n'est pas celui du lecteur.
 *
 * Il n'y a rien de confidentiel à dire ici, et rien à cacher non plus :
 * l'API a déjà retenu l'adresse et les coordonnées. L'écran explique
 * seulement pourquoi la page est vide de ce qu'on y attendait.
 */
function PasLeVotre() {
  return (
    <div className={styles.page}>
      <Carte padding="lg" className={styles.panne}>
        <h1 className={styles.panneTitre}>Ce chantier n&apos;est pas le vôtre</h1>
        <p className={styles.panneTexte}>
          Cette page montre un chantier et les devis reçus à son propriétaire. L&apos;adresse et
          les coordonnées du demandeur ne sont pas transmises aux autres comptes.
        </p>
        <BoutonLien variante="secondaire" href={CHEMINS.mesBesoins}>
          Revenir à mes chantiers
        </BoutonLien>
      </Carte>
    </div>
  );
}

/* ── La page ─────────────────────────────────────────────────────────────── */

export default async function PageBesoin(props: PageProps<'/mes-besoins/[id]'>) {
  const { id } = await props.params;

  const session = await exigerRole(['CLIENT', 'ADMIN'], {
    suite: CHEMINS_AVEC_ID.besoin(id),
  });

  let besoin: BesoinDetaille | null = null;
  let phrase: string | null = null;
  let sessionPerdue = false;

  try {
    const reponse = await appelerGraphQLAvecSession<{ besoin: BesoinDetaille }>(REQUETE_BESOIN, {
      variables: { id },
    });
    besoin = reponse.besoin;
  } catch (erreur) {
    if (estNonAuthentifie(erreur)) sessionPerdue = true;
    else phrase = phraseDErreur(erreur);
  }

  // Hors du `catch` : `redirect` lève une exception de contrôle de flux, et la
  // rattraper l'afficherait comme une panne de lecture.
  if (sessionPerdue) {
    redirect(`${CHEMINS.connexion}?suite=${encodeURIComponent(CHEMINS_AVEC_ID.besoin(id))}`);
  }

  if (phrase !== null || besoin === null) {
    return (
      <Panne
        phrase={
          phrase ?? "L'API a répondu sans ce chantier. Il a peut-être été supprimé entre-temps."
        }
      />
    );
  }

  if (besoin.demandeur === null) {
    return <PasLeVotre />;
  }

  const publieLe = formaterDate(besoin.createdAt);

  /*
   * Les devis sont remis dans leur ordre d'ARRIVÉE ici, côté serveur, et non
   * dans le composant : le tri est la seule raison pour laquelle `createdAt`
   * est demandé, et le faire une fois évite de l'embarquer dans le paquet du
   * navigateur. Le pourquoi est dans `ordonnerParArrivee`.
   */
  const devis: DevisAComparer[] = ordonnerParArrivee(besoin.devisRecus).map((recu) => ({
    id: recu._id,
    montantCentimes: recu.montantCentimes,
    delaiJours: recu.delaiJours,
    message: recu.message,
    statut: recu.statut,
    recuLe: formaterDate(recu.createdAt),
    recuLeIso: recu.createdAt,
    artisan: recu.auteur
      ? {
          id: recu.auteur._id,
          raisonSociale: recu.auteur.raisonSociale,
          noteMoyenne: recu.auteur.noteMoyenne,
          nombreAvis: recu.auteur.nombreAvis,
          verifie: recu.auteur.verifie,
        }
      : null,
    cheminFiche: recu.auteur ? CHEMINS_AVEC_ID.ficheArtisan(recu.auteur._id) : null,
  }));

  return (
    <div className={styles.page}>
      {/* ── Le chantier ────────────────────────────────────────────────── */}

      <header className={styles.enTete}>
        <div className={styles.enTeteHaut}>
          <p className={styles.surtitre}>{LIBELLES_METIER[besoin.metier]}</p>
          <Etiquette statut={besoin.statut} />
        </div>

        <h1 className={styles.titre}>{besoin.titre}</h1>

        <dl className={styles.resume}>
          <div className={styles.resumeCase}>
            <dt className={styles.resumeNom}>Adresse du chantier</dt>
            <dd className={styles.resumeValeur}>
              {/*
               * `adresse` est nulle pour tout autre compte que le
               * propriétaire. Le témoin `demandeur` a déjà écarté ce cas
               * plus haut, mais le champ reste nullable dans le schéma et
               * un `undefined` affiché serait pire qu'une phrase.
               */}
              {besoin.adresse ?? 'Elle ne vous est pas communiquée.'}
            </dd>
          </div>

          <div className={styles.resumeCase}>
            <dt className={styles.resumeNom}>Budget annoncé</dt>
            <dd className={styles.resumeValeur}>
              {besoin.budgetMaxCentimes === null ? (
                <span className={styles.resumeAbsent}>Aucun — les artisans chiffrent libres</span>
              ) : (
                <Montant centimes={besoin.budgetMaxCentimes} />
              )}
            </dd>
          </div>

          <div className={styles.resumeCase}>
            <dt className={styles.resumeNom}>Publié le</dt>
            <dd className={styles.resumeValeur}>
              {publieLe ? (
                <time dateTime={besoin.createdAt}>{publieLe}</time>
              ) : (
                <span className={styles.resumeAbsent}>Date inconnue</span>
              )}
            </dd>
          </div>
        </dl>

        <div className={styles.description}>
          <h2 className={styles.descriptionTitre}>Ce que vous avez décrit</h2>
          {/*
           * `white-space: pre-line` dans le module : la description est
           * saisie dans un `textarea`, et ses retours à la ligne font partie
           * de ce que le client a écrit. Les écraser réduirait trois
           * paragraphes à un pavé, et c'est le texte sur lequel l'artisan
           * chiffre.
           */}
          <p className={styles.descriptionTexte}>{besoin.description}</p>
        </div>

        <p className={styles.confidentialite}>
          Votre adresse et votre téléphone ne sont transmis qu&apos;à l&apos;artisan dont vous
          acceptez le devis. Les autres voient la description, la distance, et
          «&nbsp;votre prénom suivi de l&apos;initiale de votre nom&nbsp;».
        </p>
      </header>

      {/* ── Les devis ──────────────────────────────────────────────────── */}

      {devis.length === 0 ? (
        <Carte padding="lg" className={styles.aucunDevis}>
          <h2 className={styles.sectionTitre}>Aucun devis pour le moment</h2>
          <p className={styles.panneTexte}>
            Les artisans de ce métier dont le rayon d&apos;intervention couvre votre adresse
            voient ce chantier. Un devis arrive quand l&apos;un d&apos;eux l&apos;a chiffré —
            il n&apos;y a rien à relancer d&apos;ici.
          </p>
          <p className={styles.panneTexte}>
            Si rien n&apos;arrive, c&apos;est le plus souvent que la description manque
            d&apos;un élément dont un artisan a besoin pour faire un prix&nbsp;: l&apos;état
            actuel, les dimensions, l&apos;accès.
          </p>
          {/*
           * Pas de bouton « modifier » : l'API n'expose aucune mutation de
           * modification d'un besoin (`schema.graphql` n'a que `publierBesoin`).
           * Un bouton qui n'appellerait rien serait une promesse fausse.
           */}
          <BoutonLien variante="secondaire" href={CHEMINS.mesBesoins}>
            Revenir à mes chantiers
          </BoutonLien>
        </Carte>
      ) : (
        <ChoixDuDevis
          devis={devis}
          besoinOuvert={besoin.statut === 'OUVERT'}
          peutAccepter={session.role === 'CLIENT'}
          cheminReservations={CHEMINS.mesReservations}
        />
      )}
    </div>
  );
}
