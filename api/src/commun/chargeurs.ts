import { Injectable } from '@nestjs/common';
import DataLoader from 'dataloader';
import { Types } from 'mongoose';
import { ComptesService } from '../domaine/comptes/comptes.service.js';
import { ArtisansService } from '../domaine/artisans/artisans.service.js';
import { BesoinsService } from '../domaine/besoins/besoins.service.js';
import { Compte } from '../domaine/comptes/compte.schema.js';
import { Artisan } from '../domaine/artisans/artisan.schema.js';
import { Besoin } from '../domaine/besoins/besoin.schema.js';

/**
 * Remet des documents dans l'ordre des clés demandées.
 *
 * ══ Le piège que cette fonction existe pour fermer ═════════════════════════
 *
 * DataLoader passe un contrat strict : la fonction de lot reçoit N clés et
 * doit rendre N valeurs, DANS LE MÊME ORDRE. Il ne compare pas, il ne
 * recherche pas : il associe par position. La troisième valeur rendue est
 * attribuée à la troisième clé demandée, point final.
 *
 * Or une requête `{ _id: { $in: [a, b, c] } }` ne rend PAS les documents dans
 * l'ordre de la liste. Elle les rend dans l'ordre où l'index les trouve —
 * donc, en pratique, trié par `_id`. Rendre ce résultat tel quel « marche »
 * tant que les identifiants sont demandés dans l'ordre croissant, ce qui est
 * souvent le cas par hasard.
 *
 * Quand ce n'est pas le cas, le devis de Karim affiche le nom de Fatima.
 *
 * Il n'y a aucune erreur, aucun avertissement, aucune donnée manquante. Juste
 * des noms permutés, qu'un test écrit avec deux documents insérés dans
 * l'ordre croissant ne détectera jamais. C'est la raison pour laquelle le
 * test associé insère volontairement les identifiants dans le désordre.
 *
 * La deuxième obligation est de rendre une valeur pour les clés INTROUVABLES :
 * `null` tient la place. Un tableau plus court décale tout ce qui suit.
 */
const remettreDansLOrdre = <T>(
  clés: readonly Types.ObjectId[],
  documents: T[],
  /**
   * Par quoi le document est désigné. Vaut `_id` dans le cas courant, mais pas
   * toujours : le profil d'un artisan se cherche par son champ `compte`, et
   * c'est donc cette valeur-là qui doit être rapprochée de la clé demandée.
   * Une fonction plutôt qu'un nom de champ : le compilateur vérifie alors que
   * ce qu'on extrait est bien un identifiant.
   */
  cléDe: (d: T) => Types.ObjectId = (d) => (d as { _id: Types.ObjectId })._id,
): (T | null)[] => {
  const parIdentifiant = new Map(documents.map((d) => [String(cléDe(d)), d]));
  return clés.map((clé) => parIdentifiant.get(String(clé)) ?? null);
};

export interface Chargeurs {
  compte: DataLoader<Types.ObjectId, Compte | null>;
  artisan: DataLoader<Types.ObjectId, Artisan | null>;
  besoin: DataLoader<Types.ObjectId, Besoin | null>;
  /**
   * Le profil artisan d'un COMPTE — la clé est l'identifiant du compte, pas
   * celui du profil.
   *
   * Il sert aux contrôles d'habilitation : savoir si le lecteur est l'artisan
   * d'une réservation demande son profil, et la question se repose à chaque
   * champ résolu. Passer par un chargeur la pose une fois par requête, et le
   * cache de DataLoader fait le reste — c'est la même mécanique que pour les
   * données d'affichage, utilisée ici pour une décision de sécurité.
   */
  profilDuCompte: DataLoader<Types.ObjectId, Artisan | null>;
}

@Injectable()
export class FabriqueChargeurs {
  constructor(
    private readonly comptes: ComptesService,
    private readonly artisans: ArtisansService,
    private readonly besoins: BesoinsService,
  ) {}

  /**
   * Un jeu de chargeurs NEUF à chaque requête.
   *
   * ── Pourquoi pas un chargeur partagé ───────────────────────────────────
   * DataLoader mémorise ses résultats. Un chargeur partagé entre requêtes
   * devient un cache sans expiration : un artisan qui change de nom continue
   * d'apparaître sous l'ancien, pour toujours, et le problème ne se voit
   * qu'après un redémarrage qui « répare » tout.
   *
   * Pire, le cache serait partagé entre utilisateurs — ce qui transforme une
   * optimisation en fuite de données dès qu'un chargeur devient sensible au
   * demandeur.
   *
   * Le regroupement, lui, n'a besoin que de la durée d'une requête : c'est à
   * l'intérieur d'une même requête GraphQL que les mêmes identifiants sont
   * demandés cent fois.
   *
   * ── La clé est un ObjectId, qui est un objet ───────────────────────────
   * DataLoader indexe son cache par identité (`===`) par défaut. Deux
   * `ObjectId` égaux mais distincts sont deux clés différentes : le
   * regroupement fonctionnerait encore, mais le cache ne servirait à rien, et
   * la même ligne serait demandée deux fois dans le même lot.
   *
   * `cacheKeyFn` ramène la clé à sa chaîne — ce qui rend la comparaison
   * structurelle, comme on l'attend.
   */
  creer(): Chargeurs {
    const cacheKeyFn = (clé: Types.ObjectId) => String(clé);

    return {
      compte: new DataLoader(
        async (clés) => remettreDansLOrdre(clés, await this.comptes.parIdentifiants(clés)),
        { cacheKeyFn },
      ),
      artisan: new DataLoader(
        async (clés) => remettreDansLOrdre(clés, await this.artisans.parIdentifiants(clés)),
        { cacheKeyFn },
      ),
      besoin: new DataLoader(
        async (clés) => remettreDansLOrdre(clés, await this.besoins.parIdentifiants(clés)),
        { cacheKeyFn },
      ),
      profilDuCompte: new DataLoader(
        async (clés) =>
          remettreDansLOrdre(clés, await this.comptes.profilsDesComptes(clés), (a) => a.compte),
        { cacheKeyFn },
      ),
    };
  }
}

export interface ContexteGraphQL {
  chargeurs: Chargeurs;
  /** Identifiant du compte authentifié, ou `undefined` si anonyme. */
  compte?: { id: Types.ObjectId; role: string };
}
