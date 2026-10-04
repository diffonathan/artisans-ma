import { describe, expect, it } from 'vitest';
import { CHEMINS } from '../components/chemins.js';
import { REGLES_DE_ROUTE, decisionDeRoute, regleDeRoute } from '../lib/habilitations.js';

/**
 * ══ LE FILTRE DE NAVIGATION ════════════════════════════════════════════════
 *
 * Ce que ces tests éprouvent, et ce qu'ils N'éprouvent PAS.
 *
 * Ils éprouvent une table et une correspondance de préfixe. Ils ne prouvent
 * AUCUNE sécurité : la signature du jeton n'est pas vérifiée par le front, et
 * un cookie fabriqué annonçant `role: ADMIN` franchit ce filtre. L'autorité
 * est l'API, qui refuse l'opération. Le raisonnement complet est dans
 * l'en-tête de `proxy.ts`.
 *
 * Ce qu'ils protègent, en revanche, est réel : la différence entre
 * « connecter » et « refuser ». Les confondre envoie quelqu'un de déjà
 * connecté se reconnecter en boucle.
 */

describe('Les routes publiques', () => {
  it('ne portent aucune règle', () => {
    for (const chemin of [
      CHEMINS.accueil,
      CHEMINS.recherche,
      CHEMINS.technique,
      CHEMINS.connexion,
      CHEMINS.inscription,
      CHEMINS.inscriptionArtisan,
      CHEMINS.accesRefuse,
      '/artisan/507f1f77bcf86cd799439011',
    ]) {
      expect(regleDeRoute(chemin), chemin).toBeNull();
      expect(decisionDeRoute(chemin, null), chemin).toBe('laisser');
      expect(decisionDeRoute(chemin, 'CLIENT'), chemin).toBe('laisser');
      expect(decisionDeRoute(chemin, 'ARTISAN'), chemin).toBe('laisser');
    }
  });

  /**
   * `/acces-refuse` DOIT rester publique : c'est la cible de la réécriture du
   * proxy. La filtrer produirait une réécriture vers une route filtrée, donc
   * une boucle de réécritures que Next arrête par une erreur.
   */
  it('comprennent l’écran de refus lui-même, sinon le proxy bouclerait', () => {
    expect(regleDeRoute(CHEMINS.accesRefuse)).toBeNull();
  });
});

describe('Les routes du client', () => {
  it('exigent CLIENT, et refusent un artisan sans le déconnecter', () => {
    for (const chemin of [CHEMINS.publierBesoin, CHEMINS.mesReservations]) {
      expect(decisionDeRoute(chemin, 'CLIENT'), chemin).toBe('laisser');
      expect(decisionDeRoute(chemin, 'ARTISAN'), chemin).toBe('refuser');
      expect(decisionDeRoute(chemin, null), chemin).toBe('connecter');
    }
  });

  /**
   * ADMIN sur `/mes-besoins` et nulle part ailleurs du côté client.
   *
   * `mesBesoins` ne porte aucun `@Roles` dans l'API : tout compte connecté la
   * lit. `publierBesoin` et `mesReservations` sont `@Roles(Role.CLIENT)`, et la
   * garde compare par appartenance stricte — un ADMIN y est refusé. La table
   * suit l'API, et cette asymétrie est voulue.
   */
  it('laissent un ADMIN lire ses chantiers, mais ni publier ni réserver', () => {
    expect(decisionDeRoute(CHEMINS.mesBesoins, 'ADMIN')).toBe('laisser');
    expect(decisionDeRoute(CHEMINS.publierBesoin, 'ADMIN')).toBe('refuser');
    expect(decisionDeRoute(CHEMINS.mesReservations, 'ADMIN')).toBe('refuser');
  });

  it('couvrent le détail d’un chantier, qui est un segment dynamique', () => {
    const detail = `${CHEMINS.mesBesoins}/507f1f77bcf86cd799439011`;
    expect(decisionDeRoute(detail, 'CLIENT')).toBe('laisser');
    expect(decisionDeRoute(detail, 'ARTISAN')).toBe('refuser');
    expect(decisionDeRoute(detail, null)).toBe('connecter');
  });
});

describe('Les routes de l’artisan', () => {
  it('exigent ARTISAN', () => {
    for (const chemin of [CHEMINS.chantiers, CHEMINS.mesDevis, CHEMINS.monPlanning]) {
      expect(decisionDeRoute(chemin, 'ARTISAN'), chemin).toBe('laisser');
      expect(decisionDeRoute(chemin, 'CLIENT'), chemin).toBe('refuser');
      expect(decisionDeRoute(chemin, 'ADMIN'), chemin).toBe('refuser');
      expect(decisionDeRoute(chemin, null), chemin).toBe('connecter');
    }
  });
});

describe('Mon compte', () => {
  it('demande seulement d’être connecté, quel que soit le rôle', () => {
    expect(decisionDeRoute(CHEMINS.monCompte, 'CLIENT')).toBe('laisser');
    expect(decisionDeRoute(CHEMINS.monCompte, 'ARTISAN')).toBe('laisser');
    expect(decisionDeRoute(CHEMINS.monCompte, 'ADMIN')).toBe('laisser');
    expect(decisionDeRoute(CHEMINS.monCompte, null)).toBe('connecter');
  });

  it('ne refuse JAMAIS : il n’y a pas de rôle qui n’y ait pas droit', () => {
    for (const role of ['CLIENT', 'ARTISAN', 'ADMIN'] as const) {
      expect(decisionDeRoute(CHEMINS.monCompte, role), role).not.toBe('refuser');
    }
  });
});

/**
 * ══ LE PIÈGE DU PRÉFIXE ════════════════════════════════════════════════════
 *
 * `startsWith` seul transforme une route publique en route privée sans que
 * personne ne l'ait décidé. Le cas est inventé — `/mes-devis-archives`
 * n'existe pas — et c'est exactement pour cela qu'il est écrit : le jour où
 * quelqu'un l'ajoutera, ce test dira ce que la règle fait.
 */
describe('La correspondance de préfixe', () => {
  it('n’attrape pas une route qui commence par les mêmes lettres', () => {
    expect(regleDeRoute('/mes-devis-archives')).toBeNull();
    expect(regleDeRoute('/mes-besoinsXYZ')).toBeNull();
    expect(regleDeRoute('/chantiers-publics')).toBeNull();
    expect(decisionDeRoute('/mes-devis-archives', null)).toBe('laisser');
  });

  it('attrape l’égalité et le préfixe suivi d’une barre', () => {
    expect(regleDeRoute('/mes-devis')?.chemin).toBe(CHEMINS.mesDevis);
    expect(regleDeRoute('/mes-devis/')?.chemin).toBe(CHEMINS.mesDevis);
    expect(regleDeRoute('/mes-devis/42/detail')?.chemin).toBe(CHEMINS.mesDevis);
  });

  it('n’attrape pas la racine, qui serait tout le site', () => {
    expect(regleDeRoute('/')).toBeNull();
  });
});

describe('La table elle-même', () => {
  it('ne déclare aucun chemin deux fois : le second serait mort', () => {
    const chemins = REGLES_DE_ROUTE.map((regle) => regle.chemin);
    expect(new Set(chemins).size).toBe(chemins.length);
  });

  it('n’emboîte aucun chemin dans un autre, donc l’ordre de la table est sans effet', () => {
    // La PREMIÈRE règle qui correspond gagne. Tant que rien ne s'emboîte, ce
    // détail est inoffensif ; ce test est là pour qu'un futur
    // `/mes-besoins/archives` déclaré après `/mes-besoins` ne passe pas
    // inaperçu.
    for (const regle of REGLES_DE_ROUTE) {
      for (const autre of REGLES_DE_ROUTE) {
        if (regle === autre) continue;
        expect(
          autre.chemin.startsWith(`${regle.chemin}/`),
          `${autre.chemin} est sous ${regle.chemin}`,
        ).toBe(false);
      }
    }
  });

  it('ne déclare que des chemins qui viennent de CHEMINS', () => {
    const connus = new Set<string>(Object.values(CHEMINS));
    for (const regle of REGLES_DE_ROUTE) {
      expect(connus.has(regle.chemin), regle.chemin).toBe(true);
    }
  });
});
