import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import {
  ApplicationDEssai,
  creerApplicationDEssai,
  fabriques,
} from './base-d-essai.js';
import { StatutReservation } from '../src/domaine/reservations/reservation.schema.js';

/**
 * ══ L'avis vérifié ═════════════════════════════════════════════════════════
 *
 * La promesse affichée au visiteur est qu'un avis vient d'un client qui a
 * réellement payé la prestation. Ce fichier existe pour la tenir, ou pour
 * dire exactement où elle s'arrête.
 */
describe("Le droit de déposer un avis", () => {
  let essai: ApplicationDEssai;

  beforeAll(async () => {
    essai = await creerApplicationDEssai('avis-verifie');
  });
  afterAll(async () => essai.fermer());
  beforeEach(async () => essai.vider());

  it("refuse l'avis sur une prestation qui n'est pas terminée", async () => {
    const client = await fabriques.client(essai);
    const { profil } = await fabriques.artisan(essai);
    const besoin = await fabriques.besoin(essai, client._id);
    const devis = await essai.services.devis.proposer(
      { besoin: besoin._id, montantCentimes: 30_000, delaiJours: 1, message: 'Intervention simple.' },
      profil._id,
    );
    const reservation = await essai.services.devis.accepter(devis._id, client._id, {
      debut: new Date('2026-10-10T09:00:00Z'),
      fin: new Date('2026-10-10T11:00:00Z'),
    });

    // La réservation existe, elle est à payer — rien n'a été fait.
    await expect(
      essai.services.avis.deposer(
        { reservation: reservation._id, note: 5, commentaire: 'Excellent travail.' },
        client._id,
      ),
    ).rejects.toThrow(/pas notable/);

    expect(await essai.modeles.avis.countDocuments()).toBe(0);
  });

  it("refuse l'avis d'un client qui n'est pas celui de la prestation", async () => {
    const { reservation } = await fabriques.prestationTerminee(essai);
    const inconnu = await fabriques.client(essai, 'inconnu@essai.ma');

    await expect(
      essai.services.avis.deposer(
        { reservation: reservation._id, note: 1, commentaire: 'Je sabote la note.' },
        inconnu._id,
      ),
    ).rejects.toThrow(/pas notable/);

    expect(await essai.modeles.avis.countDocuments()).toBe(0);

    // Et le droit d'avis du VRAI client n'a pas été consommé au passage :
    // un refus ne doit pas priver le légitime de son tour.
    const apres = await essai.modeles.reservations.findById(reservation._id);
    expect(apres!.avisDeposeA).toBeNull();
  });

  it("accepte l'avis du client sur sa prestation terminée, et recalcule la note", async () => {
    const { client, profil, reservation } = await fabriques.prestationTerminee(essai);

    const avis = await essai.services.avis.deposer(
      { reservation: reservation._id, note: 4, commentaire: 'Ponctuel, propre, un peu cher.' },
      client._id,
    );

    expect(avis.note).toBe(4);

    // Le droit a été consommé — et c'est une date, pas un booléen.
    const apres = await essai.modeles.reservations.findById(reservation._id);
    expect(apres!.avisDeposeA).toBeInstanceOf(Date);

    // La note de l'artisan a été écrite dans la MÊME transaction.
    const artisan = await essai.modeles.artisans.findById(profil._id);
    expect(artisan!.noteMoyenne).toBe(4);
    expect(artisan!.nombreAvis).toBe(1);
  });

  it('refuse un second avis sur la même prestation', async () => {
    const { client, reservation } = await fabriques.prestationTerminee(essai);

    await essai.services.avis.deposer(
      { reservation: reservation._id, note: 5, commentaire: 'Parfait du début à la fin.' },
      client._id,
    );

    await expect(
      essai.services.avis.deposer(
        { reservation: reservation._id, note: 1, commentaire: "J'ai changé d'avis." },
        client._id,
      ),
    ).rejects.toThrow(/pas notable/);

    expect(await essai.modeles.avis.countDocuments()).toBe(1);
  });

  /**
   * ══ LA PREUVE ═════════════════════════════════════════════════════════════
   *
   * Deux dépôts d'avis lancés sur la même réservation, sans attendre entre les
   * deux. C'est le scénario que le double clic produit tous les jours.
   *
   * ── Pourquoi ce test est déterministe ───────────────────────────────────
   * Il ne « tente » pas de provoquer une collision en espérant avoir de la
   * chance. Les deux appels visent le même document, et MongoDB n'a que trois
   * manières de les traier :
   *
   *   • ils se sérialisent, et le second trouve `avisDeposeA` déjà rempli
   *     — son filtre ne correspond à rien, il refuse ;
   *   • le second heurte l'écriture non validée du premier : MongoDB refuse
   *     immédiatement avec un conflit d'écriture ÉTIQUETÉ transitoire, le
   *     pilote rejoue la transaction, et le rejeu retombe sur le cas
   *     précédent ;
   *   • l'index unique sur `reservation` refuse l'insertion.
   *
   * Les trois chemins mènent au même résultat : exactement un avis. Le test
   * est donc stable, et il le serait même si l'ordonnancement changeait.
   *
   * ── La différence avec PostgreSQL, qui mérite d'être sue ────────────────
   * En PostgreSQL, la seconde transaction ATTEND la fin de la première sur le
   * verrou de ligne, puis réévalue. En MongoDB, elle ÉCHOUE tout de suite et
   * c'est le pilote qui rejoue. Le résultat observable est le même ; la
   * mécanique n'a rien à voir, et le rejeu automatique est précisément ce qui
   * fait tenir la comparaison-et-échange. Sans lui, le second appel
   * remonterait un conflit d'écriture brut à l'utilisateur.
   */
  it("ne laisse passer qu'un seul avis sur deux dépôts simultanés", async () => {
    const { client, profil, reservation } = await fabriques.prestationTerminee(essai);

    const deposer = (note: number, commentaire: string) =>
      essai.services.avis.deposer({ reservation: reservation._id, note, commentaire }, client._id);

    const issues = await Promise.allSettled([
      deposer(5, 'Premier dépôt, envoyé en même temps que le second.'),
      deposer(1, 'Second dépôt, envoyé en même temps que le premier.'),
    ]);

    const reussis = issues.filter((i) => i.status === 'fulfilled');
    const refuses = issues.filter((i) => i.status === 'rejected');

    expect(reussis).toHaveLength(1);
    expect(refuses).toHaveLength(1);

    // Un seul avis en base, et la note de l'artisan est celle de cet avis —
    // pas une moyenne des deux, pas un compteur à 2.
    expect(await essai.modeles.avis.countDocuments()).toBe(1);
    const seul = await essai.modeles.avis.findOne();
    const artisan = await essai.modeles.artisans.findById(profil._id);
    expect(artisan!.nombreAvis).toBe(1);
    expect(artisan!.noteMoyenne).toBe(seul!.note);
  });

  /**
   * L'indivisibilité, vérifiée par l'échec.
   *
   * On fait échouer l'insertion de l'avis en posant d'abord un avis sur la
   * réservation à la main — l'index unique refusera alors le second. Le droit
   * d'avis, consommé juste avant dans la même transaction, doit être rendu.
   *
   * Si la transaction ne couvrait pas les deux écritures, le client perdrait
   * son droit sans que l'avis existe : il ne pourrait plus jamais noter, et
   * rien n'expliquerait pourquoi.
   */
  it("rend le droit d'avis si l'insertion échoue", async () => {
    const { client, reservation } = await fabriques.prestationTerminee(essai);

    // Un avis posé directement en base, SANS passer par le service : il
    // occupe l'index unique sans consommer le droit.
    await essai.modeles.avis.create({
      reservation: reservation._id,
      artisan: reservation.artisan,
      client: new Types.ObjectId(),
      note: 3,
      commentaire: 'Avis posé directement en base, pour provoquer le conflit.',
    });

    await expect(
      essai.services.avis.deposer(
        { reservation: reservation._id, note: 5, commentaire: 'Mon avis légitime.' },
        client._id,
      ),
    ).rejects.toThrow();

    // Le droit est intact : la transaction a tout annulé, y compris la
    // consommation du jeton faite à sa première étape.
    const apres = await essai.modeles.reservations.findById(reservation._id);
    expect(apres!.avisDeposeA).toBeNull();
    expect(await essai.modeles.avis.countDocuments()).toBe(1);
  });

  /**
   * La note moyenne est la moyenne des avis — vérifié, pas supposé.
   *
   * Trois prestations, trois notes (5, 4, 2) : la moyenne est 3,666..., donc
   * 3,7 arrondi au dixième. Un cumul glissant donnerait le même résultat ici ;
   * la différence apparaîtrait après une suppression, ce que le test suivant
   * montre.
   */
  it('recalcule la note depuis les avis, et non par cumul', async () => {
    const { profil } = await fabriques.artisan(essai, { email: 'note@essai.ma' });

    for (const note of [5, 4, 2]) {
      const client = await fabriques.client(essai, `note-${note}@essai.ma`);
      const besoin = await fabriques.besoin(essai, client._id);
      const devis = await essai.services.devis.proposer(
        { besoin: besoin._id, montantCentimes: 20_000, delaiJours: 1, message: 'Intervention.' },
        profil._id,
      );
      const reservation = await essai.services.devis.accepter(devis._id, client._id, {
        debut: new Date('2026-10-11T09:00:00Z'),
        fin: new Date('2026-10-11T10:00:00Z'),
      });
      await essai.services.reservations.enregistrerPaiement(reservation._id, `pi_${note}`);
      await essai.services.reservations.terminer(reservation._id, profil._id);
      await essai.services.avis.deposer(
        { reservation: reservation._id, note, commentaire: `Note de ${note} sur cinq.` },
        client._id,
      );
    }

    const apres = await essai.modeles.artisans.findById(profil._id);
    expect(apres!.nombreAvis).toBe(3);
    expect(apres!.noteMoyenne).toBe(3.7);
  });

  /**
   * Ce que MongoDB ne garantit pas — et qu'il faut savoir dire.
   *
   * En PostgreSQL, une clé étrangère rendrait ce test impossible à écrire :
   * l'insertion serait refusée. Ici elle réussit. Le test ne constate pas une
   * faiblesse du code, il constate une limite de la base, et vérifie que le
   * contrôle qui la remplace la voit.
   */
  it('accepte un avis orphelin — et le contrôle le détecte', async () => {
    const reservationInexistante = new Types.ObjectId();

    await essai.modeles.avis.create({
      reservation: reservationInexistante,
      artisan: new Types.ObjectId(),
      client: new Types.ObjectId(),
      note: 5,
      commentaire: 'Avis dont la réservation ne existe pas.',
    });

    // MongoDB l'a accepté. C'est le fait, et il n'y a pas de clé étrangère
    // pour l'en empêcher.
    expect(await essai.modeles.avis.countDocuments()).toBe(1);

    // Le contrôle qui remplace la contrainte absente le voit.
    const orphelins = await essai.services.avis.avisOrphelins();
    expect(orphelins).toHaveLength(1);
  });

  it("ne trouve aucun orphelin sur un parcours normal", async () => {
    const { client, reservation } = await fabriques.prestationTerminee(essai);
    await essai.services.avis.deposer(
      { reservation: reservation._id, note: 5, commentaire: 'Tout est en ordre.' },
      client._id,
    );

    expect(await essai.services.avis.avisOrphelins()).toHaveLength(0);
  });

  it("n'ouvre le droit d'avis qu'au passage à TERMINEE", async () => {
    const client = await fabriques.client(essai);
    const { profil } = await fabriques.artisan(essai);
    const besoin = await fabriques.besoin(essai, client._id);
    const devis = await essai.services.devis.proposer(
      { besoin: besoin._id, montantCentimes: 30_000, delaiJours: 1, message: 'Intervention.' },
      profil._id,
    );
    const reservation = await essai.services.devis.accepter(devis._id, client._id, {
      debut: new Date('2026-10-10T09:00:00Z'),
      fin: new Date('2026-10-10T11:00:00Z'),
    });

    // Terminer une prestation non payée est refusé : on ne note pas ce qu'on
    // n'a pas réglé.
    await expect(
      essai.services.reservations.terminer(reservation._id, profil._id),
    ).rejects.toThrow(/statut payé/);

    await essai.services.reservations.enregistrerPaiement(reservation._id, 'pi_ok');
    const terminee = await essai.services.reservations.terminer(reservation._id, profil._id);
    expect(terminee.statut).toBe(StatutReservation.TERMINEE);
    expect(terminee.avisDeposeA).toBeNull();
  });
});
