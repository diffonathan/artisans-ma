'use server';

/* ══════════════════════════════════════════════════════════════════════════
   LES TROIS ÉCRITURES DE L'ARTISAN

   Proposer un devis, le retirer, déclarer une prestation terminée. Même forme
   de retour que `app/actions/authentification.ts` : un `EtatFormulaire`,
   jamais une exception. Un refus du domaine — « vous avez déjà un devis en
   cours sur ce besoin » — est une réponse normale de l'API, et l'afficher dans
   la frontière d'erreur effacerait la liste de chantiers que l'artisan venait
   de lire.

   ── Le contrôle de rôle est ici AUSSI, et pas seulement dans les pages ─────

   `02-guides/server-actions.md` est explicite : une Server Action est
   joignable par une requête POST directe, hors de toute interface. La garde
   de la page ne protège donc rien du tout pour l'action. `exigerRole` est
   appelé au début de chacune des trois, et ce n'est pas une redondance : sans
   lui, un client connecté pourrait poster `proposerDevis`. L'API refuserait
   (`@Roles(Role.ARTISAN)`), mais on aurait laissé la question se poser.

   ── Pourquoi `refresh()` et pas `updateTag()` ──────────────────────────────

   `updateTag` expire une étiquette de cache. Les quatre écrans de l'artisan
   n'en posent aucune : ils lisent par `appelerGraphQLAvecSession`, qui lit un
   cookie — ce qui rend la route dynamique — et envoie son `fetch` en
   `cache: 'no-store'`. Il n'y a rien à expirer, et `updateTag(ETIQUETTE_SESSION)`
   ne ferait qu'invalider les données d'un compte qui n'a pas changé.

   Ce qui manque après une mutation, c'est le NOUVEAU RENDU. Et
   `02-guides/server-actions.md` prévient : « An action that does none of the
   above carries only its return value, and the current route is not
   re-rendered. » Autrement dit, sans appel de réactualisation, l'artisan
   verrait son devis accepté par l'API et la carte inchangée à l'écran.
   `refresh()` demande ce rendu, et le fait voyager dans la réponse de
   l'action — un seul aller-retour.

   C'est ce qui donne à `/chantiers` son état de succès : la carte ne contient
   plus le formulaire, mais la mention « devis envoyé ». Il n'y a pas de
   drapeau de réussite à faire circuler dans `EtatFormulaire`.
   ══════════════════════════════════════════════════════════════════════════ */

import { refresh } from 'next/cache';

import { centimesDepuisDirhams, phraseRefusMontant } from '@/lib/argent';
import type { EtatFormulaire } from '@/lib/formulaire';
import { phraseDErreur } from '@/lib/erreurs';
import { appelerGraphQLAvecSession } from '@/lib/graphql';
import { exigerRole } from '@/lib/session';

/* ── Lecture des champs ─────────────────────────────────────────────────── */

const texte = (donnees: FormData, champ: string): string => {
  const valeur = donnees.get(champ);
  return typeof valeur === 'string' ? valeur.trim() : '';
};

/**
 * Un identifiant MongoDB, tel que `@IsMongoId()` l'attend côté API.
 *
 * Il ne vient jamais d'une saisie : il est posé dans un champ caché par
 * l'écran. Le contrôler n'est donc pas de la validation de formulaire, c'est
 * se garder d'un POST fabriqué — et surtout obtenir une phrase lisible plutôt
 * qu'un « Bad Request Exception » si un jour un écran passe un identifiant
 * vide.
 */
const IDENTIFIANT = /^[0-9a-f]{24}$/i;

const DELAI_MINIMAL = 1;
const DELAI_MAXIMAL = 365;
const MESSAGE_MINIMAL = 10;
const MESSAGE_MAXIMAL = 2000;

/* ── Les mutations, telles que `api/schema.graphql` les déclare ──────────── */

const MUTATION_PROPOSER = `
  mutation ProposerDevis($entree: EntreeDevisGql!) {
    proposerDevis(entree: $entree) { _id statut }
  }
`;

const MUTATION_RETIRER = `
  mutation RetirerDevis($id: ID!) {
    retirerDevis(id: $id) { _id statut }
  }
`;

const MUTATION_TERMINER = `
  mutation TerminerPrestation($id: ID!) {
    terminerPrestation(id: $id) { _id statut }
  }
`;

/* ── Proposer un devis ──────────────────────────────────────────────────── */

/**
 * Champs attendus : `besoin` (caché), `montant` (en dirhams), `delaiJours`,
 * `message`.
 *
 * Le montant est saisi en DIRHAMS et converti en centimes avant l'appel.
 * C'est le seul endroit du front où cette conversion a lieu — voir
 * `app/chantiers/montant.ts` et son test.
 */
export const proposerDevis = async (
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> => {
  await exigerRole(['ARTISAN']);

  const besoin = texte(donnees, 'besoin');
  const montantSaisi = texte(donnees, 'montant');
  const delaiSaisi = texte(donnees, 'delaiJours');
  const message = texte(donnees, 'message');

  // Le montant est réaffiché TEL QUE SAISI, et non reformaté depuis les
  // centimes : quelqu'un qui a tapé « 4500,555 » doit retrouver sa frappe pour
  // voir où est la décimale de trop.
  const valeurs = { montant: montantSaisi, delaiJours: delaiSaisi, message };
  const erreurs: Record<string, string> = {};

  if (!IDENTIFIANT.test(besoin)) {
    return { message: "Ce chantier n'est pas identifiable. Rechargez la liste.", valeurs };
  }

  const montant = centimesDepuisDirhams(montantSaisi);
  // Le résultat est extrait AVANT le regroupement des erreurs : après un
  // `if (Object.keys(erreurs).length > 0) return`, TypeScript ne sait plus que
  // `montant.ok` est vrai, et il faudrait une assertion pour le lui dire.
  const montantCentimes = montant.ok ? montant.centimes : null;
  if (!montant.ok) erreurs.montant = phraseRefusMontant(montant.raison);

  const delaiJours = Number(delaiSaisi);
  if (delaiSaisi === '' || !Number.isInteger(delaiJours)) {
    erreurs.delaiJours = 'Indiquez un nombre de jours entier.';
  } else if (delaiJours < DELAI_MINIMAL || delaiJours > DELAI_MAXIMAL) {
    erreurs.delaiJours = `Le délai va de ${DELAI_MINIMAL} à ${DELAI_MAXIMAL} jours.`;
  }

  if (message.length < MESSAGE_MINIMAL) {
    erreurs.message = `Décrivez ce que vous comptez faire, en ${MESSAGE_MINIMAL} caractères au moins.`;
  } else if (message.length > MESSAGE_MAXIMAL) {
    erreurs.message = `Ce message dépasse ${MESSAGE_MAXIMAL} caractères.`;
  }

  if (montantCentimes === null || Object.keys(erreurs).length > 0) {
    return { erreurs, valeurs };
  }

  try {
    await appelerGraphQLAvecSession(MUTATION_PROPOSER, {
      variables: {
        entree: { besoin, montantCentimes, delaiJours, message },
      },
    });
  } catch (erreur) {
    // Le refus pour doublon porte sa propre consigne — « Retirez-le pour en
    // déposer un autre. » — rédigée par `devis.service.ts`. La réécrire ici
    // la ferait dériver du jour où l'API changerait de règle.
    return { message: phraseDErreur(erreur), valeurs };
  }

  refresh();
  return {};
};

/* ── Retirer un devis ───────────────────────────────────────────────────── */

/**
 * Champ attendu : `devis` (caché).
 *
 * L'écran ne propose cette action que sur un devis `ENVOYE`, parce que c'est
 * le seul statut que l'API accepte de retirer. Le refus reste traité : entre
 * l'affichage de la liste et le clic, le client a pu accepter le devis.
 */
export const retirerDevis = async (
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> => {
  await exigerRole(['ARTISAN']);

  const devis = texte(donnees, 'devis');
  if (!IDENTIFIANT.test(devis)) {
    return { message: "Ce devis n'est pas identifiable. Rechargez la liste." };
  }

  try {
    await appelerGraphQLAvecSession(MUTATION_RETIRER, { variables: { id: devis } });
  } catch (erreur) {
    return { message: phraseDErreur(erreur) };
  }

  refresh();
  return {};
};

/* ── Déclarer une prestation terminée ───────────────────────────────────── */

/**
 * Champ attendu : `reservation` (caché).
 *
 * N'aboutit qu'au statut `PAYEE` : c'est une comparaison-et-échange côté API
 * (`reservations.service.ts`), donc deux clics simultanés ne terminent la
 * prestation qu'une fois. L'écran n'a rien à verrouiller.
 */
export const terminerPrestation = async (
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> => {
  await exigerRole(['ARTISAN']);

  const reservation = texte(donnees, 'reservation');
  if (!IDENTIFIANT.test(reservation)) {
    return { message: "Cette intervention n'est pas identifiable. Rechargez la page." };
  }

  try {
    await appelerGraphQLAvecSession(MUTATION_TERMINER, { variables: { id: reservation } });
  } catch (erreur) {
    return { message: phraseDErreur(erreur) };
  }

  refresh();
  return {};
};
