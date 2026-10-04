/* ══════════════════════════════════════════════════════════════════════════
   LE FILTRE DE NAVIGATION

   ⚠️ CE FICHIER NE PROTÈGE AUCUNE DONNÉE. ⚠️

   Il faut l'écrire en premier, parce que c'est l'erreur que la présence d'un
   fichier nommé « proxy » invite à commettre. Ce qu'il y a ici, c'est un
   filtre de NAVIGATION : il évite d'ouvrir un écran dont on sait d'avance
   qu'il n'affichera rien, et il remplace une page vide par une phrase.

   L'AUTORITÉ EST L'API. Elle vérifie le rôle à chaque opération, par ses
   gardes `@Roles(...)`, en validant la SIGNATURE du jeton. Ici, la signature
   n'est pas vérifiée et ne peut pas l'être : le secret appartient à l'API
   (le raisonnement est dans `lib/jeton.ts`). N'importe qui peut fabriquer un
   cookie annonçant `role: ADMIN` et franchir ce filtre ; il arrivera sur un
   écran dont chaque requête sera refusée.

   Trois conséquences pratiques pour qui modifie ce fichier :

     • ne JAMAIS retirer un `exigerRole` d'une page en se disant « le proxy
       s'en occupe ». Les deux sont là, et ils ne font pas le même travail :
       celui-ci évite un aller-retour, l'autre refuse le rendu ;
     • ne JAMAIS faire dépendre de ce fichier l'affichage d'une donnée privée.
       La donnée ne vient pas d'ici, elle vient de l'API avec un jeton ;
     • Next prévient que le proxy peut être déployé « en amont de
       l'application », donc hors de son exécution : il ne doit s'appuyer sur
       aucun ÉTAT global. Les deux modules qu'il importe — `lib/jeton.ts` et
       `lib/habilitations.ts` — sont des fonctions pures et des constantes, et
       c'est la seule forme admissible ici.

   La table « quelle route demande quel rôle » est dans
   `lib/habilitations.ts`, parce qu'un fichier de proxy ne peut exporter que
   sa fonction et son `config` : elle n'y serait pas éprouvable.

   ── Pourquoi `proxy.ts` et pas `middleware.ts` ─────────────────────────────

   La convention `middleware` est DÉPRÉCIÉE en Next 16 et renommée `proxy`.
   L'export se nomme `proxy` (ou un export par défaut), et un seul par
   fichier.

   Le runtime est Node.js, par défaut et sans rien déclarer. L'option
   `runtime` n'est PAS disponible dans un fichier de proxy : l'y écrire lève
   une erreur. Un `export const config = { runtime: 'nodejs' }` ajouté « pour
   être explicite » casserait donc la construction.
   ══════════════════════════════════════════════════════════════════════════ */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { CHEMINS } from '@/components/chemins';
import { decisionDeRoute, regleDeRoute } from '@/lib/habilitations';
import { sessionDepuisJeton } from '@/lib/jeton';

/**
 * Le nom du cookie, recopié de `lib/session.ts`.
 *
 * Et c'est une recopie assumée, à l'inverse de tout le reste de ce chantier :
 * importer `lib/session.ts` tirerait `next/headers` dans le proxy, où
 * `cookies()` n'a aucun sens — le cookie arrive sur la requête. Les deux
 * valeurs sont des chaînes littérales, et la divergence se verrait tout de
 * suite : plus personne ne serait jamais reconnu.
 */
const NOM_COOKIE_SESSION = 'artisans_jeton';

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  /*
   * Sortie immédiate sur une route publique — l'accueil, la recherche, une
   * fiche d'artisan, la connexion. Le cookie n'est même pas touché : décoder
   * un JWT pour conclure « rien à faire » serait du travail sur le chemin le
   * plus fréquenté du site, et ce proxy tourne sur chaque navigation.
   */
  if (!regleDeRoute(pathname)) return NextResponse.next();

  const session = sessionDepuisJeton(request.cookies.get(NOM_COOKIE_SESSION)?.value);
  const decision = decisionDeRoute(pathname, session?.role ?? null);

  /*
   * NON AUTHENTIFIÉ → la connexion, avec de quoi revenir.
   *
   * `suite` porte le chemin ET la chaîne de requête : sans elle, quelqu'un
   * renvoyé d'un lien vers `/mes-besoins?tri=recent` perdrait son tri après
   * s'être connecté. La valeur est encodée, un chemin contenant `&` ou `?`
   * tronquerait sinon la chaîne — et `destinationSure` la revalide avant la
   * redirection finale, parce qu'une destination venue du client est une
   * redirection ouverte en puissance.
   */
  if (decision === 'connecter') {
    const connexion = new URL(CHEMINS.connexion, request.url);
    connexion.searchParams.set('suite', `${pathname}${search}`);
    return NextResponse.redirect(connexion);
  }

  /*
   * CONNECTÉ MAIS PAS AUTORISÉ → un refus, et surtout PAS la connexion.
   *
   * C'est la distinction que ce fichier existe pour tenir. Renvoyer un client
   * qui ouvre `/mon-planning` vers `/connexion` lui demanderait de se
   * reconnecter pour régler un problème que la connexion ne règle pas : il se
   * reconnecterait avec le même compte, serait renvoyé sur `/mon-planning` par
   * le `suite`, et repartirait vers la connexion. Une boucle, et rien pour
   * expliquer pourquoi.
   *
   * `rewrite` et non `redirect` : l'adresse reste celle que la personne a
   * demandée, donc le bouton « précédent » marche et l'URL partagée reste
   * lisible. Les paramètres disent ce qui était demandé, pour que l'écran de
   * refus propose la sortie du bon côté du service.
   */
  if (decision === 'refuser') {
    const refus = new URL(CHEMINS.accesRefuse, request.url);
    refus.searchParams.set('route', pathname);
    // `session` est nécessairement là : « refuser » ne sort de
    // `decisionDeRoute` que pour un rôle connu.
    if (session) refus.searchParams.set('role', session.role);
    return NextResponse.rewrite(refus);
  }

  // Le rôle attendu : on ne touche à rien.
  return NextResponse.next();
}

/**
 * Sur quels chemins ce proxy tourne.
 *
 * SANS `matcher`, il tournerait sur CHAQUE requête — `_next/static`,
 * `_next/image`, l'icône, les fichiers de `public/`. Une règle d'habilitation
 * appliquée à une feuille de style ne la protège pas : elle l'empêche de se
 * charger. D'où la négation.
 *
 * Les valeurs doivent être des constantes analysables à la construction : une
 * variable y est ignorée en silence. Ce motif est donc écrit en clair, et pas
 * composé à partir de `REGLES_DE_ROUTE` — un `matcher` dérivé d'un tableau
 * serait plus joli et ne filtrerait rien.
 *
 * Il laisse passer TOUTES les autres routes, publiques comprises : c'est
 * `decisionDeRoute` qui décide, et lui seul connaît la table.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|webp)$).*)'],
};
