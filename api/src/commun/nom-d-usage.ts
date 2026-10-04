/**
 * Réduit un nom complet à son nom d'usage : « Fatima Benjelloun » → « Fatima B. ».
 *
 * ── Pourquoi côté serveur, et pourquoi dans un module à part ────────────────
 * Le prénom suffit à s'adresser à quelqu'un. Le patronyme entier permet de le
 * retrouver ailleurs, et n'apporte rien à la décision de chiffrer un chantier
 * ni à la lecture d'un avis. La réduction est donc faite AVANT l'envoi : une
 * troncature posée à l'affichage laisserait la valeur entière traverser le
 * réseau, où elle se lit dans n'importe quel outil de développement.
 *
 * Le module est séparé parce que la même règle s'applique à deux endroits
 * — l'auteur d'un besoin et l'auteur d'un avis — et qu'une règle de
 * confidentialité recopiée est une règle qui finit par différer d'un endroit à
 * l'autre. C'est d'ailleurs ce qui était arrivé : `Besoin.nomDemandeur` la
 * portait, `Avis.auteur` rendait le compte entier.
 */
export const nomDUsage = (nomComplet: string | undefined | null): string => {
  const morceaux = (nomComplet ?? '').trim().split(/\s+/).filter(Boolean);

  // Pas de nom exploitable : on rend une étiquette neutre plutôt qu'une chaîne
  // vide, qui s'afficherait comme un trou dans l'interface.
  if (morceaux.length === 0) return 'Client';

  // Un seul mot n'a pas d'initiale à réduire — et en réduire un en « F. »
  // supprimerait la seule information utile.
  if (morceaux.length === 1) return morceaux[0];

  // C'est le DERNIER morceau qui fournit l'initiale, pas le second : « Fatima
  // Zahra Benjelloun » donne « Fatima B. » et non « Fatima Z. ».
  const dernier = morceaux[morceaux.length - 1];
  return `${morceaux[0]} ${dernier[0].toUpperCase()}.`;
};
