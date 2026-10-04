'use client';

/* ══════════════════════════════════════════════════════════════════════════
   RETIRER UN DEVIS

   Client pour une seule raison : `useActionState`. Un `<form action={…}>`
   rendu par le serveur sait très bien poster l'action, mais il jette sa valeur
   de retour — le refus « Ce devis n'existe pas, ou n'est plus retirable. » ne
   s'afficherait nulle part, ou remonterait jusqu'à `app/error.tsx` en
   effaçant la liste.

   Ce refus n'est pas théorique : entre le moment où la liste s'affiche et le
   clic, le client a pu accepter le devis. Le statut lu à l'écran est donc
   peut-être périmé, et c'est l'API qui tranche.

   Ce composant devrait être une primitive du socle — « un bouton qui poste une
   action et montre son refus à côté de lui ». Il n'y en a pas ; il est écrit
   localement et signalé dans le compte rendu.
   ══════════════════════════════════════════════════════════════════════════ */

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { Alerte } from '@/components/Alerte';
import { ETAT_INITIAL } from '@/lib/formulaire';
import { retirerDevis } from '@/app/actions/artisan';
import { Bouton } from '@/components/Bouton';

import styles from './page.module.css';

export interface ProprietesRetirerDevis {
  devis: string;
  /** Rappelé au lecteur d'écran : « Retirer » seul ne dit pas quel devis. */
  chantier: string;
}

export function RetirerDevis({ devis, chantier }: ProprietesRetirerDevis): ReactNode {
  const [etat, agir, enCours] = useActionState(retirerDevis, ETAT_INITIAL);

  return (
    <form className={styles.retrait} action={agir}>
      <input type="hidden" name="devis" value={devis} />
      <Bouton type="submit" variante="danger" taille="sm" enCours={enCours}>
        {enCours ? 'Retrait…' : 'Retirer ce devis'}
        <span className="lecture-seule"> — {chantier}</span>
      </Bouton>
      {etat.message ? (
        <Alerte>{etat.message}</Alerte>
      ) : null}
    </form>
  );
}
