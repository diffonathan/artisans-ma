'use client';

/* ══════════════════════════════════════════════════════════════════════════
   LES FILTRES DE LA RECHERCHE

   ── Pourquoi 'use client' ici, alors que le défaut du projet est serveur ───

   Pour une seule chose, et elle ne s'écrit pas autrement : `navigator.
   geolocation`. Demander sa position à quelqu'un est un geste du navigateur,
   déclenché par un clic, dont la réponse arrive dans un rappel. Il n'y a pas
   de version serveur de cela.

   Tout le reste du formulaire, lui, est du HTML ordinaire : c'est un
   `<form method="get">` qui pointe sur sa propre route. SANS JAVASCRIPT, il
   fonctionne — le navigateur sérialise les champs dans la chaîne de requête
   et recharge la page, ce qui est exactement ce que la recherche attend. Le
   `onSubmit` ci-dessous n'ajoute qu'un confort : il retire les champs vides
   de l'URL et navigue côté client au lieu de recharger le document. Si le
   script ne part pas, l'écran reste utilisable, avec une URL un peu plus
   bavarde.

   ── Pourquoi les critères arrivent en PROPRIÉTÉ et ne sont pas lus ici ─────

   `useSearchParams` existe, et ferait un deuxième endroit où l'URL se décode.
   Les deux finiraient par ne plus être d'accord, et c'est la page qui aurait
   raison puisque c'est elle qui interroge l'API. Le décodage est donc fait
   une fois, dans `criteres.ts`, et le résultat descend ici.

   La page remonte ce composant à chaque changement d'URL (une `key` dérivée
   des critères) : les `defaultValue` des listes et l'état de position
   repartent donc toujours de ce que l'adresse affiche, y compris après un
   retour en arrière.
   ══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';

import { Bouton } from '@/components/Bouton';
import { ChampListe } from '@/components/Champ';
import { CHEMINS } from '@/components/chemins';

import { LIBELLES_METIER, METIERS_ORDONNES } from '@/lib/metiers';
import { VILLES } from '@/lib/villes';

import {
  NOTES_MINIMALES,
  PARAMETRES,
  type Criteres,
  type PointRecherche,
} from './criteres';
import styles from './page.module.css';

/** Où en est la demande de position, pour ce que l'écran doit en dire. */
type EtatPosition = 'inerte' | 'attente' | 'refus' | 'indisponible';

const PHRASES_POSITION: Record<Exclude<EtatPosition, 'inerte' | 'attente'>, string> = {
  refus:
    "Votre navigateur n'a pas communiqué votre position. Choisissez une ville dans la liste à la place.",
  indisponible:
    "Ce navigateur ne sait pas donner votre position. Choisissez une ville dans la liste à la place.",
};

/**
 * Cinq décimales, soit environ un mètre.
 *
 * La position d'un téléphone est annoncée avec une quinzaine de décimales, qui
 * ne mesurent rien et qui allongeraient l'URL partagée de trente caractères.
 * Tronquer n'est pas un arrondi d'argent : la précision retirée n'existait
 * pas.
 */
const DECIMALES = 5;
const coordonnee = (valeur: number): string => valeur.toFixed(DECIMALES);

export interface ProprietesFiltres {
  criteres: Criteres;
}

export function Filtres({ criteres }: ProprietesFiltres): ReactNode {
  const routeur = useRouter();
  const [point, setPoint] = useState<PointRecherche | null>(criteres.point);
  const [etat, setEtat] = useState<EtatPosition>('inerte');

  /**
   * L'envoi, en version enrichie.
   *
   * Un formulaire GET natif envoie TOUS ses champs, vides compris :
   * `?metier=PLOMBERIE&ville=&note=` est une URL juste mais illisible, et
   * c'est celle qu'on partage. On la reconstruit donc sans les vides.
   */
  const soumettre = (evenement: FormEvent<HTMLFormElement>): void => {
    evenement.preventDefault();

    const parametres = new URLSearchParams();
    for (const [nom, valeur] of new FormData(evenement.currentTarget).entries()) {
      if (typeof valeur === 'string' && valeur !== '') parametres.set(nom, valeur);
    }

    const chaine = parametres.toString();
    routeur.push(chaine ? `${CHEMINS.recherche}?${chaine}` : CHEMINS.recherche);
  };

  const demanderPosition = (): void => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setEtat('indisponible');
      return;
    }

    setEtat('attente');
    navigator.geolocation.getCurrentPosition(
      (releve) => {
        setPoint({
          latitude: releve.coords.latitude,
          longitude: releve.coords.longitude,
        });
        setEtat('inerte');
      },
      // Un refus et une panne de capteur se disent de la même façon : dans les
      // deux cas la suite est la même, et distinguer les codes d'erreur de
      // l'API de géolocalisation n'apprendrait rien à qui lit l'écran.
      () => {
        setEtat('refus');
      },
      // Pas de haute précision : elle allume le GPS, prend plusieurs secondes
      // de plus et vide la batterie, pour affiner une position dont on ne se
      // sert qu'à comparer des rayons de plusieurs kilomètres.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60 * 1000 },
    );
  };

  return (
    <form
      /* `verre` est la classe GLOBALE de globals.css : la recette du
         glassmorphism ne se recopie pas dans un module, sinon deux fichiers
         décident de l'épaisseur du verre. Le module ne règle ici que la
         grille et le rythme interne. */
      className={`verre ${styles.filtres}`}
      /* `method="get"` et `action` : c'est le repli sans JavaScript. Les
         critères partent dans l'URL, jamais dans un corps de requête — une
         recherche doit pouvoir se recopier. */
      method="get"
      action={CHEMINS.recherche}
      onSubmit={soumettre}
      aria-label="Critères de recherche"
    >
      <ChampListe
        className={styles.filtreMetier}
        nom={PARAMETRES.metier}
        libelle="Métier"
        invite="Choisissez un métier"
        defaultValue={criteres.metier ?? ''}
        required
      >
        {METIERS_ORDONNES.map((metier) => (
          <option key={metier} value={metier}>
            {LIBELLES_METIER[metier]}
          </option>
        ))}
      </ChampListe>

      {point ? (
        <div className={styles.filtrePosition}>
          <span className={styles.libellePosition}>Où</span>
          <p className={styles.position}>
            Autour de votre position&nbsp;:{' '}
            <span className="nombre">{coordonnee(point.latitude)}</span>,{' '}
            <span className="nombre">{coordonnee(point.longitude)}</span>
          </p>
          {/* Les coordonnées voyagent en champs cachés : le formulaire reste
              un formulaire, donc le repli sans JavaScript les envoie aussi. */}
          <input type="hidden" name={PARAMETRES.latitude} value={coordonnee(point.latitude)} />
          <input type="hidden" name={PARAMETRES.longitude} value={coordonnee(point.longitude)} />
          <Bouton
            variante="fantome"
            taille="sm"
            onClick={() => {
              setPoint(null);
              setEtat('inerte');
            }}
          >
            Choisir une ville à la place
          </Bouton>
        </div>
      ) : (
        <ChampListe
          className={styles.filtreVille}
          nom={PARAMETRES.ville}
          libelle="Ville du chantier"
          invite="Choisissez une ville"
          aide="C'est l'adresse du chantier qui compte, pas celle de l'artisan."
          defaultValue={criteres.ville?.slug ?? ''}
          /* Obligatoire seulement quand aucune position exacte n'est posée :
             l'API exige un point, et il vient de l'un ou de l'autre. */
          required
        >
          {VILLES.map((ville) => (
            <option key={ville.slug} value={ville.slug}>
              {ville.nom}
            </option>
          ))}
        </ChampListe>
      )}

      <ChampListe
        className={styles.filtreNote}
        nom={PARAMETRES.note}
        libelle="Note minimale"
        invite="Peu importe"
        defaultValue={criteres.noteMinimale === null ? '' : String(criteres.noteMinimale)}
      >
        {NOTES_MINIMALES.map((note) => (
          <option key={note} value={note}>
            {/* La virgule décimale française : « 3,5 et plus ». */}
            {String(note).replace('.', ',')} et plus
          </option>
        ))}
      </ChampListe>

      <div className={styles.filtreCases}>
        {/* Étiquette IMPLICITE : la case est dans son `<label>`, donc le clic
            sur le texte la coche sans aucun `id` à tenir à jour. `Champ` du
            socle poserait l'étiquette au-dessus, ce qui est juste pour une
            saisie et faux pour une case. */}
        <label className={styles.case}>
          <input
            type="checkbox"
            name={PARAMETRES.verifies}
            value="1"
            defaultChecked={criteres.verifieSeulement}
          />
          <span>
            Artisans vérifiés seulement
            <small className={styles.caseAide}>Pièces justificatives contrôlées par l&apos;équipe.</small>
          </span>
        </label>
      </div>

      <div className={styles.filtreActions}>
        <Bouton type="submit">Chercher</Bouton>

        <Bouton
          variante="secondaire"
          onClick={demanderPosition}
          enCours={etat === 'attente'}
          /* `aria-live` sur le conteneur de message plus bas, pas ici : c'est
             le texte qui change, pas le bouton. */
        >
          {point ? 'Réactualiser ma position' : 'Utiliser ma position'}
        </Bouton>

        {/* Retour à la page nue. Un lien et non un bouton : il NAVIGUE, et on
            doit pouvoir l'ouvrir dans un onglet comme n'importe quel lien. */}
        <Link className={styles.reinitialiser} href={CHEMINS.recherche}>
          Tout effacer
        </Link>
      </div>

      {/* Toujours présent, vide la plupart du temps : une région `aria-live`
          créée au moment où le message arrive n'est pas annoncée par tous les
          lecteurs d'écran. */}
      <p className={styles.messagePosition} role="status" aria-live="polite">
        {etat === 'attente' ? 'Recherche de votre position…' : null}
        {etat === 'refus' ? PHRASES_POSITION.refus : null}
        {etat === 'indisponible' ? PHRASES_POSITION.indisponible : null}
      </p>
    </form>
  );
}
