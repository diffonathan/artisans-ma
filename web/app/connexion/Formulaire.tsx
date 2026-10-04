'use client';

/**
 * Le formulaire de connexion.
 *
 * ── Pourquoi 'use client' ici, et pas sur la page ─────────────────────────
 * `useActionState` est un hameçon React : il n'existe que côté client. Mais
 * seul le formulaire en a besoin — la page qui l'entoure lit `searchParams`,
 * la session et rend de la prose, toutes choses qui restent sur le serveur.
 * D'où la coupure à cet endroit précis : une page serveur, et ce fragment-ci
 * dans le paquet du navigateur.
 *
 * ── Ce que ce fichier NE contient pas ─────────────────────────────────────
 * Aucune requête, aucune validation, aucune table de messages. La Server
 * Action `connecter` de `app/actions/authentification.ts` fait les trois, et
 * rend un `EtatFormulaire` : les erreurs par champ dans `erreurs`, le refus
 * global dans `message`, et la saisie à réafficher dans `valeurs`. Ce
 * composant ne décide de rien, il affiche.
 *
 * ── L'échec ne vide pas le formulaire ─────────────────────────────────────
 * `defaultValue={etat.valeurs?.email}` et non une valeur contrôlée, et ce
 * n'est pas un raccourci. React 19 réinitialise un formulaire après
 * l'exécution de son action — c'est-à-dire qu'il remet chaque contrôle non
 * contrôlé à son `defaultValue`. Or le re-rendu qui porte le refus a DÉJÀ
 * remplacé ce `defaultValue` par l'adresse que l'API vient de refuser. La
 * réinitialisation retombe donc sur la saisie, et non sur du vide. Les deux
 * chemins mènent au même endroit : si React ne réinitialisait pas, le contrôle
 * garderait simplement ce qui y est écrit.
 *
 * Le mot de passe, lui, repart vide, et c'est voulu : `ouvrirSession` ne le
 * met jamais dans `valeurs`, parce que le réécrire dans le HTML le ferait
 * apparaître dans la source de la page et dans le cache du navigateur. Le
 * raisonnement est au-dessus de `EtatFormulaire`.
 *
 * ── Un seul message pour deux causes ──────────────────────────────────────
 * L'API répond la même phrase pour une adresse inconnue et pour un mot de
 * passe faux, avec le même temps de réponse. Cet écran ne cherche pas à les
 * distinguer : le refus s'affiche en message GLOBAL, au-dessus des deux
 * champs, et non sous l'un d'eux. Le rattacher au champ « adresse »
 * transformerait le formulaire en annuaire des comptes existants.
 */
import { useActionState } from 'react';
import { Alerte } from '@/components/Alerte';
import { Bouton } from '@/components/Bouton';
import { Champ } from '@/components/Champ';
import { connecter } from '@/app/actions/authentification';
import { ETAT_INITIAL } from '@/lib/formulaire';
import type { EtatFormulaire } from '@/lib/formulaire';
import styles from './page.module.css';

/**
 * L'état initial est déclaré ICI et non dans le module des actions : un
 * fichier `'use server'` ne peut exporter que des fonctions asynchrones. Il
 * est figé hors du composant pour que sa référence ne change pas d'un rendu
 * à l'autre.
 */
export interface ProprietesFormulaireConnexion {
  /**
   * Le chemin où revenir après la connexion. Déjà passé par `destinationSure`
   * dans la page ; la Server Action le revalide de toute façon, parce que ce
   * champ caché est modifiable depuis le navigateur.
   */
  suite: string;
}

export function FormulaireConnexion({ suite }: ProprietesFormulaireConnexion) {
  const [etat, envoyer, enAttente] = useActionState(connecter, ETAT_INITIAL);

  return (
    <form className={styles.formulaire} action={envoyer} noValidate>
      {/* `noValidate` : la validation du navigateur affiche ses bulles dans la
          langue du système et hors du flux de la page, là où le serveur rend
          des messages français rattachés au champ par aria-describedby. Avoir
          les deux ferait apparaître deux refus différents pour une saisie. */}

      <input type="hidden" name="suite" value={suite} />

      {etat.message ? (
        /* `Alerte` pose `role="alert"`, qui ne s'annonce que parce que ce
           nœud APPARAÎT après l'envoi ; rendu dès le premier affichage, il
           interromprait la lecture de la page. Même raisonnement que
           `components/Champ.tsx`. */
        <Alerte>{etat.message}</Alerte>
      ) : null}

      <Champ
        nom="email"
        libelle="Adresse électronique"
        type="email"
        /* `email` et non `username` : le gestionnaire de mots de passe du
           navigateur propose alors les adresses déjà enregistrées pour ce
           site, au lieu d'un identifiant qui n'existe pas ici. */
        autoComplete="email"
        inputMode="email"
        /* Deux attributs qui comptent sur un téléphone : sans eux, la première
           lettre de l'adresse arrive en majuscule et l'adresse est refusée. */
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={etat.valeurs?.email ?? ''}
        erreur={etat.erreurs?.email}
      />

      <Champ
        nom="motDePasse"
        libelle="Mot de passe"
        type="password"
        autoComplete="current-password"
        required
        erreur={etat.erreurs?.motDePasse}
      />

      <Bouton type="submit" taille="lg" pleineLargeur enCours={enAttente}>
        {enAttente ? 'Connexion…' : 'Se connecter'}
      </Bouton>
    </form>
  );
}
