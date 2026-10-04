'use client';

/* ══════════════════════════════════════════════════════════════════════════
   LE FORMULAIRE DE DEVIS, DANS LA CARTE DU CHANTIER

   Client, et pour deux raisons précises :

     • `useActionState` — le refus de l'API (« vous avez déjà un devis en cours
       sur ce besoin ») doit s'afficher SOUS ce chantier-là, sans effacer les
       onze autres cartes de la liste ;
     • un état d'ouverture — une liste de dix chantiers portant dix
       formulaires dépliés n'est plus une liste. Le formulaire se déplie au
       clic, et reste déplié tant qu'il porte un refus.

   Rien d'autre n'est client sur cet écran. La liste, elle, est rendue par le
   serveur.

   ── Le succès n'est pas un état de ce composant ────────────────────────────

   L'action appelle `refresh()`. Le nouveau rendu arrive dans la réponse de
   l'action, et la page ne met plus ce composant dans la carte : elle y met
   « devis envoyé », parce que `mesDevis` contient désormais un devis vivant
   sur ce chantier. Le composant disparaît donc au moment de réussir, ce qui
   évite d'avoir à inventer un drapeau de réussite dans `EtatFormulaire`.
   ══════════════════════════════════════════════════════════════════════════ */

import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { Alerte } from '@/components/Alerte';
import { ETAT_INITIAL } from '@/lib/formulaire';
import { proposerDevis } from '@/app/actions/artisan';
import { Bouton } from '@/components/Bouton';
import { Champ, ChampTexteLong } from '@/components/Champ';

import styles from './page.module.css';

export interface ProprietesProposerDevis {
  /** L'identifiant du besoin à chiffrer. */
  besoin: string;
  /** Repris dans le libellé du dépliant, pour que le bouton dise de quoi il parle. */
  titre: string;
}

export function ProposerDevis({ besoin, titre }: ProprietesProposerDevis): ReactNode {
  const [etat, agir, enCours] = useActionState(proposerDevis, ETAT_INITIAL);

  /**
   * Trois états et non un booléen : `null` signifie « personne n'a encore
   * choisi », et laisse alors le refus décider. Un simple `ouvert: boolean`
   * forcé à `true` par le refus empêcherait de refermer le formulaire après
   * une erreur — le bouton « Annuler » serait inerte.
   */
  const [choix, setChoix] = useState<'ouvert' | 'ferme' | null>(null);

  // Un refus garde le formulaire ouvert : le replier effacerait la phrase qui
  // explique ce qu'il faut corriger, et la saisie avec elle.
  const refuse = Boolean(etat.message) || Object.keys(etat.erreurs ?? {}).length > 0;
  const deplie = choix === null ? refuse : choix === 'ouvert';

  if (!deplie) {
    return (
      <Bouton variante="primaire" taille="sm" onClick={() => setChoix('ouvert')}>
        Proposer un devis
        <span className="lecture-seule"> pour {titre}</span>
      </Bouton>
    );
  }

  return (
    <form className={styles.formulaireDevis} action={agir}>
      <input type="hidden" name="besoin" value={besoin} />

      <p className={styles.formulaireTitre}>Votre devis pour ce chantier</p>

      <div className={styles.formulaireLigne}>
        <Champ
          nom="montant"
          libelle="Montant, en dirhams"
          inputMode="decimal"
          autoComplete="off"
          required
          defaultValue={etat.valeurs?.montant ?? ''}
          erreur={etat.erreurs?.montant}
          aide="Tout compris, deux décimales au plus. Par exemple 4500 ou 4500,50."
        />
        <Champ
          nom="delaiJours"
          libelle="Délai, en jours"
          type="number"
          min={1}
          max={365}
          step={1}
          autoComplete="off"
          required
          defaultValue={etat.valeurs?.delaiJours ?? ''}
          erreur={etat.erreurs?.delaiJours}
          aide="À compter du jour où le client accepte."
        />
      </div>

      <ChampTexteLong
        nom="message"
        libelle="Ce que vous comptez faire"
        rows={4}
        required
        defaultValue={etat.valeurs?.message ?? ''}
        erreur={etat.erreurs?.message}
        aide="Dix caractères au moins. Le client lit ce mot avant de choisir."
      />

      {etat.message ? (
        <Alerte>{etat.message}</Alerte>
      ) : null}

      <div className={styles.formulaireActions}>
        <Bouton type="submit" taille="sm" enCours={enCours}>
          {enCours ? 'Envoi…' : 'Envoyer le devis'}
        </Bouton>
        <Bouton
          variante="fantome"
          taille="sm"
          type="button"
          onClick={() => setChoix('ferme')}
          disabled={enCours}
        >
          Annuler
        </Bouton>
      </div>
    </form>
  );
}
