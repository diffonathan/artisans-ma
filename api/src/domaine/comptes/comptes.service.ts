import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import { Compte, DocumentCompte } from './compte.schema.js';
import { Artisan } from '../artisans/artisan.schema.js';
import { Metier, Role, positionDepuis } from '../../commun/types.js';
import { UniteDeTravail } from '../../base-de-donnees/unite-de-travail.js';
import { empreindre, verifier } from './mot-de-passe.js';

const CLE_EN_DOUBLE = 11000;

export interface EntreeInscription {
  email: string;
  motDePasse: string;
  nom: string;
  telephone?: string;
}

export interface EntreeInscriptionArtisan extends EntreeInscription {
  raisonSociale: string;
  metiers: Metier[];
  ville: string;
  latitude: number;
  longitude: number;
  rayonKm: number;
}

export interface Jeton {
  jeton: string;
  compte: Compte;
}

@Injectable()
export class ComptesService {
  constructor(
    @InjectModel(Compte.name) private readonly comptes: Model<Compte>,
    @InjectModel(Artisan.name) private readonly artisans: Model<Artisan>,
    private readonly jwt: JwtService,
    private readonly uniteDeTravail: UniteDeTravail,
  ) {}

  async inscrireClient(entree: EntreeInscription): Promise<Jeton> {
    const compte = await this.creer(entree, Role.CLIENT);
    return this.emettre(compte);
  }

  /**
   * Inscrit un artisan : un compte ET son profil métier.
   *
   * Les deux dans une transaction. Un compte sans profil serait un artisan
   * qui se connecte et ne peut rien faire — invisible dans les recherches,
   * sans moyen de répondre à un besoin, et sans message pour l'expliquer.
   * C'est le genre d'état intermédiaire qui finit en demande de support.
   */
  async inscrireArtisan(entree: EntreeInscriptionArtisan): Promise<Jeton> {
    const empreinteMotDePasse = await empreindre(entree.motDePasse);

    const compte = await this.uniteDeTravail.executer(async (session) => {
      let cree: DocumentCompte;
      try {
        [cree] = await this.comptes.create(
          [
            {
              email: entree.email,
              empreinteMotDePasse,
              nom: entree.nom,
              telephone: entree.telephone,
              role: Role.ARTISAN,
            },
          ],
          { session },
        );
      } catch (erreur) {
        if ((erreur as { code?: number }).code === CLE_EN_DOUBLE) {
          throw new ConflictException('Un compte existe déjà avec cette adresse.');
        }
        throw erreur;
      }

      await this.artisans.create(
        [
          {
            compte: cree._id,
            raisonSociale: entree.raisonSociale,
            metiers: entree.metiers,
            ville: entree.ville,
            position: positionDepuis(entree.latitude, entree.longitude),
            rayonKm: entree.rayonKm,
          },
        ],
        { session },
      );

      return cree;
    });

    return this.emettre(compte);
  }

  async connecter(email: string, motDePasse: string): Promise<Jeton> {
    const compte = await this.comptes.findOne({ email: email.toLowerCase().trim() });

    // Un seul message, qu'il s'agisse d'un e-mail inconnu ou d'un mot de passe
    // faux. Distinguer les deux transforme le formulaire en annuaire : on peut
    // tester des adresses pour savoir lesquelles ont un compte.
    const refus = new UnauthorizedException('Adresse ou mot de passe incorrect.');
    if (!compte) {
      // Le calcul est quand même fait, sur une empreinte factice. Sans cela,
      // l'absence de compte répond en une milliseconde et sa présence en deux
      // cents : le temps de réponse révèle ce que le message tait.
      await verifier(motDePasse, await empreinteFactice());
      throw refus;
    }
    if (!(await verifier(motDePasse, compte.empreinteMotDePasse))) throw refus;

    return this.emettre(compte);
  }

  private async creer(entree: EntreeInscription, role: Role): Promise<DocumentCompte> {
    const empreinteMotDePasse = await empreindre(entree.motDePasse);
    try {
      return await this.comptes.create({
        email: entree.email,
        empreinteMotDePasse,
        nom: entree.nom,
        telephone: entree.telephone,
        role,
      });
    } catch (erreur) {
      if ((erreur as { code?: number }).code === CLE_EN_DOUBLE) {
        throw new ConflictException('Un compte existe déjà avec cette adresse.');
      }
      throw erreur;
    }
  }

  private emettre(compte: Compte): Jeton {
    return {
      jeton: this.jwt.sign({ sub: String(compte._id), role: compte.role }),
      compte,
    };
  }

  async parIdentifiants(identifiants: readonly Types.ObjectId[]): Promise<Compte[]> {
    return this.comptes
      .find({ _id: { $in: identifiants as Types.ObjectId[] } })
      .select('-empreinteMotDePasse')
      .lean();
  }

  /** Le profil artisan associé à un compte, s'il en a un. */
  async artisanDuCompte(compte: Types.ObjectId): Promise<Artisan | null> {
    return this.artisans.findOne({ compte }).lean();
  }

  /**
   * Les profils artisan de plusieurs comptes, pour le chargeur groupé.
   *
   * La recherche porte sur `compte`, pas sur `_id` : c'est ce qui oblige le
   * chargeur à savoir extraire une autre clé que l'identifiant du document.
   */
  async profilsDesComptes(comptes: readonly Types.ObjectId[]): Promise<Artisan[]> {
    return this.artisans.find({ compte: { $in: comptes as Types.ObjectId[] } }).lean();
  }
}

/**
 * Empreinte d'un mot de passe qui n'existe pas. Sert uniquement à faire passer
 * autant de temps sur un e-mail inconnu que sur un e-mail connu.
 *
 * Calculée à la PREMIÈRE connexion échouée, puis gardée. La calculer au
 * chargement du module ajouterait deux cents millisecondes au démarrage de
 * l'application — et, dans les tests, elle serait calculée au coût de
 * production, avant que l'environnement de test ait pu l'abaisser.
 */
let factice: Promise<string> | null = null;
const empreinteFactice = (): Promise<string> => {
  factice ??= empreindre('aucun-compte-ne-porte-ce-mot-de-passe');
  return factice;
};
