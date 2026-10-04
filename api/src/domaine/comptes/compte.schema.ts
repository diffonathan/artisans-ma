import { Field, ID, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import { Role } from '../../commun/types.js';

@Schema({ collection: 'comptes', timestamps: true })
@ObjectType('Compte')
export class Compte {
  @Field(() => ID)
  _id: Types.ObjectId;

  /**
   * `unique: true` crée l'index unique — c'est la base, et non le code, qui
   * refuse le doublon. Un contrôle applicatif « cet e-mail existe-t-il ? »
   * suivi d'une insertion laisse passer deux inscriptions simultanées : entre
   * la lecture et l'écriture, l'autre requête a eu le temps de s'intercaler.
   */
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  @Field()
  email: string;

  /** Jamais exposé : aucun `@Field` sur cette propriété. */
  @Prop({ required: true })
  empreinteMotDePasse: string;

  @Prop({ required: true, trim: true })
  @Field()
  nom: string;

  @Prop({ trim: true })
  @Field({ nullable: true })
  telephone?: string;

  @Prop({ type: String, enum: Role, required: true, default: Role.CLIENT })
  @Field(() => Role)
  role: Role;

  @Field()
  createdAt: Date;
}

export type DocumentCompte = HydratedDocument<Compte>;
export const SchemaCompte = SchemaFactory.createForClass(Compte);
