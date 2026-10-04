/* ══════════════════════════════════════════════════════════════════════════
   D'UNE ERREUR À UNE PHRASE AFFICHABLE

   Ce fichier ne traduit presque rien, et c'est son intérêt.

   L'API rédige ses refus en français, et les rédige bien : « Un compte existe
   déjà avec cette adresse. », « Adresse ou mot de passe incorrect. », « Cette
   prestation n'est pas notable : soit elle n'est pas terminée, soit elle a
   déjà reçu votre avis, soit elle ne vous concerne pas. » Chacune de ces
   phrases a été écrite à l'endroit du code qui connaît la règle. Les
   réécrire ici produirait deux versions de la même vérité, dont une
   finirait par mentir — le jour où la règle change dans le domaine et pas
   dans cette table.

   La règle est donc : AFFICHER LE MESSAGE DE L'API. Les phrases ci-dessous ne
   servent qu'aux cas où il n'y en a pas d'utilisable, et ils sont de trois
   sortes.

     1. Le message est un gabarit de NestJS. Quand une `HttpException` est
        construite avec autre chose qu'une chaîne — ce que fait le
        `ValidationPipe`, qui lui passe le tableau des phrases de validation —
        `HttpException` fabrique son `message` depuis le nom de sa classe :
        « Bad Request Exception ». Le détail utile est dans
        `originalError.message`, que le `formatError` de l'API ne transmet pas
        (voir `ErreurApi` dans `lib/graphql.ts`). Il ne reste que le gabarit,
        et il n'est pas français.

     2. L'erreur n'est pas venue de l'API : réseau coupé, API éteinte, port
        occupé par autre chose. `EchecTransport` porte alors un message écrit
        pour celui qui exploite le service, pas pour un visiteur.

     3. Ce n'est pas une erreur connue du tout — une exception quelconque
        attrapée par un `catch`.

   ── Ce que ce fichier ne fait pas ──────────────────────────────────────────

   Il ne décide pas des erreurs PAR CHAMP. Un formulaire qui veut savoir que
   c'est « le mot de passe » qui est trop court ne peut pas le tirer de la
   réponse de l'API, pour la raison dite au point 1 : la réponse ne le dit
   plus. Cette validation-là est dans `app/actions/authentification.ts`, au
   plus près du formulaire concerné.
   ══════════════════════════════════════════════════════════════════════════ */

import { EchecGraphQL, EchecTransport } from '@/lib/graphql';

/** Ce qu'on affiche quand il ne reste vraiment rien d'exploitable. */
export const PHRASE_PAR_DEFAUT =
  "L'opération n'a pas abouti. Réessayez dans un instant ; si cela persiste, l'équipe a été prévenue.";

/**
 * Les gabarits de NestJS, à ne jamais montrer.
 *
 * `HttpException` les compose en découpant le nom de sa classe sur les
 * majuscules : `BadRequestException` → « Bad Request Exception ». La règle
 * couvre donc toutes les exceptions de NestJS d'un coup, y compris celles que
 * le domaine n'utilise pas encore. `'Internal server error'` est l'exception
 * à la règle : c'est le message que NestJS donne à une erreur non maîtrisée,
 * et il ne finit pas par « Exception ».
 */
const GABARIT_NEST = /^(?:[A-Z][a-z]+ )+Exception$/;
const MESSAGES_SANS_VALEUR = new Set(['Internal server error', 'Unexpected error value']);

const estMessageUtilisable = (message: string | undefined): message is string => {
  if (!message) return false;
  const propre = message.trim();
  if (propre.length === 0) return false;
  if (MESSAGES_SANS_VALEUR.has(propre)) return false;
  return !GABARIT_NEST.test(propre);
};

/**
 * Les phrases de repli, par code.
 *
 * `INTERNAL_SERVER_ERROR` n'y figure pas par hasard et son libellé ne parle
 * pas de panne : ce code recouvre, dans cette API, tous les refus 404 et 409
 * du domaine (le pilote Apollo de NestJS ne sait traduire que quatre statuts,
 * c'est documenté dans `lib/graphql.ts`). On n'atteint cette phrase que si le
 * message de l'API était inexploitable — donc sans savoir s'il s'agit d'une
 * panne ou d'un refus légitime. Annoncer « une panne » serait faux une fois
 * sur deux.
 */
const PHRASES_PAR_CODE: Record<string, string> = {
  BAD_REQUEST: "Les informations envoyées n'ont pas été acceptées. Vérifiez les champs du formulaire.",
  BAD_USER_INPUT: "Les informations envoyées n'ont pas été acceptées. Vérifiez les champs du formulaire.",
  UNAUTHENTICATED: 'Votre session a expiré. Reconnectez-vous pour continuer.',
  FORBIDDEN: "Votre type de compte n'a pas accès à cette opération.",
  INTERNAL_SERVER_ERROR: "L'opération a été refusée, sans que la raison soit transmise.",
  // Les deux suivants sont des défauts de la requête, pas du visiteur : ils ne
  // devraient jamais s'afficher en production, et la phrase le dit pour que
  // celui qui les voit sache qu'il y a un bogue à corriger.
  GRAPHQL_VALIDATION_FAILED: "La requête envoyée à l'API est invalide : c'est un défaut de l'application.",
  GRAPHQL_PARSE_FAILED: "La requête envoyée à l'API est illisible : c'est un défaut de l'application.",
};

/** Le code de l'erreur, si c'en est une que l'API a prononcée. */
export const codeDErreur = (erreur: unknown): string | undefined =>
  erreur instanceof EchecGraphQL ? erreur.code : undefined;

/**
 * La session est-elle à refaire ?
 *
 * Utile aux pages : un jeton expiré en cours de navigation produit un
 * `UNAUTHENTICATED` au milieu d'un rendu, et la bonne réponse est de renvoyer
 * vers la connexion plutôt que d'afficher une erreur dans un écran vide.
 */
export const estNonAuthentifie = (erreur: unknown): boolean =>
  codeDErreur(erreur) === 'UNAUTHENTICATED';

/** L'API est-elle injoignable, par opposition à « elle a dit non » ? */
export const estApiInjoignable = (erreur: unknown): boolean => erreur instanceof EchecTransport;

/**
 * La phrase à afficher pour une erreur quelconque.
 *
 * L'ordre des cas EST la politique : le message de l'API d'abord, son code
 * ensuite, la phrase générique en dernier.
 */
export const phraseDErreur = (erreur: unknown): string => {
  if (erreur instanceof EchecGraphQL) {
    if (estMessageUtilisable(erreur.message)) return erreur.message;
    const code = erreur.code;
    return (code && PHRASES_PAR_CODE[code]) || PHRASE_PAR_DEFAUT;
  }

  if (erreur instanceof EchecTransport) {
    // Le message de `EchecTransport` nomme l'adresse de l'API : utile dans un
    // journal, inutile et inquiétant sur un écran de visiteur.
    return "Le service est momentanément indisponible. Réessayez dans quelques instants.";
  }

  return PHRASE_PAR_DEFAUT;
};
