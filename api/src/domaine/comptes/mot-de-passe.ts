import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  motDePasse: string,
  sel: Buffer,
  longueur: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Paramètres de scrypt.
 *
 * `N` est le coût mémoire ; chaque doublement double le travail de l'attaquant
 * ET le nôtre. 2^16 demande environ 64 Mio et, sur une machine de bureau,
 * **220 ms mesurées** — le compromis recommandé par l'OWASP pour scrypt.
 *
 * `maxmem` doit être relevé explicitement : la valeur par défaut de Node est
 * de 32 Mio, et l'appel échoue avec « memory limit exceeded » dès que N
 * dépasse 2^15. L'erreur ne dit pas qu'il faut lever le plafond.
 *
 * ══ Pourquoi ce coût est réglable ══════════════════════════════════════════
 *
 * 220 ms par mot de passe est le bon prix en production : c'est précisément ce
 * qui rend une attaque par dictionnaire inintéressante.
 *
 * C'est un prix absurde dans une suite de tests. Celle de ce projet crée une
 * soixantaine de comptes — un client et un artisan par scénario — soit plus de
 * treize secondes passées à calculer des empreintes dont aucun test ne vérifie
 * la solidité. Mesuré : la suite est passée de 39 s à 244 s le jour où les
 * tests du N+1 ont ajouté une soixantaine d'inscriptions.
 *
 * Le coût est donc lu dans l'environnement, et les tests l'abaissent. Ce n'est
 * pas un contournement : c'est la même pratique que `BCRYPT_ROUNDS=4` dans un
 * environnement de test Laravel, et elle est sûre pour deux raisons.
 *
 *   1. L'empreinte PORTE SES PARAMÈTRES (`scrypt$N$r$p$sel$empreinte`). Une
 *      empreinte calculée à coût réduit se vérifie sans rien savoir du
 *      réglage courant, et inversement. Rien ne casse en changeant le coût.
 *
 *   2. Le coût de production reste exercé par un test, UNE fois, qui mesure
 *      explicitement l'empreinte à 2^16 — voir `paiement-et-mots-de-passe`.
 *      Baisser le coût partout sans jamais éprouver le vrai paramètre serait,
 *      là, un contournement.
 */
const COUT_PAR_DEFAUT = 16;
const R = 8;
const P = 1;
const LONGUEUR = 64;

/**
 * La lecture est PARESSEUSE, et non faite au chargement du module.
 *
 * Évaluée à l'import, elle dépendrait de l'ordre dans lequel les modules se
 * chargent : un test qui pose `SCRYPT_COUT_LOG2` dans sa préparation
 * arriverait après l'import de ce fichier, et le réglage serait ignoré — sans
 * erreur, simplement sans effet. C'est le genre de dépendance à l'ordre qui
 * se répare en déplaçant un import, donc qui se recasse à la première
 * réorganisation.
 *
 * Mémoïsée, parce que relire l'environnement est gratuit mais le faire une
 * fois suffit, et parce que le coût doit rester stable pendant l'exécution.
 */
let coutMemoise: number | null = null;
const cout = (): number => {
  if (coutMemoise !== null) return coutMemoise;
  const brut = Number(process.env.SCRYPT_COUT_LOG2);
  // Entre 2^12 (~15 ms, suffisant pour des tests) et 2^20 (~4 s, inutilisable
  // en ligne). Hors de cette plage, on revient au défaut plutôt que de laisser
  // une variable mal écrite affaiblir les mots de passe en silence.
  coutMemoise = Number.isInteger(brut) && brut >= 12 && brut <= 20 ? brut : COUT_PAR_DEFAUT;
  return coutMemoise;
};

/**
 * Pourquoi scrypt et non bcrypt ou argon2.
 *
 * Les deux autres sont d'excellents choix, et argon2 est le plus récent. Mais
 * tous deux sont des modules natifs : ils se compilent à l'installation, et
 * cette compilation échoue régulièrement selon la machine — outils de build
 * absents sous Windows, version de Node trop neuve, image Docker sans gcc.
 *
 * scrypt est dans la bibliothèque standard de Node, normalisé (RFC 7914), et
 * memory-hard comme les deux autres. Il n'ajoute aucune dépendance, donc
 * aucune installation ne peut échouer à cause de lui.
 *
 * Le format stocké est auto-descriptif : `scrypt$N$r$p$sel$empreinte`. Il
 * contient ses propres paramètres, ce qui permet de les durcir plus tard sans
 * invalider les mots de passe existants — on vérifie avec les paramètres
 * écrits dans l'empreinte, et l'on réécrit au prochain succès.
 */
export const empreindre = async (
  motDePasse: string,
  /** Permet au test du coût de production de l'exercer explicitement. */
  n: number = 2 ** cout(),
): Promise<string> => {
  const sel = randomBytes(16);
  const empreinte = await scryptAsync(motDePasse.normalize('NFKC'), sel, LONGUEUR, {
    N: n,
    r: R,
    p: P,
    maxmem: 128 * n * R * 2,
  });
  return ['scrypt', n, R, P, sel.toString('base64'), empreinte.toString('base64')].join('$');
};

/** Le coût effectivement utilisé, pour que les tests puissent l'affirmer. */
export const coutActuel = () => ({ N: 2 ** cout(), log2: cout() });

/** Le coût retenu en l'absence de réglage — celui de la production. */
export const COUT_DE_PRODUCTION = 2 ** COUT_PAR_DEFAUT;

export const verifier = async (motDePasse: string, stocke: string): Promise<boolean> => {
  const parties = stocke.split('$');
  if (parties.length !== 6 || parties[0] !== 'scrypt') return false;

  const [, n, r, p, selB64, attendueB64] = parties;
  const sel = Buffer.from(selB64, 'base64');
  const attendue = Buffer.from(attendueB64, 'base64');

  const calculee = await scryptAsync(motDePasse.normalize('NFKC'), sel, attendue.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 128 * Number(n) * Number(r) * 2,
  });

  // Comparaison à temps constant. Un `===` sur deux chaînes s'arrête au
  // premier octet différent : le temps de réponse renseigne alors sur le
  // nombre d'octets corrects, et permet de reconstruire l'empreinte octet
  // par octet. L'attaque est théorique sur un réseau, gratuite à éviter.
  return calculee.length === attendue.length && timingSafeEqual(calculee, attendue);
};
