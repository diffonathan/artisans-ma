import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { Devis, DocumentDevis, StatutDevis } from './devis.schema.js';
import { Besoin, StatutBesoin } from '../besoins/besoin.schema.js';
import { Reservation, DocumentReservation } from '../reservations/reservation.schema.js';
import { Artisan } from '../artisans/artisan.schema.js';
import { UniteDeTravail } from '../../base-de-donnees/unite-de-travail.js';
import type { Configuration } from '../../configuration/configuration.js';

export interface EntreeDevis {
  besoin: Types.ObjectId;
  montantCentimes: number;
  delaiJours: number;
  message: string;
}

/** Code d'erreur MongoDB d'une violation d'index unique. */
const CLE_EN_DOUBLE = 11000;

@Injectable()
export class DevisService {
  constructor(
    @InjectModel(Devis.name) private readonly devis: Model<Devis>,
    @InjectModel(Besoin.name) private readonly besoins: Model<Besoin>,
    @InjectModel(Artisan.name) private readonly artisans: Model<Artisan>,
    @InjectModel(Reservation.name) private readonly reservations: Model<Reservation>,
    private readonly uniteDeTravail: UniteDeTravail,
    private readonly config: ConfigService<Configuration, true>,
  ) {}

  /**
   * Un artisan propose un devis sur un besoin ouvert.
   *
   * Le doublon n'est pas évité par une lecture préalable (« a-t-il déjà
   * répondu ? ») mais par l'index unique partiel : on tente l'insertion, et
   * on traduit le refus de la base. Une lecture suivie d'une écriture laisse
   * passer deux requêtes simultanées ; l'index non.
   */
  async proposer(entree: EntreeDevis, artisan: Types.ObjectId): Promise<DocumentDevis> {
    const besoin = await this.besoins.findOne({
      _id: entree.besoin,
      statut: StatutBesoin.OUVERT,
    });
    if (!besoin) {
      throw new NotFoundException("Ce besoin n'existe pas ou n'accepte plus de devis.");
    }

    try {
      return await this.devis.create({ ...entree, artisan, statut: StatutDevis.ENVOYE });
    } catch (erreur) {
      if ((erreur as { code?: number }).code === CLE_EN_DOUBLE) {
        throw new ConflictException(
          'Vous avez déjà un devis en cours sur ce besoin. Retirez-le pour en déposer un autre.',
        );
      }
      throw erreur;
    }
  }

  /** Les devis d'un artisan, du plus récent au plus ancien. */
  async dArtisan(artisan: Types.ObjectId): Promise<Devis[]> {
    return this.devis.find({ artisan }).sort({ createdAt: -1 }).lean();
  }

  /** Retirer son devis libère la place dans l'index partiel. */
  async retirer(devis: Types.ObjectId, artisan: Types.ObjectId): Promise<DocumentDevis> {
    const retire = await this.devis.findOneAndUpdate(
      { _id: devis, artisan, statut: StatutDevis.ENVOYE },
      { $set: { statut: StatutDevis.RETIRE } },
      { returnDocument: 'after' },
    );
    if (!retire) {
      throw new NotFoundException("Ce devis n'existe pas, ou n'est plus retirable.");
    }
    return retire;
  }

  /**
   * Le client accepte un devis. C'est l'opération structurante du domaine.
   *
   * ── Quatre écritures, une seule décision ────────────────────────────────
   *   1. le besoin passe de OUVERT à ATTRIBUE ;
   *   2. le devis retenu passe à ACCEPTE ;
   *   3. tous les autres devis vivants du besoin passent à REFUSE ;
   *   4. une réservation naît, avec le montant recopié.
   *
   * Si la quatrième échoue et que les trois premières ont abouti, le besoin
   * est attribué à un devis accepté qui ne donne droit à rien : l'artisan a
   * gagné l'affaire, les concurrents sont refusés, et aucune prestation
   * n'existe. Personne ne s'en aperçoit avant que le client se plaigne.
   *
   * D'où la transaction. En PostgreSQL ce serait le réflexe par défaut ; en
   * MongoDB c'est un choix d'infrastructure, puisqu'il faut un replica set
   * pour en avoir le droit (voir docker-compose.yml).
   *
   * ── La concurrence ──────────────────────────────────────────────────────
   * Deux devis acceptés en même temps sur le même besoin : la transaction
   * seule ne suffit pas, elle garantit l'indivisibilité, pas l'exclusion. Ce
   * qui exclut, c'est que le filtre de l'étape 1 exige `statut: OUVERT`. Le
   * second à passer ne trouve aucun document à modifier : `findOneAndUpdate`
   * renvoie `null`, et on refuse. C'est une comparaison-et-échange, écrite
   * dans le filtre plutôt que dans un `if`.
   *
   * Un `if (besoin.statut === OUVERT)` AVANT l'écriture ne protégerait de
   * rien : entre la lecture et l'écriture, l'autre requête s'intercale.
   */
  async accepter(
    devisId: Types.ObjectId,
    client: Types.ObjectId,
    creneau: { debut: Date; fin: Date },
  ): Promise<DocumentReservation> {
    const pointsDeBase = this.config.get('COMMISSION_POINTS_DE_BASE', { infer: true });

    return this.uniteDeTravail.executer(async (session) => {
      const devis = await this.devis
        .findOne({ _id: devisId, statut: StatutDevis.ENVOYE })
        .session(session);
      if (!devis) {
        throw new NotFoundException("Ce devis n'existe pas, ou n'est plus acceptable.");
      }

      // Étape 1 — la comparaison-et-échange qui tranche entre deux clients.
      const besoin = await this.besoins.findOneAndUpdate(
        { _id: devis.besoin, client, statut: StatutBesoin.OUVERT },
        { $set: { statut: StatutBesoin.ATTRIBUE } },
        { session, returnDocument: 'after' },
      );
      if (!besoin) {
        throw new ConflictException(
          'Ce besoin ne vous appartient pas, ou un devis a déjà été accepté.',
        );
      }

      // Étape 2.
      devis.statut = StatutDevis.ACCEPTE;
      await devis.save({ session });

      // Étape 3 — les concurrents. `$ne` sur l'identifiant plutôt qu'une
      // boucle : une seule commande, quel que soit le nombre de devis.
      await this.devis.updateMany(
        { besoin: besoin._id, _id: { $ne: devis._id }, statut: StatutDevis.ENVOYE },
        { $set: { statut: StatutDevis.REFUSE } },
        { session },
      );

      // Étape 4 — la réservation. La commission est calculée ici et FIGÉE :
      // changer le taux demain ne doit pas réécrire les réservations d'hier.
      const commissionCentimes = Math.round((devis.montantCentimes * pointsDeBase) / 10_000);

      const [reservation] = await this.reservations.create(
        [
          {
            devis: devis._id,
            besoin: besoin._id,
            client,
            artisan: devis.artisan,
            montantCentimes: devis.montantCentimes,
            commissionCentimes,
            creneau,
            // L'adresse suit le même chemin que le montant : recopiée, pas
            // référencée. C'est ce qui la rend lisible par l'artisan retenu
            // sans avoir à l'exposer sur le besoin à tout le monde.
            adresseIntervention: besoin.adresse,
          },
        ],
        // ── Pourquoi un tableau d'UN seul élément ────────────────────
        // `Model.create` ne transmet la session que si le premier argument
        // est un TABLEAU. Appelé avec un objet seul, il fait deux choses :
        //
        //   • il ignore la session, donc l'écriture sort de la transaction et
        //     l'annulation ne la rattrape pas. Mongoose émet bien un
        //     avertissement de processus, mais une seule fois par exécution,
        //     dans le flux des journaux — facile à ne jamais voir ;
        //   • il insère l'objet d'options COMME UN SECOND DOCUMENT. Celui-là,
        //     rien ne le signale : la collection gagne un document vide.
        //
        // Les deux ne se manifestent qu'en cas d'échec de la transaction,
        // donc jamais pendant le développement, où tout réussit.
        // `test/unite-de-travail.spec.ts` le mesure.
        { session },
      );

      return reservation;
    });
  }
}
