/**
 * Ramène une destination reçue du client à un chemin interne sûr.
 *
 * ── Pourquoi ce code est ICI et non dans les actions ────────────────────────
 * Il y était. Une fonction qui assainit une chaîne n'a pourtant aucune raison
 * de vivre dans un module marqué `'use server'` : l'importer pour l'éprouver
 * traîne avec elle `next/navigation`, le client GraphQL et la session, c'est-
 * à-dire tout ce dont un test de chaîne n'a pas besoin.
 *
 * Une garde de sécurité qu'on ne peut pas éprouver facilement est une garde
 * qu'on n'éprouve pas. L'extraction n'est donc pas un rangement : c'est ce qui
 * rend `test/destination.spec.ts` possible.
 */

/**
 * Valide le chemin de retour, et le remplace par l'accueil s'il est douteux.
 *
 * Sans ce contrôle, `?suite=https://artisans-ma.exemple/connexion` enverrait
 * un visiteur FRAÎCHEMENT AUTHENTIFIÉ sur un site tiers — le moment exact où
 * il est le plus disposé à ressaisir son mot de passe sur un formulaire qui
 * ressemble au nôtre. C'est une redirection ouverte.
 *
 * Le découpage est délégué à l'analyseur d'URL plutôt que deviné à coups de
 * `startsWith`, et c'est ce qui ferme le cas qu'une énumération de formes
 * connues laissait passer : l'étape 2 du « basic URL parser » du WHATWG
 * EFFACE les tabulations et les retours à la ligne AVANT d'analyser, si bien
 * que `/<TAB>/evil.ma` arrive au navigateur en `//evil.ma`, soit une URL de
 * même protocole vers un hôte tiers. `texte()` ne fait que `.trim()`, donc un
 * caractère de contrôle en deuxième position survit.
 *
 * L'origine jetable sert de témoin : si l'analyse déplace l'origine, c'est
 * que la chaîne portait un hôte. Seuls chemin, requête et fragment sont
 * rendus, donc rien ne sort d'ici qui ne soit relatif à notre propre site.
 */
const ORIGINE_TEMOIN = 'https://a.invalid';

/**
 * Ramène une destination reçue du client à un chemin interne sûr.
 *
 * ── Pourquoi deux contrôles et non un ───────────────────────────────────────
 * Le premier compare l'ORIGINE obtenue en résolvant la valeur contre une
 * origine témoin : il écarte `https://mechant.ma`, `//mechant.ma`,
 * `javascript:…` et les variantes à tabulation ou retour à la ligne.
 *
 * Il ne suffit pas. `/..//mechant.ma` se normalise en `//mechant.ma` : le
 * `..` remonte au-dessus de la racine, l'origine témoin reste intacte — donc
 * le premier contrôle passe — et la chaîne RECONSTRUITE est une URL
 * « relative au protocole », que le navigateur résout en
 * `https://mechant.ma`. La redirection sort du site en ayant franchi un
 * contrôle qui ne regardait pas la bonne valeur.
 *
 * D'où le second : on contrôle la chaîne que l'on va réellement rendre, et
 * pas seulement celle d'où elle vient. Un chemin interne commence par un
 * `/` et un seul.
 *
 * Trouvé en éprouvant la garde contre une liste de charges utiles connues,
 * pas en la relisant — la relecture l'avait déclarée correcte. Les cas sont
 * figés dans `test/destination.spec.ts`.
 */
export const destinationSure = (suite: string): string => {
  if (!suite.startsWith('/')) return '/';

  try {
    const url = new URL(suite, ORIGINE_TEMOIN);
    if (url.origin !== ORIGINE_TEMOIN) return '/';

    const chemin = `${url.pathname}${url.search}${url.hash}`;
    if (!chemin.startsWith('/') || chemin.startsWith('//')) return '/';
    return chemin;
  } catch {
    return '/';
  }
};
