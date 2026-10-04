'use server';

/* ══════════════════════════════════════════════════════════════════════════
   PUBLIER UN BESOIN

   Une seule Server Action, et la même forme de retour que
   `app/actions/authentification.ts` : un `EtatFormulaire`, jamais une
   exception. Un titre trop court doit réafficher le formulaire avec sa
   saisie, pas la frontière d'erreur du segment.

   ── Pourquoi valider ici alors que l'API valide déjà ──────────────────────

   Pour la raison déjà écrite dans `lib/graphql.ts` : le `formatError` de
   l'API ne garde que trois champs, et le tableau de phrases de
   class-validator n'en fait pas partie. Une description de quinze caractères
   revient donc en « Bad Request Exception », sans nommer la description. Les
   seuils sont ceux de `EntreeBesoinGql`, recopiés une seule fois dans
   `app/mes-besoins/calculs.ts`.

   La seule phrase recopiée MOT POUR MOT de l'API est celle des vingt
   caractères : elle est déjà rédigée là-bas avec son pourquoi (« un artisan
   chiffre sur ce texte »), et en écrire une autre ici donnerait deux textes
   différents pour le même refus selon qui l'a prononcé.

   ── Après la mutation : `refresh`, et pas `updateTag` ─────────────────────

   `updateTag` n'aurait rien à mordre. Il expire une ÉTIQUETTE DE CACHE, et
   une étiquette n'existe que là où une lecture a été marquée — par
   `cacheTag` sous un `'use cache'`, ou par `next.tags` sur un `fetch`. Les
   lectures de cette application passent toutes par `appelerGraphQL`, qui
   impose `cache: 'no-store'` et explique pourquoi : une réponse construite
   avec un jeton ne doit jamais être servie à quelqu'un d'autre. Aucune page
   du parcours client n'est donc dans le cache de données, et `updateTag`
   n'est pas l'outil de cet écran — il le redeviendra le jour où une liste
   publique sera mise en cache.

   `refresh()` l'est. Ce qui est bien en cache, lui, c'est le CACHE DU
   ROUTEUR CLIENT : le fascicule RSC de `/mes-besoins` visité il y a dix
   secondes y dort, et un retour en arrière après publication afficherait une
   liste où le nouveau chantier manque. `refresh()` le vide. Il est appelé
   AVANT le `redirect`, comme la doc de `07-mutating-data.md` le dit pour
   `revalidatePath` : `redirect` lève, et rien ne s'exécute après lui.

   Lu dans `01-getting-started/07-mutating-data.md`,
   `03-api-reference/04-functions/refresh.md` et
   `03-api-reference/04-functions/updateTag.md`.
   ══════════════════════════════════════════════════════════════════════════ */

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';

import { CHEMINS_AVEC_ID } from '@/components/chemins';
import { phraseDErreur } from '@/lib/erreurs';
import { appelerGraphQLAvecSession } from '@/lib/graphql';
import { METIERS } from '@/lib/domaine';
import type { Metier } from '@/lib/domaine';
import { exigerRole } from '@/lib/session';
import { LONGUEURS } from '@/app/mes-besoins/calculs';
import { lireBudgetEnDirhams } from '@/lib/argent';
import { villeParNom } from '@/lib/villes';
import type { EtatFormulaire } from '@/lib/formulaire';

/**
 * La phrase des vingt caractères, telle que l'API la rédige
 * (`@Length(20, 4000, { message: … })`).
 */
const PHRASE_DESCRIPTION =
  'Décrivez le chantier en au moins vingt caractères : un artisan chiffre sur ce texte.';

const texte = (donnees: FormData, champ: string): string => {
  const valeur = donnees.get(champ);
  return typeof valeur === 'string' ? valeur.trim() : '';
};

/**
 * Lit une coordonnée du formulaire.
 *
 * Trois sorties et non deux, parce que « champ vide » et « champ illisible »
 * n'appellent pas la même suite : le premier est le cas ordinaire — la
 * géolocalisation n'a pas été utilisée, la ville suffira —, le second ne peut
 * pas venir du formulaire, `normaliserCoordonnee` ayant déjà refusé toute
 * valeur hors bornes avant qu'elle n'atteigne le champ caché. Les confondre
 * ferait passer une requête fabriquée pour une saisie normale, et le chantier
 * serait posé sur la ville sans que rien ne le signale.
 *
 * `Number` et non `parseFloat`, pour la raison déjà rencontrée dans
 * l'inscription : `parseFloat('31,6')` rend 31 en silence, ce qui déplace le
 * chantier de soixante-dix kilomètres sans qu'aucun message ne le dise.
 */
type LectureCoordonnee = { etat: 'absente' } | { etat: 'invalide' } | { etat: 'lue'; valeur: number };

const coordonnee = (donnees: FormData, champ: string, maximum: 90 | 180): LectureCoordonnee => {
  const brut = texte(donnees, champ);
  if (brut === '') return { etat: 'absente' };

  const valeur = Number(brut);
  if (!Number.isFinite(valeur) || valeur < -maximum || valeur > maximum) {
    return { etat: 'invalide' };
  }
  return { etat: 'lue', valeur };
};

const MUTATION_PUBLIER = `
  mutation PublierBesoin($entree: EntreeBesoinGql!) {
    publierBesoin(entree: $entree) { _id }
  }
`;

/**
 * Publie un besoin, puis emmène le client sur la page de son chantier.
 *
 * Champs attendus : `metier`, `titre`, `description`, `adresse`, `latitude`,
 * `longitude`, `budgetDirhams` (facultatif).
 *
 * ── Pourquoi `exigerRole` ici, dans une action ────────────────────────────
 * Une Server Action est joignable par une requête POST directe, sans passer
 * par l'écran qui la porte (c'est l'avertissement en tête de
 * `07-mutating-data.md`). Le contrôle de la page ne protège donc pas
 * l'action. Celui-ci n'est pas non plus la protection réelle — l'API refuse
 * `publierBesoin` à tout autre rôle que CLIENT, et c'est son refus qui
 * compte ; il évite un aller-retour et une phrase d'habilitation là où une
 * redirection est plus claire.
 *
 * Il est appelé HORS du `try` : `exigerRole` lève l'exception de contrôle de
 * flux de `redirect`, et un `catch` la prendrait pour un refus de l'API.
 */
export const publierBesoin = async (
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> => {
  await exigerRole(['CLIENT']);

  const erreurs: Record<string, string> = {};

  const metier = texte(donnees, 'metier');
  const titre = texte(donnees, 'titre');
  const description = texte(donnees, 'description');
  const adresse = texte(donnees, 'adresse');
  const ville = texte(donnees, 'ville');
  const budgetDirhams = texte(donnees, 'budgetDirhams');

  /*
   * La position vient de deux endroits, et dans cet ordre.
   *
   * Les deux champs cachés ne sont remplis que par la géolocalisation, qui
   * donne le point exact. Quand ils sont vides, la ville choisie dans la liste
   * est résolue ICI, côté serveur, contre la même liste que l'inscription.
   *
   * Ce détour n'est pas une complication : il est ce qui fait fonctionner le
   * formulaire SANS JavaScript. Si le navigateur devait recopier les
   * coordonnées de la ville dans les champs cachés, un formulaire envoyé avant
   * l'hydratation partirait sans position, et le refus parlerait d'une carte
   * sur laquelle personne n'a cliqué.
   */
  const villeConnue = villeParNom(ville);
  const latitudeLue = coordonnee(donnees, 'latitude', 90);
  const longitudeLue = coordonnee(donnees, 'longitude', 180);

  const pointPrecis =
    latitudeLue.etat === 'lue' && longitudeLue.etat === 'lue'
      ? { latitude: latitudeLue.valeur, longitude: longitudeLue.valeur }
      : null;
  const pointIllisible = latitudeLue.etat === 'invalide' || longitudeLue.etat === 'invalide';

  const latitude = pointPrecis?.latitude ?? (pointIllisible ? null : villeConnue?.latitude ?? null);
  const longitude =
    pointPrecis?.longitude ?? (pointIllisible ? null : villeConnue?.longitude ?? null);

  if (!METIERS.includes(metier as Metier)) {
    erreurs.metier = 'Choisissez le métier concerné.';
  }

  if (titre.length < LONGUEURS.titre.minimum || titre.length > LONGUEURS.titre.maximum) {
    erreurs.titre = `Donnez un titre au chantier (${LONGUEURS.titre.minimum} à ${LONGUEURS.titre.maximum} caractères).`;
  }

  if (description.length < LONGUEURS.description.minimum) {
    erreurs.description = PHRASE_DESCRIPTION;
  } else if (description.length > LONGUEURS.description.maximum) {
    erreurs.description = `La description ne peut pas dépasser ${LONGUEURS.description.maximum} caractères.`;
  }

  if (adresse.length < LONGUEURS.adresse.minimum || adresse.length > LONGUEURS.adresse.maximum) {
    erreurs.adresse = `Indiquez l'adresse du chantier (${LONGUEURS.adresse.minimum} à ${LONGUEURS.adresse.maximum} caractères).`;
  }

  // La position ne se saisit pas à la main : elle vient de la ville choisie ou
  // du bouton de géolocalisation. Le message dit donc quel geste refaire, et
  // ne parle pas de degrés décimaux.
  if (latitude === null || longitude === null) {
    erreurs.ville = 'Choisissez la ville du chantier, ou utilisez votre position.';
  }

  const budget = lireBudgetEnDirhams(budgetDirhams);
  if (budget.etat === 'invalide') erreurs.budgetDirhams = budget.raison;

  // Les valeurs renvoyées au formulaire pour qu'il les réaffiche. La position
  // y figure : sans elle, un refus sur un autre champ effacerait le point posé
  // sur la carte, et le client devrait recommencer la géolocalisation.
  const valeurs: Record<string, string> = {
    metier,
    titre,
    description,
    adresse,
    ville,
    budgetDirhams,
    latitude: latitude === null ? '' : String(latitude),
    longitude: longitude === null ? '' : String(longitude),
  };

  if (Object.keys(erreurs).length > 0) return { erreurs, valeurs };

  let identifiant: string;
  try {
    const reponse = await appelerGraphQLAvecSession<{ publierBesoin: { _id: string } }>(
      MUTATION_PUBLIER,
      {
        variables: {
          entree: {
            metier,
            titre,
            description,
            adresse,
            latitude,
            longitude,
            // `undefined` et non `null` : le champ est `@IsOptional()` côté
            // API, et l'absence de clé est ce qu'il attend pour « pas de
            // budget annoncé ».
            budgetMaxCentimes: budget.etat === 'lu' ? budget.centimes : undefined,
          },
        },
      },
    );
    identifiant = reponse.publierBesoin._id;
  } catch (erreur) {
    // Message GLOBAL et non rattaché à un champ : l'API refuse ici pour des
    // raisons qui ne portent sur aucun champ du formulaire (rôle, session
    // expirée, panne), et deviner lequel en lisant la phrase serait une
    // invention.
    return { message: phraseDErreur(erreur), valeurs };
  }

  refresh();
  redirect(CHEMINS_AVEC_ID.besoin(identifiant));
};
