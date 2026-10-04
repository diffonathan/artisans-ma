/**
 * Les calculs du parcours client : l'argent, le créneau, l'ordre des devis et
 * l'écriture des dates.
 *
 * ── Pourquoi ce module existe, et pourquoi il ne contient aucun JSX ───────
 * Les écrans qui s'en servent sont de deux natures : des Server Actions
 * (`app/actions/besoins.ts`, `app/actions/devis.ts`) et deux composants
 * `'use client'`. Ni les unes ni les autres ne s'importent dans un test — les
 * premières traînent `next/navigation` et la session, les seconds exigent un
 * environnement DOM que ce projet n'installe pas. Les fonctions ci-dessous
 * sont des conversions et des validations, c'est-à-dire exactement ce qu'un
 * test sait couvrir, d'où leur sortie des deux. Le raisonnement est celui de
 * `lib/destination.ts` et de `app/inscription/position.ts`.
 *
 * Les cas sont figés dans `test/besoins.spec.ts`.
 *
 * ── Ce qui a quitté ce module ────────────────────────────────────────────
 * `lireBudgetEnDirhams` est dans `lib/argent.ts`, avec la lecture du montant
 * d'un devis : c'était la même arithmétique écrite deux fois.
 * `formaterDateCourte` et `instantDepuisHeureMarocaine` sont dans
 * `lib/dates.ts`, avec les trois autres formateurs de date du projet et une
 * seule décision de fuseau. Ne reste ici que ce qui appartient vraiment au
 * parcours client : les bornes de `EntreeBesoinGql`, l'ordre des devis, et la
 * validation du créneau — que l'API ne fait pas.
 */
import { instantDepuisHeureMarocaine } from '@/lib/dates';
import type { StatutDevis } from '@/lib/domaine';

/* ── Les bornes de l'API, recopiées une seule fois ───────────────────────── */

/**
 * Les longueurs que `EntreeBesoinGql` impose
 * (`api/src/domaine/besoins/besoins.resolver.ts`).
 *
 * Elles sont ici et non dans l'action, parce que le formulaire les affiche —
 * l'attribut `minLength` du champ, et la phrase qui annonce les vingt
 * caractères de la description. Deux copies du même seuil dériveraient.
 */
export const LONGUEURS = {
  titre: { minimum: 5, maximum: 140 },
  description: { minimum: 20, maximum: 4000 },
  adresse: { minimum: 5, maximum: 240 },
} as const;

export type LectureCreneau =
  | { etat: 'ok'; debut: string; fin: string }
  | { etat: 'refus'; erreurs: Record<string, string> };

/**
 * Valide le créneau d'intervention et le rend en instants ISO.
 *
 * L'API ne contrôle que le TYPE des deux bornes (`@IsDate` dans
 * `EntreeCreneau`) : elle accepterait une fin antérieure au début, et la
 * réservation née comme cela ne se répare par aucun écran — le créneau est
 * figé avec le montant. L'ordre des deux bornes est donc vérifié ici, et
 * c'est la seule place où il l'est.
 *
 * `maintenant` est un paramètre et non un `new Date()` interne : un créneau
 * qui commence dans le passé est refusé, et une règle qui dépend de l'horloge
 * ne s'éprouve pas si l'horloge n'est pas fournie.
 */
export const validerCreneau = (
  debutBrut: string,
  finBrut: string,
  maintenant: Date,
): LectureCreneau => {
  const erreurs: Record<string, string> = {};

  const debut = instantDepuisHeureMarocaine(debutBrut);
  const fin = instantDepuisHeureMarocaine(finBrut);

  if (debut === null) erreurs.debut = "Indiquez le jour et l'heure de début.";
  if (fin === null) erreurs.fin = 'Indiquez la fin prévue.';

  if (debut !== null && new Date(debut).getTime() <= maintenant.getTime()) {
    erreurs.debut = 'Ce créneau commence dans le passé. Choisissez une date à venir.';
  }

  // L'égalité est refusée en même temps que l'inversion : un créneau de durée
  // nulle n'est pas une intervention, et il arrive d'un formulaire où la fin a
  // été laissée sur la valeur du début.
  if (debut !== null && fin !== null && new Date(fin).getTime() <= new Date(debut).getTime()) {
    erreurs.fin = 'La fin doit venir après le début.';
  }

  if (Object.keys(erreurs).length > 0) return { etat: 'refus', erreurs };
  // Les deux sont non nuls : toute lecture nulle a posé une erreur plus haut.
  return { etat: 'ok', debut: debut as string, fin: fin as string };
};

/* ── Les devis reçus ─────────────────────────────────────────────────────── */

/**
 * Le nombre de devis reçus, les retirés exclus.
 *
 * Un devis retiré n'a pas été refusé : l'artisan l'a repris lui-même, et
 * l'index unique partiel de l'API lui permet d'en déposer un autre. Le
 * compter annoncerait au client des propositions qu'il ne verra pas.
 */
export const compterDevisRecus = (devis: readonly { statut: StatutDevis }[]): number =>
  devis.filter((candidat) => candidat.statut !== 'RETIRE').length;

/**
 * Remet les devis dans leur ordre d'ARRIVÉE.
 *
 * `Besoin.devisRecus` les rend triés par `montantCentimes` croissant
 * (`besoins.resolver.ts`), donc le moins cher en tête. Afficher cet ordre tel
 * quel ferait de la première ligne une recommandation que personne n'a
 * formulée : sur un chantier, le prix le plus bas est parfois celui qui
 * oublie la fourniture. L'ordre d'arrivée ne classe rien — il raconte
 * l'historique, et laisse la comparaison au lecteur.
 *
 * Le tri porte sur une COPIE : `sort` modifie son tableau, et celui-ci vient
 * de la réponse GraphQL, que le reste de la page lit aussi.
 */
export const ordonnerParArrivee = <T extends { createdAt: string }>(devis: readonly T[]): T[] =>
  [...devis].sort(
    (premier, second) =>
      new Date(premier.createdAt).getTime() - new Date(second.createdAt).getTime(),
  );
