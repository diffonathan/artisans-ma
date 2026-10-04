/* ══════════════════════════════════════════════════════════════════════════
   /mon-planning — LES INTERVENTIONS GAGNÉES

   ── C'est le seul écran de l'artisan où l'adresse existe ───────────────────

   Et ce n'est pas une exception consentie : l'adresse n'est pas lue sur le
   besoin, elle est lue sur LA RÉSERVATION, où elle a été recopiée à
   l'acceptation du devis — comme le montant. L'artisan retenu l'a parce
   qu'elle est chez lui. Les autres ne l'ont pas parce qu'elle n'y est pas.
   Il n'y a donc aucun contrôle d'habilitation à écrire dans cette page, et
   c'était l'intérêt du détour (`README.md`).

   Le téléphone suit le même chemin, par `Reservation.demandeur`. Il est rendu
   en lien `tel:` parce que l'usage réel est un appel depuis un chantier, d'une
   main, pour prévenir d'un retard.

   ── L'ordre vient de l'API ─────────────────────────────────────────────────

   `monPlanning` est documenté « par créneau croissant ». L'écran ne retrie
   pas : un second tri local qui dériverait du premier ferait apparaître deux
   vérités selon l'écran consulté.

   ── « Terminer » n'est proposé qu'au statut PAYEE ──────────────────────────

   C'est ce que `terminerPrestation` accepte, et seulement cela. Chaque statut
   reçoit donc sa propre phrase : ce qui est attendu, de qui, et ce que le
   prochain geste déclenche.
   ══════════════════════════════════════════════════════════════════════════ */

import { Suspense } from 'react';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { creneauCompact } from '@/lib/dates';
import { BoutonLien } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { Squelette } from '@/components/Squelette';
import { CHEMINS } from '@/components/chemins';
import { Etiquette } from '@/components/Etiquette';
import { Montant } from '@/components/Montant';
import { phraseDErreur } from '@/lib/erreurs';
import { appelerGraphQLAvecSession } from '@/lib/graphql';
import type { StatutReservation } from '@/lib/domaine';
import { exigerRole } from '@/lib/session';

import { TerminerPrestation } from './TerminerPrestation';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Mon planning',
  description:
    'Les interventions attribuées, leur créneau, leur adresse et le téléphone du client.',
};

const REQUETE_PLANNING = `
  query MonPlanning {
    monPlanning {
      _id
      statut
      montantCentimes
      commissionCentimes
      adresseIntervention
      avisDeposeA
      creneau { debut fin }
      demandeur { nom telephone }
      chantier { _id titre }
    }
  }
`;

interface Intervention {
  _id: string;
  statut: StatutReservation;
  montantCentimes: number;
  commissionCentimes: number;
  adresseIntervention: string;
  avisDeposeA: string | null;
  creneau: { debut: string; fin: string };
  demandeur: { nom: string; telephone: string | null } | null;
  chantier: { _id: string; titre: string } | null;
}

/* ── Les trois états ────────────────────────────────────────────────────── */

function Vide(): ReactNode {
  return (
    <Carte className={styles.etatVide}>
      <h2 className={styles.titreEtat}>Aucune intervention à votre planning</h2>
      <p>
        Une intervention apparaît ici quand un client accepte l&apos;un de vos devis. C&apos;est à
        ce moment-là, et pas avant, que son adresse et son téléphone vous sont communiqués.
      </p>
      <div className={styles.actionsEtat}>
        <BoutonLien variante="secondaire" taille="sm" href={CHEMINS.chantiers}>
          Voir les chantiers à chiffrer
        </BoutonLien>
        <BoutonLien variante="fantome" taille="sm" href={CHEMINS.mesDevis}>
          Suivre mes devis
        </BoutonLien>
      </div>
    </Carte>
  );
}

function Echec({ phrase }: { phrase: string }): ReactNode {
  return (
    <Carte className={styles.etatEchec}>
      <h2 className={styles.titreEtat}>Votre planning n&apos;a pas pu être chargé</h2>
      <p className={styles.phraseEchec} role="alert">
        {phrase}
      </p>
      <p>
        Vos interventions ne sont pas annulées pour autant : cet écran les lit, il ne les décide
        pas.
      </p>
    </Carte>
  );
}

/* ── Ce que chaque statut attend ────────────────────────────────────────── */

function PhaseDuStatut({ intervention }: { intervention: Intervention }): ReactNode {
  const chantier = intervention.chantier?.titre ?? 'cette intervention';

  switch (intervention.statut) {
    case 'A_PAYER':
      return (
        <p className={styles.phase}>
          En attente du paiement du client. Vous avez déjà son adresse et son téléphone : de quoi
          convenir de l&apos;heure.
        </p>
      );

    case 'PAYEE':
      return (
        <>
          <p className={styles.phase}>
            Payée. Il reste à déclarer la fin de la prestation, une fois le chantier fait.
          </p>
          <TerminerPrestation reservation={intervention._id} chantier={chantier} />
        </>
      );

    case 'TERMINEE':
      return (
        <p className={styles.phase}>
          {intervention.avisDeposeA
            ? 'Terminée, et le client a déposé son avis. Il compte dans votre note.'
            : 'Terminée. Le client peut déposer un avis — un seul, et il entrera dans votre note.'}
        </p>
      );

    case 'ANNULEE':
      return (
        <p className={styles.phase}>
          Annulée. Il n&apos;y a rien à faire, et ce chantier ne vous sera pas facturé.
        </p>
      );
  }
}

/* ── Une intervention ───────────────────────────────────────────────────── */

function LigneIntervention({ intervention }: { intervention: Intervention }): ReactNode {
  const { jour, heures } = creneauCompact(intervention.creneau.debut, intervention.creneau.fin);
  const titre = intervention.chantier?.titre ?? 'Chantier retiré du site';

  // Soustraction en centimes entiers : le net de l'artisan est exact, et
  // aucune division par cent n'approche de l'écran.
  const netCentimes = intervention.montantCentimes - intervention.commissionCentimes;

  return (
    <Carte balise="li" className={styles.intervention}>
      <div className={styles.enTete}>
        <h2 className={styles.titreIntervention}>{titre}</h2>
        <Etiquette statut={intervention.statut} dense />
      </div>

      <p className={styles.creneau}>
        <span className={styles.creneauJour}>{jour}</span>
        {heures ? <span className={`nombre ${styles.creneauHeures}`}>{heures}</span> : null}
      </p>

      {/* ── Ce que l'artisan ne reçoit QUE parce qu'il a gagné ──────────── */}
      <div className={styles.coordonnees}>
        <p className={styles.mentionCoordonnees}>
          Communiquées parce que ce chantier vous a été attribué.
        </p>

        <dl className={styles.paires}>
          <div className={styles.paire}>
            <dt>Adresse d&apos;intervention</dt>
            <dd className={styles.adresse}>{intervention.adresseIntervention}</dd>
          </div>

          <div className={styles.paire}>
            <dt>Client</dt>
            <dd>
              {intervention.demandeur ? (
                <>
                  {intervention.demandeur.nom}
                  {intervention.demandeur.telephone ? (
                    <>
                      {' — '}
                      {/* Un lien `tel:` et non un numéro en texte : l'usage est
                          d'appeler depuis le chantier, pas de recopier. */}
                      <a
                        className={`nombre ${styles.telephone}`}
                        href={`tel:${intervention.demandeur.telephone.replace(/\s/g, '')}`}
                      >
                        {intervention.demandeur.telephone}
                      </a>
                    </>
                  ) : (
                    <span className={styles.sansTelephone}>
                      {' '}
                      — ce client n&apos;a pas donné de numéro
                    </span>
                  )}
                </>
              ) : (
                <span className={styles.sansTelephone}>Compte client indisponible</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <dl className={styles.paires}>
        <div className={styles.paire}>
          <dt>Montant figé</dt>
          <dd>
            <Montant centimes={intervention.montantCentimes} />
          </dd>
        </div>
        <div className={styles.paire}>
          <dt>Commission Artisans.ma</dt>
          <dd>
            <Montant centimes={intervention.commissionCentimes} />
          </dd>
        </div>
        <div className={styles.paire}>
          <dt>Vous revient</dt>
          <dd>
            <Montant centimes={netCentimes} />
          </dd>
        </div>
      </dl>

      <PhaseDuStatut intervention={intervention} />
    </Carte>
  );
}

/* ── La liste ───────────────────────────────────────────────────────────── */

async function ListePlanning(): Promise<ReactNode> {
  let reponse: { monPlanning: Intervention[] };
  try {
    reponse = await appelerGraphQLAvecSession<{ monPlanning: Intervention[] }>(REQUETE_PLANNING);
  } catch (erreur) {
    return <Echec phrase={phraseDErreur(erreur)} />;
  }

  const planning = reponse.monPlanning;
  if (planning.length === 0) return <Vide />;

  return (
    <>
      <p className={styles.compte}>
        <span className="nombre">{planning.length}</span>
        {planning.length > 1 ? ' interventions' : ' intervention'}, du créneau le plus proche au
        plus lointain
      </p>
      <ul className={styles.liste}>
        {planning.map((intervention) => (
          <LigneIntervention key={intervention._id} intervention={intervention} />
        ))}
      </ul>
    </>
  );
}

/* ── La page ────────────────────────────────────────────────────────────── */

export default async function PageMonPlanning() {
  await exigerRole(['ARTISAN'], { suite: CHEMINS.monPlanning });
  return (
    <div className={styles.page}>
      <header className={styles.ouverture}>
        <p className={styles.surtitre}>Espace artisan</p>
        <h1 className={styles.titre}>Mon planning</h1>
        <p className={styles.chapeau}>
          Les chantiers que vous avez gagnés, avec leur adresse et le téléphone du client : de
          quoi vous y rendre, et prévenir si vous avez du retard.
        </p>
      </header>

      <Suspense fallback={<Squelette cartes={2} lignes={3} annonce="Chargement de votre planning…" />}>
        <ListePlanning />
      </Suspense>
    </div>
  );
}
