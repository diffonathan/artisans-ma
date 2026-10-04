import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Besoin, DocumentBesoin, StatutBesoin } from './besoin.schema.js';
import { Metier, positionDepuis } from '../../commun/types.js';

export interface EntreeBesoin {
  metier: Metier;
  titre: string;
  description: string;
  adresse: string;
  latitude: number;
  longitude: number;
  budgetMaxCentimes?: number;
}

@Injectable()
export class BesoinsService {
  constructor(@InjectModel(Besoin.name) private readonly besoins: Model<Besoin>) {}

  async publier(entree: EntreeBesoin, client: Types.ObjectId): Promise<DocumentBesoin> {
    return this.besoins.create({
      client,
      metier: entree.metier,
      titre: entree.titre,
      description: entree.description,
      adresse: entree.adresse,
      position: positionDepuis(entree.latitude, entree.longitude),
      budgetMaxCentimes: entree.budgetMaxCentimes,
      statut: StatutBesoin.OUVERT,
    });
  }

  async parIdentifiant(id: Types.ObjectId): Promise<DocumentBesoin> {
    const besoin = await this.besoins.findById(id);
    if (!besoin) throw new NotFoundException("Ce besoin n'existe pas.");
    return besoin;
  }

  async deClient(client: Types.ObjectId): Promise<Besoin[]> {
    return this.besoins.find({ client }).sort({ createdAt: -1 }).lean();
  }

  /**
   * Lecture groupée, pour le chargeur de `commun/chargeurs.ts`.
   *
   * Trois champs du schéma remontent désormais vers un besoin :
   * `Reservation.besoin`, `Devis.besoin` et le besoin d'une liste de devis.
   * Sans regroupement, afficher vingt réservations demanderait vingt-et-une
   * requêtes — exactement le N+1 que le reste du projet s'attache à éviter.
   */
  async parIdentifiants(identifiants: readonly Types.ObjectId[]): Promise<Besoin[]> {
    return this.besoins.find({ _id: { $in: identifiants as Types.ObjectId[] } }).lean();
  }

  /**
   * Les besoins ouverts qu'un artisan peut voir, de son point de vue.
   *
   * Le filtre géographique est le miroir de la recherche d'artisans : là on
   * cherchait « qui vient ici », ici on cherche « quels chantiers sont dans
   * mon rayon ». Le rayon est cette fois une constante — celle de l'artisan
   * qui regarde — donc `maxDistance` suffit et `$expr` est inutile.
   *
   * C'est le même index 2dsphere qui sert aux deux sens de la question.
   */
  async ouvertsPourArtisan(
    metiers: Metier[],
    position: { latitude: number; longitude: number },
    rayonKm: number,
    limite = 30,
  ): Promise<Besoin[]> {
    return this.besoins.aggregate<Besoin>([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [position.longitude, position.latitude] },
          distanceField: 'distanceMetres',
          maxDistance: rayonKm * 1000,
          spherical: true,
          query: { metier: { $in: metiers }, statut: StatutBesoin.OUVERT },
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: Math.min(limite, 100) },
    ]);
  }
}
