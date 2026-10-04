'use server';

/* ══════════════════════════════════════════════════════════════════════════
   S'INSCRIRE, SE CONNECTER, SE DÉCONNECTER

   Quatre Server Actions, et une forme de retour commune faite pour
   `useActionState` : un objet, jamais une exception. Une action qui lève
   affiche la frontière d'erreur la plus proche — c'est-à-dire qu'un mot de
   passe trop court effacerait le formulaire et tout ce que le visiteur venait
   d'y saisir. Le refus est donc une VALEUR DE RETOUR, et la frontière
   d'erreur reste réservée à ce qui est vraiment imprévu.

   ── Pourquoi valider ici, alors que l'API valide déjà ──────────────────────

   Non par défiance : l'API valide, et c'est sa validation qui compte. Mais sa
   réponse de refus ne dit pas QUEL champ est en cause. Le `ValidationPipe`
   construit une `BadRequestException` avec le tableau des phrases de
   class-validator, et le `formatError` de l'API ne garde que trois champs —
   le tableau n'en fait pas partie. Il arrive donc ici
   « Bad Request Exception », et rien d'autre. Le raisonnement complet est
   dans `ErreurApi`, au-dessus de `lib/graphql.ts`.

   D'où une validation locale dont les messages recopient ceux des décorateurs
   de l'API (`api/src/domaine/comptes/comptes.resolver.ts`) : même seuil, même
   phrase. Elle n'autorise rien — ce qu'elle laisse passer, l'API peut encore
   le refuser, et son refus s'affiche alors comme message global.

   ── Après la mutation : `updateTag`, et pas `revalidateTag` ────────────────

   Le cookie posé, tout ce qui dépend du compte doit changer d'un coup. En
   Next 16 :

     • `revalidateTag(etiquette, profil)` exige un second argument et fait du
       « périmé pendant qu'on rafraîchit » : le rendu qui accompagne la
       réponse de l'action N'ATTEND PAS la donnée fraîche. Appliqué à une
       connexion, il afficherait l'en-tête du visiteur anonyme juste après que
       le visiteur s'est identifié.

     • `updateTag(etiquette)` expire immédiatement : la lecture suivante
       attend la donnée fraîche. C'est la sémantique « je lis ce que je viens
       d'écrire », et c'est celle qu'il faut ici. Réservée aux Server Actions.

     • `refresh()` rafraîchit le routeur client sans toucher au cache de
       données. C'est l'outil de la déconnexion, où rien n'est à réactualiser
       côté serveur : il faut seulement que la page affichée cesse de montrer
       un état qui n'existe plus.

   Lu dans `01-getting-started/07-mutating-data.md`, `02-guides/server-actions.md`
   et `03-api-reference/04-functions/updateTag.md`.
   ══════════════════════════════════════════════════════════════════════════ */

import { refresh, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';

import { appelerGraphQL } from '@/lib/graphql';
import { METIERS } from '@/lib/domaine';
import type { Metier } from '@/lib/domaine';
import { phraseDErreur } from '@/lib/erreurs';
import { destinationSure } from '@/lib/destination';
import type { EtatFormulaire } from '@/lib/formulaire';
import { ETIQUETTE_SESSION, effacerSession, poserSession } from '@/lib/session';

/* ── Lecture et validation des champs ───────────────────────────────────── */

const texte = (donnees: FormData, champ: string): string => {
  const valeur = donnees.get(champ);
  return typeof valeur === 'string' ? valeur.trim() : '';
};

/**
 * Contrôle de forme, volontairement grossier.
 *
 * La seule façon de savoir qu'une adresse existe est de lui écrire. Une
 * expression rationnelle plus stricte refuserait des adresses valides — les
 * domaines marocains à plusieurs niveaux, les signes `+` de catégorisation —
 * pour n'attraper que des fautes de frappe que ce motif attrape déjà.
 */
const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const LONGUEUR_MOT_DE_PASSE = 12;

/**
 * Valide les quatre champs communs au client et à l'artisan, en écrivant dans
 * `erreurs`. Les phrases sont celles des décorateurs de l'API.
 */
const validerCompte = (
  donnees: FormData,
  erreurs: Record<string, string>,
): { email: string; motDePasse: string; nom: string; telephone: string } => {
  const email = texte(donnees, 'email').toLowerCase();
  const motDePasse = texte(donnees, 'motDePasse');
  const nom = texte(donnees, 'nom');
  const telephone = texte(donnees, 'telephone');

  if (!ADRESSE.test(email)) erreurs.email = "L'adresse électronique n'est pas valide.";

  // Le mot de passe n'est pas `trim()`é à la validation de longueur par
  // hasard : `texte` l'a déjà fait, et c'est exprès. Un espace collé par un
  // copier-coller depuis un gestionnaire de mots de passe compterait sinon
  // comme un caractère ici, et l'API — qui ne rogne pas — refuserait la
  // connexion suivante sans que rien n'explique pourquoi.
  if (motDePasse.length < LONGUEUR_MOT_DE_PASSE) {
    erreurs.motDePasse = `Le mot de passe doit faire au moins ${LONGUEUR_MOT_DE_PASSE} caractères.`;
  } else if (motDePasse.length > 200) {
    erreurs.motDePasse = 'Le mot de passe ne peut pas dépasser 200 caractères.';
  }

  if (nom.length < 2 || nom.length > 120) {
    erreurs.nom = 'Indiquez votre nom (2 à 120 caractères).';
  }

  if (telephone && (telephone.length < 6 || telephone.length > 30)) {
    erreurs.telephone = 'Le numéro de téléphone doit faire entre 6 et 30 caractères.';
  }

  return { email, motDePasse, nom, telephone };
};

const nombre = (donnees: FormData, champ: string): number | null => {
  const brut = texte(donnees, champ);
  if (brut === '') return null;
  // `Number` et non `parseFloat` : `parseFloat('31,5')` rend 31 en silence,
  // là où `Number` rend NaN. Sur une latitude, la première forme déplace le
  // chantier de cinquante kilomètres sans aucun message.
  const valeur = Number(brut);
  return Number.isFinite(valeur) ? valeur : null;
};

/* ── Destination après authentification ─────────────────────────────────── */


/* ── Les mutations, telles que `api/schema.graphql` les déclare ──────────── */

const MUTATION_INSCRIRE_CLIENT = `
  mutation InscrireClient($entree: EntreeInscriptionClient!) {
    inscrireClient(entree: $entree) { jeton }
  }
`;

const MUTATION_INSCRIRE_ARTISAN = `
  mutation InscrireArtisan($entree: EntreeInscriptionArtisanGql!) {
    inscrireArtisan(entree: $entree) { jeton }
  }
`;

const MUTATION_CONNECTER = `
  mutation Connecter($email: String!, $motDePasse: String!) {
    connecter(email: $email, motDePasse: $motDePasse) { jeton }
  }
`;

interface ReponseSession {
  jeton: string;
}

/**
 * Le tronc commun des trois actions qui ouvrent une session : appeler l'API,
 * poser le cookie, expirer le cache du compte.
 *
 * Rend `null` en cas de succès — l'appelant redirige alors — et un
 * `EtatFormulaire` en cas de refus. Le `redirect` n'est PAS fait ici : il lève
 * une exception de contrôle de flux que le `try` ci-dessous attraperait, et
 * l'action rendrait un message d'erreur au lieu de naviguer.
 */
const ouvrirSession = async (
  requete: string,
  champ: string,
  variables: Record<string, unknown>,
  valeurs: Record<string, string>,
): Promise<EtatFormulaire | null> => {
  let jeton: string;
  try {
    const donnees = await appelerGraphQL<Record<string, ReponseSession>>(requete, { variables });
    jeton = donnees[champ].jeton;
  } catch (erreur) {
    // Le message de l'API est affiché tel quel, et comme message GLOBAL.
    //
    // Le rattacher à un champ demanderait de deviner lequel en lisant la
    // phrase, et la phrase est parfois ambiguë À DESSEIN : « Adresse ou mot de
    // passe incorrect. » est volontairement unique pour les deux cas, sinon le
    // formulaire devient un annuaire des comptes existants. L'afficher sous le
    // champ « adresse » trahirait l'intention de l'API.
    return { message: phraseDErreur(erreur), valeurs };
  }

  await poserSession(jeton);
  updateTag(ETIQUETTE_SESSION);
  return null;
};

/* ── Les actions ────────────────────────────────────────────────────────── */

/**
 * Inscription d'un particulier.
 *
 * Champs attendus : `email`, `motDePasse`, `nom`, `telephone` (optionnel),
 * `suite` (champ caché, optionnel).
 */
export const inscrireClient = async (
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> => {
  const erreurs: Record<string, string> = {};
  const { email, motDePasse, nom, telephone } = validerCompte(donnees, erreurs);
  const valeurs = { email, nom, telephone };

  if (Object.keys(erreurs).length > 0) return { erreurs, valeurs };

  const refus = await ouvrirSession(
    MUTATION_INSCRIRE_CLIENT,
    'inscrireClient',
    {
      entree: {
        email,
        motDePasse,
        nom,
        // `undefined` et non `''` : le champ est `@IsOptional()` côté API, et
        // une chaîne vide échouerait sur `@Length(6, 30)` — refus d'une
        // inscription parfaitement valide, pour un champ laissé vide.
        telephone: telephone || undefined,
      },
    },
    valeurs,
  );
  if (refus) return refus;

  redirect(destinationSure(texte(donnees, 'suite')));
};

/**
 * Inscription d'un artisan : compte et profil métier, en une transaction côté
 * API.
 *
 * Champs attendus, en plus de ceux du client : `raisonSociale`, `metiers`
 * (plusieurs valeurs), `ville`, `latitude`, `longitude`, `rayonKm`.
 */
export const inscrireArtisan = async (
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> => {
  const erreurs: Record<string, string> = {};
  const { email, motDePasse, nom, telephone } = validerCompte(donnees, erreurs);

  const raisonSociale = texte(donnees, 'raisonSociale');
  const ville = texte(donnees, 'ville');
  const latitude = nombre(donnees, 'latitude');
  const longitude = nombre(donnees, 'longitude');
  const rayonKm = nombre(donnees, 'rayonKm');

  // `getAll` et non `get` : une liste de métiers à choix multiple envoie
  // autant d'entrées que de cases cochées sous le même nom. `get` n'en
  // rendrait que la première, et l'artisan perdrait tous ses métiers sauf un.
  const metiers = donnees
    .getAll('metiers')
    .filter((valeur): valeur is string => typeof valeur === 'string');

  if (raisonSociale.length < 2 || raisonSociale.length > 160) {
    erreurs.raisonSociale = "Indiquez le nom de l'entreprise (2 à 160 caractères).";
  }
  if (ville.length < 2 || ville.length > 80) {
    erreurs.ville = 'Indiquez la ville (2 à 80 caractères).';
  }
  if (metiers.length === 0) {
    erreurs.metiers = 'Déclarez au moins un métier.';
  } else if (!metiers.every((metier): metier is Metier => METIERS.includes(metier as Metier))) {
    // Un métier hors liste ne vient pas d'un formulaire : il vient d'une
    // requête fabriquée. La phrase reste sobre, il n'y a personne à aider.
    erreurs.metiers = "L'un des métiers choisis n'existe pas.";
  }

  // La position n'est pas saisie à la main : elle vient du point posé sur la
  // carte. Un message qui parlerait de degrés décimaux n'aiderait personne ;
  // celui-ci dit quel geste refaire.
  const positionValide =
    latitude !== null &&
    longitude !== null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;
  if (!positionValide) erreurs.latitude = 'Placez votre atelier sur la carte.';

  if (rayonKm === null || !Number.isInteger(rayonKm) || rayonKm < 1 || rayonKm > 200) {
    erreurs.rayonKm = "Indiquez jusqu'à combien de kilomètres vous vous déplacez (1 à 200).";
  }

  const valeurs = {
    email,
    nom,
    telephone,
    raisonSociale,
    ville,
    latitude: latitude === null ? '' : String(latitude),
    longitude: longitude === null ? '' : String(longitude),
    rayonKm: rayonKm === null ? '' : String(rayonKm),
  };

  if (Object.keys(erreurs).length > 0) return { erreurs, valeurs };

  const refus = await ouvrirSession(
    MUTATION_INSCRIRE_ARTISAN,
    'inscrireArtisan',
    {
      entree: {
        email,
        motDePasse,
        nom,
        telephone: telephone || undefined,
        raisonSociale,
        metiers,
        ville,
        latitude,
        longitude,
        rayonKm,
      },
    },
    valeurs,
  );
  if (refus) return refus;

  redirect(destinationSure(texte(donnees, 'suite')));
};

/**
 * Connexion.
 *
 * Champs attendus : `email`, `motDePasse`, `suite` (champ caché, optionnel).
 *
 * La validation est ici plus légère qu'à l'inscription, et volontairement :
 * refuser localement un mot de passe de onze caractères dirait à qui tente des
 * mots de passe qu'il n'a pas la bonne longueur. Seule l'adresse est contrôlée
 * dans sa forme, parce qu'une faute de frappe visible vaut mieux qu'un
 * aller-retour.
 */
export const connecter = async (
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> => {
  const email = texte(donnees, 'email').toLowerCase();
  const motDePasse = texte(donnees, 'motDePasse');
  const valeurs = { email };

  const erreurs: Record<string, string> = {};
  if (!ADRESSE.test(email)) erreurs.email = "L'adresse électronique n'est pas valide.";
  if (motDePasse.length === 0) erreurs.motDePasse = 'Saisissez votre mot de passe.';
  if (Object.keys(erreurs).length > 0) return { erreurs, valeurs };

  const refus = await ouvrirSession(
    MUTATION_CONNECTER,
    'connecter',
    { email, motDePasse },
    valeurs,
  );
  if (refus) return refus;

  redirect(destinationSure(texte(donnees, 'suite')));
};

/**
 * Déconnexion.
 *
 * Pas de `redirect` : l'action rafraîchit la page où l'on se trouve. Si elle
 * est publique, le visiteur y reste et la voit simplement en anonyme ; si elle
 * est privée, son `exigerSession` ne trouve plus de session au nouveau rendu
 * et renvoie vers la connexion de lui-même. Un `redirect('/')` forcé ferait
 * perdre sa place à quelqu'un qui se déconnecte depuis une fiche d'artisan.
 *
 * `updateTag` expire les données du compte ; `refresh` rafraîchit le routeur
 * client, qui garde des données dynamiques que `updateTag` ne touche pas.
 */
export const deconnecter = async (): Promise<void> => {
  await effacerSession();
  updateTag(ETIQUETTE_SESSION);
  refresh();
};
