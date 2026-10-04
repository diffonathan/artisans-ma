import {
  Args,
  Context,
  Field,
  Float,
  ID,
  InputType,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { IsEnum, IsInt, IsNumber, IsOptional, Length, Max, Min } from 'class-validator';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import type { Types } from 'mongoose';
import { Besoin } from './besoin.schema.js';
import { BesoinsService } from './besoins.service.js';
import { Devis } from '../devis/devis.schema.js';
import { Compte } from '../comptes/compte.schema.js';
import { Metier, Role } from '../../commun/types.js';
import { CompteConnecte, Public, Roles } from '../../commun/authentification.js';
import { versObjectId } from '../../commun/identifiants.js';
import { ComptesService } from '../comptes/comptes.service.js';
import type { ContexteGraphQL } from '../../commun/chargeurs.js';
import { nomDUsage } from '../../commun/nom-d-usage.js';

@InputType()
export class EntreeBesoinGql {
  @Field(() => Metier)
  @IsEnum(Metier)
  metier: Metier;

  @Field()
  @Length(5, 140)
  titre: string;

  @Field()
  @Length(20, 4000, {
    message: 'Décrivez le chantier en au moins vingt caractères : un artisan chiffre sur ce texte.',
  })
  description: string;

  @Field()
  @Length(5, 240)
  adresse: string;

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

  @Field(() => Int, { nullable: true, description: 'Budget maximal, en centimes.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  budgetMaxCentimes?: number;
}

@Resolver(() => Besoin)
export class BesoinsResolver {
  constructor(
    private readonly besoins: BesoinsService,
    private readonly comptes: ComptesService,
    @InjectModel(Devis.name) private readonly devis: Model<Devis>,
  ) {}

  @Roles(Role.CLIENT)
  @Mutation(() => Besoin, { description: 'Publie un besoin, visible des artisans du secteur.' })
  publierBesoin(
    @Args('entree') entree: EntreeBesoinGql,
    @CompteConnecte() connecte: { id: Types.ObjectId },
  ) {
    return this.besoins.publier(entree, connecte.id);
  }

  @Query(() => [Besoin], { description: 'Mes besoins, du plus récent au plus ancien.' })
  mesBesoins(@CompteConnecte() connecte: { id: Types.ObjectId }) {
    return this.besoins.deClient(connecte.id);
  }

  /**
   * Un besoin par son identifiant.
   *
   * ── Ce champ ÉTAIT public, et c'était une fuite ──────────────────────────
   * Il rendait un `Besoin` dont `adresse` était exposée et dont `demandeur`
   * résolvait un `Compte` entier — e-mail et téléphone compris. N'importe
   * qui, sans jeton, pouvait donc lire les coordonnées d'un client en
   * connaissant un identifiant. Le commentaire de `besoinsPourMoi`, juste en
   * dessous, affirmait pourtant que l'adresse n'était visible que des
   * artisans du secteur : le code disait le contraire de ce que le
   * commentaire promettait.
   *
   * Deux corrections, et non une :
   *   • la lecture exige désormais un compte. Un artisan a besoin de lire un
   *     besoin pour le chiffrer, donc le restreindre davantage casserait le
   *     parcours ; mais un inconnu n'a aucune raison d'y accéder ;
   *   • les champs sensibles sont retirés du schéma et rendus par des
   *     résolveurs qui savent à qui ils parlent (plus bas).
   *
   * La première correction seule n'aurait pas suffi : n'importe quel compte
   * créé en dix secondes aurait moissonné les coordonnées de tous les
   * clients.
   */
  @Query(() => Besoin, { description: 'Un besoin par identifiant. Réservé aux comptes connectés.' })
  besoin(@Args('id', { type: () => ID }) id: string) {
    return this.besoins.parIdentifiant(versObjectId(id));
  }

  /**
   * Les chantiers ouverts dans le rayon de l'artisan connecté.
   *
   * Le rayon n'est pas un paramètre de la requête : il est lu sur le profil.
   * Laisser le client le choisir permettrait à un artisan de voir tous les
   * chantiers du pays en demandant 5 000 km, alors que la promesse faite aux
   * clients est que leur adresse n'est visible que des artisans du secteur.
   */
  @Roles(Role.ARTISAN)
  @Query(() => [Besoin], { description: 'Les chantiers ouverts dans mon rayon.' })
  async besoinsPourMoi(@CompteConnecte() connecte: { id: Types.ObjectId }) {
    const profil = await this.comptes.artisanDuCompte(connecte.id);
    if (!profil) return [];
    return this.besoins.ouvertsPourArtisan(
      profil.metiers,
      {
        latitude: profil.position.coordinates[1],
        longitude: profil.position.coordinates[0],
      },
      profil.rayonKm,
    );
  }

  /**
   * Le demandeur, AVEC ses coordonnées — et donc réservé à lui-même.
   *
   * Un client doit pouvoir relire ce qu'il a saisi. Personne d'autre n'a
   * besoin de son e-mail à ce stade : l'artisan qui veut chiffrer le chantier
   * a la description, le métier et la distance, ce qui suffit pour faire un
   * prix. Les coordonnées n'apparaissent qu'avec la réservation, c'est-à-dire
   * après qu'il a gagné — voir `Reservation.demandeur`.
   *
   * Rend `null` plutôt que de lever : un champ interdit n'est pas une erreur
   * de requête, et faire échouer toute la requête parce qu'un champ facultatif
   * est hors de portée serait disproportionné.
   */
  @ResolveField(() => Compte, {
    nullable: true,
    description: "Le compte du demandeur, avec ses coordonnées. Rendu au seul propriétaire du besoin.",
  })
  demandeur(
    @Parent() besoin: Besoin,
    @Context() ctx: ContexteGraphQL,
  ): Promise<Compte | null> | null {
    if (!ctx.compte || String(ctx.compte.id) !== String(besoin.client)) return null;
    return ctx.chargeurs.compte.load(besoin.client);
  }

  /**
   * Le nom d'usage du demandeur : « Fatima B. ».
   *
   * C'est ce qu'un artisan voit avant d'avoir gagné le chantier. Le prénom
   * suffit à s'adresser à quelqu'un ; le patronyme entier permettrait de le
   * retrouver ailleurs, et n'apporte rien à la décision de chiffrer.
   *
   * Réduction faite côté SERVEUR, pas côté affichage : une troncature faite
   * dans l'interface laisse la donnée entière circuler sur le réseau, où elle
   * se lit dans n'importe quel outil de développement.
   */
  @ResolveField(() => String, { description: "Prénom et initiale du demandeur." })
  async nomDemandeur(@Parent() besoin: Besoin, @Context() ctx: ContexteGraphQL): Promise<string> {
    const compte = await ctx.chargeurs.compte.load(besoin.client);
    return nomDUsage(compte?.nom);
  }

  /**
   * L'adresse exacte, réservée au propriétaire du besoin.
   *
   * L'artisan retenu la lit sur la réservation, où elle a été recopiée à
   * l'acceptation. Voir le commentaire du champ `adresse` dans
   * `besoin.schema.ts` pour la raison de ce détour.
   */
  @ResolveField(() => String, {
    nullable: true,
    description: "Adresse exacte du chantier. Rendue au seul propriétaire ; l'artisan retenu la lit sur la réservation.",
  })
  adresse(@Parent() besoin: Besoin, @Context() ctx: ContexteGraphQL): string | null {
    if (!ctx.compte || String(ctx.compte.id) !== String(besoin.client)) return null;
    return besoin.adresse;
  }

  /**
   * Les devis reçus sur un besoin — et pas tous, pour tout le monde.
   *
   * ── Ce champ n'avait AUCUN contrôle, et c'était grave ────────────────────
   * Il rendait la totalité des devis à quiconque possédait l'identifiant du
   * besoin. Un artisan pouvait donc lire les prix de ses concurrents sur un
   * chantier avant de déposer le sien, et se placer d'un dirham en dessous.
   * Ce n'est pas une fuite de données personnelles : c'est la destruction de
   * la mise en concurrence, c'est-à-dire du produit lui-même.
   *
   * Le contrôle ne pouvait pas être déplacé dans la forme des données, comme
   * il l'a été pour l'adresse : les devis doivent tous rester attachés au
   * même besoin, puisque l'acceptation de l'un refuse les autres dans la même
   * transaction. Ici le contrôle d'habilitation est donc la seule réponse —
   * et c'est pourquoi il est écrit en toutes lettres plutôt que supposé.
   *
   *
   * Ce champ est l'étage qui rend le N+1 intéressant à mesurer : demander dix
   * besoins avec leurs devis et le nom de chaque artisan produit, sans
   * chargeur, 1 + 10 + (10 × n) requêtes. Les devis sont groupés par un
   * chargeur ci-dessous ; l'artisan de chaque devis par le chargeur `artisan`.
   */
  @ResolveField(() => [Devis])
  async devisRecus(
    @Parent() besoin: Besoin,
    @Context() ctx: ContexteGraphQL,
  ): Promise<Devis[]> {
    if (!ctx.compte) return [];

    // Le client propriétaire voit tout : c'est son écran de décision, et la
    // comparaison des offres EST la fonction du produit.
    if (String(ctx.compte.id) === String(besoin.client)) {
      return this.devis.find({ besoin: besoin._id }).sort({ montantCentimes: 1 }).lean();
    }

    // Un artisan ne voit que le sien. Le filtre porte sur son profil, donc un
    // compte sans profil artisan ne voit rien — et c'est bien le cas d'un
    // autre client, qui n'a rien à faire là.
    const profil = await ctx.chargeurs.profilDuCompte.load(ctx.compte.id);
    if (!profil) return [];

    return this.devis.find({ besoin: besoin._id, artisan: profil._id }).lean();
  }
}
