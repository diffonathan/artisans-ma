# Marque — Artisans.ma

## Les fichiers

| Fichier | Usage |
|---|---|
| `logo.svg` | le symbole seul, boîte de 64. **Aucune police requise** : trois tracés, rendu identique partout. |
| `logo-complet.svg` | symbole + nom, pour un en-tête **où DM Sans est chargée**. Le nom appelle d'abord le jeton `--police-dm-sans` posé par `next/font`, et ne retombe sur `'DM Sans'` que si le fichier est ouvert seul. |
| `logo-mono.svg` | une seule couleur, héritée par `currentColor`. Tampon, gravure, fond coloré, impression à un ton. |
| `../app/icon.svg` | l'icône d'onglet. Next 16 la ramasse comme **fichier image** à ce nom dans `app/` et émet le `<link rel="icon" … sizes="any">`. Même géométrie que `logo.svg`, cadrée plus serré. |

Avec `app/globals.css`, ces fichiers sont les **seuls** endroits du front où une
couleur est écrite en clair. Une icône chargée en image ne reçoit ni `var()`, ni
`currentColor`, ni police : la charte ne peut pas y arriver autrement.

## Les couleurs

Toutes viennent de [`../CHARTE.md`](../CHARTE.md), palette 03 — Sarcelle profond.

| Rôle dans la charte | Jeton | Valeur | Où il tombe ici |
|---|---|---|---|
| **valeur**, attestation | `--or` | `#f9a825` | le cerne du poinçon, et lui seul |
| **action** (accent) | `--primary` | `#0d9488` | le `.ma` du nom, dans `logo-complet.svg` |
| accent, matière | `--grad-accent` | `#7ac4be` → `#0a736a` | le champ frappé |
| texte | `--texte` | `#f4f4f5` | le mot « Artisans » |
| — | — | `#ffffff` | la coche |

Le dégradé garde la **direction du jeton** (`-15deg` : clair en bas, sombre en
haut) au lieu d'être retourné pour imiter une lumière venue d'en haut. Deux
raisons, et la seconde est la vraie : la charte est la source unique, et un logo
qui contredit son dégradé se voit dès qu'il côtoie une surface qui le porte ;
par ailleurs le champ d'un poinçon est **creux**, enfoncé par le coup — sous une
lumière du haut il s'ombre en haut et s'éclaire en bas. La direction de la
charte est aussi la direction physiquement juste.

Pas de thème clair, donc pas de variante claire du logo : le cerne d'or est une
frontière extérieure franche, qui tient sur une barre d'onglets claire comme
sombre. C'est pour cela que l'or est en **bordure** et non au centre — de l'or
sur sarcelle tomberait vers 2,5:1 de contraste.

## Le sens

Un **poinçon** : la marque de métal qu'un artisan applique sur l'ouvrage *après*
qu'il est fini et constaté. Pas un bouclier, pas un label, pas une promesse
affichée d'avance.

C'est la thèse du produit, mot pour mot. L'API porte `verifie: Boolean!` et un
filtre `verifieSeulement` ; le domaine consomme un droit d'avis par
comparaison-et-échange, et ce droit n'existe qu'après une prestation **payée**
puis déclarée terminée. Un avis d'Artisans.ma n'est donc pas une opinion
publiée, c'est une marque apposée après coup. Le symbole dit cela, et rien
d'autre.

Trois décisions portent le dessin :

- **la forme est un coussin**, carré aux côtés gonflés de 2 unités, et non un
  cercle. Le cercle cranté est la forme du sceau administratif, le cercle lisse
  celle du badge des réseaux sociaux. Le coussin est la silhouette de
  l'estampille réellement frappée au marteau — marque d'orfèvre, poinçon du
  dinandier de Fès — et il garde des angles, donc un haut et un bas, donc un
  objet et non une pastille ;
- **l'or est réduit au cerne**, parce que la charte lui confie « valeur » et
  nommément le badge vérifié. Le cerne est aussi ce qui fait du dessin une
  *pièce de métal* plutôt qu'un aplat coloré ;
- **le blanc va à la coche**, parce que c'est la forme qui doit survivre en
  dernier. À 16 px le dégradé s'aplatit et le bombé disparaît ; il ne reste
  qu'un trait blanc dans un cadre, et c'est exactement le message qu'on veut
  qu'il reste.

Le symbole ne dit pas le métier, et il ne le dira pas : un poinçon atteste, il
ne raconte pas ce qu'il atteste. C'est le mot « Artisans.ma » qui fait ce
travail à côté, d'où `logo-complet.svg`.

## Ce qui a été écarté, et pourquoi

Trois pistes ont été dessinées en parallèle. Le critère d'arbitrage a été la
lisibilité à 16 px : c'est la seule taille où un logo est vu tous les jours, et
la seule contrainte qui se **mesure** au lieu de se discuter.

**Le fil à plomb.** La plus belle justification des trois : le seul outil du
bâtiment qui ne construit rien et ne rend qu'un verdict, et ce verdict vient de
la gravité — la seule référence qu'on ne puisse ni acheter ni truquer. Écarté
sur un défaut de fabrication que son auteur avait lui-même identifié et jugé
insoluble : le cordeau fait 5 unités sur 64, soit 1,25 px à 16 px. Selon le
lissage il devient un cheveu ou disparaît, et sans lui il ne reste qu'une barre
et un triangle. Le reproche décisif est là : épaissir le cordeau détruit le
sens, puisqu'une tige ne pend pas. Un signe dont la partie porteuse de sens ne
peut pas être rendue robuste n'est pas un signe fini. S'y ajoute la confusion la
plus probable — linteau + cordeau + cône suspendu est aussi la silhouette d'une
lampe à suspension, c'est-à-dire décoration d'intérieur, à un métier de
distance de la cible.

**L'angle droit ouvert.** Deux bras de poids égal soudés par un coin d'or,
l'angle opposé laissé ouvert pour dire le besoin sans devis. L'idée d'égalité
est juste, et l'ouverture est la meilleure trouvaille des trois propositions.
Écarté sur un risque fonctionnel, pas esthétique : un anneau incomplet portant
un point vif sur un bord est le vocabulaire exact des **indicateurs de
chargement**. Dans un onglet, le signe peut se lire « la page charge », ce qui
est pire qu'un logo quelconque. Son auteur le dit lui-même. Et à 16 px le coin
d'or tombe à 2 × 2 px : tout son propos — c'est là que l'accord se fait — cesse
d'exister précisément à la taille où le logo sert.

**Ce que le gagnant leur a pris.** Du fil à plomb, la règle de méthode : le
destin d'une marque se joue sur son élément le plus fin, donc on mesure avant de
juger. Elle a conduit ici à remplacer un contour par deux aplats concentriques
(voir « Règles à tenir »), et à faire dicter la taille de la coche par le vide
qui la sépare de l'or plutôt que par la composition. De l'angle droit ouvert,
l'exigence de survie en monochrome, qui a donné à `logo-mono.svg` une géométrie
propre au lieu d'être la version couleur dépouillée.

L'ouverture — le besoin qui n'a pas encore trouvé son artisan — n'a **pas** été
greffée, et c'est le regret de cet arbitrage : entailler le cerne d'or l'aurait
fait lire comme un défaut de frappe, et il n'y a pas de place pour une quatrième
forme. Trois couleurs dans un carré de 16 px sont un maximum ; qui voudra
enrichir ce symbole devra d'abord enlever.

## La faiblesse qui reste

Une coche blanche dans une forme colorée reste le vocabulaire du badge
« vérifié ». Le coussin et le cerne d'or éloignent du modèle sarcelle-rond des
réseaux sociaux, ils ne l'effacent pas : qui voit la favicon hors contexte
pensera « vérifié » avant de penser « artisan ». C'est assumé — le mot est au
bon endroit, la forme ne l'est qu'à moitié — mais ce n'est pas corrigé.

## Les mesures

Vérifiées par calcul (distance point-à-tracé sur les courbes échantillonnées) et
par comptage de pixels sur un rendu réel. Pas à l'œil.

| Grandeur | Unités du viewBox 64 | à 16 px |
|---|---|---|
| cerne d'or, au plus serré | **4,60** | 1,23 px |
| coche, épaisseur | **11** | 2,94 px |
| vide sarcelle entre la coche et l'or | **5,17** | 1,38 px |
| cadre de `logo-mono.svg` | **5** | — |
| coche de `logo-mono.svg` | **10** | — |
| vide de `logo-mono.svg` | **6,70** | — |

**Aucune forme ne passe sous 3 unités.** La plus fine est le cerne d'or, à 4,60.

Formes distinctes : **trois** en couleur (plaque d'or, champ sarcelle, coche),
**deux** en monochrome (cadre évidé, coche).

Comptage de pixels du rendu de `../app/icon.svg`, par classement des couleurs :

| Taille | or | sarcelle | blanc | pixels de frontière |
|---|---|---|---|---|
| 16 px | 64 | 74 | 29 | 17 |
| 24 px | 158 | 174 | 67 | 13 |
| 32 px | 266 | 320 | 119 | 21 |

Ces chiffres ont changé deux décisions, et c'est pour cela qu'ils sont ici :

- **le champ est réduit de 0,82 et non de 0,76.** À 0,76 le comptage donnait 88
  pixels d'or pour 70 de sarcelle : le cerne devenait un cadre, et c'est l'or —
  que la charte réserve à la valeur, donc à la rareté — qui dominait la marque ;
- **la coche fait 11 unités et non 9.** À 9, le blanc tombait à 19 pixels sur
  256 et le coude se refermait en tache diagonale. À 11 il en occupe 29 et la
  coche reste une coche.

## Règles à tenir si on retouche

1. **Deux aplats, jamais un contour.** Le cerne d'or est obtenu par deux
   coussins concentriques, pas par un `stroke`. Un `stroke` est centré sur son
   tracé : la moitié de son épaisseur tombe hors de la plaque, sur le fond, où
   elle s'évanouit au lissage — un cerne annoncé à 4,5 unités n'en pèserait que
   2,25 contre le fond.
2. **Le vide entre la coche et l'or est le dernier à sacrifier.** Sous 5 unités
   en couleur, sous 7 en monochrome, le lissage soude les deux formes : la coche
   devient une barre et le poinçon un carré plein.
3. **Les identifiants de dégradé restent préfixés par la marque.** Deux SVG
   inlinés dans la même page partagent un seul espace de noms d'identifiants ;
   un `id="g"` ferait capturer le dégradé de l'un par l'autre, sans aucune
   erreur visible.
4. **La coche de `logo-mono.svg` est la coche couleur réduite uniformément**
   (0,92). Ses angles sont identiques au centième de degré — 45,00° et -53,02°,
   rapport des branches 0,586. C'est le même glyphe, pas un cousin.
