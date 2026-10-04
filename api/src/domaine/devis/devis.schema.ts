import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import { Besoin } from '../besoins/besoin.schema.js';
import { Artisan } from '../artisans/artisan.schema.js';

export enum StatutDevis {
  ENVOYE = 'ENVOYE',
  ACCEPTE = 'ACCEPTE',
  REFUSE = 'REFUSE',
  RETIRE = 'RETIRE',
}
registerEnumType(StatutDevis, { name: 'StatutDevis' });

@Schema({ collection: 'devis', timestamps: true })
@ObjectType('Devis')
export class Devis {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Besoin.name, required: true })
  besoin: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Artisan.name, required: true })
  artisan: Types.ObjectId;

  /**
   * Résolu par un chargeur groupé, donc `nullable` : un chargeur rend `null`
   * pour une clé introuvable. Le déclarer non-nullable ferait échouer la
   * requête ENTIÈRE sur une référence orpheline — et MongoDB n'ayant pas de
   * clé étrangère, l'orphelin est un état possible, celui-là même que
   * `verifier-integrite` surveille.
   */
  @Field(() => Artisan, { nullable: true })
  auteur?: Artisan;

  /**
   * Le chantier sur lequel porte ce devis.
   *
   * Sans ce champ, un artisan consultant ses devis envoyés voyait des
   * montants et des délais sans savoir à quoi ils répondaient. La liste
   * était exacte et inutilisable.
   */
  @Field(() => Besoin, { nullable: true })
  chantier?: Besoin;

  @Prop({ required: true, min: 1 })
  @Field(() => Int)
  montantCentimes: number;

  @Prop({ required: true, min: 1, max: 365 })
  @Field(() => Int)
  delaiJours: number;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  @Field()
  message: string;

  @Prop({ type: String, enum: StatutDevis, required: true, default: StatutDevis.ENVOYE })
  @Field(() => StatutDevis)
  statut: StatutDevis;

  @Field()
  createdAt: Date;
}

export type DocumentDevis = HydratedDocument<Devis>;
export const SchemaDevis = SchemaFactory.createForClass(Devis);

/**
 * Un artisan ne propose qu'un devis par besoin — mais il peut retirer le sien
 * et en déposer un autre.
 *
 * ── Pourquoi un index PARTIEL ───────────────────────────────────────────────
 * Un index unique ordinaire sur (besoin, artisan) interdirait aussi le second
 * devis après un retrait : le document retiré occuperait la place pour
 * toujours.
 *
 * La clause `partialFilterExpression` exclut de l'index les devis retirés ou
 * refusés. Ils restent en base — on ne perd pas l'historique — mais ils ne
 * réservent plus la combinaison. L'unicité porte donc sur « un devis VIVANT
 * par couple (besoin, artisan) », qui est la règle réelle.
 *
 * C'est aussi la seule forme d'unicité conditionnelle que MongoDB sache
 * appliquer : tout ce qu'on exprimerait en SQL par un `WHERE` dans une
 * contrainte doit passer par là.
 */
SchemaDevis.index(
  { besoin: 1, artisan: 1 },
  {
    unique: true,
    partialFilterExpression: { statut: { $in: [StatutDevis.ENVOYE, StatutDevis.ACCEPTE] } },
    name: 'un_devis_vivant_par_besoin_et_artisan',
  },
);

SchemaDevis.index({ besoin: 1, createdAt: -1 });
SchemaDevis.index({ artisan: 1, createdAt: -1 });
