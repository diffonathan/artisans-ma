'use client';

/* ══════════════════════════════════════════════════════════════════════════
   DÉCLARER UNE PRESTATION TERMINÉE

   Deux raisons d'être client :

     • `useActionState`, pour que le refus de l'API s'affiche sous CETTE
       intervention — « Cette prestation n'est pas la vôtre, ou n'est pas au
       statut payé. » arrive quand la page a vieilli ;
     • une confirmation en deux temps. Ce geste ouvre le droit d'avis du client
       et clôt le chantier ; il n'existe aucune mutation pour le défaire. Un
       bouton qui agit au premier clic, au milieu d'une liste, se touche par
       accident sur un téléphone tenu d'une main sur un chantier.

   La confirmation est un état local et non une boîte de dialogue du
   navigateur : `confirm()` n'est pas stylable, parle la langue du système et
   ne dit pas ce que l'action déclenche.
   ══════════════════════════════════════════════════════════════════════════ */

import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { Alerte } from '@/components/Alerte';
import { ETAT_INITIAL } from '@/lib/formulaire';
import { terminerPrestation } from '@/app/actions/artisan';
import { Bouton } from '@/components/Bouton';

import styles from './page.module.css';

export interface ProprietesTerminerPrestation {
  reservation: string;
  /** Le chantier concerné, rappelé aux lecteurs d'écran. */
  chantier: string;
}

export function TerminerPrestation({
  reservation,
  chantier,
}: ProprietesTerminerPrestation): ReactNode {
  const [etat, agir, enCours] = useActionState(terminerPrestation, ETAT_INITIAL);
  const [confirme, setConfirme] = useState(false);

  if (!confirme) {
    return (
      <div className={styles.achevement}>
        <Bouton variante="secondaire" taille="sm" onClick={() => setConfirme(true)}>
          Déclarer la prestation terminée
          <span className="lecture-seule"> — {chantier}</span>
        </Bouton>
        {etat.message ? (
          <Alerte>{etat.message}</Alerte>
        ) : null}
      </div>
    );
  }

  return (
    <form className={styles.achevement} action={agir}>
      <input type="hidden" name="reservation" value={reservation} />
      <p className={styles.achevementAvertissement}>
        En déclarant la fin, vous clôturez ce chantier et vous ouvrez au client le droit de déposer
        un avis. Il n&apos;en déposera qu&apos;un, et vous ne pourrez pas revenir en arrière.
      </p>
      <div className={styles.achevementActions}>
        <Bouton type="submit" taille="sm" enCours={enCours}>
          {enCours ? 'Enregistrement…' : 'Oui, la prestation est terminée'}
        </Bouton>
        <Bouton
          variante="fantome"
          taille="sm"
          type="button"
          onClick={() => setConfirme(false)}
          disabled={enCours}
        >
          Pas encore
        </Bouton>
      </div>
      {etat.message ? (
        <Alerte>{etat.message}</Alerte>
      ) : null}
    </form>
  );
}
