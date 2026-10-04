import { Field, Float, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import { Metier, Position } from '../../commun/types.js';
import { Compte } from '../comptes/compte.schema.js';

export enum StatutBesoin {
  OUVERT = 'OUVERT',
  ATTRIBUE = 'ATTRIBUE',
  CLOS = 'CLOS',
}
registerEnumType(StatutBesoin, { name: 'StatutBesoin' });

@Schema({ collection: 'besoins', timestamps: true })
@ObjectType('Besoin')
export class Besoin {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Compte.name, required: true })
  client: Types.ObjectId;

  /**
   * Le demandeur — SANS `@Field`, comme `adresse` plus bas.
   *
   * Il est rendu par un résolveur qui le réserve au propriétaire du besoin et
   * répond `null` aux autres. Laisser la déclaration ici la rendrait
   * NON-NULLABLE dans le schéma GraphQL, et le refus se transformerait en
   * « Cannot return null for non-nullable field Besoin.demandeur » — une
   * erreur 500 à l'endroit exact où l'on voulait refuser poliment.
   *
   * La nullabilité se décide sur la déclaration, pas sur le résolveur : un
   * `nullable: true` posé sur le `@ResolveField` ne l'emporte pas.
   */
  demandeur?: Compte;

  @Prop({ type: String, enum: Metier, required: true })
  @Field(() => Metier)
  metier: Metier;

  @Prop({ required: true, trim: true, maxlength: 140 })
  @Field()
  titre: string;

  @Prop({ required: true, trim: true, maxlength: 4000 })
  @Field()
  description: string;

  /**
   * L'adresse du chantier — SANS `@Field`.
   *
   * Elle est exposée par un résolveur de champ qui la réserve au client
   * propriétaire (voir `besoins.resolver.ts`). L'artisan qui remporte le
   * chantier, lui, ne la lit pas ici : elle est RECOPIÉE sur la réservation
   * à l'acceptation du devis.
   *
   * Ce détour n'est pas une complication gratuite. Un contrôle
   * d'habilitation sur ce champ-ci obligerait, pour chaque besoin affiché, à
   * demander « existe-t-il une réservation dont l'artisan est le lecteur ? ».
   * La copie rend la question inutile : l'artisan qui a gagné a l'adresse
   * parce qu'elle est chez lui, et les autres ne l'ont pas parce qu'elle n'y
   * est pas. La règle devient une conséquence de l'emplacement de la donnée,
   * et non d'un `if` qu'on peut oublier d'écrire.
   */
  @Prop({ required: true, trim: true })
  adresse: string;

  @Prop({ type: Position, required: true })
  @Field(() => Position)
  position: Position;

  /**
   * Les montants sont stockés en CENTIMES, en entier.
   *
   * Un prix en nombre flottant finit par produire 1 199,999 999 999 9 ; une
   * somme de lignes finit par ne plus égaler le total affiché. Le problème
   * n'apparaît pas sur un jeu d'essai, il apparaît en production sur une
   * facture, et il n'est alors plus réparable discrètement.
   */
  @Prop({ min: 0 })
  @Field(() => Int, { nullable: true })
  budgetMaxCentimes?: number;

  @Prop({ type: String, enum: StatutBesoin, required: true, default: StatutBesoin.OUVERT })
  @Field(() => StatutBesoin)
  statut: StatutBesoin;

  @Field()
  createdAt: Date;

  /**
   * Distance entre ce chantier et l'artisan qui regarde, en mètres.
   *
   * `besoinsPourMoi` la calcule déjà — `$geoNear` la dépose dans ce champ —
   * mais elle n'était pas exposée, donc l'artisan voyait une liste de
   * chantiers sans savoir lequel était à dix minutes. Elle vaut `null` sur
   * tout autre chemin de lecture, où la question n'a pas de sens : la
   * distance n'existe que par rapport à quelqu'un.
   */
  @Field(() => Float, { nullable: true })
  distanceMetres?: number;
}

export type DocumentBesoin = HydratedDocument<Besoin>;
export const SchemaBesoin = SchemaFactory.createForClass(Besoin);

SchemaBesoin.index({ client: 1, createdAt: -1 });
SchemaBesoin.index({ metier: 1, statut: 1, createdAt: -1 });
SchemaBesoin.index({ position: '2dsphere' });
