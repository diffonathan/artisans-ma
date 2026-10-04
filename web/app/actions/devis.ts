'use server';

/* ══════════════════════════════════════════════════════════════════════════
   ACCEPTER UN DEVIS

   L'action la plus lourde de conséquences du parcours client. Côté API, elle
   fait quatre écritures dans une seule transaction : le besoin passe
   ATTRIBUE, le devis passe ACCEPTE, les devis concurrents passent REFUSE, et
   une réservation naît avec le montant et l'adresse RECOPIÉS. Rien de tout
   cela ne se défait par un écran.

   ── Pourquoi une confirmation explicite, et pas seulement un bouton ───────

   Parce que l'irréversibilité n'est pas devinable. Un bouton « Accepter »
   ressemble à « Enregistrer », et le client qui l'actionne pour comparer de
   plus près vient de refuser trois artisans. L'écran dit donc ce que
   l'acceptation déclenche, et le formulaire exige en plus une case cochée :
   `confirmation` est vérifiée ici, côté serveur, et pas seulement par
   l'attribut `required` du navigateur — une Server Action est joignable par
   un POST direct, sans passer par le formulaire.

   ── Après la mutation : `refresh`, sans `redirect` ────────────────────────

   Le client doit voir SON changement sur la page où il vient d'agir : le
   devis retenu marqué « Accepté », les autres « Refusé », le chantier
   « Attribué ». `refresh()` rafraîchit le routeur client, et la page étant
   dynamique (elle lit le cookie de session), son rendu suivant relit l'API.

   `updateTag` n'a rien à expirer ici : aucune lecture de cette application
   n'est étiquetée, `appelerGraphQL` imposant `cache: 'no-store'` et disant
   pourquoi. Le raisonnement complet est en tête de `app/actions/besoins.ts`.

   Pas de `redirect` vers les réservations non plus : le client vient de
   prendre une décision, et l'écran qui l'enregistre est celui où il doit la
   voir enregistrée. Le chemin vers la réservation lui est proposé, pas
   imposé.

   Lu dans `01-getting-started/07-mutating-data.md`,
   `03-api-reference/04-functions/refresh.md` et
   `03-api-reference/04-functions/updateTag.md`.
   ══════════════════════════════════════════════════════════════════════════ */

import { refresh } from 'next/cache';

import { phraseDErreur } from '@/lib/erreurs';
import { appelerGraphQLAvecSession } from '@/lib/graphql';
import { exigerRole } from '@/lib/session';
import { validerCreneau } from '@/app/mes-besoins/calculs';
import type { EtatFormulaire } from '@/lib/formulaire';

const texte = (donnees: FormData, champ: string): string => {
  const valeur = donnees.get(champ);
  return typeof valeur === 'string' ? valeur.trim() : '';
};

const MUTATION_ACCEPTER = `
  mutation AccepterDevis($id: ID!, $creneau: EntreeCreneau!) {
    accepterDevis(id: $id, creneau: $creneau) {
      _id
      statut
      montantCentimes
      commissionCentimes
    }
  }
`;

/**
 * Accepte un devis sur un créneau.
 *
 * Champs attendus : `devis` (identifiant), `debut` et `fin` (la valeur brute
 * de deux champs `datetime-local`), `confirmation` (la case cochée).
 *
 * Les deux bornes arrivent telles que le navigateur les écrit —
 * « 2026-10-07T09:00 », une heure sans fuseau — et `validerCreneau` les lit
 * comme des heures MAROCAINES, parce que c'est l'heure à laquelle l'artisan
 * sonne à la porte. Le raisonnement et le piège de `new Date` sont dans
 * `app/mes-besoins/calculs.ts`.
 */
export const accepterDevis = async (
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> => {
  // Hors du `try` : `exigerRole` lève l'exception de contrôle de flux de
  // `redirect`, qu'un `catch` prendrait pour un refus de l'API.
  await exigerRole(['CLIENT']);

  const devis = texte(donnees, 'devis');
  const debut = texte(donnees, 'debut');
  const fin = texte(donnees, 'fin');
  const confirmation = donnees.get('confirmation') !== null;

  // Les valeurs rendues au formulaire : le devis choisi et les deux bornes du
  // créneau telles qu'elles ont été saisies. Sans elles, un refus de l'API
  // replierait le panneau de choix et le client recommencerait tout.
  const valeurs: Record<string, string> = { devis, debut, fin };

  if (devis === '') {
    return { message: 'Choisissez le devis à accepter.', valeurs };
  }

  const creneau = validerCreneau(debut, fin, new Date());
  if (creneau.etat === 'refus') return { erreurs: creneau.erreurs, valeurs };

  if (!confirmation) {
    return {
      erreurs: {
        confirmation:
          'Cochez la case : accepter refuse les autres devis et crée une réservation.',
      },
      valeurs,
    };
  }

  try {
    await appelerGraphQLAvecSession<{ accepterDevis: { _id: string } }>(MUTATION_ACCEPTER, {
      variables: { id: devis, creneau: { debut: creneau.debut, fin: creneau.fin } },
    });
  } catch (erreur) {
    // Les refus du domaine arrivent ici avec leur phrase française déjà
    // rédigée — « Ce devis n'existe pas, ou n'est plus acceptable. », « Ce
    // besoin ne vous appartient pas, ou un devis a déjà été accepté. » — et
    // `phraseDErreur` les garde telles quelles. Les remplacer par un message
    // maison effacerait la seule information utile : le devis a-t-il été
    // retiré, ou un autre a-t-il déjà été accepté ?
    return { message: phraseDErreur(erreur), valeurs };
  }

  refresh();

  // Un état vide, et non un message de réussite : la page relit l'API et
  // affiche le devis marqué « Accepté » et le chantier « Attribué ». Dire
  // « c'est fait » en plus de le montrer ferait deux sources, dont une qui
  // pourrait mentir si la relecture échouait.
  return {};
};
