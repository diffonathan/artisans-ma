'use client';

/**
 * Comparer les devis reçus, et en accepter un.
 *
 * ── Ce que cet écran refuse de faire ──────────────────────────────────────
 * Il ne désigne pas de gagnant. L'API rend `devisRecus` trié par montant
 * croissant, et afficher cet ordre ferait de la première ligne une
 * recommandation que personne n'a formulée — alors qu'un prix bas est parfois
 * celui qui oublie la fourniture. Les devis sont donc remis dans leur ordre
 * d'ARRIVÉE côté serveur (`ordonnerParArrivee`), aucune carte ne porte de
 * mention « meilleur prix », et les trois grandeurs — montant, délai, note —
 * occupent la même place sur chaque carte pour que l'œil les compare
 * colonne par colonne.
 *
 * ── Pourquoi des boutons radio, et pas un bouton par carte ────────────────
 * Parce que choisir n'est pas agir. Un bouton « Accepter » sur chaque carte
 * mettrait la décision irréversible à un clic de la comparaison, au moment
 * exact où le lecteur promène son curseur d'un devis à l'autre. Le radio
 * sélectionne, le panneau de confirmation récapitule, et l'envoi est un
 * geste distinct.
 *
 * Accessoirement, le radio porte un `name` : le choix part donc avec le
 * formulaire même si JavaScript n'a pas chargé, et les deux champs de créneau
 * sont lus par la Server Action telle quelle. Cet écran fonctionne sans
 * hydratation, ce qu'un bouton par carte piloté par l'état n'aurait pas
 * permis.
 *
 * `'use client'` est là pour une seule chose : le récapitulatif nommé. Dire
 * « vous allez accepter le devis de Benali Électricité, 4 200,00 DH »
 * demande de savoir quel radio est coché avant l'envoi.
 */
import Link from 'next/link';
import { useActionState, useState } from 'react';

import { Alerte } from '@/components/Alerte';
import { ETAT_INITIAL } from '@/lib/formulaire';
import { accepterDevis } from '@/app/actions/devis';
import { Bouton } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { Etiquette } from '@/components/Etiquette';
import { Montant } from '@/components/Montant';
import { Note } from '@/components/Note';
import type { StatutDevis } from '@/lib/domaine';
import styles from './page.module.css';

export interface ArtisanDuDevis {
  id: string;
  raisonSociale: string;
  noteMoyenne: number;
  nombreAvis: number;
  verifie: boolean;
}

export interface DevisAComparer {
  id: string;
  montantCentimes: number;
  delaiJours: number;
  message: string;
  statut: StatutDevis;
  /** Déjà écrite en français par le serveur — voir `formaterDateCourte`. */
  recuLe: string | null;
  recuLeIso: string;
  /**
   * `Devis.auteur` est nullable dans le schéma : un profil artisan supprimé
   * laisserait un devis sans auteur. L'écran le dit au lieu d'afficher un
   * nom vide.
   */
  artisan: ArtisanDuDevis | null;
  /** Le chemin vers la fiche de l'artisan, ou `null` s'il n'a plus de profil. */
  cheminFiche: string | null;
}

export interface ProprietesChoixDuDevis {
  devis: readonly DevisAComparer[];
  /** Un devis ne s'accepte que sur un besoin encore OUVERT. */
  besoinOuvert: boolean;
  /**
   * `accepterDevis` est réservé au rôle CLIENT par l'API. Un administrateur
   * qui lit la page voit les devis et n'en accepte aucun : le panneau de
   * décision lui est retiré plutôt que de l'envoyer vers un refus
   * d'habilitation.
   */
  peutAccepter: boolean;
  cheminReservations: string;
}

export function ChoixDuDevis({
  devis,
  besoinOuvert,
  peutAccepter,
  cheminReservations,
}: ProprietesChoixDuDevis) {
  const [etat, agir, enCours] = useActionState(accepterDevis, ETAT_INITIAL);
  const [choisi, setChoisi] = useState<string | null>(null);

  const acceptables = devis.filter((candidat) => candidat.statut === 'ENVOYE');
  const retenu = devis.find((candidat) => candidat.statut === 'ACCEPTE') ?? null;
  const devisChoisi = acceptables.find((candidat) => candidat.id === choisi) ?? null;

  // Le panneau de décision ne s'affiche que s'il y a quelque chose à décider.
  const decisionPossible = besoinOuvert && peutAccepter && acceptables.length > 0;

  const cartes = (
    <ul className={styles.devis}>
      {devis.map((candidat) => {
        const selectionnable = decisionPossible && candidat.statut === 'ENVOYE';
        const coche = choisi === candidat.id;

        return (
          <li key={candidat.id}>
            {/*
             * Le `<label>` enveloppe la carte entière : toute sa surface est
             * la cible du radio, ce qui est à la fois ce qu'on attend et une
             * cible tactile confortable. `Carte` plutôt que `CarteLien` —
             * cette surface n'est pas un lien, et un lien y serait d'ailleurs
             * interdit, une ancre ne pouvant pas contenir d'élément de
             * formulaire.
             */}
            <label
              className={[
                styles.devisEtiquette,
                selectionnable ? styles.devisChoisissable : styles.devisFige,
                coche ? styles.devisCoche : null,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <Carte padding="md" className={styles.devisCarte}>
                <div className={styles.devisHaut}>
                  {selectionnable ? (
                    <input
                      className={styles.radio}
                      type="radio"
                      name="devis"
                      value={candidat.id}
                      checked={coche}
                      onChange={() => {
                        setChoisi(candidat.id);
                      }}
                    />
                  ) : null}

                  <div className={styles.devisIdentite}>
                    <span className={styles.devisArtisan}>
                      {candidat.artisan?.raisonSociale ?? 'Artisan retiré de la place'}
                    </span>
                    {candidat.artisan?.verifie ? (
                      <span className={styles.verifie}>Pièces vérifiées</span>
                    ) : null}
                  </div>

                  <Etiquette statut={candidat.statut} dense />
                </div>

                {/*
                 * Les trois grandeurs comparables, dans le même ordre sur
                 * chaque carte : montant, délai, note. C'est l'alignement qui
                 * rend la comparaison possible — trois cartes où le prix
                 * change de place obligent à le chercher trois fois.
                 */}
                <dl className={styles.grandeurs}>
                  <div className={styles.grandeur}>
                    <dt className={styles.grandeurNom}>Montant</dt>
                    <dd>
                      <Montant centimes={candidat.montantCentimes} taille="grand" />
                    </dd>
                  </div>

                  <div className={styles.grandeur}>
                    <dt className={styles.grandeurNom}>Délai annoncé</dt>
                    <dd className={styles.grandeurValeur}>
                      <span className="nombre">{candidat.delaiJours}</span>{' '}
                      {candidat.delaiJours > 1 ? 'jours' : 'jour'}
                    </dd>
                  </div>

                  <div className={styles.grandeur}>
                    <dt className={styles.grandeurNom}>Avis de ses clients</dt>
                    <dd>
                      {candidat.artisan ? (
                        <Note
                          note={candidat.artisan.noteMoyenne}
                          nombreAvis={candidat.artisan.nombreAvis}
                        />
                      ) : (
                        <span className={styles.grandeurAbsente}>—</span>
                      )}
                    </dd>
                  </div>
                </dl>

                <p className={styles.devisMessage}>{candidat.message}</p>

                <div className={styles.devisPied}>
                  {candidat.recuLe ? (
                    <time dateTime={candidat.recuLeIso}>Reçu le {candidat.recuLe}</time>
                  ) : null}
                  {candidat.cheminFiche ? (
                    // Un lien HORS de la carte cliquable : il est dans le
                    // `<label>`, donc un clic dessus suivrait le lien ET
                    // cocherait le radio. C'est acceptable — le radio est le
                    // geste anodin des deux —, mais l'ordre inverse ne
                    // l'aurait pas été.
                    <Link className={styles.lienFiche} href={candidat.cheminFiche}>
                      Voir la fiche de l&apos;artisan
                    </Link>
                  ) : null}
                </div>
              </Carte>
            </label>
          </li>
        );
      })}
    </ul>
  );

  /* ── Le besoin n'est plus ouvert : il n'y a plus de décision ──────────── */

  if (!besoinOuvert) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitre}>Les devis reçus</h2>
        <Carte padding="lg" className={retenu ? styles.attribue : styles.clos}>
          {retenu ? (
            <>
              <p className={styles.attribueTexte}>
                Ce chantier est attribué à{' '}
                <strong>{retenu.artisan?.raisonSociale ?? "l'artisan retenu"}</strong>, pour{' '}
                {/* `Montant` et non une somme écrite à la main : il porte
                    Azeret Mono et le rôle --or, que la charte réserve à tout
                    dirham affiché. */}
                <Montant centimes={retenu.montantCentimes} />. Le montant est figé&nbsp;:
                modifier le devis ne changerait plus la réservation.
              </p>
              <p className={styles.attribueTexte}>
                L&apos;adresse et votre téléphone ont été transmis à cet artisan seul, en même
                temps que la réservation. Les autres devis ont été refusés.
              </p>
              <Link className={styles.lienFiche} href={cheminReservations}>
                Voir la réservation
              </Link>
            </>
          ) : (
            // Un besoin CLOS sans devis accepté : la phrase sur l'adresse
            // transmise serait fausse, et c'est le genre de phrase qu'on garde
            // par inadvertance en réutilisant un bloc.
            <p className={styles.attribueTexte}>
              Ce chantier n&apos;accepte plus de devis, et aucun n&apos;a été accepté. Les devis
              reçus restent lisibles ci-dessous.
            </p>
          )}
        </Carte>
        {cartes}
      </section>
    );
  }

  /* ── Le chantier est ouvert : on compare, puis on décide ──────────────── */

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitre}>Les devis reçus</h2>

      <p className={styles.sectionPhrase}>
        Les devis sont rangés dans leur ordre d&apos;arrivée, et non du moins cher au plus cher.
        Le montant le plus bas n&apos;est pas forcément celui qui comprend la fourniture, ni celui
        dont les clients précédents sont contents.
      </p>

      {decisionPossible ? (
        <form action={agir} className={styles.formulaire}>
          {etat.message ? (
            <Alerte>{etat.message}</Alerte>
          ) : null}

          {cartes}

          {/* ── Le panneau de décision ──────────────────────────────────── */}

          <Carte padding="lg" className={styles.decision}>
            <h3 className={styles.decisionTitre}>Accepter un devis</h3>

            {/*
             * Les trois conséquences, écrites AVANT le geste et non après.
             * Elles sont la raison pour laquelle cet écran demande quatre
             * gestes au lieu d'un : un client qui découvre après coup que
             * trois artisans ont été refusés n'a aucun moyen de revenir en
             * arrière.
             */}
            <p className={styles.decisionPhrase}>
              Accepter un devis fait trois choses d&apos;un coup, et aucune ne se défait&nbsp;:
              les autres devis sont refusés, le montant du devis retenu est figé, et une
              réservation est créée avec votre adresse et votre téléphone, transmis à cet artisan
              seul.
            </p>

            <fieldset className={styles.creneau}>
              <legend className={styles.creneauTitre}>Quand souhaitez-vous l&apos;intervention</legend>
              <p className={styles.creneauPhrase}>
                Les heures sont celles du Maroc. Ce créneau est enregistré avec la réservation.
              </p>

              <div className={styles.creneauChamps}>
                <div className={styles.creneauChamp}>
                  <label className={styles.creneauLibelle} htmlFor="creneau-debut">
                    Début
                  </label>
                  <input
                    id="creneau-debut"
                    type="datetime-local"
                    name="debut"
                    required
                    defaultValue={etat.valeurs?.debut ?? ''}
                    aria-describedby={etat.erreurs?.debut ? 'creneau-debut-erreur' : undefined}
                    aria-invalid={etat.erreurs?.debut ? true : undefined}
                  />
                  {etat.erreurs?.debut ? (
                    <p className={styles.erreurChamp} id="creneau-debut-erreur" role="alert">
                      {etat.erreurs.debut}
                    </p>
                  ) : null}
                </div>

                <div className={styles.creneauChamp}>
                  <label className={styles.creneauLibelle} htmlFor="creneau-fin">
                    Fin prévue
                  </label>
                  <input
                    id="creneau-fin"
                    type="datetime-local"
                    name="fin"
                    required
                    defaultValue={etat.valeurs?.fin ?? ''}
                    aria-describedby={etat.erreurs?.fin ? 'creneau-fin-erreur' : undefined}
                    aria-invalid={etat.erreurs?.fin ? true : undefined}
                  />
                  {etat.erreurs?.fin ? (
                    <p className={styles.erreurChamp} id="creneau-fin-erreur" role="alert">
                      {etat.erreurs.fin}
                    </p>
                  ) : null}
                </div>
              </div>
            </fieldset>

            {/*
             * Le récapitulatif nommé. C'est la raison d'être du `'use client'`
             * de ce fichier : il cite le nom et le montant exact, pour que le
             * dernier geste ne porte pas sur « le devis coché » mais sur une
             * somme et une entreprise.
             */}
            <p className={styles.recapitulatif} aria-live="polite">
              {devisChoisi ? (
                <>
                  Devis choisi&nbsp;:{' '}
                  <strong>{devisChoisi.artisan?.raisonSociale ?? 'artisan retiré'}</strong>, pour{' '}
                  <Montant centimes={devisChoisi.montantCentimes} /> et{' '}
                  <span className="nombre">{devisChoisi.delaiJours}</span>{' '}
                  {devisChoisi.delaiJours > 1 ? 'jours' : 'jour'} de délai.
                </>
              ) : (
                'Aucun devis sélectionné pour le moment.'
              )}
            </p>

            <div className={styles.confirmation}>
              <label className={styles.confirmationLibelle}>
                <input
                  className={styles.caseConfirmation}
                  type="checkbox"
                  name="confirmation"
                  value="oui"
                  required
                  aria-describedby={
                    etat.erreurs?.confirmation ? 'confirmation-erreur' : undefined
                  }
                />
                <span>
                  J&apos;ai lu ce que l&apos;acceptation déclenche, et je veux retenir ce devis.
                </span>
              </label>
              {etat.erreurs?.confirmation ? (
                <p className={styles.erreurChamp} id="confirmation-erreur" role="alert">
                  {etat.erreurs.confirmation}
                </p>
              ) : null}
            </div>

            {/*
             * Le bouton n'est PAS neutralisé quand aucun devis n'est coché, et
             * c'est volontaire : l'état `choisi` n'existe pas avant
             * l'hydratation, donc un `disabled` calculé sur lui rendrait cet
             * écran inutilisable sans JavaScript. L'absence de choix est un
             * refus que la Server Action prononce, avec sa phrase.
             */}
            <Bouton type="submit" enCours={enCours}>
              Accepter ce devis et créer la réservation
            </Bouton>
          </Carte>
        </form>
      ) : (
        <>
          {cartes}
          {!peutAccepter ? (
            <p className={styles.sectionPhrase}>
              Seul le compte client propriétaire du chantier peut accepter un devis.
            </p>
          ) : null}
          {peutAccepter && acceptables.length === 0 ? (
            // Le chantier est ouvert, et tous les devis reçus ont été retirés
            // par leur auteur. Sans cette phrase, l'écran afficherait des
            // cartes barrées et aucun moyen d'agir, ce qui se lit comme une
            // panne.
            <p className={styles.sectionPhrase}>
              Aucun des devis reçus n&apos;est encore en attente de votre décision&nbsp;: leurs
              auteurs les ont retirés. Le chantier reste ouvert, et un artisan peut en déposer un
              nouveau.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
