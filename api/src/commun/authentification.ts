import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { Role } from './types.js';
import type { ContexteGraphQL } from './chargeurs.js';

export const CLE_ROLES = 'roles-exiges';

/**
 * Déclare les rôles autorisés sur une opération. Sans ce décorateur, une
 * opération exige seulement d'être authentifié.
 */
export const Roles = (...roles: Role[]) => SetMetadata(CLE_ROLES, roles);

export const PUBLIC = 'public';
/** Opération accessible sans compte (recherche, consultation d'une fiche). */
export const Public = () => SetMetadata(PUBLIC, true);

/**
 * Le compte authentifié, injecté dans un paramètre de résolveur.
 *
 * Lit le contexte GraphQL, jamais la requête HTTP directement : en GraphQL,
 * `ExecutionContext.switchToHttp()` ne rend pas ce qu'on croit, et le même
 * décorateur écrit pour un contrôleur REST renvoie `undefined` ici — sans
 * erreur. `GqlExecutionContext.create(ctx)` est l'accès correct.
 */
export const CompteConnecte = createParamDecorator((_donnee: unknown, ctx: ExecutionContext) => {
  const contexte = GqlExecutionContext.create(ctx).getContext<ContexteGraphQL>();
  return contexte.compte;
});

@Injectable()
export class GardeAuthentification implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(contexteExecution: ExecutionContext): boolean {
    const estPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC, [
      contexteExecution.getHandler(),
      contexteExecution.getClass(),
    ]);

    const gql = GqlExecutionContext.create(contexteExecution);
    const contexte = gql.getContext<ContexteGraphQL & { entete?: string }>();

    const entete = contexte.entete;
    if (entete?.startsWith('Bearer ')) {
      try {
        const charge = this.jwt.verify<{ sub: string; role: Role }>(entete.slice(7));
        contexte.compte = { id: new Types.ObjectId(charge.sub), role: charge.role };
      } catch {
        // Un jeton expiré ou falsifié ne vaut pas mieux qu'aucun jeton. On ne
        // distingue pas les deux : le message « jeton expiré » renseignerait
        // un attaquant sur la validité de ce qu'il a intercepté.
      }
    }

    if (estPublic) return true;
    if (!contexte.compte) throw new UnauthorizedException('Connexion requise.');

    const rolesExiges = this.reflector.getAllAndOverride<Role[]>(CLE_ROLES, [
      contexteExecution.getHandler(),
      contexteExecution.getClass(),
    ]);
    if (rolesExiges?.length && !rolesExiges.includes(contexte.compte.role as Role)) {
      throw new ForbiddenException('Cette opération ne concerne pas votre type de compte.');
    }

    return true;
  }
}
