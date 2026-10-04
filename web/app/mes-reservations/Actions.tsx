'use client';

/* ══════════════════════════════════════════════════════════════════════════
   LES DEUX ACTIONS D'UNE RÉSERVATION : payer, annuler

   'use client' est ici obligatoire, et pour deux raisons distinctes :
   `useActionState` tient le refus de l'API et l'état d'attente de chaque
   formulaire, et l'annulation demande une confirmation, donc un état local.

   Ce composant NE DÉCIDE RIEN. C'est la page qui calcule, par
   `actionsPossibles`, laquelle des deux actions est permise — la décision est
   la même pour l'écran et pour le test, et elle n'est écrite qu'une fois.
   ══════════════════════════════════════════════════════════════════════════ */

import { useActionState, useState } from 'react';

import { Alerte } from '@/components/Alerte';
import { annulerReservation, payerReservation } from '@/app/actions/reservations';
import { ETAT_INITIAL } from '@/lib/formulaire';
import type { EtatFormulaire } from '@/lib/formulaire';
import { Bouton } from '@/components/Bouton';

import styles from './page.module.css';

export interface ProprietesActions {
  reservation: string;
  peutPayer: boolean;
  peutAnnuler: boolean;
}

export function Actions({ reservation, peutPayer, peutAnnuler }: ProprietesActions) {
  /*
   * Les deux hameçons sont appelés sans condition, avant tout rendu
   * conditionnel : React identifie les états par leur ORDRE d'appel, et un
   * hameçon placé derrière un `if` change de rang dès que la condition change
   * — ici, dès qu'un paiement fait passer la réservation de A_PAYER à PAYEE.
   */
  const [etatPaiement, actionPayer, paiementEnCours] = useActionState<EtatFormulaire, FormData>(
    payerReservation,
    ETAT_INITIAL,
  );
  const [etatAnnulation, actionAnnuler, annulationEnCours] = useActionState<
    EtatFormulaire,
    FormData
  >(annulerReservation, ETAT_INITIAL);

  const [confirmationDemandee, setConfirmationDemandee] = useState(false);

  if (!peutPayer && !peutAnnuler) return null;

  return (
    <div className={styles.actions}>
      {peutPayer ? (
        <form action={actionPayer} className={styles.action}>
          <input type="hidden" name="reservation" value={reservation} />
          <Bouton type="submit" variante="primaire" enCours={paiementEnCours}>
            Enregistrer le paiement
          </Bouton>
          {/*
           * La mention n'est pas une précaution juridique, c'est la vérité du
           * bouton : rien ici ne débite personne. La cacher laisserait croire
           * que le client déclare lui-même ses paiements, ce qu'aucune place
           * de marché ne fait.
           */}
          <p className={styles.mention}>
            Ce bouton fait passer la réservation à « payée » sans qu&apos;aucun paiement ait lieu,
            pour que le parcours soit jouable en démonstration. En exploitation, cette bascule
            viendrait de la notification signée du prestataire de paiement, reçue sur un point
            d&apos;entrée dédié et vérifiée avant d&apos;être crue.
          </p>
          {etatPaiement.message ? (
            <Alerte>{etatPaiement.message}</Alerte>
          ) : null}
        </form>
      ) : null}

      {peutAnnuler ? (
        <form action={actionAnnuler} className={styles.action}>
          <input type="hidden" name="reservation" value={reservation} />

          {confirmationDemandee ? (
            <>
              <p className={styles.mention}>
                L&apos;annulation est définitive pour cette réservation. Votre chantier redevient
                ouvert, et vous pourrez accepter un autre devis.
              </p>
              <div className={styles.confirmation}>
                <Bouton type="submit" variante="danger" enCours={annulationEnCours}>
                  Confirmer l&apos;annulation
                </Bouton>
                <Bouton
                  variante="fantome"
                  onClick={() => setConfirmationDemandee(false)}
                  disabled={annulationEnCours}
                >
                  Garder la réservation
                </Bouton>
              </div>
            </>
          ) : (
            /*
             * Deux temps avant une écriture irréversible. Sans JavaScript, ce
             * bouton n'ouvre rien et le formulaire n'est pas envoyé : c'est
             * voulu — mieux vaut une annulation impossible qu'une annulation
             * faite par mégarde.
             */
            <Bouton variante="secondaire" onClick={() => setConfirmationDemandee(true)}>
              Annuler la réservation
            </Bouton>
          )}

          {etatAnnulation.message ? (
            <Alerte>{etatAnnulation.message}</Alerte>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
