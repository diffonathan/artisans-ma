import { describe, expect, it } from 'vitest';
import {
  composantesAuMaroc,
  creneauCompact,
  estAVenir,
  formaterDate,
  formaterDateAvecJour,
  formaterHeure,
  instantDepuisHeureMarocaine,
} from '../lib/dates.js';

/**
 * ══ L'HEURE DU MAROC, MESURÉE ET NON SUPPOSÉE ══════════════════════════════
 *
 * Ce module a remplacé QUATRE formateurs de date écrits séparément, qui
 * arbitraient le fuseau de trois façons différentes :
 *
 *   • `Intl` avec `timeZone: 'Africa/Casablanca'` et des libellés `fr-MA` —
 *     juste sur le fuseau, exposé sur la langue ;
 *   • un décalage FIXE de +60 minutes, deux fois — juste sur la langue, faux
 *     pendant le Ramadan ;
 *   • aucun décalage, composantes lues en UTC — juste sur la langue, et
 *     décalé d'une heure onze mois sur douze.
 *
 * Les tests ci-dessous portent sur la différence entre ces choix, et pas sur
 * le cas facile. Deux dates leur servent de pivot :
 *
 *   • le 12 MARS 2026 est dans le Ramadan : le Maroc est à UTC+0 ;
 *   • le 12 OCTOBRE 2026 ne l'est pas : le Maroc est à UTC+1.
 *
 * Un décalage fixe se trompe sur la première ; une lecture en UTC se trompe
 * sur la seconde. Les deux sont ici.
 */

describe('Les composantes d’un instant, au Maroc', () => {
  it('applique UTC+1 hors Ramadan', () => {
    const c = composantesAuMaroc('2026-10-12T23:30:00.000Z');
    expect(c).toEqual({
      annee: 2026,
      mois: 10,
      jour: 13,
      heures: 0,
      minutes: 30,
      // 13 octobre 2026 : un mardi.
      jourSemaine: 2,
    });
  });

  it('applique UTC+0 pendant le Ramadan, ce qu’un décalage figé ne sait pas faire', () => {
    const c = composantesAuMaroc('2026-03-12T23:30:00.000Z');
    expect(c?.jour).toBe(12);
    expect(c?.heures).toBe(23);
  });

  it('rend null sur une chaîne qui n’est pas une date', () => {
    expect(composantesAuMaroc('pas une date')).toBeNull();
    expect(composantesAuMaroc('')).toBeNull();
  });
});

describe('L’écriture d’une date', () => {
  it('écrit « 1er » le premier du mois, et le nombre seul ensuite', () => {
    expect(formaterDate('2026-08-01T08:00:00.000Z')).toBe('1er août 2026');
    expect(formaterDate('2026-08-02T08:00:00.000Z')).toBe('2 août 2026');
  });

  it('nomme les douze mois en français, sans passer par l’ICU', () => {
    const mois = Array.from({ length: 12 }, (_, rang) =>
      formaterDate(`2026-${String(rang + 1).padStart(2, '0')}-15T12:00:00.000Z`),
    );
    expect(mois).toEqual([
      '15 janvier 2026',
      '15 février 2026',
      '15 mars 2026',
      '15 avril 2026',
      '15 mai 2026',
      '15 juin 2026',
      '15 juillet 2026',
      '15 août 2026',
      '15 septembre 2026',
      '15 octobre 2026',
      '15 novembre 2026',
      '15 décembre 2026',
    ]);
  });

  it('nomme le jour de la semaine quand on le demande', () => {
    // Le 8 octobre 2026 est un jeudi. Le jour est RECALCULÉ depuis les
    // composantes décalées, et non demandé à l'ICU : c'est un nom, donc une
    // donnée de langue.
    expect(formaterDateAvecJour('2026-10-08T10:00:00.000Z')).toBe('jeudi 8 octobre 2026');
  });

  it('écrit l’heure sur deux chiffres, minuit compris', () => {
    // Minuit s'écrit « 00:00 » et jamais « 24:00 » : `hourCycle: 'h23'` plutôt
    // que `hour12: false`, qui rend 24 dans plusieurs versions d'ICU.
    expect(formaterHeure('2026-10-12T23:00:00.000Z')).toBe('00:00');
    expect(formaterHeure('2026-10-12T08:05:00.000Z')).toBe('09:05');
  });

  it('rend null plutôt qu’« Invalid Date »', () => {
    expect(formaterDate('n’importe quoi')).toBeNull();
    expect(formaterDateAvecJour('')).toBeNull();
    expect(formaterHeure('2026-13-45')).toBeNull();
  });
});

describe('Le créneau en deux lignes', () => {
  it('écrit une seule date quand les deux bornes tombent le même jour', () => {
    const creneau = creneauCompact('2026-10-08T08:00:00Z', '2026-10-08T11:00:00Z');
    expect(creneau.jour).toBe('jeudi 8 octobre 2026');
    expect(creneau.heures).toBe('09:00 – 12:00');
  });

  it('écrit « du … au … » quand le créneau franchit minuit', () => {
    const creneau = creneauCompact('2026-10-08T22:00:00Z', '2026-10-09T01:00:00Z');
    expect(creneau.jour).toBe('du jeudi 8 octobre 2026 au vendredi 9 octobre 2026');
    expect(creneau.heures).toBe('23:00 → 02:00');
  });

  /**
   * Le cas que la comparaison par LIBELLÉ attraperait par accident, et que la
   * comparaison par composantes attrape par construction : 23 h UTC et 1 h UTC
   * le lendemain sont le MÊME jour au Maroc en octobre (UTC+1).
   */
  it('juge « même jour » sur les composantes locales, pas sur les bornes UTC', () => {
    const creneau = creneauCompact('2026-10-07T23:00:00Z', '2026-10-08T03:00:00Z');
    expect(creneau.jour).toBe('jeudi 8 octobre 2026');
    expect(creneau.heures).toBe('00:00 – 04:00');
  });

  it('rend une phrase et non un vide quand une borne est illisible', () => {
    // Le repli est une PHRASE parce que son appelant l'affiche en titre de
    // carte : un titre absent casserait la mise en page.
    expect(creneauCompact('pas une date', '2026-10-08T03:00:00Z')).toEqual({
      jour: 'Créneau indisponible',
      heures: '',
    });
  });
});

describe('Une saisie locale vers un instant', () => {
  it('lit « 09:00 » comme 9 h au Maroc, et non comme 9 h UTC', () => {
    // Octobre : UTC+1, donc 08:00 UTC.
    expect(instantDepuisHeureMarocaine('2026-10-07T09:00')).toBe('2026-10-07T08:00:00.000Z');
  });

  it('lit la même saisie autrement pendant le Ramadan, parce que le pays le fait', () => {
    // Mars 2026 : UTC+0, donc 09:00 UTC pour 9 h sur place. Un décalage figé à
    // +60 minutes aurait rendu 08:00 — le rendez-vous avancé d'une heure.
    expect(instantDepuisHeureMarocaine('2026-03-12T09:00')).toBe('2026-03-12T09:00:00.000Z');
  });

  it('fait l’aller-retour sans dériver', () => {
    for (const saisie of [
      '2026-01-15T07:30',
      '2026-03-12T23:45',
      '2026-07-01T00:00',
      '2026-10-31T13:15',
      '2026-12-31T23:59',
    ]) {
      const instant = instantDepuisHeureMarocaine(saisie);
      expect(instant, saisie).not.toBeNull();
      const c = composantesAuMaroc(instant as string);
      const relu = `${c?.annee}-${String(c?.mois).padStart(2, '0')}-${String(c?.jour).padStart(2, '0')}T${String(c?.heures).padStart(2, '0')}:${String(c?.minutes).padStart(2, '0')}`;
      expect(relu, saisie).toBe(saisie);
    }
  });

  it('refuse une date qui n’existe pas, que Date.UTC accepte en silence', () => {
    // `Date.UTC(2026, 1, 31)` ne lève pas : il rend le 3 mars. Le témoin
    // relit les composantes et constate qu'elles ne sont pas celles saisies.
    expect(instantDepuisHeureMarocaine('2026-02-31T09:00')).toBeNull();
    expect(instantDepuisHeureMarocaine('2026-13-01T09:00')).toBeNull();
    expect(instantDepuisHeureMarocaine('2026-10-07T25:00')).toBeNull();
  });

  it('refuse ce qui n’a pas la forme d’un datetime-local', () => {
    for (const saisie of ['', '2026-10-07', '07/10/2026 09:00', '2026-10-07 09:00', 'demain']) {
      expect(instantDepuisHeureMarocaine(saisie), saisie).toBeNull();
    }
  });

  it('accepte les secondes, que certains navigateurs ajoutent', () => {
    expect(instantDepuisHeureMarocaine('2026-10-07T09:00:00')).toBe('2026-10-07T08:00:00.000Z');
  });
});

describe('estAVenir', () => {
  it('compare à l’horloge fournie, et non à l’horloge du processus', () => {
    const maintenant = Date.parse('2026-10-08T12:00:00Z');
    expect(estAVenir('2026-10-08T12:00:01Z', maintenant)).toBe(true);
    expect(estAVenir('2026-10-08T11:59:59Z', maintenant)).toBe(false);
    // L'instant exact est « à venir » : une intervention qui finit maintenant
    // n'est pas encore passée.
    expect(estAVenir('2026-10-08T12:00:00Z', maintenant)).toBe(true);
  });

  it('rend false sur une date illisible, au lieu de lever', () => {
    expect(estAVenir('pas une date', Date.parse('2026-10-08T12:00:00Z'))).toBe(false);
  });
});
