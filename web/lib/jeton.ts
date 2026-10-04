/* ══════════════════════════════════════════════════════════════════════════
   LIRE LA CHARGE UTILE D'UN JETON — SANS LA VÉRIFIER, ET SANS next/headers

   ── Pourquoi ce module est à part de lib/session.ts ────────────────────────

   `lib/session.ts` lit le cookie par `cookies()` de `next/headers`, qui
   n'existe QUE pendant un rendu. Le proxy, lui, reçoit le cookie sur la
   requête (`request.cookies`) et tourne avant tout rendu : il ne peut donc
   pas appeler `lireSession`. Sans ce module, il aurait fallu recopier le
   décodage dans `proxy.ts` — c'est-à-dire tenir deux lectures du même jeton,
   dont la divergence se traduirait par une navigation qui n'est pas d'accord
   avec l'écran qu'elle sert.

   Accessoirement, et ce n'est pas rien : une fonction pure sans dépendance
   d'exécution s'éprouve. Les cas sont figés dans `test/jeton.spec.ts`.

   ── Ce que ce module NE fait pas ───────────────────────────────────────────

   Il décode, et il ne vérifie RIEN. La signature n'est pas contrôlée, et elle
   ne peut pas l'être : le secret de signature appartient à l'API, et le front
   n'a aucune raison de le détenir — l'y copier ferait d'un front compromis un
   émetteur de jetons valides.

   Ce que ce décodage sert à faire : choisir le menu à afficher, savoir s'il
   faut proposer « publier un besoin » ou « chiffrer un chantier », et refuser
   une NAVIGATION d'avance. Ce qu'il ne sert JAMAIS à faire : décider qu'une
   opération est permise. Quelqu'un peut fabriquer un cookie annonçant
   `role: ADMIN` ; il obtiendra une interface d'administration dont chaque
   requête sera refusée par la garde de l'API, parce que la signature, elle,
   ne se fabrique pas.
   ══════════════════════════════════════════════════════════════════════════ */

export type RoleCompte = 'ADMIN' | 'ARTISAN' | 'CLIENT';

export const ROLES_COMPTE: readonly RoleCompte[] = ['ADMIN', 'ARTISAN', 'CLIENT'];

/**
 * Ce que le front sait de la session SANS interroger l'API.
 *
 * `compte` et `role` viennent de la charge utile du JWT, lue mais NON
 * VÉRIFIÉE. Ils servent à l'affichage ; l'autorisation, elle, est toujours
 * celle que l'API prononce.
 *
 * Le JETON N'EST PAS DANS CETTE INTERFACE, et ce n'est pas un oubli. C'est
 * l'objet que toute page privée reçoit d'`exigerSession`, donc la valeur la
 * plus manipulée du module ; un seul `<MonComposantClient session={session} />`
 * aurait inscrit le jeton dans la charge utile RSC, où il se lit dans la
 * source de la page et dans les outils de développement — et le cookie
 * httpOnly n'aurait servi à rien. `lireJetonSession` reste donc le SEUL chemin
 * vers le jeton, et son unique appelant légitime est
 * `appelerGraphQLAvecSession` dans `lib/graphql.ts`.
 */
export interface Session {
  compte: string;
  role: RoleCompte;
  expireA: Date | null;
}

export interface ChargeJeton {
  sub?: unknown;
  role?: unknown;
  exp?: unknown;
}

/**
 * La charge utile brute, ou `null` si la chaîne n'est pas un JWT lisible.
 *
 * `base64url` et non `base64` : un JWT remplace `+` et `/` par `-` et `_` et
 * retire le remplissage. Décoder en `base64` abîme une charge sur quatre
 * environ — donc de façon intermittente, et invisible le jour où l'on essaie.
 */
export const decoderJeton = (jeton: string): ChargeJeton | null => {
  const segments = jeton.split('.');
  if (segments.length !== 3) return null;

  try {
    const json = Buffer.from(segments[1], 'base64url').toString('utf8');
    const charge: unknown = JSON.parse(json);
    return typeof charge === 'object' && charge !== null ? (charge as ChargeJeton) : null;
  } catch {
    return null;
  }
};

/**
 * La session que porte cette charge, ou `null`.
 *
 * Une charge sans `sub`, ou portant un rôle inconnu, est traitée comme une
 * absence de session plutôt que comme une erreur : c'est ce que produit un
 * jeton d'une version précédente du format, et une page d'erreur n'y
 * apporterait rien que le visiteur puisse corriger.
 *
 * Un jeton expiré est écarté ici aussi, pour éviter d'afficher un en-tête
 * « connecté » dont toutes les requêtes échoueront en `UNAUTHENTICATED`.
 *
 * `maintenant` est un paramètre et non un `Date.now()` interne : une règle qui
 * dépend de l'horloge ne s'éprouve pas si l'horloge n'est pas fournie.
 */
export const sessionDepuisCharge = (
  charge: ChargeJeton | null,
  maintenant: number = Date.now(),
): Session | null => {
  if (!charge || typeof charge.sub !== 'string' || charge.sub === '') return null;
  if (typeof charge.role !== 'string' || !ROLES_COMPTE.includes(charge.role as RoleCompte)) {
    return null;
  }

  // `exp` est en SECONDES depuis l'époque, là où `Date.now()` est en
  // millisecondes. Comparer les deux sans conversion déclare tout jeton
  // expiré, et le symptôme est une déconnexion immédiate après la connexion.
  const expireA = typeof charge.exp === 'number' ? new Date(charge.exp * 1000) : null;
  if (expireA && expireA.getTime() <= maintenant) return null;

  return { compte: charge.sub, role: charge.role as RoleCompte, expireA };
};

/** Le raccourci des deux étapes, pour un jeton brut. */
export const sessionDepuisJeton = (
  jeton: string | null | undefined,
  maintenant: number = Date.now(),
): Session | null => (jeton ? sessionDepuisCharge(decoderJeton(jeton), maintenant) : null);
