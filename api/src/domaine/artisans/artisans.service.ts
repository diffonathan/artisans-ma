import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Artisan } from './artisan.schema.js';
import { Metier, Position } from '../../commun/types.js';

export interface CriteresRecherche {
  metier: Metier;
  position: { latitude: number; longitude: number };
  /** Ne retenir que les artisans dont les pièces ont été contrôlées. */
  verifieSeulement?: boolean;
  noteMinimale?: number;
  limite?: number;
  /** Curseur : identifiant du dernier artisan de la page précédente. */
  apres?: Types.ObjectId;
}

/**
 * Garde-fou global, en mètres.
 *
 * Sans plafond, `$geoNear` trie TOUS les artisans de la collection par
 * distance avant que le reste du pipeline ne filtre. Sur 50 000 documents,
 * chercher un plombier à Marrakech classerait d'abord les menuisiers de
 * Tanger. Le plafond borne le travail de l'index.
 *
 * 200 km correspond au rayon maximal qu'un artisan peut déclarer : au-delà,
 * aucun ne pourrait de toute façon être retenu par le filtre suivant.
 */
const PLAFOND_METRES = 200_000;

@Injectable()
export class ArtisansService {
  constructor(@InjectModel(Artisan.name) private readonly artisans: Model<Artisan>) {}

  /**
   * Trouve les artisans qui acceptent d'intervenir à une position donnée.
   *
   * ══ Le problème que `$geoNear` ne sait pas résoudre seul ═══════════════════
   *
   * La question n'est pas « quels artisans sont à moins de 25 km ? » mais
   * « quels artisans acceptent de venir ICI ? ». Ce n'est pas la même
   * question : un électricien de Casablanca qui annonce 100 km de rayon doit
   * sortir pour un chantier à Settat, un carreleur voisin qui annonce 10 km
   * ne doit pas sortir pour un chantier à 15 km.
   *
   * Le seuil est donc PROPRE À CHAQUE DOCUMENT. Or `maxDistance` est une
   * constante du pipeline : c'est le même nombre pour tous. Il ne peut pas
   * lire `$rayonKm`.
   *
   * ── La solution, en deux étages ─────────────────────────────────────────
   *   1. `$geoNear` calcule la distance réelle, en passant par l'index
   *      2dsphere, et borne le travail avec le plafond global.
   *   2. `$match` + `$expr` compare ensuite cette distance au rayon DU
   *      document. `$expr` est ce qui autorise une condition entre deux
   *      champs du même document, ce qu'une requête ordinaire ne sait pas
   *      exprimer.
   *
   * ── Deux contraintes de `$geoNear` qui se paient comptant ───────────────
   *   • il doit être le PREMIER étage du pipeline. Mettre un `$match` avant
   *     pour « filtrer d'abord, trier ensuite » est refusé par le serveur.
   *     D'où son paramètre `query` : c'est là que se mettent les filtres
   *     ordinaires, pour qu'ils s'appliquent pendant la recherche et non
   *     après ;
   *   • il exige l'index 2dsphere. Sans lui, pas de balayage de secours :
   *     la requête échoue.
   *
   * ── La pagination ───────────────────────────────────────────────────────
   * Par curseur (`_id > apres`), jamais par `skip`. Un `skip(40)` relit et
   * jette quarante documents à chaque page, et surtout : si un artisan
   * s'inscrit entre deux pages, tout glisse d'un rang et le lecteur voit deux
   * fois le même. Le curseur est stable parce qu'il désigne une position dans
   * les données, pas un rang dans un résultat.
   *
   * Le tri reste (note décroissante, puis distance) : le curseur sur `_id`
   * sert donc de départage, et la page suivante repart après un document
   * précis. Un curseur composite (note, distance, _id) serait nécessaire pour
   * une pagination parfaitement stable sur ce tri ; ici le départage simple
   * suffit, et le README le note comme une limite assumée.
   */
  async rechercher(criteres: CriteresRecherche): Promise<Artisan[]> {
    const { latitude, longitude } = criteres.position;
    const limite = Math.min(criteres.limite ?? 20, 100);

    const filtresOrdinaires: Record<string, unknown> = {
      metiers: criteres.metier,
      actif: true,
    };
    if (criteres.verifieSeulement) filtresOrdinaires.verifie = true;
    if (criteres.noteMinimale !== undefined) {
      filtresOrdinaires.noteMoyenne = { $gte: criteres.noteMinimale };
    }
    if (criteres.apres) filtresOrdinaires._id = { $gt: criteres.apres };

    return this.artisans.aggregate<Artisan>([
      {
        $geoNear: {
          // GeoJSON : [longitude, latitude]. Inverser les deux ne produit
          // aucune erreur, seulement une liste vide ou absurde.
          near: { type: 'Point', coordinates: [longitude, latitude] },
          distanceField: 'distanceMetres',
          maxDistance: PLAFOND_METRES,
          spherical: true,
          query: filtresOrdinaires,
        },
      },
      {
        // Le rayon propre à chaque artisan. C'est l'étage que `maxDistance`
        // ne peut pas remplacer.
        $match: {
          $expr: { $lte: ['$distanceMetres', { $multiply: ['$rayonKm', 1000] }] },
        },
      },
      { $sort: { noteMoyenne: -1, distanceMetres: 1, _id: 1 } },
      { $limit: limite },
    ]);
  }

  async parIdentifiants(identifiants: readonly Types.ObjectId[]): Promise<Artisan[]> {
    return this.artisans.find({ _id: { $in: identifiants as Types.ObjectId[] } }).lean();
  }

  /**
   * Un artisan par son identifiant, pour sa fiche publique.
   *
   * `rechercherArtisans` ne suffisait pas : il faut pouvoir ouvrir la fiche
   * d'un artisan depuis un lien, depuis un devis reçu, ou depuis un avis —
   * c'est-à-dire sans refaire la recherche géographique qui l'avait trouvé.
   *
   * Un profil désactivé reste lisible : un lien partagé ne doit pas se
   * terminer en page introuvable, et `actif: false` signifie « ne plus
   * apparaître dans les résultats », pas « n'a jamais existé ». La fiche dira
   * qu'il n'accepte pas de nouveaux chantiers.
   */
  async parIdentifiant(identifiant: Types.ObjectId): Promise<Artisan> {
    const trouve = await this.artisans.findById(identifiant).lean();
    if (!trouve) throw new NotFoundException("Cet artisan n'existe pas.");
    return trouve;
  }

  async position(artisan: Types.ObjectId): Promise<Position | null> {
    const trouve = await this.artisans.findById(artisan).select('position').lean();
    return trouve?.position ?? null;
  }
}
