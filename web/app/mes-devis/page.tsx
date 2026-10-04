/* ══════════════════════════════════════════════════════════════════════════
   /mes-devis — CE QUE J'AI CHIFFRÉ, ET CE QU'IL EN EST DEVENU

   ── Groupés par statut, et dans cet ordre ──────────────────────────────────

   L'API rend `mesDevis` du plus récent au plus ancien, tous statuts mêlés.
   Trié ainsi, un devis en attente de réponse se retrouve entre deux devis
   refusés le mois dernier, et l'artisan ne sait plus où regarder.

   L'ordre des groupes suit ce qu'il y a à FAIRE :

     1. ENVOYÉ  — en attente du client, et la seule action possible est ici ;
     2. ACCEPTÉ — gagné, la suite est dans le planning ;
     3. REFUSÉ  — le client a choisi quelqu'un d'autre ;
     4. RETIRÉ  — retiré par l'artisan lui-même.

   Les deux derniers ne sont pas cachés : ils disent à quoi ressemble le taux
   de réussite, et un devis retiré explique pourquoi la place est libre sur un
   chantier de `/chantiers`.

   ── Pourquoi aucun lien vers le chantier ──────────────────────────────────

   `CHEMINS_AVEC_ID.besoin(id)` mène à `/mes-besoins/:id`, qui est l'écran du
   CLIENT propriétaire. Un artisan y serait refusé. Il n'existe pas de fiche
   de chantier côté artisan, et la carte porte donc le titre sans lien — c'est
   signalé dans le compte rendu.

   ── L'adresse, encore ─────────────────────────────────────────────────────

   `Devis.chantier` est un `Besoin`, dont `adresse` vaut `null` pour l'artisan.
   Cet écran ne la demande pas : ni dans la requête, ni dans la mise en page.
   ══════════════════════════════════════════════════════════════════════════ */

import { Suspense } from 'react';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { formaterDate } from '@/lib/dates';
import { BoutonLien } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { Squelette } from '@/components/Squelette';
import { CHEMINS } from '@/components/chemins';
import { Etiquette } from '@/components/Etiquette';
import { Montant } from '@/components/Montant';
import { phraseDErreur } from '@/lib/erreurs';
import { appelerGraphQLAvecSession } from '@/lib/graphql';
import type { StatutDevis } from '@/lib/domaine';
import { exigerRole } from '@/lib/session';

import { RetirerDevis } from './RetirerDevis';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Mes devis',
  description: "Les devis envoyés, leur statut, et le retrait de ceux qui n'ont pas encore répondu.",
};

const REQUETE_DEVIS = `
  query MesDevis {
    mesDevis {
      _id
      montantCentimes
      delaiJours
      statut
      createdAt
      chantier { _id titre }
    }
  }
`;

interface MonDevis {
  _id: string;
  montantCentimes: number;
  delaiJours: number;
  statut: StatutDevis;
  createdAt: string;
  chantier: { _id: string; titre: string } | null;
}

/* ── Les groupes ────────────────────────────────────────────────────────── */

interface Groupe {
  statut: StatutDevis;
  titre: string;
  phrase: string;
}

/**
 * L'ordre d'affichage, et ce que chaque statut veut dire pour l'artisan.
 *
 * Le libellé de l'étiquette vient du socle (`Etiquette`) ; ces titres-là sont
 * des titres de SECTION, qui disent l'état d'avancement et non le mot du
 * schéma. « Envoyé » sur une pastille, « En attente de réponse » en titre.
 */
const GROUPES: readonly Groupe[] = [
  {
    statut: 'ENVOYE',
    titre: 'En attente de réponse',
    phrase: 'Le client ne s’est pas encore prononcé. C’est le seul statut où un devis se retire.',
  },
  {
    statut: 'ACCEPTE',
    titre: 'Acceptés',
    phrase: 'Le chantier est à vous. L’adresse et le téléphone du client sont sur votre planning.',
  },
  {
    statut: 'REFUSE',
    titre: 'Refusés',
    phrase: 'Le client a accepté le devis d’un autre artisan — les concurrents sont refusés d’office.',
  },
  {
    statut: 'RETIRE',
    titre: 'Retirés',
    phrase: 'Retirés par vous. La place est de nouveau libre sur ces chantiers.',
  },
];

/* ── Les trois états ────────────────────────────────────────────────────── */

function Vide(): ReactNode {
  return (
    <Carte className={styles.etatVide}>
      <h2 className={styles.titreEtat}>Vous n&apos;avez envoyé aucun devis</h2>
      <p>
        Les chantiers ouverts dans votre rayon vous attendent. Un devis se compose d&apos;un
        montant, d&apos;un délai et d&apos;un mot sur ce que vous comptez faire — c&apos;est ce mot
        que le client lit avant de choisir.
      </p>
      <BoutonLien variante="secondaire" taille="sm" href={CHEMINS.chantiers}>
        Voir les chantiers à chiffrer
      </BoutonLien>
    </Carte>
  );
}

function Echec({ phrase }: { phrase: string }): ReactNode {
  return (
    <Carte className={styles.etatEchec}>
      <h2 className={styles.titreEtat}>Vos devis n&apos;ont pas pu être chargés</h2>
      <p className={styles.phraseEchec} role="alert">
        {phrase}
      </p>
      <p>Rien n&apos;a été perdu : cet écran lit vos devis, il ne les modifie pas.</p>
    </Carte>
  );
}

/* ── Une ligne de devis ─────────────────────────────────────────────────── */

function LigneDevis({ devis }: { devis: MonDevis }): ReactNode {
  // `chantier` est nullable : le chargeur groupé rend `null` si le besoin a
  // disparu. L'écran le dit au lieu d'afficher un titre vide.
  const titre = devis.chantier?.titre ?? 'Chantier retiré du site';

  return (
    <Carte balise="li" className={styles.devis}>
      <div className={styles.enTeteDevis}>
        <h3 className={styles.titreDevis}>{titre}</h3>
        <Etiquette statut={devis.statut} dense />
      </div>

      <dl className={styles.chiffres}>
        <div className={styles.chiffre}>
          <dt>Montant</dt>
          <dd>
            <Montant centimes={devis.montantCentimes} />
          </dd>
        </div>
        <div className={styles.chiffre}>
          <dt>Délai</dt>
          <dd>
            <span className="nombre">{devis.delaiJours}</span>
            {devis.delaiJours > 1 ? ' jours' : ' jour'}
          </dd>
        </div>
        <div className={styles.chiffre}>
          <dt>Envoyé le</dt>
          <dd className={styles.jour}>{formaterDate(devis.createdAt) ?? ''}</dd>
        </div>
      </dl>

      {/* Le retrait n'est proposé QUE sur un devis envoyé, parce que c'est le
          seul statut que `retirerDevis` accepte. Proposer un bouton ailleurs
          serait promettre une action que l'API refuse. */}
      {devis.statut === 'ENVOYE' ? <RetirerDevis devis={devis._id} chantier={titre} /> : null}

      {devis.statut === 'ACCEPTE' ? (
        <BoutonLien variante="fantome" taille="sm" href={CHEMINS.monPlanning}>
          Voir l&apos;intervention
        </BoutonLien>
      ) : null}
    </Carte>
  );
}

/* ── La liste ───────────────────────────────────────────────────────────── */

async function ListeDevis(): Promise<ReactNode> {
  let reponse: { mesDevis: MonDevis[] };
  try {
    reponse = await appelerGraphQLAvecSession<{ mesDevis: MonDevis[] }>(REQUETE_DEVIS);
  } catch (erreur) {
    return <Echec phrase={phraseDErreur(erreur)} />;
  }

  const tous = reponse.mesDevis;
  if (tous.length === 0) return <Vide />;

  return (
    <div className={styles.groupes}>
      {GROUPES.map((groupe) => {
        // L'API rend déjà du plus récent au plus ancien ; le filtrage conserve
        // cet ordre, donc aucun tri n'est refait ici.
        const devisDuGroupe = tous.filter((devis) => devis.statut === groupe.statut);
        if (devisDuGroupe.length === 0) return null;

        return (
          <section className={styles.groupe} key={groupe.statut}>
            <h2 className={styles.titreGroupe}>
              {groupe.titre}
              <span className={`nombre ${styles.compteGroupe}`}>{devisDuGroupe.length}</span>
            </h2>
            <p className={styles.phraseGroupe}>{groupe.phrase}</p>
            <ul className={styles.liste}>
              {devisDuGroupe.map((devis) => (
                <LigneDevis key={devis._id} devis={devis} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/* ── La page ────────────────────────────────────────────────────────────── */

export default async function PageMesDevis() {
  await exigerRole(['ARTISAN'], { suite: CHEMINS.mesDevis });
  return (
    <div className={styles.page}>
      <header className={styles.ouverture}>
        <p className={styles.surtitre}>Espace artisan</p>
        <h1 className={styles.titre}>Mes devis</h1>
        <p className={styles.chapeau}>
          Rangés par ce qu&apos;il y a à faire : les devis en attente d&apos;abord, puis ceux qui
          ont trouvé leur réponse.
        </p>
      </header>

      <Suspense fallback={<Squelette cartes={3} lignes={2} annonce="Chargement de vos devis…" />}>
        <ListeDevis />
      </Suspense>
    </div>
  );
}
