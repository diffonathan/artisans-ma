import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { ApplicationDEssai, creerApplicationDEssai, fabriques, MARRAKECH } from './base-d-essai.js';
import { FauxAdaptateur } from '../src/paiement/faux.adaptateur.js';
import { PORT_DE_PAIEMENT } from '../src/paiement/paiement.port.js';
import { PaiementService } from '../src/paiement/paiement.service.js';
import { StatutReservation } from '../src/domaine/reservations/reservation.schema.js';

/**
 * ══ Le paiement d'une place de marché ══════════════════════════════════════
 *
 * L'argent ne nous appartient pas : il va du client à l'artisan, et la
 * plateforme prélève une commission au passage. Trois choses doivent être
 * vraies, et aucune n'est évidente.
 *
 *   1. LE MONTANT NE VIENT JAMAIS DU CLIENT. C'est la faille la plus répandue
 *      des places de marché : le prix part au navigateur, revient modifié, et
 *      la commande est encaissée au tarif que l'acheteur a choisi.
 *   2. LA NOTIFICATION EST VÉRIFIÉE. Le point d'entrée est public par
 *      nécessité ; sans signature, n'importe qui déclare une réservation payée.
 *   3. ELLE EST REJOUABLE. Un prestataire de paiement renvoie ses
 *      notifications — c'est documenté et voulu.
 *
 * Ces tests tournent SANS clé Stripe, contre le faux adaptateur. Ils prouvent
 * que NOTRE code se comporte bien ; ils ne prouvent pas que Stripe se comporte
 * comme on le croit. La distinction est écrite dans `docs/PAIEMENT.md`.
 */
describe("L'encaissement d'une réservation", () => {
  let essai: ApplicationDEssai;
  let faux: FauxAdaptateur;
  let paiement: PaiementService;

  beforeAll(async () => {
    essai = await creerApplicationDEssai('paiement-connect', { http: true });
    faux = essai.moduleRef.get(PORT_DE_PAIEMENT) as FauxAdaptateur;
    paiement = essai.moduleRef.get(PaiementService);
  });
  afterAll(async () => essai.fermer());
  beforeEach(async () => essai.vider());

  /** Sans clé Stripe, le module doit avoir choisi le faux. */
  it('démarre avec le prestataire factice quand aucune clé n’est posée', () => {
    expect(faux).toBeInstanceOf(FauxAdaptateur);
  });

  const scene = async () => {
    const client = await fabriques.client(essai, 'payeur@essai.ma');
    const { compte, profil } = await fabriques.artisan(essai, { email: 'encaisse@essai.ma' });
    const besoin = await fabriques.besoin(essai, client._id);
    const devis = await essai.services.devis.proposer(
      { besoin: besoin._id, montantCentimes: 45_000, delaiJours: 2, message: 'Intervention.' },
      profil._id,
    );
    const reservation = await essai.services.devis.accepter(devis._id, client._id, {
      debut: new Date('2026-10-20T09:00:00Z'),
      fin: new Date('2026-10-20T11:00:00Z'),
    });
    return { client, compteArtisan: compte, profil, reservation };
  };

  /**
   * ══ LE REFUS D'ENCAISSER CE QU'ON NE SAIT PAS REVERSER ════════════════════
   *
   * Un artisan peut ouvrir son compte et abandonner avant d'avoir fourni ses
   * pièces. Le compte existe, et aucun versement n'est possible.
   *
   * Encaisser quand même ferait de la plateforme le dépositaire de fonds
   * d'autrui — ce qui demande un agrément — et ferait porter au client le
   * risque d'un artisan qui ne termine jamais son inscription.
   */
  it("refuse de préparer un paiement tant que l'artisan ne peut pas être payé", async () => {
    const s = await scene();

    await expect(paiement.preparerPaiement(s.reservation._id, s.client._id)).rejects.toThrow(
      /pas encore ouvert ses encaissements/,
    );

    // Ouvrir le compte ne suffit pas : il reste inactif, comme chez Stripe.
    await paiement.ouvrirEncaissements(s.compteArtisan._id);
    await expect(paiement.preparerPaiement(s.reservation._id, s.client._id)).rejects.toThrow(
      /pas encore ouvert ses encaissements/,
    );

    // C'est l'ACTIVATION — les pièces fournies — qui débloque.
    const profil = await essai.modeles.artisans.findById(s.profil._id);
    faux.activer(profil!.compteEncaissement!);
    await paiement.rafraichirEtat(s.compteArtisan._id);

    await expect(paiement.preparerPaiement(s.reservation._id, s.client._id)).resolves.toMatch(
      /secret/,
    );
  });

  /** Ouvrir deux fois ne crée pas deux comptes : le lien seul est renouvelé. */
  it("ne recrée pas le compte quand l'artisan revient après avoir abandonné", async () => {
    const s = await scene();

    await paiement.ouvrirEncaissements(s.compteArtisan._id);
    const premier = (await essai.modeles.artisans.findById(s.profil._id))!.compteEncaissement;

    await paiement.ouvrirEncaissements(s.compteArtisan._id);
    const second = (await essai.modeles.artisans.findById(s.profil._id))!.compteEncaissement;

    expect(premier).toBeTruthy();
    expect(second).toBe(premier);
  });

  const preparer = async () => {
    const s = await scene();
    await paiement.ouvrirEncaissements(s.compteArtisan._id);
    const profil = await essai.modeles.artisans.findById(s.profil._id);
    faux.activer(profil!.compteEncaissement!);
    await paiement.rafraichirEtat(s.compteArtisan._id);
    return s;
  };

  /**
   * ══ LE MONTANT NE TRAVERSE PAS LE NAVIGATEUR ══════════════════════════════
   *
   * La mutation GraphQL n'accepte aucun montant — le schéma ne lui en offre
   * pas le champ. Ce test le prouve en le DEMANDANT : la requête est refusée
   * par la validation du schéma, avant toute exécution.
   *
   * C'est la bonne barrière : elle ne dépend d'aucun contrôle qu'un résolveur
   * pourrait oublier d'écrire.
   */
  it("n'offre aucun champ de montant dans le schéma public", async () => {
    const s = await preparer();

    const reponse = await request(essai.app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${(await essai.services.comptes.connecter('payeur@essai.ma', 'mot-de-passe-assez-long')).jeton}`)
      .send({
        query: `mutation { preparerPaiement(reservation: "${s.reservation._id}", montantCentimes: 1) }`,
      });

    expect(JSON.stringify(reponse.body.errors)).toMatch(/montantCentimes/);
  });

  /** L'intention porte le montant FIGÉ de la réservation, et la commission. */
  it("crée l'intention au montant de la réservation, jamais à un autre", async () => {
    const s = await preparer();
    await paiement.preparerPaiement(s.reservation._id, s.client._id);

    const apres = await essai.modeles.reservations.findById(s.reservation._id);
    expect(apres!.intentionPaiement).toBeTruthy();

    // Même après modification du devis, l'intention suit la réservation.
    expect(apres!.montantCentimes).toBe(45_000);
    expect(apres!.commissionCentimes).toBe(3_600); // 8 % de 45 000
  });

  /** Deux demandes pour la même réservation rendent la même intention. */
  it('est idempotent : deux demandes ne créent pas deux intentions', async () => {
    const s = await preparer();

    const un = await paiement.preparerPaiement(s.reservation._id, s.client._id);
    const deux = await paiement.preparerPaiement(s.reservation._id, s.client._id);

    expect(un).toBe(deux);
  });

  it("refuse de préparer le paiement d'une réservation qui n'est pas la sienne", async () => {
    const s = await preparer();
    const intrus = await fabriques.client(essai, 'intrus@essai.ma');

    await expect(paiement.preparerPaiement(s.reservation._id, intrus._id)).rejects.toThrow(
      /ne vous appartient pas/,
    );
  });

  /* ── Les notifications ──────────────────────────────────────────────── */

  /**
   * Envoie une notification signée.
   *
   * On envoie la CHAÎNE et non le Buffer : passé un Buffer avec un type de
   * contenu JSON, superagent le sérialise comme un objet — le serveur reçoit
   * alors `{"type":"Buffer","data":[…]}`, dont les octets n'ont plus rien à
   * voir avec ceux qui ont été signés. La signature échoue, et l'on croit à
   * un défaut du code de vérification.
   */
  const notifier = (corps: object, signature?: string) => {
    const texte = JSON.stringify(corps);
    const brut = Buffer.from(texte, 'utf8');
    return request(essai.app.getHttpServer())
      .post('/paiement/notification')
      .set('stripe-signature', signature ?? FauxAdaptateur.signer(brut))
      .set('Content-Type', 'application/json')
      .send(texte);
  };

  const reussite = (reservation: string) => ({
    type: 'payment_intent.succeeded',
    data: { object: { id: `pi_faux_${reservation}`, metadata: { reservation } } },
  });

  /**
   * ══ LA SIGNATURE ══════════════════════════════════════════════════════════
   *
   * Le point d'entrée est public : il n'y a pas de jeton, parce que ce n'est
   * pas un utilisateur qui appelle. Sans vérification de signature, n'importe
   * qui peut annoncer « paiement réussi » sur une réservation qui ne l'est
   * pas, et obtenir une prestation gratuite.
   */
  it('refuse une notification sans signature', async () => {
    const s = await preparer();
    const reponse = await notifier(reussite(String(s.reservation._id)), '');
    expect(reponse.status).toBe(401);

    const apres = await essai.modeles.reservations.findById(s.reservation._id);
    expect(apres!.statut).toBe(StatutReservation.A_PAYER);
  });

  it('refuse une notification dont la signature est fausse', async () => {
    const s = await preparer();
    const reponse = await notifier(reussite(String(s.reservation._id)), 'a'.repeat(64));
    expect(reponse.status).toBe(401);

    const apres = await essai.modeles.reservations.findById(s.reservation._id);
    expect(apres!.statut).toBe(StatutReservation.A_PAYER);
  });

  /**
   * Le corps modifié d'un seul caractère invalide la signature.
   *
   * C'est l'attaque qui compte vraiment : intercepter une notification
   * légitime et en changer le montant ou la réservation. Signer le corps
   * entier la rend impossible sans le secret.
   */
  it("refuse une notification dont le corps a été modifié après signature", async () => {
    const s = await preparer();
    const authentique = Buffer.from(JSON.stringify(reussite(String(s.reservation._id))), 'utf8');
    const signature = FauxAdaptateur.signer(authentique);

    const falsifie = reussite(String(new Types.ObjectId()));
    const reponse = await request(essai.app.getHttpServer())
      .post('/paiement/notification')
      .set('stripe-signature', signature)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(falsifie));

    expect(reponse.status).toBe(401);
  });

  it('accepte une notification signée et marque la réservation payée', async () => {
    const s = await preparer();
    await paiement.preparerPaiement(s.reservation._id, s.client._id);

    const reponse = await notifier(reussite(String(s.reservation._id)));
    expect(reponse.status).toBe(200);

    const apres = await essai.modeles.reservations.findById(s.reservation._id);
    expect(apres!.statut).toBe(StatutReservation.PAYEE);
    expect(apres!.referencePaiement).toBe(`pi_faux_${s.reservation._id}`);
  });

  /**
   * ══ LE REJEU ══════════════════════════════════════════════════════════════
   *
   * Un prestataire de paiement renvoie ses notifications : il préfère livrer
   * deux fois que risquer de ne pas livrer. La seconde doit donc être sans
   * effet ET sans erreur — une erreur ferait réessayer indéfiniment, puis
   * couper le flux des notifications qui comptent.
   */
  it('accepte deux fois la même notification sans rien changer la seconde', async () => {
    const s = await preparer();
    await paiement.preparerPaiement(s.reservation._id, s.client._id);

    const premiere = await notifier(reussite(String(s.reservation._id)));
    const seconde = await notifier(reussite(String(s.reservation._id)));

    expect(premiere.status).toBe(200);
    expect(seconde.status).toBe(200);

    const apres = await essai.modeles.reservations.findById(s.reservation._id);
    expect(apres!.statut).toBe(StatutReservation.PAYEE);
  });

  /**
   * Un événement qu'on ne traite pas reçoit 200, et c'est délibéré.
   *
   * Répondre en erreur ferait réessayer le prestataire pendant des heures
   * pour une notification qui ne réussira jamais, puis désactiver le point
   * d'entrée — et avec lui les notifications qui, elles, comptent.
   */
  it("accuse réception d'un événement qu'il ne traite pas", async () => {
    const s = await preparer();
    const reponse = await notifier({
      type: 'customer.created',
      data: { object: { id: 'cus_1', metadata: {} } },
    });

    expect(reponse.status).toBe(200);
    expect(reponse.body.raison).toMatch(/ignoré/i);

    const apres = await essai.modeles.reservations.findById(s.reservation._id);
    expect(apres!.statut).toBe(StatutReservation.A_PAYER);
  });

  it("accuse réception d'une notification dont la réservation n'existe plus", async () => {
    const reponse = await notifier(reussite(String(new Types.ObjectId())));
    expect(reponse.status).toBe(200);
  });

  it('accuse réception quand les métadonnées ne portent aucune réservation', async () => {
    const reponse = await notifier({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_sans_metadonnees', metadata: {} } },
    });
    expect(reponse.status).toBe(200);
    expect(reponse.body.raison).toMatch(/métadonnées/i);
  });

  /**
   * Le compte d'encaissement n'est PAS dans le schéma public.
   *
   * C'est un identifiant de compte financier : il n'a rien à faire dans la
   * fiche d'un artisan, que n'importe qui peut ouvrir sans compte.
   */
  it("n'expose pas l'identifiant du compte d'encaissement sur la fiche publique", async () => {
    const s = await preparer();
    const reponse = await request(essai.app.getHttpServer())
      .post('/graphql')
      .send({
        query: `query { artisan(id: "${s.profil._id}") { compteEncaissement encaissementsActifs } }`,
      });

    expect(JSON.stringify(reponse.body.errors)).toMatch(/compteEncaissement/);
  });
});
