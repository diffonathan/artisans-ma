import {
  Args,
  Context,
  Field,
  Float,
  ID,
  InputType,
  Int,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { IsBoolean, IsEnum, IsInt, IsMongoId, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Artisan } from './artisan.schema.js';
import { ArtisansService } from './artisans.service.js';
import { Compte } from '../comptes/compte.schema.js';
import { Metier } from '../../commun/types.js';
import { Public } from '../../commun/authentification.js';
import { versObjectId } from '../../commun/identifiants.js';
import type { ContexteGraphQL } from '../../commun/chargeurs.js';

/**
 * ── Un piège de `ValidationPipe` qui coûte une heure ────────────────────────
 *
 * Le tube est réglé avec `whitelist` et `forbidNonWhitelisted`. Or la liste
 * blanche n'est PAS le schéma GraphQL : elle est constituée des propriétés
 * qui portent au moins un décorateur de class-validator.
 *
 * Un champ déclaré avec `@Field()` mais sans décorateur de validation n'en
 * fait donc pas partie. Avec `whitelist` seul, il est silencieusement retiré
 * de l'entrée — la requête réussit avec un champ manquant. Avec
 * `forbidNonWhitelisted`, elle est refusée par un « Bad Request Exception »
 * qui ne nomme pas le champ coupable.
 *
 * D'où la règle tenue dans tous les types d'entrée de ce projet : CHAQUE
 * champ porte un décorateur de validation, même quand GraphQL contraint déjà
 * son type. Un `@IsEnum` sur un champ typé par une énumération GraphQL est
 * redondant à la lecture, et nécessaire à l'exécution.
 */
@InputType()
export class EntreeRecherche {
  @Field(() => Metier)
  @IsEnum(Metier)
  metier: Metier;

  @Field(() => Float)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @Field(() => Float)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  verifieSeulement?: boolean;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  noteMinimale?: number;

  @Field(() => Int, { nullable: true, defaultValue: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;

  @Field(() => ID, {
    nullable: true,
    description: 'Dernier identifiant de la page précédente (pagination par curseur).',
  })
  @IsOptional()
  @IsMongoId()
  apres?: string;
}

@Resolver(() => Artisan)
export class ArtisansResolver {
  constructor(private readonly artisans: ArtisansService) {}

  @Public()
  @Query(() => [Artisan], {
    description:
      "Les artisans qui acceptent d'intervenir à la position donnée — selon LEUR rayon, " +
      'pas selon un rayon imposé par la recherche.',
  })
  rechercherArtisans(@Args('entree') entree: EntreeRecherche) {
    return this.artisans.rechercher({
      metier: entree.metier,
      position: { latitude: entree.latitude, longitude: entree.longitude },
      verifieSeulement: entree.verifieSeulement,
      noteMinimale: entree.noteMinimale,
      limite: entree.limite,
      apres: entree.apres ? versObjectId(entree.apres, 'apres') : undefined,
    });
  }

  @Public()
  @Query(() => Artisan, { description: "La fiche d'un artisan, par identifiant." })
  artisan(@Args('id', { type: () => ID }) id: string) {
    return this.artisans.parIdentifiant(versObjectId(id));
  }

  /**
   * Le titulaire du compte, résolu par chargeur groupé.
   *
   * Ce champ est la démonstration du problème N+1 : une recherche qui rend 20
   * artisans appellerait ce résolveur 20 fois, donc 20 requêtes, pour une
   * seule requête de liste. Le chargeur attend la fin du tour d'événements,
   * rassemble les 20 identifiants et n'envoie qu'un seul `$in`.
   *
   * Le test `n-plus-un.spec.ts` COMPTE les commandes envoyées au serveur pour
   * le montrer, au lieu de l'affirmer.
   */
  @ResolveField(() => Compte, { nullable: true })
  titulaire(@Parent() artisan: Artisan, @Context() ctx: ContexteGraphQL) {
    return ctx.chargeurs.compte.load(artisan.compte);
  }
}
