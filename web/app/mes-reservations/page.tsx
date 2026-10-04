/* ══════════════════════════════════════════════════════════════════════════
   /mes-reservations — SUIVRE UNE PRESTATION, PUIS LA NOTER

   L'écran du CLIENT. Une réservation naît quand il accepte un devis : le
   montant, la commission et l'adresse y sont recopiés — figés — et c'est de
   là que part tout le reste du parcours.

   ── Le chantier n'est pas décoratif ───────────────────────────────────────
   `chantier { titre }` est la première ligne de chaque carte, avant le
   montant. Sans lui, la liste dit « 450,00 DH, le 8 octobre, Plomberie
   Ouazzani » : juste, et illisible. C'est le titre du chantier qui dit de
   quelle intervention on parle.

   ── Qui voit quoi, du côté du client ──────────────────────────────────────
   `adresseIntervention` est affichée ici, et c'est légitime : le lecteur est
   le client, propriétaire du chantier. Ce que l'écran dit en plus, c'est
   POURQUOI elle se trouve sur la réservation — l'adresse est recopiée à
   l'acceptation du devis, et c'est ce qui permet à l'artisan retenu de la
   lire sans qu'elle soit exposée sur le besoin à tous les autres.

   ── Trois états, pas un ──────────────────────────────────────────────────
   Chargement : la liste est demandée en parallèle du nom du compte et rendue
   dans une frontière `Suspense`, donc l'ossature de la page s'affiche
   immédiatement et la liste arrive après.
   Vide : le compte `leila.amrani@exemple.ma` n'a aucune réservation, et
   l'écran dit par quel chemin on en obtient une.
   Erreur : `chargerReservations` ne rejette JAMAIS. Elle rend un résultat
   étiqueté, et la page affiche la phrase de l'API dans une carte — la
   frontière d'erreur globale (`app/error.tsx`) resterait réservée à
   l'imprévu, et elle effacerait l'en-tête pour une API momentanément éteinte.
   ══════════════════════════════════════════════════════════════════════════ */

import { Suspense } from 'react';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { BoutonLien } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { Squelette } from '@/components/Squelette';
import { CHEMINS, CHEMINS_AVEC_ID } from '@/components/chemins';
import { Etiquette } from '@/components/Etiquette';
import { Montant } from '@/components/Montant';
import { formaterCreneau, formaterDate } from '@/lib/dates';
import { estNonAuthentifie, phraseDErreur } from '@/lib/erreurs';
import { appelerGraphQLAvecSession } from '@/lib/graphql';
import type { StatutReservation } from '@/lib/domaine';
import { exigerRole } from '@/lib/session';

import { Actions } from './Actions';
import { DepotDAvis } from './DepotDAvis';
import { actionsPossibles } from './regles';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Mes réservations',
  description:
    'Le suivi de vos prestations : le montant figé à l’acceptation du devis, le créneau, ' +
    'l’adresse d’intervention, et le dépôt d’avis une fois la prestation terminée.',
  // Aucune clé `icons` : l'icône d'onglet est `app/icon.svg`, par la
  // convention de fichier. Un `icons` déclaré ici l'écraserait en silence —
  // le raisonnement complet est dans `app/layout.tsx`.
};

/* ── Ce que l'API rend, tel que `api/schema.graphql` le déclare ──────────── */

interface Reservation {
  _id: string;
  statut: StatutReservation;
  montantCentimes: number;
  commissionCentimes: number;
  creneau: { debut: string; fin: string };
  adresseIntervention: string;
  avisDeposeA: string | null;
  /** Nullable au schéma : le chantier est résolu par chargeur groupé. */
  chantier: { titre: string } | null;
  /** Nullable au schéma, pour la même raison. */
  prestataire: { raisonSociale: string; _id: string } | null;
}

const REQUETE_MES_RESERVATIONS = `
  query MesReservations {
    mesReservations {
      _id
      statut
      montantCentimes
      commissionCentimes
      creneau { debut fin }
      adresseIntervention
      avisDeposeA
      chantier { titre }
      prestataire { raisonSociale _id }
    }
  }
`;

/* ── Le chargement, qui ne rejette jamais ───────────────────────────────── */

type Chargement =
  | { ok: true; reservations: Reservation[] }
  | { ok: false; sessionExpiree: boolean; phrase: string };

/**
 * Demande la liste et transforme tout refus en valeur.
 *
 * La promesse est créée AVANT d'être attendue, pour partir en même temps que
 * celle du nom du compte. Une promesse rejetée qui attend son `await` produit
 * un rejet non traité dans Node ; celle-ci ne peut pas rejeter, ce qui rend
 * l'ordre des `await` sans conséquence.
 */
async function chargerReservations(): Promise<Chargement> {
  try {
    const reponse = await appelerGraphQLAvecSession<{ mesReservations: Reservation[] }>(
      REQUETE_MES_RESERVATIONS,
    );
    return { ok: true, reservations: reponse.mesReservations };
  } catch (erreur) {
    return {
      ok: false,
      sessionExpiree: estNonAuthentifie(erreur),
      phrase: phraseDErreur(erreur),
    };
  }
}

/* ── Les morceaux de l'écran ─────────────────────────────────────────────── */

/** Aucune réservation : dire par quel chemin on en obtient une. */
function AucuneReservation() {
  return (
    <Carte padding="lg" className={styles.vide}>
      <h2 className={styles.titreVide}>Aucune réservation pour l&apos;instant</h2>
      <p className={styles.texteVide}>
        Une réservation naît lorsque vous acceptez un devis sur l&apos;un de vos chantiers. Le
        montant y est alors figé, et l&apos;artisan retenu reçoit votre adresse.
      </p>
      <div className={styles.cheminsVide}>
        <BoutonLien variante="primaire" href={CHEMINS.publierBesoin}>
          Publier un chantier
        </BoutonLien>
        <BoutonLien variante="secondaire" href={CHEMINS.mesBesoins}>
          Voir mes chantiers et leurs devis
        </BoutonLien>
      </div>
    </Carte>
  );
}

/** L'API a dit non, ou n'a pas répondu. */
function EchecDeChargement({ sessionExpiree, phrase }: { sessionExpiree: boolean; phrase: string }) {
  return (
    <Carte padding="lg" className={styles.echec}>
      <h2 className={styles.titreVide}>Vos réservations n&apos;ont pas pu être lues</h2>
      <p className={styles.texteVide}>{phrase}</p>
      {sessionExpiree ? (
        <div className={styles.cheminsVide}>
          <BoutonLien
            variante="primaire"
            href={`${CHEMINS.connexion}?suite=${encodeURIComponent(CHEMINS.mesReservations)}`}
          >
            Se reconnecter
          </BoutonLien>
        </div>
      ) : null}
    </Carte>
  );
}

/** Une ligne de la fiche : un intitulé, une valeur. */
function Ligne({
  intitule,
  children,
  precision,
}: {
  intitule: string;
  children: ReactNode;
  precision?: string;
}) {
  return (
    <div className={styles.ligne}>
      <dt className={styles.intitule}>{intitule}</dt>
      <dd className={styles.valeur}>
        {children}
        {precision ? <span className={styles.precision}>{precision}</span> : null}
      </dd>
    </div>
  );
}

function CarteReservation({ reservation }: { reservation: Reservation }) {
  const { payer, annuler, noter } = actionsPossibles(reservation.statut, reservation.avisDeposeA);
  const creneau = formaterCreneau(reservation.creneau.debut, reservation.creneau.fin);
  const jourDeLAvis = reservation.avisDeposeA ? formaterDate(reservation.avisDeposeA) : null;

  return (
    <Carte balise="li" padding="lg" className={styles.reservation}>
      <header className={styles.enTete}>
        <div className={styles.identite}>
          {/*
           * Le titre du chantier peut manquer : `chantier` est nullable au
           * schéma. L'écran le dit au lieu d'afficher un vide — un champ nul
           * n'est pas une erreur, c'est une absence.
           */}
          <h2 className={styles.titreReservation}>
            {reservation.chantier?.titre ?? 'Chantier introuvable'}
          </h2>
          {reservation.prestataire ? (
            <p className={styles.prestataire}>
              Confiée à{' '}
              <Link
                className={styles.lienArtisan}
                href={CHEMINS_AVEC_ID.ficheArtisan(reservation.prestataire._id)}
              >
                {reservation.prestataire.raisonSociale}
              </Link>
            </p>
          ) : (
            <p className={styles.prestataire}>L&apos;artisan de cette réservation est introuvable.</p>
          )}
        </div>
        <Etiquette statut={reservation.statut} />
      </header>

      <dl className={styles.fiche}>
        <Ligne
          intitule="Montant convenu"
          precision="Figé à l'acceptation du devis : une modification du devis ne le change plus."
        >
          <Montant centimes={reservation.montantCentimes} taille="grand" />
        </Ligne>

        <Ligne intitule="Dont commission de la place de marché">
          <Montant centimes={reservation.commissionCentimes} />
        </Ligne>

        <Ligne intitule="Créneau" precision="Heure du Maroc.">
          {creneau ? (
            creneau.memeJour ? (
              <>
                {creneau.debutJour}, de <span className="nombre">{creneau.debutHeure}</span> à{' '}
                <span className="nombre">{creneau.finHeure}</span>
              </>
            ) : (
              <>
                du {creneau.debutJour} à <span className="nombre">{creneau.debutHeure}</span> au{' '}
                {creneau.finJour} à <span className="nombre">{creneau.finHeure}</span>
              </>
            )
          ) : (
            "Le créneau enregistré n'est pas lisible."
          )}
        </Ligne>

        <Ligne
          intitule="Adresse d'intervention"
          precision="Recopiée sur la réservation à l'acceptation du devis. Seul l'artisan retenu la lit ; les autres ne l'ont jamais reçue."
        >
          {reservation.adresseIntervention}
        </Ligne>
      </dl>

      {/* Les actions possibles, et elles seules. ANNULEE n'en a aucune. */}
      <Actions reservation={reservation._id} peutPayer={payer} peutAnnuler={annuler} />

      {noter ? (
        <DepotDAvis
          reservation={reservation._id}
          prestataire={reservation.prestataire?.raisonSociale ?? null}
        />
      ) : null}

      {jourDeLAvis ? (
        <p className={styles.avisDepose}>
          Votre avis a été déposé le {jourDeLAvis}. Il ne peut pas être déposé deux fois : la note
          de l&apos;artisan a été recalculée dans la même écriture.
        </p>
      ) : null}
    </Carte>
  );
}

async function ListeDesReservations({ chargement }: { chargement: Promise<Chargement> }) {
  const resultat = await chargement;

  if (!resultat.ok) {
    return <EchecDeChargement sessionExpiree={resultat.sessionExpiree} phrase={resultat.phrase} />;
  }

  if (resultat.reservations.length === 0) return <AucuneReservation />;

  return (
    <ol className={styles.liste}>
      {resultat.reservations.map((reservation) => (
        <CarteReservation key={reservation._id} reservation={reservation} />
      ))}
    </ol>
  );
}

/* ── La page ─────────────────────────────────────────────────────────────── */

export default async function PageMesReservations() {
  /*
   * `mesReservations` est réservée au rôle CLIENT côté API — ADMIN compris,
   * dont le jeton serait refusé. Rediriger ici évite d'afficher une page dont
   * chaque requête échoue ; la protection réelle reste celle de l'API.
   */
  await exigerRole(['CLIENT'], { suite: CHEMINS.mesReservations });

  // La promesse est lancée SANS `await` : elle est confiée à la frontière
  // `Suspense` ci-dessous, donc l'ossature de la page s'affiche pendant que
  // l'API répond.
  const chargement = chargerReservations();

  return (
    <div className={styles.page}>
      <header className={styles.ouverture}>
        <p className={styles.surtitre}>Mes prestations</p>
        <h1 className={styles.titre}>Mes réservations</h1>
        <p className={styles.chapeau}>
          De la plus récente à la plus ancienne. Chaque réservation porte le montant convenu, le
          créneau et l&apos;adresse d&apos;intervention, tels qu&apos;ils ont été figés quand vous
          avez accepté le devis.
        </p>
      </header>

      <Suspense fallback={<Squelette cartes={3} lignes={3} annonce="Chargement de vos réservations." />}>
        <ListeDesReservations chargement={chargement} />
      </Suspense>
    </div>
  );
}
