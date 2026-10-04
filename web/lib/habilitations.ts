/* ══════════════════════════════════════════════════════════════════════════
   QUELLE ROUTE DEMANDE QUEL RÔLE

   ⚠️ CE N'EST PAS UNE GARANTIE. ⚠️ C'est la table que `proxy.ts` consulte pour
   éviter d'ouvrir un écran qui n'affichera rien. L'autorité est l'API, qui
   vérifie le rôle à chaque opération en validant la SIGNATURE du jeton — ce
   que le front ne peut pas faire (voir `lib/jeton.ts`). Le raisonnement
   complet, et les trois conséquences pratiques, sont dans l'en-tête de
   `proxy.ts`.

   ── Pourquoi cette table n'est PAS dans proxy.ts ──────────────────────────

   Parce qu'un fichier de proxy ne peut exporter que sa fonction et son
   `config` : `decision` et la table n'y seraient pas éprouvables. Et la règle
   du préfixe ci-dessous est exactement le genre de détail qui se relit comme
   correct et se révèle faux sur un cas qu'on n'avait pas en tête.

   Les cas sont figés dans `test/habilitations.spec.ts`.
   ══════════════════════════════════════════════════════════════════════════ */

import { CHEMINS } from '@/components/chemins';
import type { RoleCompte } from '@/lib/jeton';

export interface RegleDeRoute {
  /** Le préfixe de chemin, tel que `components/chemins.ts` le déclare. */
  chemin: string;
  /** `null` : il suffit d'être connecté, quel que soit le rôle. */
  roles: readonly RoleCompte[] | null;
}

/**
 * Les routes privées, et le rôle que chacune demande.
 *
 * Les chemins viennent de `CHEMINS` et ne sont pas réécrits à la main : une
 * route renommée là-bas cesserait d'être filtrée ici en silence, ce qui est
 * exactement l'écart qu'une source unique existe pour empêcher.
 *
 * ── Ce qui décide du contenu de chaque ligne ───────────────────────────────
 * L'API, et rien d'autre. Chaque ligne a été relue contre son `@Roles(...)` :
 *
 *   • `mesBesoins` ne porte AUCUN `@Roles` dans
 *     `api/src/domaine/besoins/besoins.resolver.ts` : tout compte connecté la
 *     lit, ADMIN compris, et la page l'accepte (`exigerRole(['CLIENT',
 *     'ADMIN'])`). D'où ADMIN sur cette seule ligne ;
 *   • `publierBesoin`, `mesReservations`, `accepterDevis` et `deposerAvis`
 *     sont `@Roles(Role.CLIENT)`, et la garde compare par appartenance
 *     STRICTE — un ADMIN y est refusé. Lui ouvrir ces routes donnerait un
 *     écran dont chaque requête échoue ;
 *   • `besoinsPourMoi`, `mesDevis` et `monPlanning` sont
 *     `@Roles(Role.ARTISAN)`.
 *
 * Le filtre suit donc la page, qui suit l'API. Jamais l'inverse.
 */
export const REGLES_DE_ROUTE: readonly RegleDeRoute[] = [
  { chemin: CHEMINS.mesBesoins, roles: ['CLIENT', 'ADMIN'] },
  { chemin: CHEMINS.publierBesoin, roles: ['CLIENT'] },
  { chemin: CHEMINS.mesReservations, roles: ['CLIENT'] },

  { chemin: CHEMINS.chantiers, roles: ['ARTISAN'] },
  { chemin: CHEMINS.mesDevis, roles: ['ARTISAN'] },
  { chemin: CHEMINS.monPlanning, roles: ['ARTISAN'] },

  // Les trois rôles ont un compte : c'est le CONTENU qui diffère, pas le droit
  // d'être là.
  { chemin: CHEMINS.monCompte, roles: null },
];

/**
 * La règle qui s'applique à ce chemin, ou `null` si la route est publique.
 *
 * ── Le préfixe, et le piège ───────────────────────────────────────────────
 * La correspondance est l'égalité OU le préfixe suivi d'une barre, et jamais
 * `startsWith` seul. Sans la barre, une règle sur `/mes-devis` filtrerait
 * aussi un futur `/mes-devis-archives` — une route publique devenue privée
 * sans que personne ne l'ait décidé — et une règle sur `/` filtrerait tout le
 * site. C'est la même précaution que `estCourante` dans
 * `components/Enveloppe.tsx`, et pour la même raison.
 *
 * La PREMIÈRE règle qui correspond gagne. L'ordre de la table compte donc si
 * deux chemins s'emboîtent ; aucun ne s'emboîte aujourd'hui, et ce test-là est
 * écrit pour qu'on le sache si cela change.
 */
export const regleDeRoute = (chemin: string): RegleDeRoute | null =>
  REGLES_DE_ROUTE.find(
    (regle) => chemin === regle.chemin || chemin.startsWith(`${regle.chemin}/`),
  ) ?? null;

/**
 * Ce que le proxy doit faire de cette requête.
 *
 *   'laisser'  — route publique, ou rôle attendu : on ne touche à rien ;
 *   'connecter' — personne n'est connecté : la connexion, avec de quoi revenir ;
 *   'refuser'  — quelqu'un est connecté, mais ce n'est pas son côté du
 *                service : un refus, et SURTOUT pas la connexion.
 *
 * La distinction entre les deux derniers est la raison d'être de ce module.
 * Renvoyer vers la connexion quelqu'un qui est déjà connecté lui demande de
 * régler par la connexion un problème que la connexion ne règle pas : il
 * reviendrait avec le même compte, serait ramené sur la même page par le
 * paramètre `suite`, et repartirait vers la connexion. Une boucle, et rien
 * pour expliquer pourquoi.
 */
export type Decision = 'laisser' | 'connecter' | 'refuser';

export const decisionDeRoute = (chemin: string, role: RoleCompte | null): Decision => {
  const regle = regleDeRoute(chemin);
  if (!regle) return 'laisser';
  if (role === null) return 'connecter';
  if (regle.roles === null) return 'laisser';
  return regle.roles.includes(role) ? 'laisser' : 'refuser';
};
