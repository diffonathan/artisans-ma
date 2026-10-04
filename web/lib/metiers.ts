/* ══════════════════════════════════════════════════════════════════════════
   LES HUIT MÉTIERS, EN FRANÇAIS, EN UN SEUL ENDROIT

   Trois agents ont écrit cette table, à l'identique, dans trois dossiers de
   route différents :

     • `app/inscription/FormulaireArtisan.tsx` — `LIBELLES_METIERS` ;
     • `app/recherche/criteres.ts` — `LIBELLES_METIER` + `METIERS_ORDONNES`,
       avec en commentaire « CE TABLEAU DEVRAIT ÊTRE DANS LE SOCLE » ;
     • `app/chantiers/libelles.ts` — `libelleMetier()`.

   Deux routes de client importaient déjà la version de la RECHERCHE, et la
   fiche d'artisan aussi : un import d'un dossier de route vers un autre, qui
   est le symptôme du manque et non un choix. Les trois copies sont ici.

   ── Pourquoi `lib/` et non `components/` ──────────────────────────────────

   Il n'y a pas de JSX ici. `components/` porte des composants ; une table de
   traduction et un comparateur sont des données, et `lib/` est déjà là pour
   ça — c'est où vivent `destination.ts` et `domaine.ts`.
   ══════════════════════════════════════════════════════════════════════════ */

import { METIERS, type Metier } from '@/lib/domaine';

/**
 * Les huit valeurs de l'énumération `Metier`, écrites comme on les lit.
 *
 * `Record<Metier, string>` et non un objet littéral : si l'API ajoute un
 * neuvième métier, l'absence de libellé devient une erreur de compilation au
 * lieu d'une option vide dans une liste déroulante.
 */
export const LIBELLES_METIER: Record<Metier, string> = {
  CARRELAGE: 'Carrelage',
  CLIMATISATION: 'Climatisation',
  ELECTRICITE: 'Électricité',
  MACONNERIE: 'Maçonnerie',
  MENUISERIE: 'Menuiserie',
  PEINTURE: 'Peinture',
  PLOMBERIE: 'Plomberie',
  SERRURERIE: 'Serrurerie',
};

/**
 * Les métiers dans l'ordre alphabétique de leur LIBELLÉ, pour les listes.
 *
 * L'ordre des libellés et celui des valeurs de l'énumération ne coïncident
 * pas : « Électricité » se classe avant « Maçonnerie » quand `ELECTRICITE`
 * suit `CLIMATISATION`. Trier sur ce que le lecteur voit est le seul tri
 * qu'il puisse anticiper.
 */
export const METIERS_ORDONNES: readonly Metier[] = [...METIERS].sort((a, b) =>
  LIBELLES_METIER[a].localeCompare(LIBELLES_METIER[b], 'fr'),
);

/**
 * Le nom d'un métier reçu de l'API comme une CHAÎNE quelconque.
 *
 * Le repli rend la valeur brute plutôt qu'une phrase d'erreur : si l'API
 * ajoute un métier demain, l'écran affichera « ETANCHEITE » — lisible, et
 * visiblement à traduire — au lieu de mentir avec « Métier inconnu » ou de
 * laisser un vide.
 *
 * À n'employer que là où le type n'est pas `Metier`. Quand il l'est,
 * `LIBELLES_METIER[metier]` est exact et le compilateur le garantit.
 */
export const libelleMetier = (metier: string): string =>
  LIBELLES_METIER[metier as Metier] ?? metier;
