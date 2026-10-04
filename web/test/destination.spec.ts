import { describe, expect, it } from 'vitest';
import { destinationSure } from '../lib/destination.js';
import { formaterCentimes } from '../components/Montant.js';

/**
 * ══ La garde anti-redirection ouverte ══════════════════════════════════════
 *
 * Après une connexion, l'application renvoie l'utilisateur là où il voulait
 * aller — une valeur qui vient donc du client, et qu'un attaquant choisit.
 * Un lien vers `/connexion?suite=https://mechant.ma` placé dans un courriel
 * fait atterrir la victime sur un faux site, après un passage par le vrai :
 * la barre d'adresse a montré le bon domaine, et le mot de passe suivant est
 * saisi en confiance.
 *
 * ── Pourquoi ce fichier existe ──────────────────────────────────────────────
 * La première version de la garde ne contrôlait que le préfixe. Une revue l'a
 * corrigée en comparant l'origine obtenue par résolution contre une origine
 * témoin, ce qui écarte la plupart des charges utiles — et une relecture l'a
 * déclarée correcte.
 *
 * Elle ne l'était pas. `/..//mechant.ma` se normalise en `//mechant.ma` : le
 * `..` remonte au-dessus de la racine, l'origine témoin reste intacte, donc le
 * contrôle passe, et la chaîne rendue est une URL relative au protocole que le
 * navigateur résout vers l'extérieur.
 *
 * Le défaut a été trouvé en ÉPROUVANT la garde contre une liste de charges
 * utiles, pas en la relisant. D'où ce fichier : la liste est désormais
 * exécutée à chaque modification, et toute garde réécrite devra la repasser.
 */
const destination = (valeur: string) => destinationSure(valeur);

/** Une destination est sortante si le navigateur la résoudrait hors du site. */
const estSortante = (chemin: string): boolean =>
  chemin.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(chemin);

describe('La destination après connexion', () => {
  it('laisse passer un chemin interne, avec sa requête et son ancre', () => {
    expect(destination(('/besoins'))).toBe('/besoins');
    expect(destination(('/besoins?metier=PLOMBERIE#liste'))).toBe(
      '/besoins?metier=PLOMBERIE#liste',
    );
    expect(destination(('/espace-artisan/planning'))).toBe('/espace-artisan/planning');
  });

  it("retombe sur l'accueil quand il n'y a rien à suivre", () => {
    expect(destination('')).toBe('/');
    expect(destination((''))).toBe('/');
    expect(destination(('   '))).toBe('/');
  });

  /**
   * ══ LA LISTE ══════════════════════════════════════════════════════════════
   *
   * Chaque entrée est une charge utile connue de redirection ouverte. Le test
   * ne vérifie pas une valeur attendue au cas par cas — il vérifie
   * l'INVARIANT : rien de ce que rend la garde ne doit pouvoir sortir du site.
   *
   * Formuler l'assertion comme un invariant plutôt que comme une table de
   * correspondances a une conséquence utile : une garde réécrite autrement
   * (qui rendrait `/` plutôt que le chemin nettoyé, par exemple) passe encore,
   * sans qu'on ait à remettre la table à jour. C'est la propriété qu'on veut
   * tenir, pas l'implémentation qu'on veut figer.
   */
  const CHARGES_UTILES = [
    'https://mechant.ma',
    'http://mechant.ma/connexion',
    '//mechant.ma',
    '////mechant.ma',
    '/\\mechant.ma',
    '/\\\\mechant.ma',
    '\\\\mechant.ma',
    // Celle-ci est la fuite qui avait survécu à la revue : le `..` remonte
    // au-dessus de la racine et la normalisation produit `//mechant.ma`.
    '/..//mechant.ma',
    '/../..//mechant.ma',
    '/a/../..//mechant.ma',
    // Caractères de contrôle, que les navigateurs retirent avant de résoudre.
    '\t//mechant.ma',
    '\n//mechant.ma',
    '/\t/mechant.ma',
    '/\n//mechant.ma',
    ' //mechant.ma',
    // Schémas d'URL.
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    // Identifiants dans l'autorité, pour faire passer le domaine réel pour un
    // chemin : `//a.invalid@mechant.ma` est servi par mechant.ma.
    '//a.invalid@mechant.ma',
    '/\\/mechant.ma',
  ];

  it.each(CHARGES_UTILES)('ne sort jamais du site : %j', (charge) => {
    const obtenu = destination((charge));
    expect(estSortante(obtenu), `« ${charge} » a produit « ${obtenu} »`).toBe(false);
    expect(obtenu.startsWith('/')).toBe(true);
  });

  /**
   * Un chemin qui RESSEMBLE à une URL sans en être une doit passer : le
   * contrôle doit être étroit, pas large. Une garde qui refuse tout ce qui
   * contient un point ou deux-points casserait des routes légitimes, et la
   * correction serait alors retirée au premier ticket.
   */
  it('laisse passer un chemin interne qui ressemble à une URL', () => {
    expect(destination(('/artisan/plomberie-ouazzani.ma'))).toBe(
      '/artisan/plomberie-ouazzani.ma',
    );
    expect(destination(('/recherche?ville=Fès'))).toContain('/recherche');
  });
});

/**
 * ══ L'argent ═══════════════════════════════════════════════════════════════
 *
 * L'API stocke des CENTIMES en entier. Toute la conversion vit dans un seul
 * endroit, et c'est celui-là qu'on éprouve — un arrondi faux sur un montant
 * est le genre de défaut qu'un utilisateur découvre avant nous, sur une
 * facture, et qui n'est alors plus réparable discrètement.
 */
describe('Les montants', () => {
  it('rend des dirhams à deux décimales depuis des centimes entiers', () => {
    expect(formaterCentimes(0)).toMatch(/0,00/);
    expect(formaterCentimes(1)).toMatch(/0,01/);
    expect(formaterCentimes(45_000)).toMatch(/450,00/);
    expect(formaterCentimes(380_000)).toMatch(/3\s?800,00/);
  });

  /**
   * Le centime ne doit jamais se perdre dans un flottant.
   *
   * 1 999 999 centimes divisés en nombre à virgule flottante donnent
   * 19999.989999999998 sur certaines opérations. Le test porte sur les deux
   * dernières décimales, qui sont celles qui se perdent.
   */
  it('ne perd pas le centime sur de gros montants', () => {
    expect(formaterCentimes(1_999_999)).toMatch(/19\s?999,99/);
    expect(formaterCentimes(100_000_001)).toMatch(/1\s?000\s?000,01/);
  });

  it('ne rend jamais de notation scientifique ni de NaN', () => {
    for (const centimes of [0, 1, 999, 1_000_000_000]) {
      const rendu = formaterCentimes(centimes);
      expect(rendu).not.toMatch(/e[+-]/i);
      expect(rendu).not.toContain('NaN');
    }
  });
});
