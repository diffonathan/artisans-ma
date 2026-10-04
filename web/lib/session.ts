/* ══════════════════════════════════════════════════════════════════════════
   LA SESSION : UN JETON JWT DANS UN COOKIE httpOnly

   ── Pourquoi un cookie httpOnly et pas localStorage ────────────────────────

   L'API rend un JWT (`Session.jeton` de `api/schema.graphql`) à l'inscription
   et à la connexion. Il faut le ranger quelque part, et les deux rangements
   possibles n'ont pas le même pire cas.

   `localStorage` est lisible par n'importe quel JavaScript tournant sur
   l'origine. Une seule faille d'injection — un commentaire d'avis affiché sans
   échappement, une dépendance compromise, une extension — et le jeton part en
   trois lignes vers un serveur tiers. Il reste valable sept jours (l'API le
   signe avec `expiresIn: '7d'`), et rien ne permet de le révoquer. Une XSS
   cesse alors d'être un défaut d'affichage : elle devient un vol de compte,
   dont la victime ne saura jamais rien.

   Un cookie `httpOnly` n'est pas exposé à `document.cookie`. Le même code
   injecté ne peut plus LIRE le jeton. C'est une réduction de dégâts, pas une
   immunité : l'attaquant peut encore faire agir le navigateur de la victime
   depuis la page. Mais il ne repart pas avec une clé réutilisable ailleurs,
   pendant une semaine, hors de toute session.

   ── Ce que ce choix coûte, et qu'il faut assumer ───────────────────────────

     1. Le front ne peut plus poser le jeton depuis le navigateur. Il faut une
        Server Action ou un gestionnaire de route, parce que seul le serveur
        peut émettre un en-tête `Set-Cookie`. D'où `poserSession` ci-dessous,
        appelée depuis `app/actions/authentification.ts`.

     2. Un cookie part automatiquement avec les requêtes, ce qu'un jeton rangé
        en mémoire ne fait pas. C'est ce qui ouvre la CSRF, d'où `sameSite`
        réglé explicitement — le détail est au-dessus de l'option.

     3. Les lectures de l'API doivent passer par le serveur, puisque c'est lui
        qui tient le jeton. Ce n'est pas une contrainte subie ici : les pages
        de cette application lisent toutes côté serveur (voir le choix du
        client dans `lib/graphql.ts`).

   ── Un mot sur `cookies()` en Next 16 ──────────────────────────────────────

   `cookies()` est ASYNCHRONE. L'accès synchrone n'est pas déprécié, il est
   supprimé : `cookies().get(…)` ne rend pas un magasin mais une promesse, où
   `.get` n'existe pas. Tout passe par `const magasin = await cookies()`. Voir
   `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`.

   Deux conséquences de cette doc décident de la forme de ce fichier : `.set`
   et `.delete` ne sont utilisables que dans une Server Action ou un
   gestionnaire de route — HTTP n'autorise pas de `Set-Cookie` après le début
   du flux — et lire un cookie rend la route dynamique.

   `next/headers` n'est importable que côté serveur : ce module ne peut donc
   pas être tiré par erreur dans un composant client. C'est la barrière, et
   elle ne demande aucune dépendance supplémentaire.
   ══════════════════════════════════════════════════════════════════════════ */

import { cookies } from 'next/headers';
import { decoderJeton, sessionDepuisJeton } from '@/lib/jeton';
import type { RoleCompte, Session } from '@/lib/jeton';
import { redirect } from 'next/navigation';
import { CHEMINS } from '@/components/chemins';

/**
 * Le nom est préfixé du projet plutôt que nommé `jeton` : en développement,
 * plusieurs applications de ce dossier tournent sur `localhost`, et les
 * cookies ne sont pas isolés par port. Un cookie `jeton` posé par une autre
 * application serait envoyé ici, et inversement.
 */
export const NOM_COOKIE_SESSION = 'artisans_jeton';

/**
 * Étiquette de cache de tout ce qui dépend du compte connecté.
 *
 * Les Server Actions d'authentification l'expirent par `updateTag` après avoir
 * posé ou effacé le cookie. Une page qui met en cache une donnée tirée du
 * compte (`moi`, `monProfilArtisan`, ses devis) doit la marquer de cette
 * étiquette, sinon elle continuera d'afficher l'état du compte précédent.
 */
export const ETIQUETTE_SESSION = 'session';

/**
 * Repli de durée de vie du cookie, aligné sur le `expiresIn: '7d'` de l'API
 * (`api/src/domaine/domaine.module.ts`). Il ne sert que si le jeton ne porte
 * pas de `exp` lisible : on préfère toujours la date du jeton lui-même, pour
 * qu'un cookie ne survive jamais au jeton qu'il transporte.
 */
const DUREE_SESSION_SECONDES = 7 * 24 * 60 * 60;

/**
 * Où l'on envoie quelqu'un à qui il manque une session.
 *
 * Importé de `components/chemins`, qui est la source unique des chemins et ne
 * porte aucune directive — donc lisible depuis ce module serveur. Un littéral
 * recopié ici aurait demandé deux éditions au premier renommage de la route,
 * ce qui est exactement ce que ce fichier-là existe pour éviter.
 */
export const CHEMIN_CONNEXION = CHEMINS.connexion;

/*
 * `RoleCompte`, `Session` et le décodage de la charge utile ont DÉMÉNAGÉ dans
 * `lib/jeton.ts`. La raison n'est pas le rangement : `proxy.ts` doit lire le
 * même jeton AVANT tout rendu, donc sans `cookies()`, et deux décodages du
 * même cookie finiraient par ne plus dire la même chose. L'en-tête de
 * `lib/jeton.ts` porte le raisonnement, y compris pourquoi ce décodage ne
 * vérifie rien.
 */

/** Le jeton brut, à joindre à un appel GraphQL. `null` si personne n'est connecté. */
export const lireJetonSession = async (): Promise<string | null> => {
  const magasin = await cookies();
  return magasin.get(NOM_COOKIE_SESSION)?.value ?? null;
};

/**
 * La session telle que le front la voit, ou `null`.
 *
 * Un cookie présent mais indécodable, sans `sub`, ou portant un rôle inconnu
 * est traité comme une absence de session plutôt que comme une erreur : c'est
 * ce que produit un jeton d'une version précédente du format, et une page
 * d'erreur n'y apporterait rien que le visiteur puisse corriger.
 *
 * Un jeton expiré est écarté ici aussi, pour éviter d'afficher un en-tête
 * « connecté » dont toutes les requêtes échoueront en `UNAUTHENTICATED`. Le
 * cookie n'est pas effacé au passage : cette fonction est appelée pendant des
 * rendus, où écrire un cookie est interdit. Il le sera à la prochaine action.
 */
export const lireSession = async (): Promise<Session | null> =>
  sessionDepuisJeton(await lireJetonSession());

/**
 * Pose le cookie de session. À n'appeler que depuis une Server Action ou un
 * gestionnaire de route — voir l'en-tête du fichier.
 */
export const poserSession = async (jeton: string): Promise<void> => {
  const magasin = await cookies();
  const charge = decoderJeton(jeton);

  // Le cookie meurt avec le jeton, jamais après. L'inverse donnerait un
  // visiteur qui se croit connecté et dont chaque requête est refusée, sans
  // qu'aucun écran ne puisse expliquer pourquoi.
  const restant =
    typeof charge?.exp === 'number'
      ? Math.max(0, Math.floor(charge.exp - Date.now() / 1000))
      : DUREE_SESSION_SECONDES;

  magasin.set(NOM_COOKIE_SESSION, jeton, {
    httpOnly: true,
    // `secure` conditionnel et non constant : un cookie `secure` n'est pas
    // posé sur http://localhost, ce qui rendrait la connexion impossible en
    // développement — et sans message, le cookie étant simplement ignoré.
    secure: process.env.NODE_ENV === 'production',
    // 'lax' et non 'strict'. 'strict' n'envoie le cookie sur AUCUNE navigation
    // venue d'ailleurs : un lien reçu par courriel vers une réservation
    // afficherait la page en visiteur déconnecté, puis « connecté » au clic
    // suivant. 'lax' l'envoie sur les navigations de premier niveau en GET et
    // le retient sur les requêtes croisées en POST — exactement la surface
    // CSRF qu'on veut fermer, les Server Actions étant des POST de même site.
    sameSite: 'lax',
    path: '/',
    maxAge: restant,
  });
};

/** Efface le cookie de session. Même contrainte d'appel que `poserSession`. */
export const effacerSession = async (): Promise<void> => {
  const magasin = await cookies();
  magasin.delete(NOM_COOKIE_SESSION);
};

/**
 * Exige une session, et redirige vers la connexion s'il n'y en a pas.
 *
 * `suite` porte le chemin d'où l'on vient, pour y revenir après connexion. Il
 * est encodé : un chemin contenant `&` ou `?` tronquerait sinon la chaîne de
 * requête. Le formulaire de connexion doit le revalider avant de s'y rendre —
 * `connecter` le fait, et dit pourquoi.
 *
 * Ce garde-fou n'est PAS un contrôle de sécurité : il évite d'afficher une
 * page vide à quelqu'un de déconnecté. La protection réelle est que l'API
 * refuse toute requête sans jeton valide ; une page qui oublierait cet appel
 * n'afficherait donc pas de donnée privée, elle afficherait une erreur.
 */
export const exigerSession = async (options: { suite?: string } = {}): Promise<Session> => {
  const session = await lireSession();
  if (session) return session;

  const suite = options.suite;
  redirect(suite ? `${CHEMIN_CONNEXION}?suite=${encodeURIComponent(suite)}` : CHEMIN_CONNEXION);
};

/**
 * Exige une session ET un rôle. Un client qui ouvre une page d'artisan est
 * renvoyé à l'accueil, pas à la connexion : il est déjà connecté, lui proposer
 * de se reconnecter ne réglerait rien.
 */
export const exigerRole = async (
  roles: readonly RoleCompte[],
  options: { suite?: string } = {},
): Promise<Session> => {
  const session = await exigerSession(options);
  if (!roles.includes(session.role)) redirect(CHEMINS.accueil);
  return session;
};
