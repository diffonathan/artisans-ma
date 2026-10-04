import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import { Reservation } from '../reservations/reservation.schema.js';
import { Artisan } from '../artisans/artisan.schema.js';
import { Compte } from '../comptes/compte.schema.js';

@Schema({ collection: 'avis', timestamps: true })
@ObjectType('Avis')
export class Avis {
  @Field(() => ID)
  _id: Types.ObjectId;

  /**
   * Index unique : une réservation ne porte jamais deux avis.
   *
   * Cet index est la deuxième barrière, pas la première. La première est
   * l'échange `avisDeposeA: null -> maintenant` à l'intérieur de la
   * transaction. Les deux disent la même règle par deux moyens différents, et
   * c'est voulu : si un jour un chemin de code oublie de consommer le droit,
   * l'index refuse quand même l'insertion.
   */
  @Prop({ type: Types.ObjectId, ref: Reservation.name, required: true, unique: true })
  reservation: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Artisan.name, required: true })
  artisan: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Compte.name, required: true })
  client: Types.ObjectId;

  /**
   * L'auteur — SANS - Field.
   *
   * Il en avait un, et c'était une fuite : la requête - avisDArtisan - est
   * PUBLIQUE, et ce champ résolvait un - Compte - entier, e-mail et téléphone
   * compris. N'importe qui pouvait donc moissonner les coordonnées de tous
   * les clients ayant laissé un avis, sans même ouvrir de compte.
   *
   * Remplacé par - nomAuteur -, qui rend le nom d'usage. C'est la même
   * correction que sur - Besoin.demandeur -, et le fait qu'elle ait dû être
   * faite deux fois est la raison pour laquelle la réduction du nom vit
   * désormais dans - commun/nom-d-usage.ts - au lieu d'être recopiée.
   */
  auteur?: Compte;

  @Prop({ required: true, min: 1, max: 5 })
  @Field(() => Int)
  note: number;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  @Field()
  commentaire: string;

  @Field()
  createdAt: Date;
}

export type DocumentAvis = HydratedDocument<Avis>;
export const SchemaAvis = SchemaFactory.createForClass(Avis);

SchemaAvis.index({ artisan: 1, createdAt: -1 });
