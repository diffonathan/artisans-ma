'use client';

/**
 * L'inscription d'un artisan : treize champs, en trois blocs.
 *
 * ── Pourquoi ce formulaire est séparé de celui du particulier ─────────────
 * Il demande neuf champs de plus, et trois d'entre eux — les métiers, la
 * position, le rayon — ne se remplissent pas en lisant leur étiquette : ils
 * décident de ce que l'artisan verra pendant toute la vie de son compte, et
 * chacun porte donc une phrase d'explication. Mettre ces treize champs devant
 * un particulier qui en remplirait quatre le fait partir ; c'est la raison du
 * choix préalable, expliquée dans `Choix.tsx`.
 *
 * ── Les trois états contrôlés, et pourquoi EUX ────────────────────────────
 * Le reste du formulaire est non contrôlé : `defaultValue={etat.valeurs?.…}`
 * suffit à réafficher une saisie refusée, par le mécanisme détaillé dans
 * `app/connexion/Formulaire.tsx`. Trois valeurs ne peuvent pas s'en
 * contenter :
 *
 *   • les MÉTIERS, parce que `inscrireArtisan` ne les met pas dans `valeurs`.
 *     Non contrôlées, les cases cochées seraient remises à `defaultChecked`
 *     par la réinitialisation que React fait après l'action — l'artisan
 *     perdrait ses métiers à chaque refus, c'est-à-dire exactement la chose
 *     que `valeurs` existe pour éviter ;
 *
 *   • la POSITION, parce qu'elle est ÉCRITE par le programme — par le choix
 *     d'une ville ou par la géolocalisation — et qu'un champ caché non
 *     contrôlé n'a pas de valeur à écrire ;
 *
 *   • la VILLE, parce que c'est elle qui déclenche l'écriture de la position.
 *     Contrôlée, la liste garde sa sélection à travers un refus sans qu'aucun
 *     effet n'ait à la resynchroniser depuis `valeurs`.
 *
 * ── La géolocalisation : un confort, jamais une condition ─────────────────
 * Le bouton « Utiliser ma position » ne fait que remplacer les coordonnées de
 * la ville par celles du navigateur. S'il est refusé, s'il expire, ou si
 * l'API n'existe pas, le formulaire reste envoyable : la ville choisie porte
 * déjà une position. Le repli n'est donc pas une erreur à afficher en rouge,
 * c'est une phrase qui dit ce qui tient lieu de relevé.
 */
import { useActionState, useState } from 'react';
import { Alerte } from '@/components/Alerte';
import { Bouton } from '@/components/Bouton';
import { Champ, ChampListe } from '@/components/Champ';
import { METIERS } from '@/lib/domaine';
import type { Metier } from '@/lib/domaine';
import { inscrireArtisan } from '@/app/actions/authentification';
import { ETAT_INITIAL } from '@/lib/formulaire';
import { VILLES, formaterCoordonnee, normaliserCoordonnee } from '@/lib/villes';
import styles from './page.module.css';

/** Déclaré ici : un module `'use server'` n'exporte que des fonctions. */
/**
 * Les libellés français des huit métiers de l'énumération `Metier`.
 *
 * `Record<Metier, string>` et non un objet littéral : si l'API ajoutait un
 * métier à `METIERS` sans qu'on lui donne de libellé ici, ce serait une
 * ERREUR DE COMPILATION, au lieu d'une case à cocher vide en production.
 * C'est le raisonnement de la table de `components/Etiquette.tsx`.
 *
 * Ces libellés ne sont PAS dans le socle, et c'est un manque signalé : trois
 * autres écrans au moins en auront besoin (la recherche, la publication d'un
 * besoin, la liste des chantiers). Les déclarer dans `lib/` serait écrire
 * dans les fichiers d'un autre agent.
 */
const LIBELLES_METIERS: Record<Metier, string> = {
  CARRELAGE: 'Carrelage',
  CLIMATISATION: 'Climatisation',
  ELECTRICITE: 'Électricité',
  MACONNERIE: 'Maçonnerie',
  MENUISERIE: 'Menuiserie',
  PEINTURE: 'Peinture',
  PLOMBERIE: 'Plomberie',
  SERRURERIE: 'Serrurerie',
};

/** Le rayon proposé au départ : de quoi couvrir une agglomération. */
const RAYON_PAR_DEFAUT = '30';

/** Au-delà, le relevé n'a plus rien à apprendre par rapport à la ville. */
const PRECISION_UTILE_METRES = 2000;

type OriginePosition = 'ville' | 'navigateur';

interface PositionChoisie {
  latitude: string;
  longitude: string;
  origine: OriginePosition;
  /** Incertitude annoncée par le navigateur, en mètres. */
  precisionMetres?: number;
}

type EtatReleve = 'repos' | 'en-cours' | 'obtenu' | 'refuse' | 'indisponible';

/* ══════════════════════════════════════════════════════════════════════════
   LE GROUPE DE CASES À COCHER

   Le socle n'a pas de primitive pour un groupe de cases : `Champ` câble UN
   contrôle à UNE étiquette, ce qui est exactement ce qu'il ne faut pas ici —
   huit cases partagent une seule question, et c'est `<fieldset>`/`<legend>`
   qui l'exprime. Écrit localement, et signalé comme manque.
   ══════════════════════════════════════════════════════════════════════════ */

function ChoixMetiers({
  choisis,
  basculer,
  erreur,
}: {
  choisis: readonly Metier[];
  basculer: (metier: Metier) => void;
  erreur: string | undefined;
}) {
  const decrit = ['metiers-aide', erreur ? 'metiers-erreur' : null].filter(Boolean).join(' ');

  return (
    <fieldset className={styles.groupe} aria-describedby={decrit}>
      <legend className={styles.legende}>
        Vos métiers
        {/* L'astérisque est une convention visuelle, pas un mot : masquée aux
            lecteurs d'écran, qui reçoivent le texte à côté. Même traitement
            que `components/Champ.tsx`. */}
        <span className={styles.marqueur} aria-hidden="true">
          *
        </span>
        <span className="lecture-seule"> (obligatoire)</span>
      </legend>

      <p className={styles.aideGroupe} id="metiers-aide">
        Un chantier n&apos;est montré qu&apos;aux artisans qui déclarent son métier. Cochez-en
        autant que vous en exercez réellement&nbsp;: un métier coché par acquit de conscience
        remplit votre liste de chantiers que vous ne chiffrerez pas.
      </p>

      <div className={styles.cases}>
        {METIERS.map((metier) => (
          /* L'étiquette ENVELOPPE la case : tout le libellé devient cliquable,
             ce qui donne une cible tactile confortable sans qu'aucun `for`/`id`
             n'ait à être tenu à jour. */
          <label key={metier} className={styles.caseMetier}>
            <input
              type="checkbox"
              name="metiers"
              value={metier}
              checked={choisis.includes(metier)}
              onChange={() => {
                basculer(metier);
              }}
            />
            {LIBELLES_METIERS[metier]}
          </label>
        ))}
      </div>

      {erreur ? (
        <p className={styles.erreurGroupe} id="metiers-erreur" role="alert">
          {erreur}
        </p>
      ) : null}
    </fieldset>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   LE FORMULAIRE
   ══════════════════════════════════════════════════════════════════════════ */

export interface ProprietesFormulaireArtisan {
  /** Le chemin où revenir après l'inscription, déjà assaini par la page. */
  suite: string;
}

export function FormulaireArtisan({ suite }: ProprietesFormulaireArtisan) {
  const [etat, envoyer, enAttente] = useActionState(inscrireArtisan, ETAT_INITIAL);

  const [metiers, setMetiers] = useState<readonly Metier[]>([]);
  const [ville, setVille] = useState('');
  const [position, setPosition] = useState<PositionChoisie | null>(null);
  const [releve, setReleve] = useState<EtatReleve>('repos');

  const basculerMetier = (metier: Metier) => {
    setMetiers((precedents) =>
      precedents.includes(metier)
        ? precedents.filter((autre) => autre !== metier)
        : // L'ordre de `METIERS` est conservé plutôt que l'ordre des clics :
          // la liste envoyée reste la même quelle que soit la façon de cocher.
          METIERS.filter((candidat) => candidat === metier || precedents.includes(candidat)),
    );
  };

  const choisirVille = (nom: string) => {
    setVille(nom);
    setReleve('repos');

    const trouvee = VILLES.find((candidate) => candidate.nom === nom);
    if (!trouvee) {
      // L'invite de la liste, de valeur vide : la position repart à zéro
      // plutôt que de rester celle d'une ville qu'on vient de désélectionner.
      setPosition(null);
      return;
    }

    const latitude = normaliserCoordonnee(trouvee.latitude, 90);
    const longitude = normaliserCoordonnee(trouvee.longitude, 180);
    if (latitude === null || longitude === null) {
      // Impossible avec la table actuelle — `test/inscription-position.spec.ts`
      // le vérifie pour les huit villes. Le cas est traité quand même : le
      // laisser tomber dans un `!` poserait des champs cachés vides sans que
      // rien ne le dise.
      setPosition(null);
      return;
    }

    setPosition({ latitude, longitude, origine: 'ville' });
  };

  const releverPosition = () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setReleve('indisponible');
      return;
    }

    setReleve('en-cours');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const latitude = normaliserCoordonnee(coords.latitude, 90);
        const longitude = normaliserCoordonnee(coords.longitude, 180);
        if (latitude === null || longitude === null) {
          // Un couple hors bornes ne vient pas d'un GPS : il vient d'une
          // extension qui simule la position. On garde celle de la ville.
          setReleve('refuse');
          return;
        }
        setPosition({
          latitude,
          longitude,
          origine: 'navigateur',
          precisionMetres: Number.isFinite(coords.accuracy) ? Math.round(coords.accuracy) : undefined,
        });
        setReleve('obtenu');
      },
      () => {
        /*
         * Un seul traitement pour les trois causes — refus, indisponibilité,
         * expiration — et c'est voulu : la conduite à tenir est la même, et
         * nommer la cause obligerait à traduire des codes d'erreur que le
         * navigateur ne renseigne pas toujours. Rien n'est effacé : la
         * position de la ville, si elle était là, reste en place.
         */
        setReleve('refuse');
      },
      // `enableHighAccuracy` reste à faux : le GPS d'un téléphone met
      // plusieurs dizaines de secondes à se fixer, pour gagner une précision
      // dont un rayon d'intervention en kilomètres n'a aucun usage.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  return (
    <form className={styles.formulaire} action={envoyer} noValidate>
      <input type="hidden" name="suite" value={suite} />
      <input type="hidden" name="latitude" value={position?.latitude ?? ''} />
      <input type="hidden" name="longitude" value={position?.longitude ?? ''} />

      {etat.message ? (
        <Alerte>{etat.message}</Alerte>
      ) : null}

      {/* ── 1. L'entreprise ────────────────────────────────────────────── */}
      <section className={styles.bloc}>
        <h2 className={styles.titreBloc}>Votre entreprise</h2>

        <Champ
          nom="raisonSociale"
          libelle="Nom de l’entreprise"
          autoComplete="organization"
          required
          defaultValue={etat.valeurs?.raisonSociale ?? ''}
          erreur={etat.erreurs?.raisonSociale}
          aide="C’est ce nom que les clients lisent dans les résultats de recherche et sur vos devis."
        />

        <ChoixMetiers choisis={metiers} basculer={basculerMetier} erreur={etat.erreurs?.metiers} />
      </section>

      {/* ── 2. La zone d'intervention ──────────────────────────────────── */}
      <section className={styles.bloc}>
        <h2 className={styles.titreBloc}>Où vous intervenez</h2>

        <ChampListe
          nom="ville"
          libelle="Ville de votre atelier"
          invite="Choisissez une ville"
          required
          value={ville}
          onChange={(evenement) => {
            choisirVille(evenement.target.value);
          }}
          erreur={etat.erreurs?.ville}
          aide="Si votre ville n’y figure pas, prenez la plus proche : c’est la position, et non le nom, qui sert à calculer les distances."
        >
          {VILLES.map((candidate) => (
            <option key={candidate.nom} value={candidate.nom}>
              {candidate.nom}
            </option>
          ))}
        </ChampListe>

        <div className={styles.releve}>
          <Bouton
            variante="secondaire"
            taille="sm"
            onClick={releverPosition}
            enCours={releve === 'en-cours'}
          >
            {releve === 'en-cours' ? 'Relevé en cours…' : 'Utiliser ma position'}
          </Bouton>

          {/* aria-live="polite" : le relevé arrive de façon asynchrone, donc
              après la lecture de cette zone. Sans cela, qui n'a pas l'écran
              sous les yeux n'apprend jamais que la position a changé. */}
          <p className={styles.etatReleve} aria-live="polite">
            {position === null ? (
              /* La consigne de départ s'efface dès qu'un repli la remplace
                 plus bas : les deux ensemble demanderaient deux fois la même
                 chose dans la même phrase. */
              releve === 'repos' || releve === 'en-cours' ? (
                <>Choisissez une ville, ou relevez votre position.</>
              ) : null
            ) : (
              <>
                {position.origine === 'navigateur' ? 'Position relevée' : `Position de ${ville}`}
                &nbsp;:{' '}
                {/* Les coordonnées sont des nombres : Azeret Mono, par la
                    classe globale `.nombre`. La valeur affichée est celle que
                    les champs cachés portent, et non une autre écriture. */}
                <span className="nombre">{formaterCoordonnee(position.latitude)}</span>
                {' / '}
                <span className="nombre">{formaterCoordonnee(position.longitude)}</span>
                {position.precisionMetres !== undefined &&
                position.precisionMetres <= PRECISION_UTILE_METRES ? (
                  <>
                    , à <span className="nombre">{position.precisionMetres}</span>
                    &#x202f;m près
                  </>
                ) : null}
                .
              </>
            )}

            {/* Le repli, dit sobrement, et il ne dit pas la même chose selon
                qu'une ville est choisie ou non : « la ville choisie en tient
                lieu » serait faux si la liste était restée sur son invite, et
                une phrase fausse à cet endroit laisse l'artisan croire que le
                formulaire est complet. */}
            {releve === 'refuse' || releve === 'indisponible' ? (
              <>
                {' '}
                {releve === 'refuse'
                  ? 'Le relevé n’a pas abouti.'
                  : 'Ce navigateur ne donne pas la position.'}{' '}
                {position === null
                  ? 'Choisissez une ville dans la liste : sa position sera retenue.'
                  : /* « déjà retenue » et non « celle de la ville » : après un
                       premier relevé réussi puis un second qui échoue, c'est la
                       position du navigateur qui reste en place. */
                    'La position déjà retenue est conservée.'}
              </>
            ) : null}
          </p>
        </div>

        {/* Le refus du serveur sur la position : il nomme `latitude`, parce
            que c'est le champ sur lequel `inscrireArtisan` écrit son erreur.
            Rendu ici plutôt que sous un champ caché, qu'aucun lecteur ne
            voit. */}
        {etat.erreurs?.latitude ? (
          <p className={styles.erreurGroupe} role="alert">
            {etat.erreurs.latitude}
          </p>
        ) : null}

        <Champ
          nom="rayonKm"
          libelle="Rayon d’intervention, en kilomètres"
          type="number"
          inputMode="numeric"
          min={1}
          max={200}
          step={1}
          required
          defaultValue={etat.valeurs?.rayonKm ?? RAYON_PAR_DEFAUT}
          erreur={etat.erreurs?.rayonKm}
          aide="C’est lui qui décide des chantiers que vous verrez : la recherche ne retient que les artisans dont le rayon couvre l’adresse du client. Un artisan de Tahannaout qui annonce 10 km ne voit pas Marrakech, à 30 km ; un artisan d’Essaouira qui annonce 200 km la voit, à 170 km."
        />
      </section>

      {/* ── 3. Le compte ───────────────────────────────────────────────── */}
      <section className={styles.bloc}>
        <h2 className={styles.titreBloc}>Vos identifiants</h2>

        <Champ
          nom="nom"
          libelle="Votre nom"
          autoComplete="name"
          required
          defaultValue={etat.valeurs?.nom ?? ''}
          erreur={etat.erreurs?.nom}
          aide="Le vôtre, et non celui de l’entreprise : c’est avec lui que vous signez vos échanges."
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
          aide="Facultatif. Il n’est transmis qu’au client dont vous avez remporté le devis."
        />

        <Champ
          nom="motDePasse"
          libelle="Mot de passe"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          erreur={etat.erreurs?.motDePasse}
          aide="12 caractères au minimum. Aucune autre règle : ni majuscule, ni chiffre, ni caractère spécial imposé. Quatre mots mis bout à bout font l’affaire et se retiennent."
        />
      </section>

      <Bouton type="submit" taille="lg" pleineLargeur enCours={enAttente}>
        {enAttente ? 'Création du compte…' : 'Créer mon compte artisan'}
      </Bouton>
    </form>
  );
}
