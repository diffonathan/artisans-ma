/* ══════════════════════════════════════════════════════════════════════════
   LES ÉNUMÉRATIONS DU SCHÉMA, ET RIEN D'AUTRE

   Ce sont les `enum` de `api/schema.graphql`, dans leur orthographe exacte.
   Elles DÉCLARENT — ce module ne ré-exporte rien et n'est pas un barillet.

   ── Pourquoi elles ne sont plus dans lib/graphql.ts ────────────────────────

   Elles y étaient, et la construction de production refusait le projet.
   `lib/graphql.ts` importe `lireJetonSession`, donc `lib/session.ts`, donc
   `next/headers`. Un composant 'use client' qui lit `METIERS` — le formulaire
   d'inscription de l'artisan, les filtres de la recherche, le formulaire de
   publication d'un besoin — tirait donc `next/headers` dans le paquet du
   NAVIGATEUR, où cette API n'existe pas :

     « You're importing a module that depends on "next/headers". This API is
       only available in Server Components in the App Router »

   Un `import type` seul passait (les types sont effacés) ; c'est l'import de
   la VALEUR `METIERS` qui cassait. Le symptôme était donc intermittent selon
   l'écran, et invisible en développement : `next dev` sert les paquets à la
   demande et ne le signalait pas.

   La leçon est générale, et c'est pourquoi ce fichier existe plutôt qu'une
   rustine par import : les constantes partagées entre serveur et navigateur
   ne doivent jamais vivre dans le même module que le transport. Ce module
   n'importe RIEN, et ne peut donc rien entraîner avec lui.
   ══════════════════════════════════════════════════════════════════════════ */

export const METIERS = [
  'CARRELAGE',
  'CLIMATISATION',
  'ELECTRICITE',
  'MACONNERIE',
  'MENUISERIE',
  'PEINTURE',
  'PLOMBERIE',
  'SERRURERIE',
] as const;
export type Metier = (typeof METIERS)[number];

export const STATUTS_BESOIN = ['OUVERT', 'ATTRIBUE', 'CLOS'] as const;
export type StatutBesoin = (typeof STATUTS_BESOIN)[number];

export const STATUTS_DEVIS = ['ENVOYE', 'ACCEPTE', 'REFUSE', 'RETIRE'] as const;
export type StatutDevis = (typeof STATUTS_DEVIS)[number];

export const STATUTS_RESERVATION = ['A_PAYER', 'PAYEE', 'TERMINEE', 'ANNULEE'] as const;
export type StatutReservation = (typeof STATUTS_RESERVATION)[number];

export const ROLES = ['ADMIN', 'ARTISAN', 'CLIENT'] as const;
export type Role = (typeof ROLES)[number];
