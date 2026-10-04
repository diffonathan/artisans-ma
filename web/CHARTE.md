# Charte d'Artisans.ma

Dérivée de la **charte maison des 24 palettes**
(`Documents/Projet/charte/CHARTE-24-PALETTES.md`). Ce fichier est la **source
unique** des couleurs du projet : aucune valeur de couleur ne s'écrit ailleurs
qu'en `var(--…)` pointant sur un jeton défini ici.

---

## La palette : 03 — Sarcelle profond `#0d9488`

Palettes déjà attribuées : 13 Bleu FTMO (Hope Traders), 01 Vert Hope
(RDV Santé), 08 Or antique (Factura). Deux projets ne portent jamais la même.

**Pourquoi la sarcelle, et pas un bronze ou un ambré** — ce qui aurait pourtant
mieux « dit » l'artisanat marocain : parce que cette application ne parle que
d'argent. Devis, montants figés, commission, encaissements. Le rôle **or =
valeur** de la charte doit donc rester libre pour les montants, et un accent
dans la famille or/bronze le mangerait. La sarcelle est la seule teinte fraîche
non attribuée qui ne soit ni un bleu (13 pris, 14 et 15 trop proches) ni un
vert de direction (01 pris, et le vert reste réservé à « accepté »).

Elle n'est pas arbitraire pour autant : les verts-bleus profonds sont ceux du
zellige, et c'est la seule référence marocaine qui ne soit pas déjà prise.

---

## Les jetons

Calculés par les formules exactes de la charte, pas à l'estime :

```
assombrir(hex, t) = mélange(hex, #000000, t)
eclaircir(hex, t) = mélange(hex, #ffffff, t)
```

| Jeton | Valeur | Origine |
|---|---|---|
| `--primary` | `#0d9488` | l'accent |
| `--primary-dim` | `#0b7970` | `assombrir(accent, 0.18)` |
| `--accent-soft` | `rgba(13, 148, 136, 0.10)` | |
| `--accent-border` | `rgba(13, 148, 136, 0.30)` | |
| `--accent-glow` | `rgba(13, 148, 136, 0.18)` | |
| `--glass-border-hover` | `rgba(13, 148, 136, 0.35)` | |
| `--grad-accent` | `linear-gradient(-15deg, #7ac4be, #0a736a)` | `eclaircir(…, 0.45)` → `assombrir(…, 0.22)` |
| `--accent-texte` | `#7ac4be` | `eclaircir(accent, 0.45)` |

`--accent-texte` est l'accent **quand il porte du texte**, et il n'est pas un
cinquième rôle : c'est le même rôle *action*, à la graduation que le socle nuit
impose. `--primary` est une teinte moyenne — il convient aux fonds, aux traits
et au contour de focus, mais du texte écrit avec lui plafonne à 4,9:1 sur une
surface opaque et tombe à 3,2:1 dès qu'il se pose sur `--accent-soft`
au-dessus du verre. L'extrémité claire de `--grad-accent` tient partout, et
c'est pourquoi aucune teinte nouvelle n'est introduite ici.

Symétrique du choix inverse dans `components/Bouton.module.css` : là le fond
est l'accent et c'est le texte qui doit s'assombrir.

Les trois halos de `body::before` utilisent `rgba(13, 148, 136, …)` aux
opacités 0.12, 0.06 et 0.05, sur le dégradé nuit de la charte.

---

## Les quatre rôles, jamais interchangés

| Rôle | Jeton | Valeur | Ce qu'il porte ici |
|---|---|---|---|
| **action** | `--primary` | `#0d9488` | fonds, bordures, contour de focus, pastilles |
| **action, en texte** | `--accent-texte` | `#7ac4be` | libellés d'accent, liens au survol, rubrique courante |
| **valeur** | `--or` | `#f9a825` | tout montant en dirhams, la commission, le badge « vérifié » |
| **hausse / accepté** | `--vert` | `#4ade80` | devis accepté, prestation terminée, note élevée |
| **baisse / refusé** | `--rouge` | `#f87171` | devis refusé, réservation annulée, erreur |

`#4ade80` et non `#22c55e` : l'accent est un vert-bleu, et il faut que
« accepté » s'en distingue d'un coup d'œil. Un vert franc et clair y arrive,
un vert moyen non. C'est l'application directe de la règle de la charte — si
l'accent approche une couleur de direction, c'est la **direction** qui change
de teinte, jamais l'inverse.

L'attention (`--ambre`) n'existe pas comme cinquième couleur : `--or` la porte,
parce qu'un avertissement et un montant ne se croisent jamais dans le même
composant.

---

## Le socle, qui ne change pas

- **nuit uniquement** — aucun thème clair, aucun `prefers-color-scheme`, aucun
  basculeur. Le fond du `body` est explicite ;
- **glassmorphism** — `backdrop-filter: blur(12px) saturate(140%)`, bordures
  fines, liseré interne haut ;
- **DM Sans** pour le texte, **Azeret Mono** réservé aux nombres — montants,
  distances, notes, compteurs. Jamais pour de la prose ;
- courbe d'animation signature `cubic-bezier(0.22, 1, 0.36, 1)`.

## Ce qui est interdit

- une couleur écrite en dur dans un composant ;
- une teinte absente des 24 palettes ;
- `prefers-color-scheme` ou tout thème clair ;
- un `<select>` restylé en ligne : la recette est globale, et `background:` en
  raccourci efface le chevron — utiliser `background-color` ;
- Azeret Mono sur autre chose que des nombres.
