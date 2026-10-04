/* ══════════════════════════════════════════════════════════════════════════
   /chantiers — LES CHANTIERS OUVERTS DANS MON RAYON

   ── L'absence d'adresse n'est PAS un trou dans l'écran ─────────────────────

   `Besoin.adresse` vaut `null` ici, pour tout le monde sauf le client
   propriétaire. Ce n'est pas une donnée manquante : l'adresse n'est même pas
   écrite sur le besoin pour l'artisan — elle est recopiée sur la réservation
   à l'acceptation du devis (`README.md`, « Un défaut trouvé en construisant
   les écrans »).

   Cet écran ne prévoit donc AUCUN emplacement pour une adresse, pas même
   masqué : une ligne « Adresse : — » laisserait croire à une donnée retenue,
   et le premier développeur venu essaierait de la remplir. Ce que l'artisan
   reçoit à la place est un prénom réduit côté serveur (« Fatima B. ») et une
   distance. La phrase qui l'explique est dite UNE fois, dans le chapeau, et
   elle est formulée comme ce qu'elle est : une garantie faite au client.

   ── Pourquoi `mesDevis` est lu ici ─────────────────────────────────────────

   Un artisan n'a droit qu'à un devis vivant par chantier — index unique
   partiel sur (besoin, artisan) limité aux statuts ENVOYE et ACCEPTE. Sans
   cette seconde liste, l'écran proposerait un formulaire sur un chantier déjà
   chiffré, et l'artisan ne découvrirait le doublon qu'au refus de l'API. Le
   refus reste traité — la liste a pu vieillir — mais il n'est plus le chemin
   normal.

   ── Les trois états ────────────────────────────────────────────────────────

   La liste est derrière une frontière `<Suspense>` : l'en-tête et le chapeau
   s'affichent tout de suite, le squelette tient la place pendant l'appel. Le
   vide a sa propre carte, qui dit quoi faire ensuite. L'erreur reste dans la
   page au lieu de remonter à `app/error.tsx`, pour que la navigation de
   l'artisan survive à une API éteinte.
   ══════════════════════════════════════════════════════════════════════════ */

import { Suspense } from 'react';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { BoutonLien } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { Squelette } from '@/components/Squelette';
import { CHEMINS } from '@/components/chemins';
import { Distance } from '@/components/Distance';
import { Montant } from '@/components/Montant';
import { phraseDErreur } from '@/lib/erreurs';
import { appelerGraphQLAvecSession } from '@/lib/graphql';
import type { StatutDevis } from '@/lib/domaine';
import { exigerRole } from '@/lib/session';

import { formaterDate } from '@/lib/dates';
import { libelleMetier } from '@/lib/metiers';
import { ProposerDevis } from './ProposerDevis';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Chantiers à chiffrer',
  description:
    "Les chantiers ouverts dont l'adresse tombe dans votre rayon d'intervention, " +
    'et le formulaire pour les chiffrer.',
};

/* ── Les lectures, telles que `api/schema.graphql` les déclare ───────────── */

const REQUETE_CHANTIERS = `
  query ChantiersPourMoi {
    besoinsPourMoi {
      _id
      titre
      description
      metier
      budgetMaxCentimes
      nomDemandeur
      distanceMetres
      createdAt
    }
    mesDevis {
      _id
      statut
      chantier { _id }
    }
  }
`;

interface BesoinPourMoi {
  _id: string;
  titre: string;
  description: string;
  metier: string;
  budgetMaxCentimes: number | null;
  nomDemandeur: string;
  distanceMetres: number | null;
  createdAt: string;
}

interface DevisDeMoi {
  _id: string;
  statut: StatutDevis;
  chantier: { _id: string } | null;
}

interface ReponseChantiers {
  besoinsPourMoi: BesoinPourMoi[];
  mesDevis: DevisDeMoi[];
}

/** Les statuts qui occupent la place dans l'index partiel de l'API. */
const STATUTS_VIVANTS: readonly StatutDevis[] = ['ENVOYE', 'ACCEPTE'];

/**
/* ── Les trois états de la liste ────────────────────────────────────────── */

function Vide(): ReactNode {
  return (
    <Carte className={styles.etatVide}>
      <h2 className={styles.titreEtat}>Aucun chantier ouvert dans votre rayon</h2>
      <p>
        Les chantiers n&apos;arrivent ici que si leur adresse tombe dans le rayon que vous avez
        déclaré, et s&apos;ils relèvent d&apos;un de vos métiers. Rien ne vous attend pour
        l&apos;instant.
      </p>
      <p>
        Si vous acceptez de vous déplacer plus loin, ou si vous exercez un métier que votre profil
        ne mentionne pas, c&apos;est sur votre compte que cela se règle.
      </p>
      <BoutonLien variante="secondaire" taille="sm" href={CHEMINS.monCompte}>
        Voir mon rayon et mes métiers
      </BoutonLien>
    </Carte>
  );
}

function Echec({ phrase }: { phrase: string }): ReactNode {
  return (
    <Carte className={styles.etatEchec}>
      <h2 className={styles.titreEtat}>Les chantiers n&apos;ont pas pu être chargés</h2>
      <p className={styles.phraseEchec} role="alert">
        {phrase}
      </p>
      <p>
        Vos devis déjà envoyés ne sont pas affectés : ils sont dans votre liste de devis, et le
        client les voit.
      </p>
      <BoutonLien variante="secondaire" taille="sm" href={CHEMINS.mesDevis}>
        Voir mes devis
      </BoutonLien>
    </Carte>
  );
}

/* ── Une carte de chantier ──────────────────────────────────────────────── */

function Chantier({ besoin, dejaChiffre }: { besoin: BesoinPourMoi; dejaChiffre: boolean }) {
  return (
    <Carte balise="li" className={styles.chantier}>
      <div className={styles.enTeteChantier}>
        <span className={styles.metier}>{libelleMetier(besoin.metier)}</span>
        <Distance metres={besoin.distanceMetres} className={styles.distance} />
      </div>

      <h2 className={styles.titreChantier}>{besoin.titre}</h2>

      <p className={styles.provenance}>
        Déposé par {besoin.nomDemandeur}, le {formaterDate(besoin.createdAt) ?? ''}
      </p>

      <p className={styles.description}>{besoin.description}</p>

      <p className={styles.budget}>
        {besoin.budgetMaxCentimes === null ? (
          <span className={styles.sansBudget}>Aucun budget annoncé</span>
        ) : (
          <>
            <span className={styles.libelleBudget}>Budget annoncé&nbsp;: </span>
            <Montant centimes={besoin.budgetMaxCentimes} />
            <span className={styles.nuanceBudget}> au plus</span>
          </>
        )}
      </p>

      {dejaChiffre ? (
        <div className={styles.dejaChiffre}>
          <p>Vous avez déjà un devis en cours sur ce chantier.</p>
          <BoutonLien variante="fantome" taille="sm" href={CHEMINS.mesDevis}>
            Le relire ou le retirer
          </BoutonLien>
        </div>
      ) : (
        <ProposerDevis besoin={besoin._id} titre={besoin.titre} />
      )}
    </Carte>
  );
}

/* ── La liste, derrière la frontière de suspense ────────────────────────── */

async function ListeChantiers(): Promise<ReactNode> {
  let reponse: ReponseChantiers;
  try {
    reponse = await appelerGraphQLAvecSession<ReponseChantiers>(REQUETE_CHANTIERS);
  } catch (erreur) {
    return <Echec phrase={phraseDErreur(erreur)} />;
  }

  const { besoinsPourMoi, mesDevis } = reponse;
  if (besoinsPourMoi.length === 0) return <Vide />;

  // `chantier` est nullable dans le schéma : le chargeur groupé rend `null`
  // pour un besoin disparu. Un tel devis ne bloque alors aucune carte.
  const chantiersDejaChiffres = new Set(
    mesDevis.flatMap((devis) =>
      STATUTS_VIVANTS.includes(devis.statut) && devis.chantier ? [devis.chantier._id] : [],
    ),
  );

  return (
    <>
      <p className={styles.compte}>
        <span className="nombre">{besoinsPourMoi.length}</span>
        {besoinsPourMoi.length > 1 ? ' chantiers ouverts' : ' chantier ouvert'} dans votre rayon
      </p>
      <ul className={styles.liste}>
        {besoinsPourMoi.map((besoin) => (
          <Chantier
            key={besoin._id}
            besoin={besoin}
            dejaChiffre={chantiersDejaChiffres.has(besoin._id)}
          />
        ))}
      </ul>
    </>
  );
}

/* ── La page ────────────────────────────────────────────────────────────── */

export default async function PageChantiers() {
  // `exigerRole` redirige un client vers l'accueil et un visiteur vers la
  // connexion, avec le retour ici. La protection réelle reste celle de l'API,
  // qui refuse `besoinsPourMoi` à tout autre rôle.
  await exigerRole(['ARTISAN'], { suite: CHEMINS.chantiers });
  return (
    <div className={styles.page}>
      <header className={styles.ouverture}>
        <p className={styles.surtitre}>Espace artisan</p>
        <h1 className={styles.titre}>Chantiers à chiffrer</h1>
        <p className={styles.chapeau}>
          Ces chantiers sont ouverts, relèvent de vos métiers, et leur adresse tombe dans le rayon
          que vous avez déclaré.
        </p>
        {/* La phrase sur l'adresse est dite ICI, une fois, et pas répétée sur
            chaque carte : c'est une règle de la place de marché, pas une
            particularité de telle annonce. */}
        <p className={styles.garantie}>
          L&apos;adresse exacte ne figure pas sur un chantier ouvert. Elle vous est communiquée
          avec la réservation, si votre devis est retenu — c&apos;est ce que nous promettons au
          client qui publie chez nous. D&apos;ici là, vous avez son prénom et la distance.
        </p>
      </header>

      <Suspense fallback={<Squelette cartes={3} lignes={3} annonce="Chargement des chantiers…" />}>
        <ListeChantiers />
      </Suspense>
    </div>
  );
}
