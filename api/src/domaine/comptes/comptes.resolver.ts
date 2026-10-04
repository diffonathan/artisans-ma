import { Args, Field, InputType, Int, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import {
  ArrayNotEmpty,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Compte } from './compte.schema.js';
import { ComptesService } from './comptes.service.js';
import { Artisan } from '../artisans/artisan.schema.js';
import { Metier } from '../../commun/types.js';
import { CompteConnecte, Public } from '../../commun/authentification.js';
import type { Types } from 'mongoose';

@InputType()
export class EntreeInscriptionClient {
  @Field()
  @IsEmail({}, { message: "L'adresse électronique n'est pas valide." })
  email: string;

  /**
   * Douze caractères au minimum, et aucune règle de composition.
   *
   * Exiger une majuscule, un chiffre et un caractère spécial produit
   * `Password1!` — court, prévisible, et présent dans toutes les listes
   * d'attaque. La longueur est le seul facteur qui résiste vraiment, et c'est
   * la recommandation du NIST depuis 2017 : longueur minimale, pas de règle
   * de composition, pas d'expiration forcée.
   */
  @Field()
  @Length(12, 200, { message: 'Le mot de passe doit faire au moins 12 caractères.' })
  motDePasse: string;

  @Field()
  @Length(2, 120)
  nom: string;

  @Field({ nullable: true })
  @IsOptional()
  @Length(6, 30)
  telephone?: string;
}

@InputType()
export class EntreeInscriptionArtisanGql extends EntreeInscriptionClient {
  @Field()
  @Length(2, 160)
  raisonSociale: string;

  @Field(() => [Metier])
  @ArrayNotEmpty({ message: 'Déclarez au moins un métier.' })
  @IsIn(Object.values(Metier), { each: true })
  metiers: Metier[];

  @Field()
  @Length(2, 80)
  ville: string;

  @Field()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @Field()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(200)
  rayonKm: number;
}

@ObjectType('Session')
export class SessionGql {
  @Field({ description: 'Jeton à présenter dans l’en-tête Authorization: Bearer.' })
  jeton: string;

  @Field(() => Compte)
  compte: Compte;
}

@Resolver(() => Compte)
export class ComptesResolver {
  constructor(private readonly comptes: ComptesService) {}

  @Public()
  @Mutation(() => SessionGql, { description: 'Crée un compte client.' })
  inscrireClient(@Args('entree') entree: EntreeInscriptionClient) {
    return this.comptes.inscrireClient(entree);
  }

  @Public()
  @Mutation(() => SessionGql, {
    description: "Crée un compte artisan ET son profil métier, en une seule transaction.",
  })
  inscrireArtisan(@Args('entree') entree: EntreeInscriptionArtisanGql) {
    return this.comptes.inscrireArtisan(entree);
  }

  @Public()
  @Mutation(() => SessionGql)
  connecter(@Args('email') email: string, @Args('motDePasse') motDePasse: string) {
    return this.comptes.connecter(email, motDePasse);
  }

  @Query(() => Compte, { description: 'Le compte authentifié.' })
  async moi(@CompteConnecte() connecte: { id: Types.ObjectId }) {
    const [compte] = await this.comptes.parIdentifiants([connecte.id]);
    return compte;
  }

  @Query(() => Artisan, {
    nullable: true,
    description: "Le profil artisan du compte authentifié, s'il en a un.",
  })
  monProfilArtisan(@CompteConnecte() connecte: { id: Types.ObjectId }) {
    return this.comptes.artisanDuCompte(connecte.id);
  }
}
