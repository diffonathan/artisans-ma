import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { Artisan } from '../domaine/artisans/artisan.schema.js';
import { Compte } from '../domaine/comptes/compte.schema.js';
import {
  Reservation,
  StatutReservation,
} from '../domaine/reservations/reservation.schema.js';
import { ReservationsService } from '../domaine/reservations/reservations.service.js';
import { PORT_DE_PAIEMENT, type PortDePaiement } from './paiement.port.js';
import type { Configuration } from '../configuration/configuration.js';

@Injectable()
export class PaiementService {
  private readonly journal = new Logger(PaiementService.name);

  constructor(
    @Inject(PORT_DE_PAIEMENT) private readonly prestataire: PortDePaiement,
    @InjectModel(Artisan.name) private readonly artisans: Model<Artisan>,
    @InjectModel(Compte.name) private readonly comptes: Model<Compte>,
    @InjectModel(Reservation.name) private readonly reservations: Model<Reservation>,
    private readonly reservationsService: ReservationsService,
    private readonly config: ConfigService<Configuration, true>,
  ) {}

  /**
   * Ouvre le compte d'encaissement d'un artisan et rend l'adresse où il doit
   * se rendre pour fournir ses pièces.
   *
   * Rejouable : un artisan qui abandonne en cours de route et revient obtient
   * un NOUVEAU lien sur le MÊME compte. Les liens d'inscription expirent en
   * quelques minutes chez le prestataire ; sans ce rejeu, un artisan revenu le
   * lendemain serait bloqué devant une page morte, avec un compte à moitié
   * créé qu'il ne pourrait ni finir ni recommencer.
   */
  async ouvrirEncaissements(compteId: Types.ObjectId): Promise<string> {
    const profil = await this.artisans.findOne({ compte: compteId });
    if (!profil) throw new NotFoundException("Votre compte n'a pas de profil artisan.");

    const compte = await this.comptes.findById(compteId);
    if (!compte) throw new NotFoundException('Compte introuvable.');

    const racine = this.config.get('URL_PUBLIQUE', { infer: true });
    const retour = `${racine}/mon-compte?encaissements=ouverts`;
    const rafraichir = `${racine}/mon-compte?encaissements=a-reprendre`;

    if (profil.compteEncaissement) {
      // Le compte existe : on ne crée pas le second, on rend un lien neuf.
      const etat = await this.prestataire.lireCompte(profil.compteEncaissement);
      await this.artisans.updateOne(
        { _id: profil._id },
        { $set: { encaissementsActifs: etat.encaissementsActifs } },
      );
      if (etat.encaissementsActifs) return retour;

      const { lien } = await this.prestataire.ouvrirCompte({
        email: compte.email,
        raisonSociale: profil.raisonSociale,
        retour,
        rafraichir,
      });
      return lien;
    }

    const { compte: ouvert, lien } = await this.prestataire.ouvrirCompte({
      email: compte.email,
      raisonSociale: profil.raisonSociale,
      retour,
      rafraichir,
    });

    await this.artisans.updateOne(
      { _id: profil._id },
      {
        $set: {
          compteEncaissement: ouvert.identifiant,
          encaissementsActifs: ouvert.encaissementsActifs,
        },
      },
    );

    return lien;
  }

  /** Relit l'état du compte chez le prestataire et le recopie chez nous. */
  async rafraichirEtat(compteId: Types.ObjectId): Promise<boolean> {
    const profil = await this.artisans.findOne({ compte: compteId });
    if (!profil?.compteEncaissement) return false;

    const etat = await this.prestataire.lireCompte(profil.compteEncaissement);
    await this.artisans.updateOne(
      { _id: profil._id },
      { $set: { encaissementsActifs: etat.encaissementsActifs } },
    );
    return etat.encaissementsActifs;
  }

  /**
   * Prépare le paiement d'une réservation et rend le secret client.
   *
   * ══ LE MONTANT NE TRAVERSE JAMAIS LE NAVIGATEUR ═══════════════════════════
   *
   * C'est la faille classique des places de marché : le montant part au
   * client, revient modifié, et la commande est encaissée au prix que
   * l'acheteur a choisi. Ici il n'a aucun chemin pour revenir — il est LU sur
   * la réservation, qui l'a elle-même figé à l'acceptation du devis, dans la
   * transaction qui a refusé les concurrents.
   *
   * La commission suit la même règle : figée au taux du jour de
   * l'acceptation. Changer le taux demain ne réécrit pas les réservations
   * d'hier.
   */
  async preparerPaiement(
    reservationId: Types.ObjectId,
    clientId: Types.ObjectId,
  ): Promise<string> {
    const reservation = await this.reservations.findOne({
      _id: reservationId,
      client: clientId,
    });
    if (!reservation) {
      throw new NotFoundException("Cette réservation n'existe pas, ou ne vous appartient pas.");
    }
    if (reservation.statut !== StatutReservation.A_PAYER) {
      throw new ConflictException(
        `Cette réservation est au statut ${reservation.statut} : il n'y a rien à payer.`,
      );
    }

    const artisan = await this.artisans.findById(reservation.artisan);
    if (!artisan?.compteEncaissement || !artisan.encaissementsActifs) {
      // On refuse d'encaisser ce qu'on ne saura pas reverser. Garder l'argent
      // en attendant que l'artisan finisse son inscription ferait de nous le
      // dépositaire de fonds d'autrui, ce qui demande un agrément — et ferait
      // porter au client le risque d'un artisan qui ne finit jamais.
      throw new ConflictException(
        "Cet artisan n'a pas encore ouvert ses encaissements. Le paiement ne " +
          'peut pas être prélevé tant que ce n’est pas fait.',
      );
    }

    const intention = await this.prestataire.creerIntention({
      reservation: String(reservation._id),
      montantCentimes: reservation.montantCentimes,
      commissionCentimes: reservation.commissionCentimes,
      compteArtisan: artisan.compteEncaissement,
      description: `Artisans.ma — ${artisan.raisonSociale}`,
    });

    await this.reservations.updateOne(
      { _id: reservation._id },
      { $set: { intentionPaiement: intention.identifiant } },
    );

    return intention.secretClient;
  }

  /**
   * Traite une notification du prestataire, SIGNATURE DÉJÀ VÉRIFIÉE.
   *
   * ── Pourquoi la vérification est faite avant, dans le contrôleur ────────
   * Parce qu'elle a besoin du corps BRUT, en octets, et que ce service
   * travaille sur des objets. Séparer les deux évite qu'un futur appelant
   * passe ici un événement qu'il a fabriqué lui-même : cette méthode est
   * `private` du point de vue du domaine, et le seul chemin public est le
   * contrôleur, qui ne sait rien faire sans signature valide.
   */
  async traiterNotification(evenement: {
    type: string;
    reservation: string | null;
    intention: string;
  }): Promise<{ traite: boolean; raison: string }> {
    if (evenement.type !== 'payment_intent.succeeded') {
      // On ne traite qu'un seul type, et on dit « reçu » pour les autres :
      // répondre en erreur ferait réessayer le prestataire indéfiniment pour
      // des événements qui ne nous concernent pas.
      return { traite: false, raison: `Type ignoré : ${evenement.type}` };
    }

    if (!evenement.reservation) {
      this.journal.warn(
        `Paiement ${evenement.intention} sans identifiant de réservation dans ` +
          'ses métadonnées. Non traité.',
      );
      return { traite: false, raison: 'Aucune réservation dans les métadonnées.' };
    }

    if (!Types.ObjectId.isValid(evenement.reservation)) {
      return { traite: false, raison: 'Identifiant de réservation mal formé.' };
    }

    // `enregistrerPaiement` est déjà idempotent : le même paiement reçu deux
    // fois ne change rien la seconde, et ne lève pas. C'est nécessaire ici —
    // un prestataire de paiement REJOUE ses notifications, c'est documenté et
    // voulu, il préfère livrer deux fois que risquer de ne pas livrer.
    //
    // ── Pourquoi on attrape l'erreur au lieu de la laisser remonter ───────
    // Une réservation supprimée, ou un identifiant qui ne correspond à rien,
    // ferait lever `NotFoundException` — donc répondre 404 au prestataire. Il
    // réessaierait pendant des heures une notification qui ne réussira
    // JAMAIS, puis désactiverait le point d'entrée, et avec lui les
    // notifications qui, elles, comptent.
    //
    // On accuse donc réception et on journalise. Le défaut a été trouvé par
    // un test ; le commentaire du contrôleur annonçait déjà ce comportement
    // alors que le code ne l'appliquait pas — une promesse écrite qu'aucune
    // ligne ne tenait.
    try {
      await this.reservationsService.enregistrerPaiement(
        new Types.ObjectId(evenement.reservation),
        evenement.intention,
      );
    } catch (erreur) {
      const message = (erreur as Error).message;
      this.journal.warn(
        `Paiement ${evenement.intention} non appliqué à la réservation ` +
          `${evenement.reservation} : ${message}`,
      );
      return { traite: false, raison: `Non appliqué : ${message}` };
    }

    return { traite: true, raison: 'Réservation marquée payée.' };
  }
}
