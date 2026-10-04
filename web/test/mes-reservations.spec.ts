import { describe, expect, it } from 'vitest';

import {
  actionsPossibles,
  referenceDePaiement,
  validerAvis,
} from '../app/mes-reservations/regles.js';
import { formaterCreneau, formaterDate } from '../lib/dates.js';

/**
 * ══ Les règles de l'écran « mes réservations » ═════════════════════════════
 *
 * Trois sujets, et trois raisons distinctes de les éprouver.
 *
 *   1. CE QUI EST PROPOSÉ. L'écran ne doit offrir que les actions que l'API
 *      accepterait. Proposer « déposer un avis » sur une prestation déjà
 *      notée produit un refus que l'écran savait inévitable, et le visiteur
 *      conclut que l'application est cassée.
 *
 *   2. LA RÉFÉRENCE DE PAIEMENT. Son déterminisme n'est pas une élégance :
 *      `enregistrerPaiement` lève si une AUTRE référence se présente sur une
 *      réservation déjà payée. Une référence tirée au hasard transformerait
 *      un double clic en incohérence signalée.
 *
 *   3. LE CRÉNEAU. Le décalage est appliqué à la main, par choix (le détail
 *      est dans `regles.ts`). Un décalage écrit à la main se vérifie, sinon
 *      il devient un « à peu près » que personne ne recompte.
 */

describe('Les actions possibles selon le statut', () => {
  it('à payer : payer et annuler, jamais noter', () => {
    expect(actionsPossibles('A_PAYER', null)).toEqual({
      payer: true,
      annuler: true,
      noter: false,
    });
  });

  it('payée : annuler seulement — le paiement ne se refait pas', () => {
    expect(actionsPossibles('PAYEE', null)).toEqual({
      payer: false,
      annuler: true,
      noter: false,
    });
  });

  it('terminée et non notée : noter, et rien d’autre', () => {
    expect(actionsPossibles('TERMINEE', null)).toEqual({
      payer: false,
      annuler: false,
      noter: true,
    });
  });

  /**
   * Le cas qui justifie à lui seul cette fonction. L'API refuse le second
   * dépôt — le droit d'avis est un jeton consommé — et l'écran ne doit pas
   * même proposer le formulaire.
   */
  it('terminée et déjà notée : plus aucune action', () => {
    expect(actionsPossibles('TERMINEE', '2026-10-12T10:00:00.000Z')).toEqual({
      payer: false,
      annuler: false,
      noter: false,
    });
  });

  it('annulée : rien, quelle que soit la date d’avis', () => {
    expect(actionsPossibles('ANNULEE', null)).toEqual({
      payer: false,
      annuler: false,
      noter: false,
    });
    expect(actionsPossibles('ANNULEE', '2026-10-12T10:00:00.000Z')).toEqual({
      payer: false,
      annuler: false,
      noter: false,
    });
  });

  /**
   * Un statut inconnu — ajouté côté API sans que cet écran soit repassé — ne
   * doit RIEN autoriser. L'invariant est plus utile que la liste : il tient
   * encore si un cinquième statut apparaît.
   */
  it('n’autorise rien sur un statut qu’elle ne connaît pas', () => {
    const possibles = actionsPossibles(
      'REMBOURSEE' as Parameters<typeof actionsPossibles>[0],
      null,
    );
    expect(Object.values(possibles).some(Boolean)).toBe(false);
  });
});

describe('La référence de paiement', () => {
  it('est la même pour la même réservation, appel après appel', () => {
    const premier = referenceDePaiement('6701f0a1b2c3d4e5f6a7b8c9');
    const second = referenceDePaiement('6701f0a1b2c3d4e5f6a7b8c9');
    expect(second).toBe(premier);
  });

  it('diffère d’une réservation à l’autre', () => {
    expect(referenceDePaiement('aaaaaaaaaaaaaaaaaaaaaaaa')).not.toBe(
      referenceDePaiement('bbbbbbbbbbbbbbbbbbbbbbbb'),
    );
  });

  it('se reconnaît pour ce qu’elle est : une démonstration', () => {
    expect(referenceDePaiement('6701f0a1b2c3d4e5f6a7b8c9')).toMatch(/^demonstration-/);
  });
});

describe('Le créneau tel qu’il se lit', () => {
  /**
   * Le jeu de données de démonstration pose la prestation de Fatima à
   * `2026-10-08T09:00:00Z`. En heure du Maroc (UTC+1), c'est 10:00 — et c'est
   * bien ce qu'un client de Marrakech doit lire. Afficher 09:00 serait
   * afficher un instant UTC en le faisant passer pour une heure locale.
   */
  it('décale l’instant à l’heure du Maroc', () => {
    const creneau = formaterCreneau('2026-10-08T09:00:00Z', '2026-10-08T13:00:00Z');
    expect(creneau).not.toBeNull();
    expect(creneau?.debutHeure).toBe('10:00');
    expect(creneau?.finHeure).toBe('14:00');
    expect(creneau?.debutJour).toBe('jeudi 8 octobre 2026');
    expect(creneau?.memeJour).toBe(true);
  });

  /**
   * Le cas que le décalage crée. En UTC, ce créneau tient dans la journée du
   * 8 ; décalé d'une heure, il finit le 9. L'écran doit alors écrire les deux
   * dates — sans ce drapeau il afficherait « le 8 octobre, de 23:00 à 00:30 »,
   * ce qui se lit comme un créneau qui remonte dans le temps.
   */
  it('signale un créneau qui change de jour', () => {
    const creneau = formaterCreneau('2026-10-08T22:00:00Z', '2026-10-08T23:30:00Z');
    expect(creneau?.memeJour).toBe(false);
    expect(creneau?.debutJour).toBe('jeudi 8 octobre 2026');
    expect(creneau?.debutHeure).toBe('23:00');
    expect(creneau?.finJour).toBe('vendredi 9 octobre 2026');
    expect(creneau?.finHeure).toBe('00:30');
  });

  /**
   * Et le symétrique, qui est le cas vraiment trompeur : un créneau que le
   * décalage fait tenir dans UN SEUL jour alors qu'il traverse minuit en UTC.
   * Un affichage calculé en UTC écrirait deux dates là où il n'y en a qu'une.
   */
  it('ne signale rien quand le décalage ramène les deux bornes au même jour', () => {
    const creneau = formaterCreneau('2026-10-07T23:00:00Z', '2026-10-08T03:00:00Z');
    expect(creneau?.memeJour).toBe(true);
    expect(creneau?.debutJour).toBe('jeudi 8 octobre 2026');
    expect(creneau?.debutHeure).toBe('00:00');
    expect(creneau?.finHeure).toBe('04:00');
  });

  it('passe le dernier jour du mois sans se tromper de mois', () => {
    const creneau = formaterCreneau('2026-12-31T23:00:00Z', '2027-01-01T02:00:00Z');
    // « 1er » et non « 1 » : c'est la seule irrégularité de la date française,
    // et elle manquait à l'ancienne version de ce formateur, qui vivait dans
    // `app/mes-reservations/regles.ts`. Les trois autres copies du projet, en
    // revanche, l'écrivaient — donc deux écrans donnaient deux orthographes du
    // même jour. `lib/dates.ts` n'en tient plus qu'une.
    expect(creneau?.debutJour).toBe('vendredi 1er janvier 2027');
    expect(creneau?.finJour).toBe('vendredi 1er janvier 2027');
    expect(creneau?.finHeure).toBe('03:00');
  });

  it('rend null sur une date illisible, au lieu d’un « Invalid Date »', () => {
    expect(formaterCreneau('pas une date', '2026-10-08T13:00:00Z')).toBeNull();
    expect(formaterCreneau('2026-10-08T09:00:00Z', '')).toBeNull();
    expect(formaterDate('pas une date')).toBeNull();
  });

  it('écrit une date seule sans le jour de la semaine', () => {
    expect(formaterDate('2026-10-12T08:00:00Z')).toBe('12 octobre 2026');
  });
});

describe('La validation d’un avis', () => {
  it('accepte une note de 1 à 5 et un commentaire de dix caractères', () => {
    expect(validerAvis(1, 'dix pile !')).toEqual({});
    expect(validerAvis(5, 'Devis respecté au dirham.')).toEqual({});
  });

  it('refuse l’absence de note — le cas le plus courant', () => {
    expect(validerAvis(null, 'Devis respecté au dirham.')).toHaveProperty('note');
  });

  it('refuse une note hors des bornes, entière ou non', () => {
    expect(validerAvis(0, 'Devis respecté au dirham.')).toHaveProperty('note');
    expect(validerAvis(6, 'Devis respecté au dirham.')).toHaveProperty('note');
    expect(validerAvis(4.5, 'Devis respecté au dirham.')).toHaveProperty('note');
  });

  it('refuse un commentaire trop court, et le dit avec la phrase de l’API', () => {
    expect(validerAvis(5, 'Très bien').commentaire).toBe(
      'Un avis utile fait au moins dix caractères.',
    );
  });

  it('refuse un commentaire au-delà de deux mille caractères', () => {
    expect(validerAvis(5, 'a'.repeat(2001))).toHaveProperty('commentaire');
    expect(validerAvis(5, 'a'.repeat(2000))).toEqual({});
  });

  /**
   * Les deux refus arrivent ensemble quand les deux champs sont fautifs : un
   * formulaire qui ne signale qu'une erreur à la fois se fait corriger en
   * deux allers-retours.
   */
  it('signale les deux champs d’un coup', () => {
    expect(Object.keys(validerAvis(null, 'court')).sort()).toEqual(['commentaire', 'note']);
  });
});
