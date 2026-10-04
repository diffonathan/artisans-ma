import type { Metadata } from 'next';
import { Azeret_Mono, DM_Sans } from 'next/font/google';
import { deconnecter } from '@/app/actions/authentification';
import { Bouton } from '@/components/Bouton';
import { Enveloppe } from '@/components/Enveloppe';
import { VisiteGuidee } from '@/components/visite-guidee/VisiteGuidee';
import { compteDEntete } from '@/lib/entete';
import './globals.css';

/**
 * Les deux polices sont des polices VARIABLES, d'où l'absence de `weight` :
 * next/font n'en exige un que pour une police à graisses figées. Un seul
 * fichier couvre alors toute la plage de graisses, ce qui évite de télécharger
 * quatre fichiers pour afficher du 400, du 500 et du 600.
 *
 * `variable` plutôt que `className` : globals.css consomme ces deux variables
 * dans --police-texte et --police-nombres, et c'est lui qui décide qui reçoit
 * quoi. Poser la classe de DM Sans sur <html> mettrait la police du texte
 * partout, y compris là où la charte veut Azeret Mono — et inversement il
 * n'existe aucun endroit où appliquer la classe d'Azeret Mono, puisque les
 * nombres sont dispersés dans les composants des autres agents.
 *
 * `latin-ext` en plus de `latin` : les noms marocains écrits en français
 * passent dans latin, mais pas tous les toponymes translittérés.
 */
const dmSans = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--police-dm-sans',
});

const azeretMono = Azeret_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--police-azeret-mono',
});

export const metadata: Metadata = {
  title: {
    default: 'Artisans.ma — trouver un artisan qui accepte de venir chez vous',
    // Les pages des autres agents n'ont plus qu'à donner leur propre titre.
    template: '%s · Artisans.ma',
  },
  description:
    'Décrivez votre chantier, recevez des devis des artisans dont la zone ' +
    "d'intervention couvre votre adresse, et comparez. Les avis affichés " +
    'viennent de prestations réellement payées.',
  // PAS de clé `icons` ici, et c'est délibéré : l'icône d'onglet est
  // `app/icon.svg`, le poinçon de brand/logo.svg.
  //
  // La doc de generate-metadata annonce que les métadonnées par fichier
  // l'emportent sur cet objet. Pour les icônes, l'implémentation fait
  // l'INVERSE — resolve-metadata.js ne verse les icônes de convention que
  // sous `if (!resolvedMetadata.icons)`. Un `icons` déclaré ici, même
  // inoffensif, jetterait donc app/icon.svg en silence : la route serait
  // construite, jamais liée, et l'onglet ne ressemblerait plus à l'en-tête.
};

/**
 * La disposition racine, et l'endroit où l'enveloppe est montée.
 *
 * ── Pourquoi elle est ICI, et plus dans chaque page ───────────────────────
 * `app/page.tsx` posait le contrat : « le jour où une deuxième route est
 * écrite, ces deux lignes DOIVENT remonter dans la disposition racine ». Onze
 * routes plus tard, onze pages montaient `<Enveloppe>` elles-mêmes, chacune
 * avec sa copie des quinze lignes qui résolvent le compte — et
 * `<VisiteGuidee />` n'était montée que sur l'accueil et sur /technique, donc
 * le bouton « Aide » de la barre était INERTE sur les neuf autres.
 *
 * Trois choses se règlent en remontant :
 *
 *   1. /connexion, /inscription et /inscription/artisan n'avaient aucune
 *      navigation ni aucun pied : elles ne montaient rien ;
 *   2. la visite guidée est montée UNE fois. Sa mémoire est globale, deux
 *      instances se disputeraient le focus ;
 *   3. un `loading.tsx` s'affiche désormais DANS le `<main>`, donc l'en-tête
 *      reste à l'écran pendant l'attente. Avec l'enveloppe montée par la page,
 *      le chargement effaçait la barre de navigation puis la faisait
 *      réapparaître — ce qui se lit comme un rechargement complet.
 *
 * ── Ce que ça coûte ──────────────────────────────────────────────────────
 * `compteDEntete` lit le cookie de session, donc cette disposition est
 * DYNAMIQUE, donc toutes les routes le sont. /recherche et /artisan/[id]
 * seraient prérendables sans elle. C'est le prix d'un en-tête qui sait qui
 * regarde, et c'est le même prix qu'elles payaient déjà en le montant
 * elles-mêmes.
 *
 * Les fragments ne créant aucun nœud DOM, `<header>`, `<main>` et `<footer>`
 * restent les enfants directs du `<body>` en colonne flex, et le pied se
 * colle en bas sans hauteur calculée.
 */
export default async function DispositionRacine({ children }: LayoutProps<'/'>) {
  const compte = await compteDEntete();

  return (
    /*
     * data-scroll-behavior="smooth" est VOULU, et il n'est pas décoratif.
     *
     * globals.css pose `scroll-behavior: smooth` sur <html>, pour les ancres
     * internes — sauter d'une liste de devis au devis visé. Jusqu'à Next 15,
     * le routeur neutralisait cette valeur le temps d'une navigation, puis la
     * restaurait, pour que changer de page reste un saut instantané en haut.
     * Next 16 a arrêté de le faire : sans cet attribut, chaque navigation
     * ferait DÉFILER toute la page jusqu'en haut, ce qui est long et donne
     * l'impression que l'application rame. L'attribut redemande explicitement
     * l'ancien comportement.
     *
     * Et si quelqu'un retirait un jour le `scroll-behavior` de globals.css,
     * cet attribut deviendrait inerte plutôt que nuisible.
     */
    <html
      lang="fr"
      data-scroll-behavior="smooth"
      className={`${dmSans.variable} ${azeretMono.variable}`}
    >
      <body>
        <Enveloppe
          compte={compte}
          actionsCompte={
            /*
             * La déconnexion traverse la frontière cliente de l'enveloppe
             * comme n'importe quel nœud rendu côté serveur. Un `<form>` et non
             * un bouton qui appellerait l'action : sans JavaScript, le
             * formulaire poste quand même.
             */
            <form action={deconnecter}>
              <Bouton type="submit" variante="fantome" taille="sm">
                Se déconnecter
              </Bouton>
            </form>
          }
        >
          {children}
        </Enveloppe>

        {/*
         * Montée en FRÈRE de l'enveloppe, et une seule fois pour toute
         * l'application : elle écoute l'événement `artisans:ouvrir-aide` que
         * le bouton « Aide » de la barre émet sur `window`.
         */}
        <VisiteGuidee />
      </body>
    </html>
  );
}
