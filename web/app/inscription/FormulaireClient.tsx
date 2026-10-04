'use client';

/**
 * L'inscription d'un particulier : quatre champs, dont un facultatif.
 *
 * ── Pourquoi si peu de champs ─────────────────────────────────────────────
 * Parce que l'API n'en demande pas plus (`EntreeInscriptionClient` :
 * `email`, `motDePasse`, `nom`, `telephone?`). L'adresse du chantier n'est
 * PAS demandée ici : elle appartient au besoin, pas au compte. Un particulier
 * qui déménage ne change pas de compte, et surtout — c'est la règle de
 * confidentialité du projet — une adresse recopiée sur un compte serait lue
 * par tout écran qui affiche ce compte, alors que l'adresse d'un chantier
 * n'est lue que par son propriétaire et par l'artisan retenu.
 *
 * ── Le mot de passe, expliqué AVANT le refus ──────────────────────────────
 * Douze caractères, et aucune règle de composition. La règle est écrite sous
 * le champ, en permanence : la faire découvrir par un message d'erreur coûte
 * un aller-retour et une saisie perdue à chaque inscription. L'aide dit aussi
 * ce que la contrainte autorise — quatre mots ordinaires —, sans quoi
 * « douze caractères » se lit comme « inventez quelque chose d'imprononçable ».
 *
 * ── Ce que fait `useActionState`, et ce qu'il ne fait pas ─────────────────
 * Il garde la saisie à travers un refus : `inscrireClient` rend les valeurs
 * dans `etat.valeurs`, que les `defaultValue` ci-dessous réaffichent. Le
 * mécanisme exact — React 19 réinitialise le formulaire après l'action, donc
 * vers le `defaultValue` déjà remplacé par le re-rendu — est détaillé dans
 * `app/connexion/Formulaire.tsx`, qui en dépend de la même façon.
 *
 * Le mot de passe n'est jamais réaffiché : la Server Action ne le met pas
 * dans `valeurs`, et c'est volontaire.
 */
import { useActionState } from 'react';
import { Alerte } from '@/components/Alerte';
import { Bouton } from '@/components/Bouton';
import { Champ } from '@/components/Champ';
import { inscrireClient } from '@/app/actions/authentification';
import { ETAT_INITIAL } from '@/lib/formulaire';
import styles from './page.module.css';

/** Déclaré ici : un module `'use server'` n'exporte que des fonctions. */
export interface ProprietesFormulaireClient {
  /** Le chemin où revenir après l'inscription, déjà assaini par la page. */
  suite: string;
}

export function FormulaireClient({ suite }: ProprietesFormulaireClient) {
  const [etat, envoyer, enAttente] = useActionState(inscrireClient, ETAT_INITIAL);

  return (
    /* `noValidate` : les bulles du navigateur s'affichent dans la langue du
       système et hors du flux, là où le serveur rend des messages français
       rattachés au champ. Avoir les deux montrerait deux refus pour une
       saisie. Les attributs `required` restent posés — ils portent
       l'information dans l'arbre d'accessibilité. */
    <form className={styles.formulaire} action={envoyer} noValidate>
      <input type="hidden" name="suite" value={suite} />

      {etat.message ? (
        <Alerte>{etat.message}</Alerte>
      ) : null}

      <Champ
        nom="nom"
        libelle="Votre nom"
        autoComplete="name"
        required
        defaultValue={etat.valeurs?.nom ?? ''}
        erreur={etat.erreurs?.nom}
        /* Ce que l'artisan verra, et pourquoi il ne verra pas le reste. La
           réduction à « Fatima B. » est faite par le serveur, jamais à
           l'affichage : une troncature côté écran laisserait le patronyme
           entier traverser le réseau. */
        aide="Les artisans ne voient que votre prénom et l’initiale de votre nom tant que vous n’avez pas accepté de devis."
      />

      <Champ
        nom="email"
        libelle="Adresse électronique"
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={etat.valeurs?.email ?? ''}
        erreur={etat.erreurs?.email}
      />

      <Champ
        nom="telephone"
        libelle="Téléphone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        defaultValue={etat.valeurs?.telephone ?? ''}
        erreur={etat.erreurs?.telephone}
        /* Le champ est facultatif côté API (`@IsOptional()`), et l'écran dit
           à quoi il sert plutôt que de le présenter comme une formalité :
           c'est le numéro que l'artisan retenu lira sur sa réservation. */
        aide="Facultatif. Il n’est transmis qu’à l’artisan dont vous acceptez le devis."
      />

      <Champ
        nom="motDePasse"
        libelle="Mot de passe"
        type="password"
        autoComplete="new-password"
        /* `minLength` double la règle du serveur sans la remplacer : il permet
           au gestionnaire de mots de passe du navigateur de proposer une
           suggestion de la bonne longueur. */
        minLength={12}
        required
        erreur={etat.erreurs?.motDePasse}
        aide="12 caractères au minimum. Aucune autre règle : ni majuscule, ni chiffre, ni caractère spécial imposé. Quatre mots mis bout à bout font l’affaire et se retiennent."
      />

      <Bouton type="submit" taille="lg" pleineLargeur enCours={enAttente}>
        {enAttente ? 'Création du compte…' : 'Créer mon compte'}
      </Bouton>
    </form>
  );
}
