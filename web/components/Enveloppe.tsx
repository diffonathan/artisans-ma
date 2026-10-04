'use client';

/**
 * L'enveloppe de l'application : barre d'en-tête, navigation, pied de page.
 *
 * ── Pourquoi 'use client' sur une enveloppe ───────────────────────────────
 * Parce qu'elle marque la rubrique courante, et que LIRE L'URL DEPUIS UN
 * COMPOSANT SERVEUR N'EXISTE PAS dans l'App Router : c'est un refus délibéré
 * de Next, pour que l'état d'une disposition survive aux navigations. Seul
 * `usePathname` répond, et c'est un hook client.
 *
 * Le coût est borné et vaut d'être su : `children` continue d'être rendu sur
 * le SERVEUR et traverse cette frontière en charge utile RSC. Les pages
 * restent donc des composants serveur ; seul le chrome — une centaine de
 * lignes de JSX — part dans le paquet client.
 *
 * `cacheComponents` est éteint dans next.config.ts ; si quelqu'un l'allume,
 * `usePathname` demandera une frontière <Suspense> au-dessus de cette
 * enveloppe sur toute route à paramètre dynamique non prérendu.
 *
 * ── Ce que cette enveloppe NE fait pas ────────────────────────────────────
 * Elle ne lit pas la session, et elle ne peut pas : lire un cookie est un
 * geste de serveur, et ce fichier part dans le navigateur. Le compte lui est
 * PASSÉ, résolu par `lib/entete.ts` et monté par `app/layout.tsx` — une fois
 * pour toute l'application, au lieu des huit copies que les pages portaient.
 *
 * Elle ne monte pas non plus la visite guidée. Le bouton « Aide » en émet
 * l'intention, rien de plus ; <VisiteGuidee /> est montée en FRÈRE de cette
 * enveloppe, par `app/layout.tsx`, UNE fois pour toute l'application. Deux
 * instances se disputeraient le focus, et l'importer d'ici ferait entrer les
 * étapes de la visite dans le paquet de l'en-tête, chargé sur toutes les
 * pages.
 */
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import logoArtisans from '@/brand/logo.svg';
import { BoutonLien } from './Bouton';
import { CHEMINS } from './chemins';
import styles from './Enveloppe.module.css';

/**
 * L'intention « ouvrir l'aide », émise sur `window`.
 *
 * La valeur double `EVENEMENT_AIDE` de `components/visite-guidee/etapes.ts`,
 * et la raison n'est PAS une frontière à franchir — `etapes.ts` ne porte aucune
 * directive, donc cette enveloppe cliente pourrait l'importer sans difficulté.
 * La raison est le POIDS : importer `etapes.ts` tirerait ses six étapes de
 * prose dans le graphe client de l'en-tête, c'est-à-dire sur toutes les pages,
 * alors que la visite n'est montée qu'une fois et ailleurs. Se fier au
 * secouage d'arbre pour les retirer serait un pari, et ce projet ne le prend
 * pas ailleurs non plus.
 *
 * Pas exporté, à la différence de l'ancienne version : un export inutilisé
 * depuis un module 'use client' est exactement le piège de référence client
 * que `./chemins` documente, et personne ne lisait celui-ci. Le coût accepté
 * est qu'un renommage se fasse aux deux endroits.
 *
 * Cette visite accepte DEUX déclencheurs : cet événement, ou un clic sur un
 * élément portant `data-aide`. Le bouton ci-dessous n'utilise que le premier.
 * Porter les deux ouvrirait la visite deux fois pour un seul clic.
 */
const EVENEMENT_AIDE = 'artisans:ouvrir-aide';

/*
 * Les chemins ont DÉMÉNAGÉ dans './chemins', et ne sont pas ré-exportés d'ici.
 *
 * Ce fichier porte 'use client'. Une valeur exportée par un module client et
 * lue depuis un composant serveur — ce que sont toutes les pages — est
 * remplacée par une référence client : une fonction opaque dont chaque
 * propriété rend `undefined`, sans qu'aucun type ne bronche. Les `href` de ces
 * pages devenaient donc vides. Le raisonnement complet, et la mesure, sont
 * dans l'en-tête de './chemins'.
 *
 * Un `export { CHEMINS } from './chemins'` placé ici ne réparerait rien : le
 * ré-export d'un module client reste une référence client.
 */

export type RoleCompte = 'CLIENT' | 'ARTISAN' | 'ADMIN';

export interface CompteEnveloppe {
  /** `compte.nom`. Affiché tel quel dans l'en-tête. */
  nom: string;
  role: RoleCompte;
}

interface Rubrique {
  chemin: string;
  libelle: string;
}

/**
 * La navigation dépend du rôle, parce que les deux côtés du service n'ont
 * aucune page en commun : un artisan ne publie pas de besoin, un client ne
 * chiffre pas de chantier. Un menu unique où la moitié des entrées renvoie un
 * refus d'habilitation serait pire qu'un menu court.
 *
 * ── Le cas ADMIN, et pourquoi il n'a plus la navigation du client ──────────
 * Il l'avait, et c'était un piège que quatre agents d'écran ont signalé : les
 * gardes de l'API comparent le rôle par appartenance STRICTE, donc
 * `@Roles(Role.CLIENT)` refuse un ADMIN. Un administrateur voyait « Mes
 * réservations » et se faisait refuser en cliquant.
 *
 * Il garde donc exactement ce que l'API lui laisse : `mesBesoins` ne porte
 * aucun `@Roles`, donc tout compte connecté la lit ; `mesReservations` est
 * CLIENT-strict et disparaît. C'est vérifié sur
 * `api/src/domaine/besoins/besoins.resolver.ts` et
 * `api/src/domaine/reservations/reservations.resolver.ts`, pas supposé.
 *
 * Le jour où ADMIN aura ses propres écrans, c'est ici qu'ils s'ajoutent.
 */
function rubriques(compte: CompteEnveloppe | null | undefined): Rubrique[] {
  if (!compte) {
    return [{ chemin: CHEMINS.recherche, libelle: 'Trouver un artisan' }];
  }
  if (compte.role === 'ARTISAN') {
    return [
      { chemin: CHEMINS.chantiers, libelle: 'Chantiers à chiffrer' },
      { chemin: CHEMINS.mesDevis, libelle: 'Mes devis' },
      { chemin: CHEMINS.monPlanning, libelle: 'Mon planning' },
    ];
  }
  if (compte.role === 'ADMIN') {
    return [
      { chemin: CHEMINS.recherche, libelle: 'Trouver un artisan' },
      { chemin: CHEMINS.mesBesoins, libelle: 'Mes chantiers' },
    ];
  }
  return [
    { chemin: CHEMINS.recherche, libelle: 'Trouver un artisan' },
    { chemin: CHEMINS.mesBesoins, libelle: 'Mes chantiers' },
    { chemin: CHEMINS.publierBesoin, libelle: 'Publier un chantier' },
    { chemin: CHEMINS.mesReservations, libelle: 'Mes réservations' },
  ];
}

/**
 * La rubrique courante.
 *
 * Le préfixe suivi d'une barre, et non `startsWith` seul : sans cela
 * `/mes-devis` allumerait aussi `/mes-devis-archives`, et la racine `/`
 * allumerait toutes les pages du site.
 */
function estCourante(chemin: string, cheminActuel: string): boolean {
  if (chemin === CHEMINS.accueil) return cheminActuel === CHEMINS.accueil;
  return cheminActuel === chemin || cheminActuel.startsWith(`${chemin}/`);
}

export interface ProprietesEnveloppe {
  children: ReactNode;
  /** Le compte authentifié, ou `null` pour un visiteur. */
  compte?: CompteEnveloppe | null;
  /**
   * Emplacement pour les actions du compte — « Se déconnecter », typiquement.
   * C'est une couture volontaire : la déconnexion est une Server Action, elle
   * appartient à l'agent de l'authentification, et elle traverse cette
   * frontière client comme n'importe quel nœud rendu côté serveur.
   */
  actionsCompte?: ReactNode;
}

export function Enveloppe({ children, compte, actionsCompte }: ProprietesEnveloppe): ReactNode {
  const cheminActuel = usePathname();
  const entrees = rubriques(compte);

  return (
    <>
      {/* Premier élément focalisable de la page : au clavier, il évite de
          traverser toute la navigation pour atteindre le contenu. Invisible
          jusqu'au focus — voir le module. */}
      <a className={styles.evitement} href="#contenu">
        Aller au contenu
      </a>

      <header className={styles.entete}>
        <div className={styles.barre}>
          <Link className={styles.marque} href={CHEMINS.accueil}>
            {/*
             * alt vide, et ce n'est pas un oubli : le nom est juste à côté en
             * TEXTE. Un alt « Artisans.ma » ferait annoncer le nom deux fois
             * dans le même lien.
             *
             * Le mot est du texte vivant plutôt que logo-complet.svg : « .ma »
             * y prend --primary par un jeton au lieu d'une couleur figée dans
             * un fichier, et le nom hérite de DM Sans déjà chargée par
             * next/font — donc rien à télécharger de plus.
             */}
            {/*
             * `loading="eager"` et non `priority`, qui est déprécié en
             * Next 16 au profit de `preload`. Et `eager` plutôt que `preload`
             * justement : ce poinçon de 30×30 n'est pas l'élément LCP, donc il
             * n'a pas à occuper une ligne du <head> devant l'image du héros.
             * Il doit seulement échapper au `lazy` par défaut, étant le
             * premier élément visible de chaque page.
             */}
            <Image
              className={styles.poincon}
              src={logoArtisans}
              alt=""
              width={30}
              height={30}
              loading="eager"
            />
            <span className={styles.nom}>
              Artisans<span className={styles.extension}>.ma</span>
            </span>
          </Link>

          <nav className={styles.navigation} aria-label="Navigation principale">
            <ul className={styles.rubriques}>
              {entrees.map((rubrique) => {
                const courante = estCourante(rubrique.chemin, cheminActuel);
                return (
                  <li key={rubrique.chemin}>
                    <Link
                      className={[styles.rubrique, courante ? styles.rubriqueCourante : null]
                        .filter(Boolean)
                        .join(' ')}
                      href={rubrique.chemin}
                      /* aria-current et non la seule couleur : la rubrique
                         active doit être repérable sans voir la page. */
                      aria-current={courante ? 'page' : undefined}
                    >
                      {rubrique.libelle}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className={styles.actions}>
            <button
              className={styles.aide}
              type="button"
              onClick={() => {
                window.dispatchEvent(new Event(EVENEMENT_AIDE));
              }}
            >
              <svg
                className={styles.pictoAide}
                viewBox="0 0 20 20"
                aria-hidden="true"
                focusable="false"
              >
                <circle
                  cx="10"
                  cy="10"
                  r="8.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M7.7 7.4a2.35 2.35 0 1 1 3.2 2.2c-.6.27-.9.75-.9 1.35v.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <circle cx="10" cy="14.2" r="1" fill="currentColor" />
              </svg>
              Aide
            </button>

            {compte ? (
              <>
                <Link className={styles.compte} href={CHEMINS.monCompte}>
                  <span className="lecture-seule">Mon compte&nbsp;: </span>
                  {compte.nom}
                </Link>
                {actionsCompte}
              </>
            ) : (
              <>
                <BoutonLien variante="fantome" taille="sm" href={CHEMINS.connexion}>
                  Se connecter
                </BoutonLien>
                <BoutonLien variante="primaire" taille="sm" href={CHEMINS.inscription}>
                  S&apos;inscrire
                </BoutonLien>
              </>
            )}
          </div>
        </div>
      </header>

      {/* La cible du lien d'évitement, et le repère de région principale. */}
      <main className={styles.contenu} id="contenu">
        {children}
      </main>

      <footer className={styles.pied}>
        <div className={styles.piedInterieur}>
          <div className={styles.piedMarque}>
            <span className={styles.nom}>
              Artisans<span className={styles.extension}>.ma</span>
            </span>
            <p className={styles.piedPhrase}>
              Les avis affichés viennent de prestations réellement payées, puis déclarées
              terminées. Un client, une prestation, un avis.
            </p>
          </div>

          <nav className={styles.piedLiens} aria-label="Liens de pied de page">
            <Link href={CHEMINS.recherche}>Trouver un artisan</Link>
            <Link href={CHEMINS.inscriptionArtisan}>Devenir artisan</Link>
            {/*
             * `/technique` existait sur le disque et dans `CHEMINS` sans
             * qu'AUCUN lien y mène : la route était construite et injoignable.
             * Le pied est sa place — c'est une page destinée à qui évalue le
             * projet, pas au particulier qui cherche un plombier.
             */}
            <Link href={CHEMINS.technique}>Comment c&apos;est construit</Link>
            {/*
             * « Se connecter » n'a aucun sens pour qui est déjà connecté : le
             * lien menait à une page qui le renvoyait aussitôt. Il laisse la
             * place à son compte.
             */}
            {compte ? (
              <Link href={CHEMINS.monCompte}>Mon compte</Link>
            ) : (
              <Link href={CHEMINS.connexion}>Se connecter</Link>
            )}
          </nav>
        </div>
      </footer>
    </>
  );
}
