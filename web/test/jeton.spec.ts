import { describe, expect, it } from 'vitest';
import { decoderJeton, sessionDepuisCharge, sessionDepuisJeton } from '../lib/jeton.js';

/**
 * ══ LA LECTURE DU JETON ════════════════════════════════════════════════════
 *
 * Cette lecture décide de DEUX choses : le menu que l'en-tête affiche, et la
 * navigation que `proxy.ts` laisse passer. Elle ne décide d'aucun droit —
 * l'API vérifie la signature à chaque opération, et ce module n'en vérifie
 * aucune.
 *
 * Elle est éprouvée ici parce qu'elle était PRIVÉE dans `lib/session.ts`, où
 * elle traînait `next/headers` : personne ne pouvait l'appeler depuis un test,
 * et le proxy ne pouvait pas l'appeler du tout. C'est la raison de son
 * extraction, et ce fichier en est la contrepartie.
 */

/** Fabrique un JWT dont seule la charge utile compte : la signature est factice. */
const jeton = (charge: Record<string, unknown>): string => {
  const base64url = (valeur: object): string =>
    Buffer.from(JSON.stringify(valeur)).toString('base64url');
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(charge)}.signature-factice`;
};

const DANS_UN_AN = Math.floor(Date.parse('2027-01-01T00:00:00Z') / 1000);
const MAINTENANT = Date.parse('2026-10-03T12:00:00Z');

describe('decoderJeton', () => {
  it('lit la charge utile d’un jeton bien formé', () => {
    expect(decoderJeton(jeton({ sub: 'abc', role: 'CLIENT' }))).toEqual({
      sub: 'abc',
      role: 'CLIENT',
    });
  });

  /**
   * Le cas qui condamne un décodage en `base64` ordinaire.
   *
   * Un JWT remplace `+` et `/` par `-` et `_` et retire le remplissage. Un
   * décodage en `base64` abîme donc une charge sur quatre environ — de façon
   * intermittente, et jamais le jour où l'on essaie à la main. La charge
   * ci-dessous est choisie pour que son encodage contienne les deux
   * caractères de l'alphabet url.
   */
  it('décode l’alphabet « base64url », et pas seulement « base64 »', () => {
    const charge = { sub: '507f1f77bcf86cd799439011', role: 'ARTISAN', note: 'ÿþø?>' };
    const encodee = Buffer.from(JSON.stringify(charge)).toString('base64url');
    expect(encodee).toMatch(/[-_]/);
    expect(decoderJeton(`entete.${encodee}.signature`)).toEqual(charge);
  });

  it('rend null sur tout ce qui n’est pas un JWT à trois segments', () => {
    for (const valeur of ['', 'abc', 'a.b', 'a.b.c.d', '..']) {
      expect(decoderJeton(valeur), valeur).toBeNull();
    }
  });

  it('rend null quand la charge n’est pas un objet JSON', () => {
    const brut = (valeur: string) =>
      `entete.${Buffer.from(valeur).toString('base64url')}.signature`;
    expect(decoderJeton(brut('pas du json'))).toBeNull();
    expect(decoderJeton(brut('"une chaîne"'))).toBeNull();
    expect(decoderJeton(brut('42'))).toBeNull();
    // `null` est bien du JSON, et `typeof null === 'object'` : le contrôle
    // explicite sur `null` est ce qui empêche de rendre un objet qui n'en est
    // pas un, et de lever sur `charge.sub` chez l'appelant.
    expect(decoderJeton(brut('null'))).toBeNull();
  });
});

describe('sessionDepuisCharge', () => {
  it('rend compte, rôle et expiration', () => {
    const session = sessionDepuisCharge(
      { sub: 'abc', role: 'ARTISAN', exp: DANS_UN_AN },
      MAINTENANT,
    );
    expect(session).toEqual({
      compte: 'abc',
      role: 'ARTISAN',
      expireA: new Date('2027-01-01T00:00:00Z'),
    });
  });

  it('accepte les trois rôles de l’API, et rien d’autre', () => {
    for (const role of ['ADMIN', 'ARTISAN', 'CLIENT']) {
      expect(sessionDepuisCharge({ sub: 'abc', role }, MAINTENANT)?.role, role).toBe(role);
    }
    for (const role of ['client', 'SUPERADMIN', '', 'CLIENT ', 42, null]) {
      expect(sessionDepuisCharge({ sub: 'abc', role }, MAINTENANT), String(role)).toBeNull();
    }
  });

  it('traite une charge incomplète comme une absence de session, pas comme une erreur', () => {
    // C'est ce que produit un jeton d'une version précédente du format. Une
    // page d'erreur n'y apporterait rien que le visiteur puisse corriger.
    expect(sessionDepuisCharge({ role: 'CLIENT' }, MAINTENANT)).toBeNull();
    expect(sessionDepuisCharge({ sub: '', role: 'CLIENT' }, MAINTENANT)).toBeNull();
    expect(sessionDepuisCharge({ sub: 42, role: 'CLIENT' }, MAINTENANT)).toBeNull();
    expect(sessionDepuisCharge(null, MAINTENANT)).toBeNull();
  });

  /**
   * Le piège le plus coûteux de ce module, et il est silencieux : `exp` est en
   * SECONDES depuis l'époque, là où `Date.now()` est en millisecondes.
   * Comparer les deux sans conversion déclare TOUT jeton expiré, et le
   * symptôme observé est une déconnexion immédiate après la connexion.
   */
  it('compare `exp` en secondes à une horloge en millisecondes', () => {
    const session = sessionDepuisCharge(
      { sub: 'abc', role: 'CLIENT', exp: Math.floor(MAINTENANT / 1000) + 60 },
      MAINTENANT,
    );
    expect(session).not.toBeNull();
  });

  it('écarte un jeton expiré, et celui qui expire à l’instant même', () => {
    const expire = Math.floor(MAINTENANT / 1000);
    expect(sessionDepuisCharge({ sub: 'abc', role: 'CLIENT', exp: expire }, MAINTENANT)).toBeNull();
    expect(
      sessionDepuisCharge({ sub: 'abc', role: 'CLIENT', exp: expire - 1 }, MAINTENANT),
    ).toBeNull();
  });

  it('accepte une charge sans `exp`, en laissant `expireA` à null', () => {
    // Le cookie reprend alors la durée de repli alignée sur l'API. Refuser le
    // jeton serait pire : il peut être parfaitement valide.
    const session = sessionDepuisCharge({ sub: 'abc', role: 'CLIENT' }, MAINTENANT);
    expect(session?.expireA).toBeNull();
  });
});

describe('sessionDepuisJeton', () => {
  it('enchaîne les deux étapes', () => {
    const session = sessionDepuisJeton(
      jeton({ sub: 'abc', role: 'CLIENT', exp: DANS_UN_AN }),
      MAINTENANT,
    );
    expect(session?.role).toBe('CLIENT');
  });

  it('traite l’absence de cookie comme l’absence de session', () => {
    // C'est ce que `request.cookies.get(...)?.value` rend dans le proxy quand
    // personne n'est connecté : la signature accepte donc `undefined`.
    expect(sessionDepuisJeton(undefined, MAINTENANT)).toBeNull();
    expect(sessionDepuisJeton(null, MAINTENANT)).toBeNull();
    expect(sessionDepuisJeton('', MAINTENANT)).toBeNull();
  });
});
