import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import { Metier, Position } from '../../commun/types.js';
import { Compte } from '../comptes/compte.schema.js';

@Schema({ collection: 'artisans', timestamps: true })
@ObjectType('Artisan')
export class Artisan {
  @Field(() => ID)
  _id: Types.ObjectId;

  /** Un compte ne porte qu'un seul profil d'artisan : index unique. */
  @Prop({ type: Types.ObjectId, ref: Compte.name, required: true, unique: true })
  compte: Types.ObjectId;

  /**
   * Le compte propriétaire du profil.
   *
   * `nullable` parce qu'il est résolu par un chargeur groupé, et qu'un
   * chargeur rend `null` pour une clé introuvable. Le déclarer non-nullable
   * ferait échouer toute la requête sur un profil dont le compte aurait
   * disparu — MongoDB n'ayant pas de clé étrangère, c'est un état possible,
   * et c'est précisément celui que `verifier-integrite` surveille.
   */
  @Field(() => Compte, { nullable: true, description: 'Le compte propriétaire du profil.' })
  titulaire?: Compte;

  @Prop({ required: true, trim: true })
  @Field()
  raisonSociale: string;

  @Prop({ type: [String], enum: Metier, required: true })
  @Field(() => [Metier])
  metiers: Metier[];

  @Prop({ required: true, trim: true })
  @Field()
  ville: string;

  @Prop({ type: Position, required: true })
  @Field(() => Position)
  position: Position;

  /**
   * Le rayon d'intervention, propre à chaque artisan.
   *
   * C'est ce champ qui rend la recherche géographique non triviale :
   * `$geoNear` sait filtrer sur UNE distance maximale, la même pour tous.
   * Ici le seuil change à chaque document. Voir `artisans.service.ts`.
   */
  @Prop({ required: true, min: 1, max: 200, default: 25 })
  @Field(() => Int)
  rayonKm: number;

  @Prop({ default: false })
  @Field({ description: "Pièces justificatives contrôlées par l'équipe." })
  verifie: boolean;

  @Prop({ default: true })
  @Field()
  actif: boolean;

  /**
   * Note moyenne et nombre d'avis, recopiés ici depuis la collection `avis`.
   *
   * ── Pourquoi dupliquer une donnée qu'on sait recalculer ─────────────────
   * La liste de résultats se trie par note. Sans ce champ, trier 400 artisans
   * demanderait d'agréger leurs avis à chaque recherche — un `$lookup` plus
   * un `$group` par artisan, à chaque page affichée.
   *
   * La contrepartie d'une donnée dupliquée est qu'elle peut mentir. Elle est
   * donc recalculée DANS LA MÊME TRANSACTION que l'avis qui la change : les
   * deux écritures réussissent ensemble ou échouent ensemble. Un lecteur ne
   * voit jamais l'avis sans la note, ni la note sans l'avis.
   */
  @Prop({ default: 0, min: 0, max: 5 })
  @Field(() => Float)
  noteMoyenne: number;

  @Prop({ default: 0, min: 0 })
  @Field(() => Int)
  nombreAvis: number;

  @Field(() => Float, { nullable: true, description: 'Distance au besoin recherché, en mètres.' })
  distanceMetres?: number;
}

export type DocumentArtisan = HydratedDocument<Artisan>;
export const SchemaArtisan = SchemaFactory.createForClass(Artisan);

/**
 * L'index 2dsphere : sans lui, `$geoNear` échoue — il ne se dégrade pas en
 * balayage complet comme le ferait un index ordinaire. L'erreur est explicite
 * (« unable to find index for $geoNear query »), ce qui est une chance.
 */
SchemaArtisan.index({ position: '2dsphere' });

/** La recherche filtre d'abord sur le métier et l'activité. */
SchemaArtisan.index({ metiers: 1, actif: 1 });
