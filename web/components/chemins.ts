/**
 * Les chemins de l'application.
 *
 * ── Pourquoi ce fichier existe, et pourquoi ces lignes ne sont PLUS dans
 *    components/Enveloppe.tsx ──────────────────────────────────────────────
 *
 * `CHEMINS` y était déclaré, et l'enveloppe porte `'use client'`. Or une
 * valeur exportée par un module client et importée depuis un composant
 * SERVEUR ne traverse pas la frontière : React la remplace par une
 * **référence client**, c'est-à-dire une fonction opaque dont toute lecture de
 * propriété rend `undefined`. Mesuré sur ce projet pendant la construction :
 *
 *   typeof CHEMINS           → 'function'
 *   String(CHEMINS.accueil)  → 'undefined'
 *
 * Aucune erreur de type ne le signale — `typeof CHEMINS` reste correct pour
 * TypeScript, qui ne modélise pas la frontière serveur/client. Le symptôme
 * arrive bien plus loin : `<Link href={undefined}>` fait planter le
 * formateur d'URL de Next sur « Cannot destructure property 'auth' of 'a' as
 * it is undefined », message qui ne nomme ni le chemin, ni le composant, ni la
 * frontière. La construction de `/_not-found` échouait là-dessus.
 *
 * Et c'était le cas FAVORABLE : un `href` absent sur un lien rendu
 * dynamiquement ne plante pas, il produit un lien mort. Un chemin par page,
 * silencieusement.
 *
 * Ce module n'a donc pas de directive : il est importable des deux côtés. Ce
 * n'est pas un fichier barillet — il ne ré-exporte rien, il DÉCLARE. Et
 * `Enveloppe.tsx` ne ré-expose pas `CHEMINS` : un ré-export depuis un module
 * client resterait une référence client, donc le même piège. L'ancien import
 * `from '@/components/Enveloppe'` est désormais une erreur de compilation,
 * ce qui est exactement ce qu'on veut qu'il soit.
 *
 * ── Ce que ces chemins ne sont pas ───────────────────────────────────────
 * Des routes typées. Un chemin qui n'existe pas ne lève AUCUNE erreur, juste
 * un 404 à l'exécution. D'où l'intérêt de les importer plutôt que de recopier
 * des littéraux : au moins le renommage se fait en un endroit.
 */
export const CHEMINS = {
  accueil: '/',
  recherche: '/recherche',
  connexion: '/connexion',
  inscription: '/inscription',
  inscriptionArtisan: '/inscription/artisan',
  monCompte: '/mon-compte',
  technique: '/technique',
  /**
   * L'écran de refus d'habilitation. AUCUN lien ne pointe dessus, et c'est
   * voulu : on n'y arrive que par la réécriture de `proxy.ts`, qui conserve
   * l'adresse demandée dans la barre. Il est déclaré ici quand même, parce
   * que le proxy en a besoin et que recopier un littéral de chemin est
   * exactement ce que ce fichier existe pour éviter.
   */
  accesRefuse: '/acces-refuse',
  // Côté client
  mesBesoins: '/mes-besoins',
  publierBesoin: '/publier-un-besoin',
  mesReservations: '/mes-reservations',
  // Côté artisan
  chantiers: '/chantiers',
  mesDevis: '/mes-devis',
  monPlanning: '/mon-planning',
} as const;

/**
 * Les chemins qui portent un identifiant.
 *
 * Séparés de `CHEMINS` et non glissés dedans : `CHEMINS` est un objet de
 * constantes, que `as const` rend littéral et donc comparable (`chemin ===
 * CHEMINS.recherche`). Y mêler des fonctions casserait cette propriété, dont
 * se sert la navigation pour marquer la rubrique courante.
 *
 * L'identifiant est encodé : il vient de l'URL ou d'une réponse de l'API, et
 * un `ObjectId` n'a rien à y échapper — mais la fonction ne sait pas d'où on
 * l'appelle, et le jour où un slug remplacera l'identifiant, l'encodage sera
 * déjà là.
 */
export const CHEMINS_AVEC_ID = {
  ficheArtisan: (id: string) => `/artisan/${encodeURIComponent(id)}`,
  besoin: (id: string) => `/mes-besoins/${encodeURIComponent(id)}`,
} as const;
