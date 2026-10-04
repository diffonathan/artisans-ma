/* ══════════════════════════════════════════════════════════════════════════
   LES RÈGLES DE L'ÉCRAN « MES RÉSERVATIONS »

   Trois fonctions pures, sans directive et sans dépendance d'exécution : ce
   qui est possible selon le statut, comment se nomme un paiement de
   démonstration, et ce qu'un avis doit contenir.

   L'ÉCRITURE DES DATES a quitté ce fichier pour `lib/dates.ts`. Elle y était
   avec un décalage marocain figé à +60 minutes, donc fausse pendant le
   Ramadan — et trois autres écrans en portaient leur propre version, dont
   deux arbitraient le fuseau autrement. Le module partagé mesure le décalage
   au lieu de le supposer.

   ── Pourquoi un fichier, et pas du code dans la page ──────────────────────
   Les deux Server Actions (`app/actions/reservations.ts`,
   `app/actions/avis.ts`) portent 'use server', et un module 'use server' ne
   peut exporter que des fonctions asynchrones : une fonction pure n'y est pas
   exportable, donc pas testable. Les deux composants d'interaction portent
   'use client', et une valeur exportée depuis un module client n'est qu'une
   référence côté serveur — l'appeler depuis la page échouerait.

   Ces règles sont donc ici, dans le dossier de la route, lisibles par la page
   (serveur) comme par les actions, et éprouvées dans
   `test/mes-reservations.spec.ts`.
   ══════════════════════════════════════════════════════════════════════════ */

import type { StatutReservation } from '@/lib/domaine';

/* ── Ce que le client peut faire, selon où en est la prestation ──────────── */

export interface ActionsPossibles {
  payer: boolean;
  annuler: boolean;
  noter: boolean;
}

/**
 * La table du domaine, et rien de plus.
 *
 *   A_PAYER  → payer, annuler
 *   PAYEE    → annuler
 *   TERMINEE → noter, et seulement si l'avis n'a pas déjà été déposé
 *   ANNULEE  → rien
 *
 * `noter` dépend d'`avisDeposeA` parce que le droit d'avis est un jeton
 * consommé une fois pour toutes (le raisonnement est dans le README de l'API).
 * L'API refuse le second dépôt ; l'écran ne doit pas même l'offrir, sinon il
 * promet une action dont il sait qu'elle sera refusée.
 *
 * Le statut arrive de l'API en chaîne. Une valeur inconnue — un statut ajouté
 * côté serveur sans que cet écran soit repassé — ne doit rien autoriser :
 * c'est pourquoi tout est à `false` au départ plutôt qu'en fin de `switch`.
 */
export function actionsPossibles(
  statut: StatutReservation,
  avisDeposeA: string | null,
): ActionsPossibles {
  switch (statut) {
    case 'A_PAYER':
      return { payer: true, annuler: true, noter: false };
    case 'PAYEE':
      return { payer: false, annuler: true, noter: false };
    case 'TERMINEE':
      return { payer: false, annuler: false, noter: avisDeposeA === null };
    default:
      return { payer: false, annuler: false, noter: false };
  }
}

/* ── Le paiement de démonstration ───────────────────────────────────────── */

/**
 * La référence envoyée à `payerReservation`, dérivée de la réservation.
 *
 * Elle est DÉTERMINISTE, et c'est tout l'intérêt. `enregistrerPaiement`
 * traite le rejeu de la MÊME référence comme « rien à faire », et lève sur une
 * AUTRE référence présentée à une réservation déjà payée — « Cette réservation
 * est déjà au statut PAYEE avec un autre paiement. » Une référence tirée au
 * hasard à chaque appel ferait donc de deux clics sur le même bouton, ou de
 * deux onglets ouverts sur la même page, une incohérence signalée au client
 * alors que son paiement est passé.
 *
 * Le préfixe nomme ce que c'est : aucune de ces références ne vient d'un
 * prestataire de paiement.
 */
export function referenceDePaiement(reservation: string): string {
  return `demonstration-${reservation}`;
}

/* ── L'avis ─────────────────────────────────────────────────────────────── */

export const NOTES = [1, 2, 3, 4, 5] as const;
export const LONGUEUR_COMMENTAIRE_MINIMALE = 10;
const LONGUEUR_COMMENTAIRE_MAXIMALE = 2000;

/**
 * Valide la note et le commentaire, en recopiant les seuils et les phrases des
 * décorateurs de l'API (`api/src/domaine/avis/avis.resolver.ts`).
 *
 * La validation locale n'autorise rien — l'API refuse encore ce qu'elle laisse
 * passer. Elle existe parce que le refus de l'API ne dit pas QUEL champ est en
 * cause : le `ValidationPipe` compose un « Bad Request Exception » dont le
 * détail ne traverse pas le `formatError` (c'est documenté au-dessus de
 * `ErreurApi`, dans `lib/graphql.ts`). Sans elle, un commentaire de huit
 * caractères afficherait un message global sans rien souligner.
 *
 * `note` arrive `null` quand aucune étoile n'est cochée : c'est le cas le plus
 * courant, pas une anomalie.
 */
export function validerAvis(note: number | null, commentaire: string): Record<string, string> {
  const erreurs: Record<string, string> = {};

  if (note === null || !Number.isInteger(note) || note < 1 || note > 5) {
    erreurs.note = 'Choisissez une note, de 1 à 5.';
  }

  if (commentaire.length < LONGUEUR_COMMENTAIRE_MINIMALE) {
    erreurs.commentaire = 'Un avis utile fait au moins dix caractères.';
  } else if (commentaire.length > LONGUEUR_COMMENTAIRE_MAXIMALE) {
    erreurs.commentaire = 'Un avis ne peut pas dépasser 2 000 caractères.';
  }

  return erreurs;
}
