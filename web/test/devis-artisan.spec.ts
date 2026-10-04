import { describe, expect, it } from 'vitest';
import { PLAFOND_CENTIMES, centimesDepuisDirhams, phraseRefusMontant } from '../lib/argent.js';
import type { RefusMontant } from '../lib/argent.js';

/**
 * ══ La saisie d'un montant, en dirhams, vers des centimes entiers ══════════
 *
 * C'est le seul endroit du front où de l'argent change de représentation. Tout
 * le reste de l'application manipule des centimes entiers, parce que l'API n'en
 * connaît pas d'autres ; ici une personne tape des dirhams, avec son clavier,
 * sa virgule et ses espaces.
 *
 * ── Pourquoi un test, et pas une relecture ─────────────────────────────────
 * La version évidente de cette fonction est `Math.round(Number(saisie) * 100)`.
 * Elle passe sur « 4500 », sur « 4500,50 », et sur tous les exemples qu'on se
 * donne en la relisant. Elle échoue sur « 4500,555 » — où elle INVENTE un
 * montant au lieu de refuser — et sur une saisie de trente chiffres, où elle
 * rend un flottant que l'API rejettera sans dire quel champ est en cause.
 *
 * Les deux cas sont dans la liste ci-dessous. Toute réécriture de la fonction
 * devra les repasser.
 */
const lire = (saisie: string) => centimesDepuisDirhams(saisie);

/** Raccourci de lecture : la raison du refus, ou `null` si la saisie passe. */
const refus = (saisie: string): RefusMontant | null => {
  const resultat = lire(saisie);
  return resultat.ok ? null : resultat.raison;
};

/** Les centimes obtenus, ou `null` si la saisie est refusée. */
const centimes = (saisie: string): number | null => {
  const resultat = lire(saisie);
  return resultat.ok ? resultat.centimes : null;
};

describe('Un montant saisi en dirhams', () => {
  it('convertit un nombre entier', () => {
    expect(centimes('4500')).toBe(450000);
    expect(centimes('1')).toBe(100);
  });

  it('accepte la virgule française et le point anglais', () => {
    expect(centimes('4500,50')).toBe(450050);
    expect(centimes('4500.50')).toBe(450050);
  });

  it('complète une décimale unique à droite, et non à gauche', () => {
    // « 450,5 » fait cinquante centimes. Un `padStart` en ferait cinq, et la
    // différence de quarante-cinq centimes ne se voit sur aucun écran.
    expect(centimes('450,5')).toBe(45050);
  });

  it('ignore les espaces de groupement, sous toutes leurs formes', () => {
    expect(centimes('1 200')).toBe(120000);
    expect(centimes('1 200,25')).toBe(120025);
    expect(centimes('1 200')).toBe(120000);
    expect(centimes("1'200")).toBe(120000);
    expect(centimes('  4500  ')).toBe(450000);
  });

  it("n'introduit aucune erreur de représentation binaire", () => {
    // `Number('4500.55') * 100` vaut 450054.99999999994. Le résultat doit être
    // 450055 exactement, et ce doit être un entier.
    expect(centimes('4500,55')).toBe(450055);
    expect(Number.isInteger(centimes('4500,55'))).toBe(true);

    // Le même piège, sur une valeur réputée pour le montrer.
    expect(centimes('0,07')).toBe(7);
    expect(centimes('8,20')).toBe(820);
    expect(centimes('1,10')).toBe(110);
  });
});

describe('Un montant refusé', () => {
  it('distingue une saisie vide d’une saisie illisible', () => {
    expect(refus('')).toBe('absent');
    expect(refus('   ')).toBe('absent');
    expect(refus('quatre mille')).toBe('illisible');
    expect(refus('4500 DH')).toBe('illisible');
    expect(refus('4500,,50')).toBe('illisible');
    expect(refus('4,5,0')).toBe('illisible');
  });

  it('refuse un signe, même positif', () => {
    // Un devis négatif n'existe pas, et `+4500` est une frappe accidentelle
    // plus souvent qu'une intention.
    expect(refus('-4500')).toBe('illisible');
    expect(refus('+4500')).toBe('illisible');
  });

  it('refuse une troisième décimale au lieu de l’arrondir', () => {
    // C'est LE cas que `Math.round(Number(x) * 100)` traite en silence : il
    // rendrait 450056 pour une saisie que personne n'a voulu écrire.
    expect(refus('4500,555')).toBe('trop-precis');
    expect(refus('1,001')).toBe('trop-precis');
  });

  it('refuse zéro, que l’API refuserait aussi (@Min(1) sur les centimes)', () => {
    expect(refus('0')).toBe('nul');
    expect(refus('0,00')).toBe('nul');
    // Un centime passe : c'est absurde commercialement, mais c'est à l'API de
    // décider du plancher, pas à l'écran d'en inventer un second.
    expect(centimes('0,01')).toBe(1);
  });

  it('refuse ce qui dépasse l’entier 32 bits de GraphQL', () => {
    // `montantCentimes` est un `Int` GraphQL. Au-delà, l'API refuse à l'étage
    // du schéma avec une erreur qui ne nomme aucun champ.
    const plafondEnDirhams = Math.floor(PLAFOND_CENTIMES / 100);
    expect(centimes(String(plafondEnDirhams))).toBe(plafondEnDirhams * 100);
    expect(refus(String(plafondEnDirhams + 1))).toBe('hors-limite');
    expect(refus('999999999999999999999999999')).toBe('hors-limite');
  });

  it('rend un entier sûr, ou rien', () => {
    // La garantie qui compte : aucune saisie ne doit produire un nombre
    // flottant, ni un entier au-delà de la zone exacte.
    const saisies = [
      '0',
      '1',
      '0,01',
      '4500,55',
      '99999999,99',
      '21474836,47',
      '21474836,48',
      '999999999999999999999999999',
      'illisible',
      '',
    ];
    for (const saisie of saisies) {
      const resultat = lire(saisie);
      if (resultat.ok) {
        expect(Number.isSafeInteger(resultat.centimes)).toBe(true);
        expect(resultat.centimes).toBeGreaterThanOrEqual(1);
        expect(resultat.centimes).toBeLessThanOrEqual(PLAFOND_CENTIMES);
      }
    }
  });
});

describe('Les phrases de refus', () => {
  it('en donne une, non vide, pour chacune des cinq raisons', () => {
    // Sans ce test, ajouter une raison à `RefusMontant` sans sa phrase
    // compilerait — le `switch` est exhaustif, mais rien n'oblige à le
    // constater à l'exécution.
    const raisons: RefusMontant[] = ['absent', 'illisible', 'trop-precis', 'nul', 'hors-limite'];
    for (const raison of raisons) {
      expect(phraseRefusMontant(raison).length).toBeGreaterThan(10);
    }
  });
});
