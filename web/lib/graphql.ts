/* ══════════════════════════════════════════════════════════════════════════
   LE CLIENT GRAPHQL : UN `fetch`, ET RIEN D'AUTRE

   ── Pourquoi pas Apollo Client, pourquoi pas urql ──────────────────────────

   Un client GraphQL complet achète trois choses : un cache normalisé, des
   abonnements, et des hameçons React (`useQuery`) qui suivent l'état du
   réseau. Les trois supposent que les lectures partent du NAVIGATEUR.

   Ici elles n'en partent pas. Le jeton de session vit dans un cookie
   httpOnly, donc hors de portée du JavaScript de la page (le raisonnement
   complet est dans `lib/session.ts`) : c'est le serveur qui lit l'API, et les
   composants reçoivent des données déjà résolues. Un cache normalisé de
   quarante kilooctets, embarqué dans le fascicule client pour mémoriser des
   réponses qui n'y transitent jamais, est du poids pur — sur une place de
   marché que ses visiteurs ouvriront en 4G depuis un chantier.

   ── Ce que ce choix coûte ──────────────────────────────────────────────────

     • Pas de cache normalisé. Accepter un devis ne met pas magiquement à jour
       les autres écrans qui l'affichaient : il faut dire quoi réactualiser,
       par `updateTag` ou `refresh` dans la Server Action qui mute. C'est plus
       de code à écrire, et c'est du code qui se lit — l'invalidation est
       explicite au lieu d'être devinée par une heuristique de normalisation.

     • Pas d'abonnements. L'API n'en déclare aucun (`schema.graphql` n'a ni
       `Subscription` ni `type Subscription`), donc la perte est nulle
       aujourd'hui. Le jour où un artisan devra voir arriver un devis sans
       recharger, il faudra autre chose que ce fichier.

     • Pas de requêtes typées par génération de code. Les types ci-dessous
       sont RECOPIÉS de `api/schema.graphql` à la main, et peuvent donc dériver
       si le schéma change. Installer un générateur était hors de question
       (aucune dépendance n'est ajoutée sur ce chantier), et le schéma est
       écrit sur le disque par l'API à chaque démarrage : la dérive se voit
       dans un diff.

   ── Ce qui vient du schéma, et d'où ────────────────────────────────────────

   Les énumérations de `api/schema.graphql` sont dans `lib/domaine.ts`. Elles
   n'ont jamais pu vivre dans une Server Action — un fichier `'use server'` ne
   peut exporter que des fonctions asynchrones — et elles ne peuvent pas non
   plus vivre ICI : ce module importe la session, donc `next/headers`, qui
   n'existe pas dans le navigateur.
   ══════════════════════════════════════════════════════════════════════════ */

import { lireJetonSession } from '@/lib/session';

/**
 * L'API de développement écoute sur le port 3000 — et `next dev` aussi. Le
 * défaut ci-dessous suppose donc que le FRONT a été déplacé, pas l'API : voir
 * `.env.example`, qui explique le conflit et fixe `PORT`.
 */
const ADRESSE_PAR_DEFAUT = 'http://localhost:3000/graphql';

const adresseApi = (): string => process.env.API_GRAPHQL ?? ADRESSE_PAR_DEFAUT;

/* ── Les énumérations du schéma : voir lib/domaine.ts ────────────────────────
   Elles ont DÉMÉNAGÉ dans `lib/domaine.ts`, et ne sont pas ré-exportées d'ici.
   Ce fichier importe `lib/session.ts`, donc `next/headers` : un composant
   'use client' qui lisait `METIERS` depuis ici tirait `next/headers` dans le
   paquet du navigateur et faisait échouer `next build`. Le raisonnement
   complet, et le message d'erreur, sont dans l'en-tête de `lib/domaine.ts`.
   ────────────────────────────────────────────────────────────────────────── */

/* ── La forme des erreurs, telle que l'API l'émet ───────────────────────── */

/**
 * `formatError` dans `api/src/app.module.ts` réduit chaque erreur à ces trois
 * champs, et à eux seuls. Tout le reste — `originalError`, `locations`,
 * `stacktrace` — est jeté avant de sortir du serveur.
 *
 * Une conséquence qui surprend, et qui explique la forme de `lib/erreurs.ts` :
 * les détails de validation sont dans `originalError.message` (un tableau de
 * phrases produites par class-validator), donc ils ne traversent PAS. Une
 * inscription refusée pour mot de passe trop court arrive ici en
 * `{ message: 'Bad Request Exception', code: 'BAD_REQUEST' }` — un message
 * qu'aucun visiteur ne doit lire. C'est pourquoi les Server Actions valident
 * les champs avant d'appeler l'API : non par défiance, mais parce que la
 * réponse de refus ne dit pas quel champ est en cause.
 */
export interface ErreurApi {
  message: string;
  code?: string;
  chemin?: readonly (string | number)[];
}

/**
 * Les codes que l'API produit réellement, et par quel chemin.
 *
 * Le pilote Apollo de NestJS traduit les exceptions HTTP en codes GraphQL,
 * mais sa table ne couvre que quatre statuts
 * (`node_modules/@nestjs/apollo/dist/drivers/apollo-base.driver.js`) :
 *
 *   400 BadRequestException   → BAD_REQUEST
 *   401 UnauthorizedException → UNAUTHENTICATED
 *   403 ForbiddenException    → FORBIDDEN
 *   422                       → BAD_USER_INPUT
 *
 * Tout le reste tombe en `INTERNAL_SERVER_ERROR` — y compris les 404
 * (`NotFoundException`) et les 409 (`ConflictException`), qui sont pourtant
 * les refus les plus courants du domaine : « Ce besoin n'existe pas ou
 * n'accepte plus de devis. », « Un compte existe déjà avec cette adresse. »,
 * « Cette prestation n'est pas notable […] ».
 *
 * Il ne faut donc SURTOUT PAS remplacer le message d'un
 * `INTERNAL_SERVER_ERROR` par une phrase du genre « une panne est survenue » :
 * on effacerait la phrase française, exacte et déjà rédigée, qui explique au
 * visiteur ce qui s'est passé. `lib/erreurs.ts` garde le message de l'API et
 * ne se rabat sur le code que lorsqu'il n'y a rien à garder.
 */
export type CodeErreurApi =
  | 'BAD_REQUEST'
  | 'BAD_USER_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INTERNAL_SERVER_ERROR'
  | 'GRAPHQL_VALIDATION_FAILED'
  | 'GRAPHQL_PARSE_FAILED'
  | (string & {});

/** L'API a répondu, et elle a répondu « non ». */
export class EchecGraphQL extends Error {
  readonly erreurs: readonly ErreurApi[];
  readonly code?: CodeErreurApi;

  constructor(erreurs: readonly ErreurApi[]) {
    // La première erreur porte le message affichable. Les autres sont gardées
    // entières : une requête qui demande plusieurs champs peut en échouer
    // plusieurs, et n'en journaliser qu'une rendrait le débogage aveugle.
    super(erreurs[0]?.message ?? 'Erreur GraphQL sans message.');
    this.name = 'EchecGraphQL';
    this.erreurs = erreurs;
    this.code = erreurs[0]?.code;
  }
}

/**
 * L'API n'a pas répondu, ou a répondu autre chose que du GraphQL.
 *
 * Distinct de `EchecGraphQL` parce que la conduite à tenir diffère : un refus
 * de l'API s'affiche au visiteur, une API éteinte se réessaie et se signale à
 * celui qui exploite le service. Les confondre produit des « erreur
 * inattendue » là où il fallait lire « lancez `docker compose up` ».
 */
export class EchecTransport extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EchecTransport';
  }
}

interface CorpsGraphQL<T> {
  data?: T | null;
  errors?: ErreurApi[];
}

export interface OptionsAppel {
  variables?: Record<string, unknown>;
  /** Le jeton à présenter. `null` ou absent : la requête part anonyme. */
  jeton?: string | null;
  signal?: AbortSignal;
}

/**
 * Envoie une requête, rend `data`, lève sur refus.
 *
 * `cache: 'no-store'` est explicite bien que Next ne mette en cache que les
 * requêtes GET : l'écrire évite qu'une future version du framework décide de
 * mémoriser les POST et serve à un visiteur la réponse construite pour un
 * autre, jeton compris. Le cache de cette application se décide au niveau des
 * pages (`'use cache'` + `cacheTag`), pas au niveau du transport, où il n'a
 * aucun moyen de savoir ce qui est public.
 */
export const appelerGraphQL = async <T>(requete: string, options: OptionsAppel = {}): Promise<T> => {
  let reponse: Response;
  try {
    reponse = await fetch(adresseApi(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.jeton ? { authorization: `Bearer ${options.jeton}` } : {}),
      },
      body: JSON.stringify({ query: requete, variables: options.variables ?? {} }),
      cache: 'no-store',
      signal: options.signal,
    });
  } catch (cause) {
    throw new EchecTransport(`L'API d'Artisans.ma est injoignable (${adresseApi()}).`, { cause });
  }

  // Le corps est lu même sur un statut d'erreur, et c'est voulu : une requête
  // mal formée est refusée par Apollo en HTTP 400 avec un corps GraphQL
  // parfaitement exploitable. Se fier à `reponse.ok` jetterait ce corps et
  // remplacerait « Cannot query field "x" » par « HTTP 400 ».
  const corps = (await reponse.json().catch(() => null)) as CorpsGraphQL<T> | null;

  if (!corps) {
    throw new EchecTransport(
      `Réponse illisible de l'API (HTTP ${reponse.status}) : ce n'est pas du JSON. ` +
        `Vérifiez que API_GRAPHQL pointe bien sur /graphql.`,
    );
  }

  if (corps.errors?.length) throw new EchecGraphQL(corps.errors);

  // Une réponse sans erreurs et sans données ne devrait pas exister. Lever
  // plutôt que rendre `undefined` évite que l'appelant lise `data.besoin` sur
  // rien et se retrouve à déboguer un `TypeError` deux écrans plus loin.
  if (corps.data === null || corps.data === undefined) {
    throw new EchecTransport("L'API a répondu sans données et sans erreur.");
  }

  return corps.data;
};

/**
 * Le même appel, avec le jeton du cookie s'il y en a un.
 *
 * C'est la forme que les pages utilisent. Elle est SÉPARÉE de `appelerGraphQL`
 * au lieu d'être son comportement par défaut, parce que lire un cookie rend la
 * route dynamique : une page publique — la recherche d'artisans, une fiche —
 * cesserait d'être prérendable du seul fait d'appeler ce client. Le choix
 * reste donc à la page, qui est la seule à savoir si elle est publique.
 */
export const appelerGraphQLAvecSession = async <T>(
  requete: string,
  options: Omit<OptionsAppel, 'jeton'> = {},
): Promise<T> => appelerGraphQL<T>(requete, { ...options, jeton: await lireJetonSession() });
