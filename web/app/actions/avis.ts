'use server';

/* ══════════════════════════════════════════════════════════════════════════
   DÉPOSER UN AVIS

   Une seule action, et la plus contrainte de l'application : l'avis n'existe
   que parce qu'une prestation a été payée puis déclarée terminée, et il ne
   peut être déposé qu'une fois. Le droit d'avis est un jeton consommé par
   comparaison-et-échange dans la transaction qui écrit l'avis et recalcule la
   note de l'artisan (`api/README.md`, « garantir un avis sans clé
   étrangère »).

   Conséquence pour l'écran : il n'y a rien à rejouer. Un second dépôt est
   refusé par l'API, et le formulaire n'est affiché que lorsque `avisDeposeA`
   vaut `null` — proposer un champ dont on sait que l'envoi sera refusé est
   une promesse fausse.

   Le refus de l'API, lui, s'affiche tel quel : « Cette prestation n'est pas
   notable : soit elle n'est pas terminée, soit elle a déjà reçu votre avis,
   soit elle ne vous concerne pas. » C'est une phrase unique pour quatre refus
   possibles, et c'est voulu — les distinguer renseignerait un inconnu sur
   l'existence de réservations qui ne sont pas les siennes. La réécrire ici
   effacerait cette intention.
   ══════════════════════════════════════════════════════════════════════════ */

import { refresh } from 'next/cache';

import type { EtatFormulaire } from '@/lib/formulaire';
import { validerAvis } from '@/app/mes-reservations/regles';
import { phraseDErreur } from '@/lib/erreurs';
import { appelerGraphQLAvecSession } from '@/lib/graphql';
import { exigerRole } from '@/lib/session';
import { CHEMINS } from '@/components/chemins';

const texte = (donnees: FormData, champ: string): string => {
  const valeur = donnees.get(champ);
  return typeof valeur === 'string' ? valeur.trim() : '';
};

/**
 * La note, en entier ou `null`.
 *
 * `Number` et non `parseInt` : `parseInt('4 étoiles')` rendrait 4 en silence,
 * là où `Number` rend NaN. Sur une valeur qui vient d'un envoi fabriqué, la
 * première forme accepterait n'importe quoi commençant par un chiffre.
 */
const noteSaisie = (donnees: FormData): number | null => {
  const brut = texte(donnees, 'note');
  if (brut === '') return null;
  const valeur = Number(brut);
  return Number.isFinite(valeur) ? valeur : null;
};

const MUTATION_DEPOSER_AVIS = `
  mutation DeposerAvis($entree: EntreeAvisGql!) {
    deposerAvis(entree: $entree) { _id note createdAt }
  }
`;

interface ReponseAvis {
  _id: string;
  note: number;
  createdAt: string;
}

/**
 * Dépose l'avis d'un client sur une prestation terminée.
 *
 * Champs attendus : `reservation` (caché), `note` (1 à 5), `commentaire`.
 *
 * `valeurs` renvoie le commentaire et la note au formulaire en cas de refus :
 * quelqu'un qui vient d'écrire dix lignes sur son chauffe-eau ne doit pas les
 * perdre parce que l'API était injoignable.
 */
export const deposerAvis = async (
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> => {
  // Même raisonnement que dans `app/actions/reservations.ts` : l'autorisation
  // réelle est celle de l'API ; ceci évite d'afficher un refus de session sous
  // un formulaire que l'on vient de remplir.
  await exigerRole(['CLIENT'], { suite: CHEMINS.mesReservations });

  const reservation = texte(donnees, 'reservation');
  const note = noteSaisie(donnees);
  const commentaire = texte(donnees, 'commentaire');

  const valeurs = { commentaire, note: note === null ? '' : String(note) };

  if (!reservation) {
    // L'identifiant est posé par la page : son absence vient d'un envoi
    // fabriqué, pas d'un visiteur.
    return { message: "La prestation à noter n'a pas été transmise.", valeurs };
  }

  const erreurs = validerAvis(note, commentaire);
  if (Object.keys(erreurs).length > 0) return { erreurs, valeurs };

  try {
    await appelerGraphQLAvecSession<{ deposerAvis: ReponseAvis }>(MUTATION_DEPOSER_AVIS, {
      // Le commentaire envoyé est celui qui a été validé — rogné. L'API
      // compte les caractères sans rogner : envoyer la chaîne brute ferait
      // passer pour valide, ici, un commentaire de dix espaces.
      variables: { entree: { reservation, note, commentaire } },
    });
  } catch (erreur) {
    return { message: phraseDErreur(erreur), valeurs };
  }

  // Après le dépôt, `avisDeposeA` n'est plus `null` : la carte doit cesser
  // d'afficher le formulaire et dire que l'avis est déposé. C'est exactement
  // ce que `refresh()` obtient, dans la réponse de l'action elle-même.
  refresh();
  return {};
};
