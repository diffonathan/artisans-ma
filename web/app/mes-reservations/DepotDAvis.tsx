'use client';

/* ══════════════════════════════════════════════════════════════════════════
   LE DÉPÔT D'AVIS

   'use client' pour `useActionState` : les erreurs par champ et l'attente
   doivent s'afficher sans quitter la carte, et le texte écrit doit revenir
   dans le champ si l'API refuse.

   ── Pourquoi des boutons radio, et pas une liste déroulante ───────────────
   Cinq valeurs, exclusives, toutes visibles : c'est la définition d'un groupe
   de radios. Une liste déroulante demanderait un clic de plus pour un choix
   de cinq, et la charte interdit par ailleurs de restyler un `<select>` en
   ligne. Le groupe est fait ici plutôt que dans `components/` : le socle n'a
   pas de primitive de choix exclusif, et le signaler valait mieux que d'en
   ajouter une au passage dans un dossier partagé.
   ══════════════════════════════════════════════════════════════════════════ */

import { useActionState } from 'react';

import { Alerte } from '@/components/Alerte';
import { deposerAvis } from '@/app/actions/avis';
import { ETAT_INITIAL } from '@/lib/formulaire';
import type { EtatFormulaire } from '@/lib/formulaire';
import { Bouton } from '@/components/Bouton';
import { ChampTexteLong } from '@/components/Champ';

import { LONGUEUR_COMMENTAIRE_MINIMALE, NOTES } from './regles';
import styles from './page.module.css';

export interface ProprietesDepotDAvis {
  reservation: string;
  /** La raison sociale de l'artisan, pour que le groupe de notes dise qui est noté. */
  prestataire: string | null;
}

export function DepotDAvis({ reservation, prestataire }: ProprietesDepotDAvis) {
  const [etat, action, enCours] = useActionState<EtatFormulaire, FormData>(deposerAvis, ETAT_INITIAL);

  const erreurNote = etat.erreurs?.note;
  const noteChoisie = etat.valeurs?.note ?? '';

  return (
    <form action={action} className={styles.avis}>
      <input type="hidden" name="reservation" value={reservation} />

      <h3 className={styles.titreAvis}>Déposer votre avis</h3>
      {/*
       * Dire d'où vient le droit de noter n'est pas de la pédagogie gratuite :
       * c'est la seule chose qui distingue cet avis d'une étoile anonyme, et
       * c'est ce qui en fait la valeur pour le prochain client.
       */}
      <p className={styles.mention}>
        Cet avis n&apos;existe que parce que cette prestation a été payée, puis déclarée terminée
        par l&apos;artisan. Il ne peut être déposé qu&apos;une fois, et il est affiché sur la fiche
        de l&apos;artisan avec sa note recalculée.
      </p>

      <fieldset
        className={styles.notes}
        aria-describedby={erreurNote ? 'avis-note-erreur' : undefined}
      >
        <legend className={styles.legende}>
          Votre note{prestataire ? ` pour ${prestataire}` : ''}
          {/* Même convention que `components/Champ.tsx` : l'astérisque est
              visuelle et masquée, le mot est donné à côté pour les lecteurs
              d'écran. */}
          <span aria-hidden="true" className={styles.obligatoire}>
            *
          </span>
          <span className="lecture-seule"> (obligatoire)</span>
        </legend>

        <div className={styles.etoiles}>
          {NOTES.map((valeur) => (
            <label key={valeur} className={styles.etoile}>
              <input
                type="radio"
                name="note"
                value={valeur}
                required
                defaultChecked={noteChoisie === String(valeur)}
              />
              {/* La valeur est un nombre : Azeret Mono, par la classe globale. */}
              <span className={`nombre ${styles.etoileValeur}`}>{valeur}</span>
              <span className="lecture-seule">
                {valeur === 1 ? 'étoile sur 5' : 'étoiles sur 5'}
              </span>
            </label>
          ))}
        </div>

        {erreurNote ? (
          <p className={styles.refus} id="avis-note-erreur" role="alert">
            {erreurNote}
          </p>
        ) : null}
      </fieldset>

      <ChampTexteLong
        nom="commentaire"
        libelle="Ce qui s'est passé"
        className={styles.champAvis}
        required
        rows={4}
        minLength={LONGUEUR_COMMENTAIRE_MINIMALE}
        maxLength={2000}
        defaultValue={etat.valeurs?.commentaire}
        aide="Dix caractères au minimum. Ce que le prochain client gagnerait à savoir : ponctualité, propreté, devis respecté."
        erreur={etat.erreurs?.commentaire}
      />

      <Bouton type="submit" variante="primaire" enCours={enCours}>
        Déposer mon avis
      </Bouton>

      {/* Le refus GLOBAL passe par la primitive ; `.refus` reste au-dessus
          pour l'erreur du groupe de notes, qui est une erreur de CHAMP et se
          dessine comme celles de `Champ.module.css`. */}
      {etat.message ? <Alerte>{etat.message}</Alerte> : null}
    </form>
  );
}
