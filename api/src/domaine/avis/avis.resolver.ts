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
import { IsInt, IsMongoId, Length, Max, Min } from 'class-validator';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Types } from 'mongoose';
import { Avis } from './avis.schema.js';
import { AvisService } from './avis.service.js';
import { Compte } from '../comptes/compte.schema.js';
import { Role } from '../../commun/types.js';
import { CompteConnecte, Public, Roles } from '../../commun/authentification.js';
import { versObjectId } from '../../commun/identifiants.js';
import type { ContexteGraphQL } from '../../commun/chargeurs.js';
import { nomDUsage } from '../../commun/nom-d-usage.js';

@InputType()
export class EntreeAvisGql {
  @Field(() => ID)
  @IsMongoId()
  reservation: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(5)
  note: number;

  @Field()
  @Length(10, 2000, {
    message: 'Un avis utile fait au moins dix caractères.',
  })
  commentaire: string;
}

@Resolver(() => Avis)
export class AvisResolver {
  constructor(
    private readonly avis: AvisService,
    @InjectModel(Avis.name) private readonly modele: Model<Avis>,
  ) {}

  @Roles(Role.CLIENT)
  @Mutation(() => Avis, {
    description:
      "Dépose un avis sur une prestation terminée. Le droit d'avis est consommé par " +
      "comparaison-et-échange : deux dépôts simultanés, un seul passe.",
  })
  deposerAvis(
    @Args('entree') entree: EntreeAvisGql,
    @CompteConnecte() connecte: { id: Types.ObjectId },
  ) {
    return this.avis.deposer(
      { ...entree, reservation: versObjectId(entree.reservation, 'reservation') },
      connecte.id,
    );
  }

  @Public()
  @Query(() => [Avis], { description: "Les avis d'un artisan, du plus récent au plus ancien." })
  avisDArtisan(@Args('artisan', { type: () => ID }) artisan: string) {
    return this.modele
      .find({ artisan: versObjectId(artisan, 'artisan') })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
  }

  /**
   * Le nom d'usage de l'auteur : - Fatima B. -.
   *
   * Un avis signé d'un prénom et d'une initiale reste crédible — c'est ce
   * qu'affichent toutes les places de marché — et ne permet pas de retrouver
   * la personne ailleurs. Le compte entier n'est plus exposé du tout sur
   * cette surface, qui est publique.
   */
  @ResolveField(() => String, { description: "Prénom et initiale de l'auteur." })
  async nomAuteur(@Parent() avis: Avis, @Context() ctx: ContexteGraphQL): Promise<string> {
    const compte = await ctx.chargeurs.compte.load(avis.client);
    return nomDUsage(compte?.nom);
  }
}
