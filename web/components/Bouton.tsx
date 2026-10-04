/**
 * Les boutons, et les liens qui ressemblent à des boutons.
 *
 * DEUX composants et non un seul à propriété `href` facultative. Une union
 * discriminée se laisse écrire, mais elle se déstructure mal — le discriminant
 * disparaît au premier spread — et surtout elle laisse choisir la balise par
 * mégarde. La distinction n'est pas cosmétique : une ancre NAVIGUE (clic du
 * milieu, « ouvrir dans un onglet », barre d'état du navigateur), un bouton
 * AGIT et se déclenche à la barre d'espace. Les confondre casse l'un des deux
 * comportements à chaque fois.
 *
 * Aucun `'use client'` : ce fichier ne tient ni état ni effet. Un module sans
 * directive est PARTAGÉ — un composant client qui l'importe l'emporte dans son
 * graphe et peut lui passer `onClick`, un composant serveur l'utilise sans
 * envoyer une ligne de JavaScript. Poser la directive ici forcerait le second
 * cas à devenir le premier.
 */
import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import styles from './Bouton.module.css';

export type VarianteBouton = 'primaire' | 'secondaire' | 'fantome' | 'danger';
export type TailleBouton = 'sm' | 'md' | 'lg';

interface Apparence {
  variante?: VarianteBouton;
  taille?: TailleBouton;
  /** Occupe toute la largeur disponible — formulaire sur téléphone, surtout. */
  pleineLargeur?: boolean;
}

function classes(
  { variante = 'primaire', taille = 'md', pleineLargeur = false }: Apparence,
  className: string | undefined,
): string {
  return [
    styles.bouton,
    styles[variante],
    styles[taille],
    pleineLargeur ? styles.pleineLargeur : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export interface ProprietesBouton extends Apparence, ComponentPropsWithoutRef<'button'> {
  /**
   * Action en cours : neutralise le bouton, pose `aria-busy` et montre un
   * indicateur. La neutralisation n'est pas décorative — un bouton qui reste
   * cliquable pendant l'envoi d'un devis en envoie deux.
   *
   * `aria-disabled` et non l'attribut `disabled`, et c'est la différence qui
   * compte : un élément `disabled` n'est plus focalisable, donc le navigateur
   * retire le focus du bouton au moment même où `enCours` passe à vrai, et le
   * laisse retomber sur <body>. Celui qui vient d'appuyer perd sa position de
   * lecture, et l'`aria-busy` posé sur ce nœud-là ne lui est jamais annoncé.
   * Le clic, lui, est bloqué en JavaScript juste en dessous.
   */
  enCours?: boolean;
}

export function Bouton({
  variante,
  taille,
  pleineLargeur,
  enCours = false,
  className,
  children,
  disabled,
  type,
  onClick,
  ...reste
}: ProprietesBouton): ReactNode {
  return (
    <button
      {...reste}
      /*
       * `type="button"` par défaut, et non le `submit` implicite de HTML : un
       * bouton secondaire ajouté dans un formulaire soumettrait celui-ci sans
       * que son auteur l'ait demandé. Les boutons d'envoi écrivent
       * explicitement type="submit".
       */
      type={type ?? 'button'}
      className={classes({ variante, taille, pleineLargeur }, className)}
      /*
       * `disabled` ne sert QUE pour l'indisponibilité demandée par l'appelant
       * — « Précédent » sur la première étape n'a rien à annoncer et gagne à
       * sortir du parcours de tabulation. L'attente, elle, passe par
       * `aria-disabled` : voir la propriété `enCours`.
       */
      disabled={disabled === true}
      aria-disabled={enCours || undefined}
      aria-busy={enCours || undefined}
      /*
       * `onClick` est déstructuré puis reposé APRÈS le spread, sans quoi le
       * gestionnaire de l'appelant écraserait ce garde. Un `type="submit"`
       * demande en plus `preventDefault()` : sans attribut `disabled`, le
       * bouton soumettrait toujours son formulaire.
       *
       * ── Pourquoi `undefined` quand il n'y a rien à garder ─────────────────
       * Le garde n'était POSÉ SANS CONDITION, et cela rendait ce bouton
       * impossible à passer en propriété d'un composant client. React doit
       * sérialiser un nœud rendu côté serveur pour le faire traverser une
       * telle frontière, et une fonction ne se sérialise pas :
       *
       *   « Event handlers cannot be passed to Client Component props.
       *     {type: "submit", …, onClick: function onClick, …} »
       *
       * C'est exactement ce que fait `actionsCompte` d'`Enveloppe` — la
       * couture par laquelle la déconnexion, qui est une Server Action,
       * traverse l'en-tête client. L'erreur était donc présente sur CHAQUE
       * page du site, et personne ne l'avait vue : aucun agent d'écran n'a pu
       * faire tourner un serveur.
       *
       * Un bouton sans `onClick` et sans `enCours` n'a rien à garder : il ne
       * reçoit donc aucune fonction, et redevient un nœud sérialisable. Le
       * comportement ne change dans aucun autre cas.
       */
      onClick={
        enCours || onClick
          ? (evenement) => {
              if (enCours) {
                evenement.preventDefault();
                return;
              }
              onClick?.(evenement);
            }
          : undefined
      }
    >
      {enCours ? <span className={styles.rouet} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export interface ProprietesBoutonLien
  extends Apparence,
    Omit<ComponentPropsWithoutRef<typeof Link>, 'className'> {
  className?: string;
}

export function BoutonLien({
  variante,
  taille,
  pleineLargeur,
  className,
  children,
  ...reste
}: ProprietesBoutonLien): ReactNode {
  return (
    <Link {...reste} className={classes({ variante, taille, pleineLargeur }, className)}>
      {children}
    </Link>
  );
}
