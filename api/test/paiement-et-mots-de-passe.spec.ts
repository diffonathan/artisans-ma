import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationDEssai, creerApplicationDEssai, fabriques } from './base-d-essai.js';
import { StatutReservation } from '../src/domaine/reservations/reservation.schema.js';
import {
  COUT_DE_PRODUCTION,
  coutActuel,
  empreindre,
  verifier,
} from '../src/domaine/comptes/mot-de-passe.js';

describe('Le paiement', () => {
  let essai: ApplicationDEssai;

  beforeAll(async () => {
    essai = await creerApplicationDEssai('paiement');
  });
  afterAll(async () => essai.fermer());
  beforeEach(async () => essai.vider());

  const creneau = {
    debut: new Date('2026-10-20T09:00:00Z'),
    fin: new Date('2026-10-20T11:00:00Z'),
  };

  const reservationAPayer = async () => {
    const client = await fabriques.client(essai);
    const { profil } = await fabriques.artisan(essai);
    const besoin = await fabriques.besoin(essai, client._id);
    const devis = await essai.services.devis.proposer(
      { besoin: besoin._id, montantCentimes: 35_000, delaiJours: 1, message: 'Intervention.' },
      profil._id,
    );
    return {
      client,
      profil,
      reservation: await essai.services.devis.accepter(devis._id, client._id, creneau),
    };
  };

  /**
   * ══ L'IDEMPOTENCE ═════════════════════════════════════════════════════════
   *
   * Un prestataire de paiement rejoue ses notifications : c'est documenté, et
   * c'est voulu — il préfère livrer deux fois que risquer de ne pas livrer.
   *
   * Le même événement doit donc pouvoir arriver deux fois sans rien casser, et
   * sans être signalé comme une erreur : l'état voulu est déjà atteint, il n'y
   * a rien à faire. Renvoyer une erreur ferait réessayer le prestataire, et
   * finirait par couper la notification.
   */
  it('accepte deux fois le même paiement sans rien changer la seconde fois', async () => {
    const { reservation } = await reservationAPayer();

    const premier = await essai.services.reservations.enregistrerPaiement(
      reservation._id,
      'pi_abc123',
    );
    expect(premier.statut).toBe(StatutReservation.PAYEE);

    // Le rejeu : même référence, même résultat, aucune erreur.
    const second = await essai.services.reservations.enregistrerPaiement(
      reservation._id,
      'pi_abc123',
    );
    expect(second.statut).toBe(StatutReservation.PAYEE);
    expect(String(second._id)).toBe(String(reservation._id));
  });

  /**
   * Un doublon se tait ; une incohérence parle.
   *
   * Deux paiements DIFFÉRENTS pour la même réservation ne sont pas un rejeu :
   * c'est soit un double encaissement, soit une erreur d'aiguillage. Confondre
   * les deux cas sous prétexte d'idempotence laisserait passer un vrai
   * problème d'argent sans trace.
   */
  it('refuse un second paiement portant une autre référence', async () => {
    const { reservation } = await reservationAPayer();

    await essai.services.reservations.enregistrerPaiement(reservation._id, 'pi_premier');

    await expect(
      essai.services.reservations.enregistrerPaiement(reservation._id, 'pi_autre'),
    ).rejects.toThrow(/déjà au statut PAYEE/);
  });

  it('refuse de payer une réservation annulée', async () => {
    const { client, reservation } = await reservationAPayer();
    await essai.services.reservations.annuler(reservation._id, client._id);

    await expect(
      essai.services.reservations.enregistrerPaiement(reservation._id, 'pi_trop_tard'),
    ).rejects.toThrow(/déjà au statut ANNULEE/);
  });

  it("refuse d'annuler une prestation déjà terminée", async () => {
    const { client, reservation } = await fabriques.prestationTerminee(essai);

    await expect(
      essai.services.reservations.annuler(reservation._id, client._id),
    ).rejects.toThrow(/déjà terminée ou annulée/);
  });
});

/**
 * ══ Les mots de passe ══════════════════════════════════════════════════════
 *
 * scrypt plutôt que bcrypt ou argon2, parce qu'il est dans la bibliothèque
 * standard de Node : aucune compilation native ne peut échouer à
 * l'installation. Le détail du choix est dans `mot-de-passe.ts`.
 */
describe('Les mots de passe', () => {
  it('ne stocke jamais le mot de passe, et change de sel à chaque fois', async () => {
    const motDePasse = 'un-mot-de-passe-assez-long';

    const a = await empreindre(motDePasse);
    const b = await empreindre(motDePasse);

    expect(a).not.toContain(motDePasse);

    // Deux empreintes du MÊME mot de passe diffèrent : le sel est tiré au
    // hasard. Sans cela, deux comptes avec le même mot de passe auraient la
    // même empreinte — et une seule table précalculée les ouvrirait tous.
    expect(a).not.toBe(b);

    // Les deux se vérifient pourtant.
    expect(await verifier(motDePasse, a)).toBe(true);
    expect(await verifier(motDePasse, b)).toBe(true);
  });

  it('refuse un mot de passe faux', async () => {
    const empreinte = await empreindre('le-bon-mot-de-passe');
    expect(await verifier('le-mauvais-mot-de-passe', empreinte)).toBe(false);
  });

  /**
   * L'empreinte porte ses propres paramètres : `scrypt$N$r$p$sel$empreinte`.
   *
   * C'est ce qui permettra de durcir le coût plus tard sans invalider les
   * comptes existants : on vérifie avec les paramètres écrits DANS
   * l'empreinte, et l'on réécrit au prochain succès. Une constante globale
   * obligerait à réinitialiser tous les mots de passe.
   */
  it('décrit ses propres paramètres dans la valeur stockée', async () => {
    const empreinte = await empreindre('un-mot-de-passe-assez-long');
    const [algorithme, n, r, p] = empreinte.split('$');

    expect(algorithme).toBe('scrypt');
    // Dans les tests, le coût est abaissé — et l'empreinte le dit.
    expect(Number(n)).toBe(coutActuel().N);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
    expect(empreinte.split('$')).toHaveLength(6);
  });

  /**
   * ══ LE COÛT DE PRODUCTION, EXERCÉ UNE FOIS ════════════════════════════════
   *
   * Le reste de la suite calcule ses empreintes à coût réduit, pour ne pas
   * passer treize secondes à hacher des mots de passe de démonstration. Ce
   * test est la contrepartie : il exerce le VRAI paramètre, 2^16, celui qui
   * s'appliquera en ligne.
   *
   * Sans lui, l'abaissement serait un contournement — on aurait une suite
   * rapide qui ne vérifie jamais le réglage réellement déployé.
   *
   * Il vérifie aussi la propriété qui rend l'abaissement sûr : une empreinte
   * calculée à 2^16 se vérifie alors que l'environnement courant est réglé sur
   * 2^12, et réciproquement. C'est le format auto-descriptif qui le permet, et
   * c'est ce qui autorisera à durcir le coût un jour sans réinitialiser aucun
   * mot de passe.
   */
  it('vérifie une empreinte calculée au coût de production', async () => {
    const motDePasse = 'un-mot-de-passe-assez-long';

    // L'environnement de test est bien sur un coût réduit...
    expect(coutActuel().N).toBeLessThan(COUT_DE_PRODUCTION);

    // ...et pourtant une empreinte au coût de production se vérifie.
    const depart = Date.now();
    const empreinte = await empreindre(motDePasse, COUT_DE_PRODUCTION);
    const duree = Date.now() - depart;

    expect(empreinte.split('$')[1]).toBe(String(COUT_DE_PRODUCTION));
    expect(await verifier(motDePasse, empreinte)).toBe(true);
    expect(await verifier('un-autre-mot-de-passe-long', empreinte)).toBe(false);

    // Le coût est bien RÉEL : en dessous de 20 ms, le paramètre ne protège
    // plus de rien, et quelque chose l'a silencieusement affaibli.
    expect(duree).toBeGreaterThan(20);
  });

  it('refuse une valeur stockée malformée au lieu de lever', async () => {
    for (const malformee of ['', 'nimporte-quoi', 'bcrypt$2b$12$abc', 'scrypt$1$2$3']) {
      expect(await verifier('un-mot-de-passe-assez-long', malformee)).toBe(false);
    }
  });

  /**
   * Deux écritures Unicode du même mot de passe doivent s'équivaloir.
   *
   * « é » s'écrit soit en un point de code (U+00E9), soit en deux (e +
   * accent combinant). Les deux s'affichent pareil, et un clavier macOS ne
   * produit pas forcément la même forme qu'un clavier Windows. Sans
   * normalisation, un utilisateur qui change de machine ne peut plus se
   * connecter — avec un mot de passe qu'il voit correct à l'écran.
   */
  it('accepte les deux écritures Unicode du même mot de passe', async () => {
    const compose = 'café-très-sécurisé'; // é et è précomposés
    const decompose = 'café-très-sécurisé'; // e + accent

    expect(compose).not.toBe(decompose);
    expect(compose.normalize('NFKC')).toBe(decompose.normalize('NFKC'));

    const empreinte = await empreindre(compose);
    expect(await verifier(decompose, empreinte)).toBe(true);
  });
});

describe("L'authentification", () => {
  let essai: ApplicationDEssai;

  beforeAll(async () => {
    essai = await creerApplicationDEssai('authentification');
  });
  afterAll(async () => essai.fermer());
  beforeEach(async () => essai.vider());

  it('émet un jeton à la connexion', async () => {
    await fabriques.client(essai, 'connexion@essai.ma');

    const session = await essai.services.comptes.connecter(
      'connexion@essai.ma',
      'mot-de-passe-assez-long',
    );

    expect(session.jeton).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(session.compte.email).toBe('connexion@essai.ma');
  });

  /**
   * Le même message pour un e-mail inconnu et un mot de passe faux.
   *
   * Distinguer les deux transforme le formulaire en annuaire : on peut tester
   * des adresses pour savoir lesquelles ont un compte, ce qui est exactement
   * ce qu'on cherche avant une attaque par mot de passe.
   */
  it('donne le même message pour un e-mail inconnu et un mot de passe faux', async () => {
    await fabriques.client(essai, 'existe@essai.ma');

    const messages: string[] = [];
    for (const [email, motDePasse] of [
      ['existe@essai.ma', 'mauvais-mot-de-passe'],
      ['n-existe-pas@essai.ma', 'mot-de-passe-assez-long'],
    ]) {
      await essai.services.comptes.connecter(email, motDePasse).catch((e) => {
        messages.push(e.message);
      });
    }

    expect(messages).toHaveLength(2);
    expect(messages[0]).toBe(messages[1]);
  });

  it("refuse deux comptes avec la même adresse", async () => {
    await fabriques.client(essai, 'doublon@essai.ma');

    await expect(
      essai.services.comptes.inscrireClient({
        email: 'doublon@essai.ma',
        motDePasse: 'mot-de-passe-assez-long',
        nom: 'Deuxième',
      }),
    ).rejects.toThrow(/existe déjà/);
  });

  it("normalise l'adresse : la casse ne crée pas un second compte", async () => {
    await essai.services.comptes.inscrireClient({
      email: 'Casse@Essai.MA',
      motDePasse: 'mot-de-passe-assez-long',
      nom: 'Casse',
    });

    // Le schéma met l'adresse en minuscules AVANT l'index unique.
    await expect(
      essai.services.comptes.inscrireClient({
        email: 'casse@essai.ma',
        motDePasse: 'mot-de-passe-assez-long',
        nom: 'Casse bis',
      }),
    ).rejects.toThrow(/existe déjà/);

    // Et la connexion marche avec l'une comme avec l'autre écriture.
    await expect(
      essai.services.comptes.connecter('CASSE@ESSAI.ma', 'mot-de-passe-assez-long'),
    ).resolves.toHaveProperty('jeton');
  });

  /**
   * L'inscription d'un artisan est indivisible : compte ET profil.
   *
   * Un compte sans profil serait un artisan qui se connecte et ne peut rien
   * faire — invisible des recherches, incapable de répondre à un besoin, et
   * sans message pour l'expliquer. On vérifie ici qu'un échec sur le compte
   * ne laisse pas de profil orphelin.
   */
  it("ne laisse pas de profil orphelin si le compte est refusé", async () => {
    await fabriques.artisan(essai, { email: 'artisan-unique@essai.ma' });
    const profilsAvant = await essai.modeles.artisans.countDocuments();

    await expect(
      essai.services.comptes.inscrireArtisan({
        email: 'artisan-unique@essai.ma',
        motDePasse: 'mot-de-passe-assez-long',
        nom: 'Doublon',
        raisonSociale: 'Doublon SARL',
        metiers: ['PLOMBERIE'] as never,
        ville: 'Marrakech',
        latitude: 31.6258,
        longitude: -7.9891,
        rayonKm: 25,
      }),
    ).rejects.toThrow(/existe déjà/);

    expect(await essai.modeles.artisans.countDocuments()).toBe(profilsAvant);
  });
});
