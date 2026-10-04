import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * Convertit un identifiant reçu de l'extérieur en `ObjectId`.
 *
 * ── Pourquoi ne pas appeler `new Types.ObjectId(x)` directement ─────────────
 * Le constructeur lève une `BSONError`, qui n'est pas une exception HTTP. Sans
 * traduction, NestJS la transforme en « Internal server error » 500 : une
 * faute de frappe du client devient une panne du serveur dans les journaux,
 * et les vraies pannes se noient dedans.
 *
 * Deuxième raison, moins visible : `new Types.ObjectId('clients')` ne lève
 * PAS. Toute chaîne de 12 octets est un ObjectId valide, parce que douze
 * octets sont exactement ce qu'un ObjectId contient. La chaîne est donc
 * acceptée, convertie en un identifiant qui ne désigne rien, et la requête
 * répond « introuvable » au lieu de « identifiant invalide ».
 *
 * `isValid` seul ne suffit pas non plus : il accepte lui aussi les chaînes de
 * 12 caractères. Le contrôle exact est la forme hexadécimale sur 24
 * caractères, qui est la seule que l'API émet.
 */
export const versObjectId = (valeur: string, champ = 'identifiant'): Types.ObjectId => {
  if (!/^[0-9a-fA-F]{24}$/.test(valeur)) {
    throw new BadRequestException(`Le champ « ${champ} » n'est pas un identifiant valide.`);
  }
  return new Types.ObjectId(valeur);
};
