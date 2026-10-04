'use client';

/**
 * Le formulaire de publication d'un chantier.
 *
 * `'use client'` pour trois raisons précises, et non par habitude :
 *   • `useActionState`, qui fait circuler les erreurs par champ sans perdre
 *     la saisie ;
 *   • le compteur de caractères de la description, qui doit se mettre à jour
 *     à la frappe — c'est la seule façon d'annoncer le seuil de vingt
 *     caractères AVANT le refus ;
 *   • `navigator.geolocation`, qui n'existe que dans le navigateur.
 *
 * ── Ce qui est volontairement ABSENT ──────────────────────────────────────
 * La validation des longueurs. Elle est dans la Server Action, qui est la
 * seule à être appelée quand JavaScript n'a pas chargé. La redoubler ici
 * donnerait deux tables de messages à maintenir, et c'est le genre de
 * duplication qui finit par afficher deux phrases différentes pour le même
 * refus. Le navigateur fait sa part par `required` et `minLength`, qui sont
 * des attributs et non du code.
 */
import { useActionState, useState } from 'react';

import { Alerte } from '@/components/Alerte';
import { ETAT_INITIAL } from '@/lib/formulaire';
import { publierBesoin } from '@/app/actions/besoins';
import { Bouton } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { Champ, ChampListe, ChampTexteLong } from '@/components/Champ';
import { LIBELLES_METIER, METIERS_ORDONNES } from '@/lib/metiers';
import { VILLES, formaterCoordonnee, normaliserCoordonnee } from '@/lib/villes';
import { LONGUEURS } from '@/app/mes-besoins/calculs';
import styles from './page.module.css';

/** Les états que la demande de position peut prendre. */
type EtatPosition =
  | { genre: 'liste' }
  | { genre: 'demande' }
  | { genre: 'precise'; latitude: string; longitude: string }
  | { genre: 'echec'; phrase: string };

/**
 * Les phrases de refus de `navigator.geolocation`, par code.
 *
 * Les trois codes sont ceux de `GeolocationPositionError`. Ils ne demandent
 * pas le même geste au lecteur : une permission refusée se répare dans les
 * réglages du navigateur, une position indisponible en se déplaçant, un
 * dépassement de délai en réessayant. Une phrase unique les enverrait tous
 * chercher au mauvais endroit.
 */
const PHRASES_POSITION: Record<number, string> = {
  1: "Vous avez refusé l'accès à votre position. Choisissez la ville dans la liste, ou autorisez la géolocalisation dans les réglages du navigateur.",
  2: 'Votre position est indisponible pour le moment. Choisissez la ville dans la liste.',
  3: "La demande de position a pris trop de temps. Réessayez, ou choisissez la ville dans la liste.",
};

const PHRASE_POSITION_INCONNUE =
  "Votre position n'a pas pu être lue. Choisissez la ville dans la liste.";

export function Formulaire() {
  const [etat, agir, enCours] = useActionState(publierBesoin, ETAT_INITIAL);
  const [position, setPosition] = useState<EtatPosition>({ genre: 'liste' });
  const [longueurDescription, setLongueurDescription] = useState(
    (etat.valeurs?.description ?? '').length,
  );

  const demanderLaPosition = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPosition({
        genre: 'echec',
        phrase: 'Ce navigateur ne sait pas donner votre position. Choisissez la ville dans la liste.',
      });
      return;
    }

    setPosition({ genre: 'demande' });
    navigator.geolocation.getCurrentPosition(
      (mesure) => {
        // `normaliserCoordonnee` arrondit à cinq décimales et REFUSE une
        // valeur hors bornes plutôt que de l'écrêter — le raisonnement est
        // dans `app/inscription/position.ts`.
        const latitude = normaliserCoordonnee(mesure.coords.latitude, 90);
        const longitude = normaliserCoordonnee(mesure.coords.longitude, 180);
        if (latitude === null || longitude === null) {
          setPosition({ genre: 'echec', phrase: PHRASE_POSITION_INCONNUE });
          return;
        }
        setPosition({ genre: 'precise', latitude, longitude });
      },
      (echec) => {
        setPosition({
          genre: 'echec',
          phrase: PHRASES_POSITION[echec.code] ?? PHRASE_POSITION_INCONNUE,
        });
      },
      // Pas de `enableHighAccuracy` : l'adresse exacte est saisie en texte
      // juste au-dessus, et le point ne sert qu'à savoir quels artisans
      // acceptent de venir. Demander le GPS fin coûterait de la batterie et
      // plusieurs secondes d'attente pour une précision dont la recherche,
      // qui compte en kilomètres, n'a aucun usage.
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const descriptionTropCourte = longueurDescription < LONGUEURS.description.minimum;

  return (
    <Carte padding="lg" className={styles.carteFormulaire}>
      <form action={agir} className={styles.formulaire}>
        {/*
         * Le message global est annoncé par `role="alert"` : après un envoi
         * refusé, le focus est resté sur le bouton, et sans région vivante un
         * lecteur d'écran ne dirait rien du refus.
         */}
        {etat.message ? (
          <Alerte>{etat.message}</Alerte>
        ) : null}

        <ChampListe
          nom="metier"
          libelle="Métier"
          invite="Choisissez le métier"
          required
          defaultValue={etat.valeurs?.metier ?? ''}
          erreur={etat.erreurs?.metier}
          aide="Le chantier n'est proposé qu'aux artisans qui exercent ce métier."
        >
          {METIERS_ORDONNES.map((metier) => (
            <option key={metier} value={metier}>
              {LIBELLES_METIER[metier]}
            </option>
          ))}
        </ChampListe>

        <Champ
          nom="titre"
          libelle="Titre du chantier"
          required
          minLength={LONGUEURS.titre.minimum}
          maxLength={LONGUEURS.titre.maximum}
          defaultValue={etat.valeurs?.titre ?? ''}
          erreur={etat.erreurs?.titre}
          placeholder="Chauffe-eau à remplacer"
          aide="Une ligne, telle qu'elle apparaîtra dans la liste des artisans."
        />

        <ChampTexteLong
          nom="description"
          libelle="Description"
          required
          minLength={LONGUEURS.description.minimum}
          maxLength={LONGUEURS.description.maximum}
          defaultValue={etat.valeurs?.description ?? ''}
          erreur={etat.erreurs?.description}
          onChange={(evenement) => {
            setLongueurDescription(evenement.currentTarget.value.trim().length);
          }}
          placeholder="Le chauffe-eau de 80 litres ne monte plus en température. Accès par la terrasse. Devis pour fourniture et pose."
          aide={
            <>
              C&apos;est sur ce texte qu&apos;un artisan chiffre&nbsp;: dites l&apos;état actuel,
              ce que vous voulez obtenir, et comment on accède au chantier. Vingt caractères au
              minimum.
              {/*
               * Le compteur est un NOMBRE : Azeret Mono par la classe globale
               * `.nombre`, comme la charte l'exige. Il n'est pas annoncé à
               * chaque frappe (`aria-live` absent) : un lecteur d'écran qui
               * épellerait le compteur à chaque lettre rendrait le champ
               * inutilisable. Le refus, lui, est annoncé.
               */}
              <span
                className={
                  descriptionTropCourte ? styles.compteurInsuffisant : styles.compteurAtteint
                }
              >
                <span className="nombre">{longueurDescription}</span>
                {' / '}
                <span className="nombre">{LONGUEURS.description.minimum}</span>
              </span>
            </>
          }
        />

        <Champ
          nom="adresse"
          libelle="Adresse du chantier"
          required
          minLength={LONGUEURS.adresse.minimum}
          maxLength={LONGUEURS.adresse.maximum}
          defaultValue={etat.valeurs?.adresse ?? ''}
          erreur={etat.erreurs?.adresse}
          placeholder="Quartier Guéliz, Marrakech"
          autoComplete="street-address"
          aide="Elle n'est lue que par vous, et par l'artisan dont vous accepterez le devis. Les autres voient la ville et la distance."
        />

        {/* ── La position ─────────────────────────────────────────────────── */}

        <fieldset className={styles.bloc}>
          <legend className={styles.blocTitre}>Où se trouve le chantier</legend>
          <p className={styles.blocPhrase}>
            Un artisan n&apos;a pas une zone, il a un rayon qui lui est propre. Ce point sert à
            savoir lesquels acceptent de venir jusqu&apos;à vous.
          </p>

          <ChampListe
            nom="ville"
            libelle="Ville"
            invite="Choisissez la ville"
            required={position.genre !== 'precise'}
            defaultValue={etat.valeurs?.ville ?? ''}
            erreur={etat.erreurs?.ville}
          >
            {VILLES.map((ville) => (
              <option key={ville.nom} value={ville.nom}>
                {ville.nom}
              </option>
            ))}
          </ChampListe>

          <div className={styles.lignePosition}>
            <Bouton
              type="button"
              variante="secondaire"
              taille="sm"
              onClick={demanderLaPosition}
              enCours={position.genre === 'demande'}
            >
              Utiliser ma position
            </Bouton>

            {position.genre === 'precise' ? (
              <>
                <p className={styles.positionLue}>
                  Point relevé&nbsp;:{' '}
                  <span className="nombre">{formaterCoordonnee(position.latitude)}</span>
                  {', '}
                  <span className="nombre">{formaterCoordonnee(position.longitude)}</span>. Il
                  remplace la ville.
                </p>
                <Bouton
                  type="button"
                  variante="fantome"
                  taille="sm"
                  onClick={() => {
                    setPosition({ genre: 'liste' });
                  }}
                >
                  Revenir à la ville
                </Bouton>
              </>
            ) : null}

            {position.genre === 'echec' ? (
              <p className={styles.positionEchec} role="alert">
                {position.phrase}
              </p>
            ) : null}
          </div>

          {/*
           * Les deux champs cachés ne portent une valeur QUE lorsque la
           * géolocalisation a abouti. Vides, l'action résout les coordonnées
           * de la ville elle-même — ce qui est ce qui fait fonctionner ce
           * formulaire avant l'hydratation, et pourquoi la liste porte un
           * `name`.
           */}
          <input
            type="hidden"
            name="latitude"
            value={position.genre === 'precise' ? position.latitude : ''}
          />
          <input
            type="hidden"
            name="longitude"
            value={position.genre === 'precise' ? position.longitude : ''}
          />
        </fieldset>

        {/* ── Le budget ───────────────────────────────────────────────────── */}

        <Champ
          nom="budgetDirhams"
          libelle="Budget maximal, en dirhams"
          /*
           * `inputMode="decimal"` et non `type="number"` : un champ numérique
           * refuse la virgule selon la langue du navigateur, et son
           * incrémenteur n'a aucun sens sur une somme. L'attribut donne le
           * pavé numérique sur téléphone, et globals.css lui met déjà Azeret
           * Mono — un champ de nombre reçoit la police des nombres.
           */
          inputMode="decimal"
          defaultValue={etat.valeurs?.budgetDirhams ?? ''}
          erreur={etat.erreurs?.budgetDirhams}
          placeholder="4500"
          aide="Facultatif. Laissé vide, aucun budget n'est annoncé aux artisans — ils chiffrent sans plafond affiché."
        />

        <div className={styles.actions}>
          <Bouton type="submit" enCours={enCours} pleineLargeur>
            Publier le chantier
          </Bouton>
          <p className={styles.actionsPhrase}>
            Un chantier publié reste ouvert jusqu&apos;à ce que vous acceptiez un devis. Vous
            pouvez le relire et comparer les devis autant de fois que vous voulez avant de
            choisir.
          </p>
        </div>
      </form>
    </Carte>
  );
}
