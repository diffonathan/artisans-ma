import { z } from 'zod';

/**
 * La configuration est validée AU DÉMARRAGE, pas au premier usage.
 *
 * Une variable d'environnement absente ou mal écrite doit faire échouer le
 * démarrage avec un message qui la nomme — pas provoquer un `undefined` qui
 * traverse trois couches et ressort en « connexion refusée » une heure plus
 * tard, en production.
 */
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),

  /**
   * `directConnection=true` n'est pas un détail de confort.
   *
   * Le replica set s'annonce sous le nom de ses membres — ici
   * `localhost:27017`, vu DE L'INTÉRIEUR du conteneur. Le pilote MongoDB
   * découvre la topologie, lit ce nom, et va s'y connecter. Depuis l'hôte, où
   * le port est publié sur 27018, cette adresse ne répond pas :
   *
   *     connect ECONNREFUSED 127.0.0.1:27017
   *
   * `directConnection=true` demande au pilote de parler à la socket qu'on lui
   * a donnée, sans découverte. Les transactions continuent de fonctionner :
   * c'est l'appartenance du nœud au replica set qui les autorise, pas la
   * façon dont le client s'y connecte.
   */
  MONGO_URI: z
    .string()
    .min(1)
    .default('mongodb://localhost:27018/artisans?directConnection=true'),

  /** Commission de la place de marché, en points de base (250 = 2,50 %). */
  COMMISSION_POINTS_DE_BASE: z.coerce.number().int().min(0).max(10_000).default(800),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /**
   * Les clés du prestataire de paiement — toutes FACULTATIVES, et c'est une
   * décision.
   *
   * Sans elles, l'application démarre avec un prestataire factice : le
   * parcours complet reste jouable, les tests tournent, et quiconque clone le
   * dépôt peut voir fonctionner la place de marché. Les exiger rendrait le
   * projet injouable sans un compte Stripe, pour une démonstration.
   *
   * Le prix est qu'une absence de clé en PRODUCTION passerait inaperçue. D'où
   * l'avertissement au démarrage dans `paiement.module.ts`, et le fait que
   * l'interface dise, à l'écran, que les paiements ne sont pas réels.
   */
  STRIPE_CLE_SECRETE: z.string().optional(),

  /**
   * Le secret de signature des notifications. Sans lui, les notifications
   * sont REFUSÉES plutôt qu'acceptées sans contrôle : le point d'entrée est
   * public, et une notification non vérifiée permet à n'importe qui de
   * déclarer une réservation payée.
   */
  STRIPE_SECRET_NOTIFICATION: z.string().optional(),

  /** Où l'artisan revient après avoir fourni ses pièces chez le prestataire. */
  URL_PUBLIQUE: z.string().default('http://localhost:3100'),
});

export type Configuration = z.infer<typeof schema>;

export const chargerConfiguration = (): Configuration => {
  const resultat = schema.safeParse(process.env);
  if (!resultat.success) {
    const details = resultat.error.issues
      .map((p) => `  ${p.path.join('.')} : ${p.message}`)
      .join('\n');
    throw new Error(`Configuration invalide :\n${details}`);
  }
  return resultat.data;
};
