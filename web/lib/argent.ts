/* ══════════════════════════════════════════════════════════════════════════
   LIRE UNE SOMME SAISIE EN DIRHAMS, ET LA RENDRE EN CENTIMES ENTIERS

   ── Ce que ce fichier répare ───────────────────────────────────────────────

   Deux agents ont écrit la même conversion, avec le même raisonnement et deux
   arithmétiques distinctes :

     • `app/chantiers/montant.ts` — `centimesDepuisDirhams`, pour le montant
       d'un devis, plafonné à l'`Int` de GraphQL ;
     • `app/mes-besoins/calculs.ts` — `lireBudgetEnDirhams`, pour le budget
       annoncé d'un besoin, plafonné à dix millions de dirhams.

   Les deux refusaient zéro, acceptaient la virgule, retiraient les espaces de
   groupement et composaient le résultat en entiers. Elles divergeaient sur
   trois détails : l'apostrophe comme séparateur de milliers (acceptée par la
   première, pas par la seconde), le `trim` initial, et le plafond.

   L'ARITHMÉTIQUE est maintenant écrite une fois. Elle est le seul endroit de
   l'application où une erreur d'arrondi peut naître sur de l'argent, et deux
   copies d'un calcul juste finissent par ne plus l'être toutes les deux.

   Les deux lecteurs publics gardent en revanche leur forme et leurs phrases :
   « vide » ne veut pas dire la même chose dans les deux écrans — un devis sans
   montant n'existe pas, un besoin sans budget annoncé est le cas courant.

   ── Pourquoi pas Math.round(Number(saisie) * 100) ──────────────────────────

   Parce que la multiplication porterait sur un flottant. `1.005 * 100` vaut
   100.49999999999999, soit 100 centimes au lieu de 101 ; `Number('4500.55')
   * 100` vaut 450054.99999999994. `Math.round` rattrape le second cas et pas
   le premier, et c'est la forme d'erreur la plus désagréable : juste la
   plupart du temps. La partie entière et les centièmes sont donc lus
   SÉPARÉMENT, en entiers, et composés en entiers. Aucun flottant ne touche de
   l'argent.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Le plafond n'est pas une précaution de confort : `montantCentimes` et
 * `budgetMaxCentimes` sont des `Int` GraphQL, donc des entiers signés sur 32
 * bits. Au-delà, l'API refuse la requête à l'étage de la validation du schéma,
 * avec un `GRAPHQL_VALIDATION_FAILED` qui ne nomme pas le champ. Mieux vaut le
 * dire ici, où l'on sait de quel champ il s'agit.
 */
export const PLAFOND_CENTIMES = 2_147_483_647;

/**
 * Le plafond du budget annoncé : dix millions de dirhams.
 *
 * Posé SOUS l'`Int` de GraphQL, et non dessus : un particulier qui annonce un
 * budget de vingt millions de dirhams s'est trompé de champ ou de zéro, et une
 * phrase française vaut mieux qu'une erreur de schéma.
 */
export const BUDGET_MAXIMUM_CENTIMES = 1_000_000_000;

export type RefusMontant = 'absent' | 'illisible' | 'trop-precis' | 'nul' | 'hors-limite';

export type LectureMontant = { ok: true; centimes: number } | { ok: false; raison: RefusMontant };

/**
 * Ce que l'on retire d'une saisie avant de la lire : toutes les formes de
 * l'espace, et les deux apostrophes.
 *
 * L'espace fine insécable (U+202F) est celle que `Montant` écrit : c'est donc
 * celle qu'un copier-coller depuis un montant affiché rapporte dans le champ.
 * L'apostrophe est le séparateur de milliers de la convention suisse, qu'un
 * clavier produit par habitude.
 */
const SEPARATEURS_DE_MILLIERS = /[\s  '’]/g;

/** Un nombre décimal écrit à la française ou à l'anglaise, et rien d'autre. */
const NOMBRE_SAISI = /^(\d+)(?:[.,](\d+))?$/;

/**
 * L'arithmétique, écrite une fois.
 *
 * Le refus est TYPÉ et non `null` : « vide », « illisible », « trop précis »,
 * « nul » et « hors limite » demandent cinq phrases différentes à l'écran.
 * Rendre `null` pour les cinq obligerait l'appelant à refaire l'analyse pour
 * choisir son message, c'est-à-dire à écrire une deuxième fois la règle — et
 * les deux copies dérivent.
 *
 * Le signe moins n'est pas accepté : ni un devis ni un budget négatif
 * n'existent, et le refuser ici donne une phrase utile là où l'API rendrait
 * « Bad Request Exception ».
 */
export const lireDirhams = (saisie: string, plafondCentimes: number): LectureMontant => {
  const propre = saisie.trim().replace(SEPARATEURS_DE_MILLIERS, '');
  if (propre === '') return { ok: false, raison: 'absent' };

  const morceaux = NOMBRE_SAISI.exec(propre);
  if (!morceaux) return { ok: false, raison: 'illisible' };

  const [, partieEntiere, decimales = ''] = morceaux;
  if (decimales.length > 2) return { ok: false, raison: 'trop-precis' };

  // `padEnd` et non `padStart` : « 450,5 » fait 50 centimes, pas 5.
  const centiemes = Number(decimales.padEnd(2, '0'));

  // La partie entière est bornée AVANT la multiplication : une saisie de
  // trente chiffres produirait sinon un flottant, et `Number.isSafeInteger`
  // sur son produit arriverait trop tard pour dire lequel des deux champs est
  // en cause.
  const dirhams = Number(partieEntiere);
  if (!Number.isSafeInteger(dirhams) || dirhams > Math.floor(plafondCentimes / 100)) {
    return { ok: false, raison: 'hors-limite' };
  }

  const centimes = dirhams * 100 + centiemes;
  if (centimes < 1) return { ok: false, raison: 'nul' };
  if (centimes > plafondCentimes) return { ok: false, raison: 'hors-limite' };

  return { ok: true, centimes };
};

/* ── Le montant d'un devis ───────────────────────────────────────────────── */

/** Lit le montant d'un devis. Un devis sans montant n'existe pas : vide = refus. */
export const centimesDepuisDirhams = (saisie: string): LectureMontant =>
  lireDirhams(saisie, PLAFOND_CENTIMES);

/** La phrase à afficher sous le champ d'un devis, par motif de refus. */
export const phraseRefusMontant = (raison: RefusMontant): string => {
  switch (raison) {
    case 'absent':
      return 'Indiquez le montant de votre devis.';
    case 'illisible':
      return 'Écrivez le montant en chiffres, par exemple 4500 ou 4500,50.';
    case 'trop-precis':
      return 'Deux décimales au plus : le dirham se divise en centimes.';
    case 'nul':
      return 'Un devis à zéro dirham ne peut pas être envoyé.';
    case 'hors-limite':
      return 'Ce montant dépasse ce que la plateforme sait traiter.';
  }
};

/* ── Le budget annoncé d'un besoin ───────────────────────────────────────── */

export type LectureBudget =
  | { etat: 'absent' }
  | { etat: 'invalide'; raison: string }
  | { etat: 'lu'; centimes: number };

/**
 * Lit le budget annoncé d'un besoin.
 *
 * La forme de retour diffère de celle du devis, et c'est le domaine qui le
 * demande : ici « absent » n'est PAS un refus. Ne rien annoncer est un choix
 * que le formulaire doit laisser faire, et le distinguer d'une saisie fautive
 * est tout l'intérêt de ce troisième état.
 */
export const lireBudgetEnDirhams = (saisie: string): LectureBudget => {
  const lecture = lireDirhams(saisie, BUDGET_MAXIMUM_CENTIMES);
  if (lecture.ok) return { etat: 'lu', centimes: lecture.centimes };
  if (lecture.raison === 'absent') return { etat: 'absent' };
  return { etat: 'invalide', raison: phraseRefusBudget(lecture.raison) };
};

/** La phrase à afficher sous le champ de budget, par motif de refus. */
export const phraseRefusBudget = (raison: RefusMontant): string => {
  switch (raison) {
    case 'absent':
      return 'Indiquez un budget, ou laissez le champ vide.';
    case 'illisible':
      return 'Indiquez un montant en dirhams, par exemple 4500 ou 4500,50.';
    case 'trop-precis':
      return 'Deux décimales au plus : le dirham se divise en centimes.';
    case 'nul':
      // Zéro passerait la validation de l'API (`@Min(0)`) et s'afficherait aux
      // artisans comme un budget maximal de 0,00 DH, ce qui écarte d'avance
      // tous les devis. Ne rien annoncer se fait en laissant le champ vide, et
      // la phrase dit lequel des deux gestes est le bon.
      return 'Laissez le champ vide si vous ne voulez pas annoncer de budget.';
    case 'hors-limite':
      return 'Ce budget dépasse ce que le formulaire accepte.';
  }
};
