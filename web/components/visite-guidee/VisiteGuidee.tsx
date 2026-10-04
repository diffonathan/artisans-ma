'use client';

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import { Bouton } from '../Bouton';
import { CHEMINS } from '../chemins';
import {
  ATTRIBUT_AIDE,
  CLE_VISITE_VUE,
  ETAPES,
  EVENEMENT_AIDE,
} from './etapes';
import styles from './VisiteGuidee.module.css';

/**
 * Ce que l'on rend focalisable quand on pose le piège du clavier. La liste est
 * volontairement courte : elle suffit à cette modale, et une liste exhaustive
 * (contenteditable, iframe, audio contrôlable…) donnerait l'illusion d'un
 * utilitaire générique qu'il faudrait maintenir.
 */
const SELECTEUR_FOCALISABLE =
  'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Chaque accès à localStorage est enrobé, et pas par principe : en navigation
 * privée, et sous une politique de cookies restrictive, la simple LECTURE de
 * `window.localStorage` lève une SecurityError. Non enrobée, elle remonterait
 * depuis un effet et ferait tomber l'arbre React — une visite guidée qui
 * empêche le site de s'afficher.
 *
 * Le repli est « jamais vue » plutôt que « déjà vue » : la visite se rouvrira
 * à chaque session privée, ce qui est moins grave que de ne jamais la montrer
 * à personne si le stockage est indisponible.
 */
function dejaVue(): boolean {
  try {
    return window.localStorage.getItem(CLE_VISITE_VUE) === 'oui';
  } catch {
    return false;
  }
}

function marquerVue(): void {
  try {
    window.localStorage.setItem(CLE_VISITE_VUE, 'oui');
  } catch {
    // Rien à faire, et surtout rien à dire : l'utilisateur n'a pas demandé
    // à mémoriser quoi que ce soit.
  }
}

/**
 * La visite de première connexion.
 *
 * Elle s'ouvre toute seule la première fois, puis plus jamais — sauf clic sur
 * « Aide ». Règle maison : un outil qu'il faut expliquer de vive voix à chaque
 * nouvel arrivant n'est pas fini ; celui-ci porte son mode d'emploi.
 *
 * À monter UNE fois, en FRÈRE de l'enveloppe et jamais dedans, et surtout pas
 * une fois par page : la mémoire est globale, et deux instances se
 * disputeraient le focus. Elle est montée par `app/layout.tsx`.
 *
 * L'ouverture automatique est décidée dans un effet et non au premier rendu.
 * localStorage n'existe pas pendant le rendu serveur : un composant qui
 * s'ouvrirait « tout de suite » rendrait un vide côté serveur et une modale
 * côté client, c'est-à-dire une erreur d'hydratation.
 */
export function VisiteGuidee() {
  const [ouverte, setOuverte] = useState(false);
  const [index, setIndex] = useState(0);
  const modale = useRef<HTMLDivElement | null>(null);
  /** L'élément qui avait le focus avant l'ouverture, pour le lui rendre. */
  const declencheur = useRef<HTMLElement | null>(null);
  const idTitre = useId();

  const derniere = index === ETAPES.length - 1;
  const etape = ETAPES[index];

  const ouvrir = useCallback(() => {
    const actif = document.activeElement;
    // document.body est bien un HTMLElement, et ce n'est pas un déclencheur :
    // lui rendre le focus à la fermeture reviendrait à le retirer de la page.
    declencheur.current =
      actif instanceof HTMLElement && actif !== document.body ? actif : null;
    setIndex(0);
    setOuverte(true);
  }, []);

  const fermer = useCallback(() => {
    setOuverte(false);
    marquerVue();
    // Avant le démontage, donc : le bouton « Aide » existe encore et prend le
    // focus. Après, le focus serait déjà retombé sur <body> et le lecteur
    // d'écran aurait perdu la position de lecture.
    declencheur.current?.focus();
    declencheur.current = null;
  }, []);

  /*
   * Première visite, SUR L'ACCUEIL SEULEMENT. Pas `ouvrir()` : il n'y a aucun
   * déclencheur à mémoriser, personne n'a cliqué.
   *
   * ── Pourquoi la condition de chemin ──────────────────────────────────────
   * Tant que cette visite était montée par `app/page.tsx`, elle n'existait que
   * sur l'accueil et la condition était implicite. Montée par la disposition
   * racine, elle existe partout — et sans ce filtre, quelqu'un qui arrive
   * directement sur `/connexion` par un lien reçu, ou qu'une redirection y
   * amène, reçoit une présentation du site en six écrans par-dessus le
   * formulaire qu'il essayait de remplir. Une visite guidée s'offre, elle ne
   * s'impose pas au milieu d'une tâche.
   *
   * Partout ailleurs, elle reste à un clic sur « Aide ».
   */
  const cheminActuel = usePathname();
  useEffect(() => {
    if (cheminActuel === CHEMINS.accueil && !dejaVue()) {
      setOuverte(true);
    }
    // Le chemin n'est pas dans les dépendances, et c'est voulu : la visite
    // s'ouvre à l'ARRIVÉE, pas à chaque navigation vers l'accueil au cours de
    // la même session — `dejaVue()` ne sera vrai qu'après une fermeture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // L'intention « Aide », émise par l'en-tête. Deux contrats acceptés, décrits
  // dans etapes.ts : un événement sur window, ou un clic sur [data-aide].
  useEffect(() => {
    const surIntention = () => ouvrir();

    // `Event` et non `MouseEvent` : seuls `target` et `preventDefault()`
    // servent ici, et le type importé plus haut sous le nom KeyboardEvent est
    // celui de React — mélanger les deux familles dans un même fichier se
    // paie en relectures.
    const surClic = (evenement: Event) => {
      const cible = evenement.target;
      if (!(cible instanceof Element)) {
        return;
      }
      // closest() et non une comparaison : le clic arrive souvent sur l'icône
      // ou le libellé à l'intérieur du bouton, pas sur le bouton lui-même.
      if (!cible.closest(`[${ATTRIBUT_AIDE}]`)) {
        return;
      }
      // Au cas où l'en-tête aurait écrit un <a href="/aide"> : la visite
      // remplace la navigation, elle ne s'y ajoute pas.
      evenement.preventDefault();
      ouvrir();
    };

    window.addEventListener(EVENEMENT_AIDE, surIntention);
    document.addEventListener('click', surClic);
    return () => {
      window.removeEventListener(EVENEMENT_AIDE, surIntention);
      document.removeEventListener('click', surClic);
    };
  }, [ouvrir]);

  // Ouverture : le focus entre dans la modale, et la page cesse de défiler
  // derrière elle. Le défilement est rendu tel qu'il était trouvé plutôt que
  // remis à 'visible' — globals.css pose `overflow-x: hidden` sur le body, et
  // écrire 'visible' le lui retirerait.
  useEffect(() => {
    if (!ouverte) {
      return;
    }
    modale.current?.focus();
    const defilementInitial = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = defilementInitial;
    };
  }, [ouverte]);

  const surTouche = (evenement: KeyboardEvent<HTMLDivElement>) => {
    if (evenement.key === 'Escape') {
      fermer();
      return;
    }
    if (evenement.key === 'ArrowRight') {
      // Pas de fermeture par flèche sur la dernière étape : une touche de
      // navigation ne doit pas avoir, au bout de la course, l'effet d'un
      // bouton « Terminer » qu'on n'a pas visé.
      if (!derniere) {
        setIndex((i) => i + 1);
      }
      return;
    }
    if (evenement.key === 'ArrowLeft') {
      setIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (evenement.key !== 'Tab') {
      return;
    }

    // Le piège. Sans lui, Tab sort de la modale et parcourt une page que le
    // voile rend inatteignable à la souris : le focus devient invisible.
    const focalisables = modale.current?.querySelectorAll<HTMLElement>(
      SELECTEUR_FOCALISABLE,
    );
    if (!focalisables || focalisables.length === 0) {
      return;
    }
    const premier = focalisables[0];
    const dernier = focalisables[focalisables.length - 1];
    const actif = document.activeElement;

    if (evenement.shiftKey && (actif === premier || actif === modale.current)) {
      evenement.preventDefault();
      dernier.focus();
    } else if (!evenement.shiftKey && actif === dernier) {
      evenement.preventDefault();
      premier.focus();
    }
  };

  if (!ouverte) {
    return null;
  }

  return (
    <div
      className={styles.voile}
      // onMouseDown et non onClick : un clic dont le bouton s'enfonce DANS le
      // texte et se relâche sur le voile, à la fin d'une sélection à la
      // souris, est reçu par le voile — et fermerait la modale alors que
      // l'utilisateur voulait copier une adresse e-mail.
      onMouseDown={(evenement) => {
        if (evenement.target === evenement.currentTarget) {
          fermer();
        }
      }}
    >
      <div
        ref={modale}
        className={`verre ${styles.modale}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        tabIndex={-1}
        onKeyDown={surTouche}
      >
        {/*
         * <div> et non <header> / <footer> pour ces deux blocs, bien que le
         * rôle visuel soit exactement celui-là. HTML-AAM mappe `header` sur le
         * repère `banner` et `footer` sur `contentinfo` dès que l'élément n'est
         * pas descendant d'un article / aside / main / nav / section — et
         * `role="dialog"` ne figure pas dans cette liste, pas plus qu'il ne
         * crée de racine de sectionnement. L'ancêtre le plus proche est donc
         * <body>, et la page a déjà son banner et son contentinfo dans
         * l'enveloppe : il y en aurait deux de chaque, ce que les règles
         * landmark-no-duplicate-banner / -contentinfo signalent à juste titre.
         * Aucun sélecteur du module ne porte sur un nom de balise.
         */}
        <div className={styles.entete}>
          <p className={styles.compteur}>
            <span className="nombre">{index + 1}</span>
            <span aria-hidden="true"> / </span>
            <span className="nombre">{ETAPES.length}</span>
          </p>
          <h2 id={idTitre} className={styles.titre}>
            {etape.titre}
          </h2>
          <button
            type="button"
            className={styles.fermer}
            onClick={fermer}
            aria-label="Fermer la visite guidée"
          >
            {/* aria-hidden sur le glyphe : le libellé est déjà porté par le
                bouton, et « multiplication » lu à voix haute n'aide personne. */}
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className={styles.corps}>
          {etape.paragraphes.map((paragraphe) => (
            <p key={paragraphe} className={styles.paragraphe}>
              {paragraphe}
            </p>
          ))}

          {etape.comptes && (
            <ul className={styles.comptes}>
              {etape.comptes.map((compte) => (
                <li key={compte.adresse} className={styles.compte}>
                  <span className={styles.compteRole}>{compte.role}</span>
                  {/* Un <span> et non un <code> : l'élément code hériterait
                      de la police à chasse fixe du navigateur, et la charte
                      réserve le monospace aux nombres. */}
                  <span className={styles.compteAdresse}>{compte.adresse}</span>
                  <span className={styles.compteEtat}>{compte.etat}</span>
                </li>
              ))}
            </ul>
          )}

          {etape.aRetenir && (
            <aside className={styles.aRetenir}>
              <p className={styles.aRetenirTitre}>À retenir</p>
              <p>{etape.aRetenir}</p>
            </aside>
          )}
        </div>

        <div className={styles.pied}>
          <nav className={styles.points} aria-label="Étapes de la visite">
            {ETAPES.map((candidate, rang) => (
              <button
                key={candidate.titre}
                type="button"
                className={rang === index ? styles.pointActif : styles.point}
                // aria-current et non un libellé « (étape courante) » : la
                // position est un état, pas un morceau de texte.
                aria-current={rang === index ? 'step' : undefined}
                aria-label={`Étape ${rang + 1} : ${candidate.titre}`}
                onClick={() => setIndex(rang)}
              />
            ))}
          </nav>

          {/* La primitive, et non deux boutons redessinés : le pied de cette
              modale et le reste du site doivent avoir la même teinte, le même
              rayon et la même couleur de texte pour le même rôle. */}
          <div className={styles.boutons}>
            <Bouton
              variante="secondaire"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
            >
              Précédent
            </Bouton>
            <Bouton onClick={() => (derniere ? fermer() : setIndex((i) => i + 1))}>
              {derniere ? 'Commencer' : 'Suivant'}
            </Bouton>
          </div>
        </div>
      </div>
    </div>
  );
}
