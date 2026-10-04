import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import { Besoin } from '../besoins/besoin.schema.js';
import { Devis } from '../devis/devis.schema.js';
import { Artisan } from '../artisans/artisan.schema.js';
import { Compte } from '../comptes/compte.schema.js';

export enum StatutReservation {
  A_PAYER = 'A_PAYER',
  PAYEE = 'PAYEE',
  TERMINEE = 'TERMINEE',
  ANNULEE = 'ANNULEE',
}
registerEnumType(StatutReservation, { name: 'StatutReservation' });

@Schema({ _id: false })
@ObjectType('Creneau')
export class Creneau {
  @Prop({ required: true })
  @Field()
  debut: Date;

  @Prop({ required: true })
  @Field()
  fin: Date;
}

@Schema({ collection: 'reservations', timestamps: true })
@ObjectType('Reservation')
export class Reservation {
  @Field(() => ID)
  _id: Types.ObjectId;

  /**
   * Le devis accepté. Index unique : accepter deux fois le même devis ne peut
   * pas produire deux réservations, même si les deux requêtes arrivent
   * exactement ensemble.
   */
  @Prop({ type: Types.ObjectId, ref: Devis.name, required: true, unique: true })
  devis: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Besoin.name, required: true })
  besoin: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Compte.name, required: true })
  client: Types.ObjectId;

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
  prestataire?: Artisan;

  /**
   * Le montant est RECOPIÉ depuis le devis au moment de l'acceptation, et non
   * lu à travers une référence.
   *
   * Un artisan qui changerait son prix après coup modifierait sinon une
   * réservation déjà payée. La copie fige l'accord : c'est le raisonnement
   * qui fait qu'une ligne de facture porte son prix au lieu de pointer vers
   * un catalogue.
   */
  @Prop({ required: true, min: 1 })
  @Field(() => Int)
  montantCentimes: number;

  /** Part de la place de marché, figée elle aussi au taux du jour. */
  @Prop({ required: true, min: 0 })
  @Field(() => Int)
  commissionCentimes: number;

  @Prop({ type: Creneau, required: true })
  @Field(() => Creneau)
  creneau: Creneau;

  /**
   * L'adresse du chantier, RECOPIÉE depuis le besoin à l'acceptation.
   *
   * Même raisonnement que `montantCentimes` juste au-dessus : la copie fige
   * ce qui a été convenu. Mais elle sert ici une seconde fin, qui est de la
   * confidentialité.
   *
   * Toute réservation qu'un lecteur peut atteindre est une réservation dont
   * il est partie : `mesReservations` ne rend que les siennes, `monPlanning`
   * que celles de son profil, et chaque mutation ne rend que celle qu'elle
   * vient de toucher. Il n'y a aucun chemin par lequel un tiers obtienne une
   * réservation — donc aucun contrôle à écrire pour protéger ce champ. La
   * garantie tient à la forme du schéma, pas à la vigilance du code.
   */
  //
  // `required` SANS `default: ''` : les deux ensemble sont un piège. Le
  // validateur `required` de Mongoose rejette la chaîne vide, donc un défaut
  // à `''` ne remplit jamais rien — il donne seulement l'illusion que le
  // champ est facultatif, jusqu'à ce qu'une écriture échoue sur
  // « Path `adresseIntervention` is required ».
  //
  // L'invariant voulu est qu'une réservation porte TOUJOURS son adresse :
  // sans elle, l'artisan ne sait pas où se présenter. `required` seul le dit,
  // et le dit à la base.
  @Prop({ required: true, trim: true })
  @Field({ description: "Adresse du chantier, figée à l'acceptation du devis." })
  adresseIntervention: string;

  /**
   * Le client, avec ses coordonnées.
   *
   * C'est la contrepartie du retrait de `Besoin.demandeur` : l'artisan a
   * besoin d'un téléphone pour se présenter à l'heure, mais seulement une
   * fois qu'il a remporté le chantier. Avant cela, il ne voit qu'un prénom.
   *
   * Accessoirement, c'est aussi ce qui empêche de contourner la place de
   * marché : les coordonnées n'apparaissent qu'avec la réservation, donc
   * après que la commission est acquise.
   */
  @Field(() => Compte, { nullable: true })
  demandeur?: Compte;

  @Field(() => Besoin, { nullable: true, description: 'Le chantier concerné.' })
  chantier?: Besoin;

  @Prop({
    type: String,
    enum: StatutReservation,
    required: true,
    default: StatutReservation.A_PAYER,
  })
  @Field(() => StatutReservation)
  statut: StatutReservation;

  /**
   * Le « droit de déposer un avis », matérialisé.
   *
   * ── Pourquoi une date et non un booléen ────────────────────────────────
   * `null` signifie « droit disponible » ; une date signifie « droit
   * consommé, à cet instant ». Un booléen dirait la même chose en perdant
   * quand.
   *
   * ── À quoi il sert vraiment ────────────────────────────────────────────
   * MongoDB ne peut pas garantir qu'un avis référence une réservation réelle :
   * il n'y a pas de clé étrangère. Ce champ déplace la garantie là où la base
   * SAIT l'appliquer : déposer un avis commence par faire passer ce champ de
   * `null` à maintenant, en exigeant dans le FILTRE qu'il valait `null`. Deux
   * dépôts simultanés : un seul trouve `null`, l'autre ne trouve rien.
   *
   * Voir `avis.service.ts` pour l'échange effectif, et le README pour ce que
   * cette approche ne garantit toujours pas.
   */
  //
  // `@Field(() => Date, ...)` avec le type ÉCRIT : `emitDecoratorMetadata`
  // réduit toute union à `Object`, et `Date | null` n'y échappe pas. Sans le
  // type explicite, la construction du schéma GraphQL échoue au démarrage —
  // ce qui est la bonne nouvelle : l'erreur nomme le champ.
  @Prop({ type: Date, default: null })
  @Field(() => Date, { nullable: true })
  avisDeposeA: Date | null;

  @Prop({ type: String, default: null })
  referencePaiement: string | null;

  @Field()
  createdAt: Date;
}

export type DocumentReservation = HydratedDocument<Reservation>;
export const SchemaReservation = SchemaFactory.createForClass(Reservation);

SchemaReservation.index({ client: 1, createdAt: -1 });
SchemaReservation.index({ artisan: 1, 'creneau.debut': 1 });
