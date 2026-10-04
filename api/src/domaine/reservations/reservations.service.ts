import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DocumentReservation,
  Reservation,
  StatutReservation,
} from './reservation.schema.js';
import { Besoin, StatutBesoin } from '../besoins/besoin.schema.js';
import { UniteDeTravail } from '../../base-de-donnees/unite-de-travail.js';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectModel(Reservation.name) private readonly reservations: Model<Reservation>,
    @InjectModel(Besoin.name) private readonly besoins: Model<Besoin>,
    private readonly uniteDeTravail: UniteDeTravail,
  ) {}

  /**
   * Enregistre le paiement d'une réservation.
   *
   * ── L'idempotence, et pourquoi elle n'est pas optionnelle ───────────────
   * Un prestataire de paiement rejoue ses notifications. C'est documenté, et
   * c'est voulu : il préfère livrer deux fois que risquer de ne pas livrer.
   * Le même événement « paiement réussi » arrive donc parfois deux fois, et
   * parfois à plusieurs minutes d'intervalle.
   *
   * Le filtre exige `statut: A_PAYER`. Le second passage ne trouve rien à
   * modifier : il n'y a pas d'erreur à signaler, l'état voulu est déjà
   * atteint. On renvoie donc la réservation telle quelle, sans lever — c'est
   * la différence entre « rien à faire » et « échec ».
   *
   * La référence du paiement est aussi comparée : si une AUTRE référence
   * prétend payer une réservation déjà payée, ce n'est plus un doublon mais
   * une incohérence, et il faut le dire.
   */
  async enregistrerPaiement(
    reservationId: Types.ObjectId,
    referencePaiement: string,
  ): Promise<DocumentReservation> {
    const payee = await this.reservations.findOneAndUpdate(
      { _id: reservationId, statut: StatutReservation.A_PAYER },
      { $set: { statut: StatutReservation.PAYEE, referencePaiement } },
      { returnDocument: 'after' },
    );
    if (payee) return payee;

    const existante = await this.reservations.findById(reservationId);
    if (!existante) throw new NotFoundException("Cette réservation n'existe pas.");

    // Rejeu du même paiement : l'état voulu est déjà là.
    if (existante.referencePaiement === referencePaiement) return existante;

    throw new ConflictException(
      `Cette réservation est déjà au statut ${existante.statut} avec un autre paiement.`,
    );
  }

  /**
   * L'artisan déclare la prestation terminée. C'est ce passage qui ouvre le
   * droit d'avis : `avisDeposeA` vaut toujours `null` à ce stade, et c'est
   * seulement maintenant qu'il devient consommable.
   *
   * Une prestation non payée ne peut pas être terminée : le filtre l'impose.
   */
  async terminer(
    reservationId: Types.ObjectId,
    artisan: Types.ObjectId,
  ): Promise<DocumentReservation> {
    return this.uniteDeTravail.executer(async (session) => {
      const terminee = await this.reservations.findOneAndUpdate(
        { _id: reservationId, artisan, statut: StatutReservation.PAYEE },
        { $set: { statut: StatutReservation.TERMINEE } },
        { session, returnDocument: 'after' },
      );
      if (!terminee) {
        throw new ConflictException(
          "Cette prestation n'est pas la vôtre, ou n'est pas au statut payé.",
        );
      }

      // Le besoin se clôt avec la prestation : il n'a plus à apparaître dans
      // les listes de chantiers à prendre.
      await this.besoins.updateOne(
        { _id: terminee.besoin },
        { $set: { statut: StatutBesoin.CLOS } },
        { session },
      );

      return terminee;
    });
  }

  async annuler(
    reservationId: Types.ObjectId,
    client: Types.ObjectId,
  ): Promise<DocumentReservation> {
    return this.uniteDeTravail.executer(async (session) => {
      const annulee = await this.reservations.findOneAndUpdate(
        {
          _id: reservationId,
          client,
          statut: { $in: [StatutReservation.A_PAYER, StatutReservation.PAYEE] },
        },
        { $set: { statut: StatutReservation.ANNULEE } },
        { session, returnDocument: 'after' },
      );
      if (!annulee) {
        throw new ConflictException(
          'Cette réservation ne vous appartient pas, ou est déjà terminée ou annulée.',
        );
      }

      // Le besoin redevient OUVERT : le client peut accepter un autre devis.
      // Les devis refusés ne sont PAS ressuscités — ils ont été refusés, et
      // leurs auteurs ont pu se réengager ailleurs. L'artisan dont le devis
      // était accepté le voit passer à REFUSE lui aussi, ce qui libère la
      // place dans l'index partiel et lui permet de proposer à nouveau.
      await this.besoins.updateOne(
        { _id: annulee.besoin },
        { $set: { statut: StatutBesoin.OUVERT } },
        { session },
      );

      return annulee;
    });
  }

  async deClient(client: Types.ObjectId): Promise<Reservation[]> {
    return this.reservations.find({ client }).sort({ createdAt: -1 }).lean();
  }

  async dArtisan(artisan: Types.ObjectId): Promise<Reservation[]> {
    return this.reservations.find({ artisan }).sort({ 'creneau.debut': 1 }).lean();
  }
}
