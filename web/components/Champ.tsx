/**
 * Un champ de formulaire : son étiquette, son contrôle, son aide, son erreur.
 *
 * Ce que ce composant APPORTE, et qui est la seule raison de son existence :
 * le câblage d'accessibilité. `for`/`id` liés, `aria-invalid` posé en même
 * temps que l'erreur, `aria-describedby` pointant à la fois l'aide et le
 * message. Écrits à la main dans douze formulaires, l'un des quatre finit
 * toujours par manquer, et c'est toujours le même : l'erreur s'affiche en
 * rouge et n'est jamais annoncée.
 *
 * Ce qu'il n'apporte PAS : l'apparence des contrôles. La recette des `input`,
 * `textarea` et `select` — fond, bordure, halo de focus, chevron du select —
 * est dans globals.css, globale et volontairement hors d'atteinte d'ici.
 *
 * Aucun `'use client'` : trois balises et aucun état. Un champ contrôlé, un
 * compteur de caractères ou une saisie assistée appartiennent au formulaire
 * qui en a besoin, et c'est lui qui porte la directive.
 */
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import styles from './Champ.module.css';

interface ProprietesCommunes {
  /**
   * Le `name` envoyé au serveur. Obligatoire : une Server Action lit
   * `formData.get(nom)`, et un champ sans nom n'est tout simplement pas envoyé
   * par le navigateur — en silence.
   */
  nom: string;
  libelle: string;
  /** Consigne permanente, sous le champ. Pas un espace réservé : un placeholder disparaît à la saisie. */
  aide?: ReactNode;
  /** Message rendu par le serveur après un envoi refusé. `null` ou absent = pas d'erreur. */
  erreur?: string | null;
  /** À préciser seulement si deux champs du même nom coexistent sur la page. */
  id?: string;
  /** Posé sur l'enveloppe du champ, pour la mise en page du formulaire. */
  className?: string;
}

/**
 * Les attributs que porte le CONTRÔLE (et non son enveloppe).
 *
 * `aria-describedby` enchaîne l'aide puis l'erreur, dans cet ordre : un lecteur
 * d'écran les lit à la suite de l'étiquette, et l'aide avant l'erreur est
 * l'ordre dans lequel elles se comprennent. `undefined` plutôt que chaîne vide
 * quand il n'y a rien à décrire — un `aria-describedby=""` désigne un élément
 * inexistant.
 */
function attributs(identifiant: string, aide: ReactNode, erreur: string | null | undefined) {
  const cibles = [aide ? `${identifiant}-aide` : null, erreur ? `${identifiant}-erreur` : null]
    .filter(Boolean)
    .join(' ');
  return {
    'aria-invalid': erreur ? (true as const) : undefined,
    'aria-describedby': cibles.length > 0 ? cibles : undefined,
  };
}

/** L'étiquette, l'aide et l'erreur — identiques pour les trois contrôles. */
function Enveloppement({
  identifiant,
  libelle,
  obligatoire,
  aide,
  erreur,
  className,
  children,
}: {
  identifiant: string;
  libelle: string;
  obligatoire: boolean;
  aide: ReactNode;
  erreur: string | null | undefined;
  className: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className={[styles.champ, className].filter(Boolean).join(' ')}>
      <label className={styles.libelle} htmlFor={identifiant}>
        {libelle}
        {obligatoire ? (
          <>
            {/* L'astérisque est une convention visuelle, pas un mot : elle est
                masquée aux lecteurs d'écran, qui reçoivent le texte à côté. Le
                contrôle porte déjà `required`, donc l'information arrive aussi
                par l'arbre d'accessibilité — ceci la rend lisible dans la liste
                des étiquettes d'un formulaire. */}
            <span className={styles.marqueur} aria-hidden="true">
              *
            </span>
            <span className="lecture-seule"> (obligatoire)</span>
          </>
        ) : null}
      </label>

      {children}

      {aide ? (
        <p className={styles.aide} id={`${identifiant}-aide`}>
          {aide}
        </p>
      ) : null}

      {erreur ? (
        /*
         * role="alert" n'est pas gratuit : il ne s'annonce que parce que ce
         * nœud APPARAÎT après l'envoi. Rendu dès le premier affichage il
         * interromprait la lecture de la page — d'où le rendu conditionnel
         * plutôt qu'un conteneur toujours présent et vide.
         */
        <p className={styles.erreur} id={`${identifiant}-erreur`} role="alert">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}

export interface ProprietesChamp
  extends ProprietesCommunes,
    Omit<ComponentPropsWithoutRef<'input'>, 'name' | 'id' | 'className'> {}

export function Champ({
  nom,
  libelle,
  aide,
  erreur,
  id,
  className,
  ...reste
}: ProprietesChamp): ReactNode {
  const identifiant = id ?? nom;
  return (
    <Enveloppement
      identifiant={identifiant}
      libelle={libelle}
      obligatoire={reste.required === true}
      aide={aide}
      erreur={erreur}
      className={className}
    >
      <input {...reste} {...attributs(identifiant, aide, erreur)} id={identifiant} name={nom} />
    </Enveloppement>
  );
}

export interface ProprietesChampTexteLong
  extends ProprietesCommunes,
    Omit<ComponentPropsWithoutRef<'textarea'>, 'name' | 'id' | 'className'> {}

export function ChampTexteLong({
  nom,
  libelle,
  aide,
  erreur,
  id,
  className,
  ...reste
}: ProprietesChampTexteLong): ReactNode {
  const identifiant = id ?? nom;
  return (
    <Enveloppement
      identifiant={identifiant}
      libelle={libelle}
      obligatoire={reste.required === true}
      aide={aide}
      erreur={erreur}
      className={className}
    >
      <textarea {...reste} {...attributs(identifiant, aide, erreur)} id={identifiant} name={nom} />
    </Enveloppement>
  );
}

export interface ProprietesChampListe
  extends ProprietesCommunes,
    Omit<ComponentPropsWithoutRef<'select'>, 'name' | 'id' | 'className'> {
  /**
   * Première option, sans valeur, pour que la liste ne parte pas sur un métier
   * que le client n'a pas choisi. Avec `required`, le navigateur refuse alors
   * l'envoi tant qu'elle est sélectionnée.
   */
  invite?: string;
}

export function ChampListe({
  nom,
  libelle,
  aide,
  erreur,
  id,
  className,
  invite,
  children,
  ...reste
}: ProprietesChampListe): ReactNode {
  const identifiant = id ?? nom;
  return (
    <Enveloppement
      identifiant={identifiant}
      libelle={libelle}
      obligatoire={reste.required === true}
      aide={aide}
      erreur={erreur}
      className={className}
    >
      {/*
       * Aucune classe, aucun style en ligne sur ce select, et c'est une règle
       * du projet : son chevron est une IMAGE DE FOND posée par globals.css.
       * Un `background:` en raccourci, même pour changer la seule teinte,
       * réinitialise background-image et escamote le chevron sans erreur.
       */}
      <select {...reste} {...attributs(identifiant, aide, erreur)} id={identifiant} name={nom}>
        {invite ? <option value="">{invite}</option> : null}
        {children}
      </select>
    </Enveloppement>
  );
}
