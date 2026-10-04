import {
  Args,
  Context,
  Field,
  ID,
  InputType,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { IsDate, IsInt, IsMongoId, Length, Max, Min } from 'class-validator';
import type { Types } from 'mongoose';
import { Devis } from './devis.schema.js';
import { DevisService } from './devis.service.js';
import { Artisan } from '../artisans/artisan.schema.js';
import { Besoin } from '../besoins/besoin.schema.js';
import { Reservation } from '../reservations/reservation.schema.js';
import { Role } from '../../commun/types.js';
import { CompteConnecte, Roles } from '../../commun/authentification.js';
import { versObjectId } from '../../commun/identifiants.js';
import { ComptesService } from '../comptes/comptes.service.js';
import type { ContexteGraphQL } from '../../commun/chargeurs.js';
import { ForbiddenException } from '@nestjs/common';

@InputType()
export class EntreeDevisGql {
  @Field(() => ID)
  @IsMongoId()
  besoin: string;

  @Field(() => Int, { description: 'Montant total, en centimes.' })
  @IsInt()
  @Min(1)
  montantCentimes: number;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(365)
  delaiJours: number;

  @Field()
  @Length(10, 2000)
  message: string;
}

@InputType()
export class EntreeCreneau {
  @Field()
  @IsDate()
  debut: Date;

  @Field()
  @IsDate()
  fin: Date;
}

@Resolver(() => Devis)
export class DevisResolver {
  constructor(
    private readonly devis: DevisService,
    private readonly comptes: ComptesService,
  ) {}

  @Roles(Role.ARTISAN)
  @Mutation(() => Devis, { description: 'Propose un devis sur un besoin ouvert.' })
  async proposerDevis(
    @Args('entree') entree: EntreeDevisGql,
    @CompteConnecte() connecte: { id: Types.ObjectId },
  ) {
    const profil = await this.profil(connecte.id);
    return this.devis.proposer(
      { ...entree, besoin: versObjectId(entree.besoin, 'besoin') },
      profil._id,
    );
  }

  @Roles(Role.ARTISAN)
  @Mutation(() => Devis, { description: 'Retire son devis — libère la place pour un autre.' })
  async retirerDevis(
    @Args('id', { type: () => ID }) id: string,
    @CompteConnecte() connecte: { id: Types.ObjectId },
  ) {
    const profil = await this.profil(connecte.id);
    return this.devis.retirer(versObjectId(id), profil._id);
  }

  @Roles(Role.CLIENT)
  @Mutation(() => Reservation, {
    description:
      'Accepte un devis : refuse les autres, attribue le besoin et crée la réservation — ' +
      'les quatre écritures dans une seule transaction.',
  })
  accepterDevis(
    @Args('id', { type: () => ID }) id: string,
    @Args('creneau') creneau: EntreeCreneau,
    @CompteConnecte() connecte: { id: Types.ObjectId },
  ) {
    return this.devis.accepter(versObjectId(id), connecte.id, creneau);
  }

  @Roles(Role.ARTISAN)
  @Query(() => [Devis], {
    description: 'Mes devis envoyés, du plus récent au plus ancien.',
  })
  async mesDevis(@CompteConnecte() connecte: { id: Types.ObjectId }) {
    const profil = await this.comptes.artisanDuCompte(connecte.id);
    if (!profil) return [];
    return this.devis.dArtisan(profil._id);
  }

  @ResolveField(() => Artisan, { nullable: true })
  auteur(@Parent() devis: Devis, @Context() ctx: ContexteGraphQL) {
    return ctx.chargeurs.artisan.load(devis.artisan);
  }

  /** Le chantier chiffré, par chargeur groupé. */
  @ResolveField(() => Besoin, { nullable: true })
  chantier(@Parent() devis: Devis, @Context() ctx: ContexteGraphQL) {
    return ctx.chargeurs.besoin.load(devis.besoin);
  }

  private async profil(compte: Types.ObjectId) {
    const profil = await this.comptes.artisanDuCompte(compte);
    if (!profil) {
      throw new ForbiddenException(
        "Votre compte n'a pas de profil artisan — impossible de proposer un devis.",
      );
    }
    return profil;
  }
}
