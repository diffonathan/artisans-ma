'use server';

/* ══════════════════════════════════════════════════════════════════════════
   PAYER, ANNULER

   Deux Server Actions à la forme du socle : un `EtatFormulaire` en retour,
   jamais une exception. Une action qui lève affiche la frontière d'erreur la
   plus proche, c'est-à-dire qu'un refus de l'API effacerait la liste des
   réservations pour un message que la carte concernée pouvait porter.

   ── `refresh()`, et pourquoi pas `updateTag` ──────────────────────────────

   La page `/mes-reservations` lit le cookie de session, donc elle est
   dynamique et rien n'y est mis en cache sous une étiquette. Il n'y a
   littéralement aucun tag à expirer : `updateTag` serait une incantation sans
   effet, et le lecteur du code croirait qu'une donnée mise en cache existe
   quelque part.

   `refresh()` est l'outil du cas « l'état affiché dépend de ce que l'action
   vient de changer, hors cache » : il refait le rendu de la route et renvoie
   la nouvelle charge RSC DANS LA MÊME réponse que l'action
   (`02-guides/server-actions.md`, « Single-roundtrip response »). Le client
   voit donc son paiement pris en compte sans second aller-retour.

   `revalidateTag`, qui exige un second argument en Next 16, ferait l'inverse
   de ce qu'il faut ici : il rafraîchit en arrière-plan et n'attend pas la
   donnée fraîche pour le rendu qui accompagne la réponse.
   ══════════════════════════════════════════════════════════════════════════ */

import { refresh } from 'next/cache';

import type { EtatFormulaire } from '@/lib/formulaire';
import { referenceDePaiement } from '@/app/mes-reservations/regles';
import { phraseDErreur } from '@/lib/erreurs';
import { appelerGraphQLAvecSession } from '@/lib/graphql';
import { exigerRole } from '@/lib/session';
import { CHEMINS } from '@/components/chemins';

const texte = (donnees: FormData, champ: string): string => {
  const valeur = donnees.get(champ);
  return typeof valeur === 'string' ? valeur.trim() : '';
};

/**
 * Le message d'un champ caché manquant.
 *
 * Il ne peut pas arriver depuis l'écran : l'identifiant est posé par la page.
 * Il arrive d'un envoi fabriqué — une Server Action est joignable par un POST
 * direct. La phrase reste sobre, il n'y a personne à aider.
 */
const RESERVATION_ABSENTE = "La réservation visée n'a pas été transmise.";

const MUTATION_PAYER = `
  mutation PayerReservation($id: ID!, $referencePaiement: String!) {
    payerReservation(id: $id, referencePaiement: $referencePaiement) { _id statut }
  }
`;

const MUTATION_ANNULER = `
  mutation AnnulerReservation($id: ID!) {
    annulerReservation(id: $id) { _id statut }
  }
`;

interface ReponseReservation {
  _id: string;
  statut: string;
}

/**
 * Enregistre le paiement d'une réservation à payer.
 *
 * ── Ce que ce bouton n'est pas ────────────────────────────────────────────
 * En exploitation, le passage à « payée » vient de la notification signée du
 * prestataire de paiement, reçue sur un point d'entrée dédié et vérifiée
 * avant d'être crue — pas du client, qui n'a aucune raison d'être cru sur ce
 * point. La mutation existe pour que le parcours soit jouable sans clé de
 * paiement, et l'écran le dit à côté du bouton : une démonstration qui laisse
 * croire que le client déclare lui-même ses paiements est trompeuse.
 *
 * Champs attendus : `reservation`.
 */
export const payerReservation = async (
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> => {
  /*
   * L'autorisation qui compte est celle de l'API : elle vérifie le rôle CLIENT
   * et l'appartenance de la réservation, et refuse sans jeton valide. Ce
   * garde-fou-ci sert à autre chose — un onglet resté ouvert après l'expiration
   * du jeton renvoie vers la connexion au lieu d'afficher « votre session a
   * expiré » sous un bouton qui ne marchera plus.
   */
  await exigerRole(['CLIENT'], { suite: CHEMINS.mesReservations });

  const reservation = texte(donnees, 'reservation');
  if (!reservation) return { message: RESERVATION_ABSENTE };

  try {
    await appelerGraphQLAvecSession<{ payerReservation: ReponseReservation }>(MUTATION_PAYER, {
      variables: { id: reservation, referencePaiement: referenceDePaiement(reservation) },
    });
  } catch (erreur) {
    return { message: phraseDErreur(erreur) };
  }

  refresh();
  return {};
};

/**
 * Annule une réservation qui n'a pas encore été réalisée.
 *
 * Le besoin redevient OUVERT côté API : le client peut accepter un autre
 * devis. L'écran ne le promet pas plus que ça — il n'a pas la liste des devis
 * sous les yeux.
 *
 * Champs attendus : `reservation`.
 */
export const annulerReservation = async (
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> => {
  await exigerRole(['CLIENT'], { suite: CHEMINS.mesReservations });

  const reservation = texte(donnees, 'reservation');
  if (!reservation) return { message: RESERVATION_ABSENTE };

  try {
    await appelerGraphQLAvecSession<{ annulerReservation: ReponseReservation }>(MUTATION_ANNULER, {
      variables: { id: reservation },
    });
  } catch (erreur) {
    // Le refus de l'API est affiché tel quel. « Cette réservation ne vous
    // appartient pas, ou est déjà terminée ou annulée. » couvre trois cas
    // d'un coup, délibérément : les distinguer renseignerait un inconnu sur
    // l'existence de réservations qui ne sont pas les siennes.
    return { message: phraseDErreur(erreur) };
  }

  refresh();
  return {};
};
