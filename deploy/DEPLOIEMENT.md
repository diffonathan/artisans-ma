# Mettre la démonstration en ligne

Deux services gratuits et permanents : **MongoDB Atlas** pour la base,
**Render** pour l'application. Comptez vingt minutes la première fois.

> Ce document décrit une **démonstration**, pas une exploitation. Les écarts
> avec ce qu'on ferait pour de vrai sont signalés au fur et à mesure — les
> taire donnerait une fausse idée de ce qui a été pensé.

---

## 1. La base : MongoDB Atlas, offre M0

L'application exige un **replica set** : sans lui, les transactions
multi-documents sont refusées, et avec elles la garantie qui tient tout le
domaine (voir le README). En local, le `docker-compose` monte un replica set à
un nœud exprès pour ça.

**Sur Atlas, il n'y a rien à monter : l'offre M0 EST un replica set à trois
nœuds.** C'est la raison de ce choix plutôt qu'un conteneur MongoDB chez
l'hébergeur — un nœud unique ne ferait pas tourner l'application.

1. Créer un compte sur <https://www.mongodb.com/cloud/atlas> puis une grappe
   **M0 (Free)**, en région **Frankfurt (eu-central-1)** — la plus proche du
   Maroc parmi les régions gratuites, et la même que Render.
2. **Database Access** → créer un utilisateur, rôle *Read and write to any
   database*. Noter le mot de passe.
3. **Network Access** → ajouter `0.0.0.0/0`.

   > C'est large, et il faut savoir pourquoi : l'offre gratuite de Render ne
   > donne pas d'adresse IP fixe en sortie. Il n'y a donc rien de plus étroit
   > à autoriser. La base reste protégée par son utilisateur et son mot de
   > passe, mais sa surface d'écoute est publique — ce qu'on n'accepterait pas
   > pour des données réelles. Pour une exploitation : adresse de sortie fixe
   > et liste d'autorisation, ou appairage de réseaux privés.

4. **Connect → Drivers** donne la chaîne. Y ajouter le nom de la base :

   ```
   mongodb+srv://UTILISATEUR:MOTDEPASSE@grappe.xxxxx.mongodb.net/artisans
   ```

   ⚠️ **Ne pas y mettre `directConnection=true`.** Ce réglage sert au montage
   local, où le replica set à un nœud s'annonce sur une adresse injoignable
   depuis l'hôte. Sur Atlas il collerait le pilote à un seul des trois nœuds,
   et supprimerait la bascule automatique en cas de panne de celui-là. Le
   script de démarrage le détecte et avertit.

   ⚠️ **Si le mot de passe contient `@`, `/`, `:` ou `?`**, il faut l'encoder
   (`@` → `%40`). Sinon l'analyseur d'URL coupe la chaîne au mauvais endroit
   et lit un hôte qui n'existe pas. Le message d'erreur parle alors d'un hôte
   introuvable, jamais du mot de passe — c'est un piège déjà payé sur un autre
   projet.

---

## 2. L'application : Render

1. <https://dashboard.render.com> → **New → Blueprint**, pointer ce dépôt.
   Render lit `render.yaml` et propose le service `artisans-ma`.
2. Renseigner les deux variables marquées `sync: false` :

   | Variable | Valeur |
   |---|---|
   | `MONGO_URI` | la chaîne de l'étape 1 |
   | `JWT_SECRET` | une valeur tirée au hasard — voir ci-dessous |

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
   ```

   Sans `JWT_SECRET`, **le conteneur refuse de démarrer**. C'est délibéré : la
   valeur de repli du code est écrite en clair dans un dépôt public, et
   démarrer avec elle donnerait des sessions que n'importe qui peut forger.

3. Pour la **première** mise en ligne seulement, passer `SEMER_AU_DEMARRAGE` à
   `1`. Une fois la démonstration peuplée, le remettre à `0` et redéployer.

   Le semis **vide la base** avant de la remplir. Le laisser à `1`
   réinitialiserait la démonstration à chaque réveil du conteneur — c'est-à-dire
   à chaque visite après quinze minutes de calme — et effacerait sous les yeux
   d'un visiteur ce qu'un autre vient d'y faire.

---

## 3. Ce qu'il faut savoir du résultat

**Le service s'endort.** Quinze minutes sans visite, et Render le suspend ; la
visite suivante le réveille en quarante à soixante secondes. Le dire quelque
part évite qu'une page blanche d'une minute passe pour une panne — c'est la
différence entre « c'est lent » et « c'est cassé ». La fiche du portfolio
porte un indicateur pour ça.

**Le port s'ouvre avant que la base soit prête.** C'est l'ordre choisi dans
`deploy/demarrer.sh`, et il vient d'un échec : sur un déploiement précédent,
le contrôle de santé démarrait à seize secondes avec une seconde de patience,
pendant que les migrations tournaient encore. Rien n'écoutait, le conteneur
était tué, et recommençait — les journaux ne montraient que des redémarrages.
Un service qui écoute pendant qu'il se prépare survit à son contrôle de santé.

**Mesuré sur l'image :** 161 Mio au repos, pour 512 disponibles. Les deux
processus Node tiennent sans réglage particulier parce que l'interface utilise
la sortie autonome de Next, qui ne charge que les modules réellement atteints.

---

## 4. Vérifier que c'est bon

Trois adresses, dans cet ordre. La deuxième est celle qui prouve que la base
répond vraiment.

```
https://VOTRE-SERVICE.onrender.com/
https://VOTRE-SERVICE.onrender.com/recherche?metier=PEINTURE&ville=marrakech
https://VOTRE-SERVICE.onrender.com/technique
```

La deuxième doit afficher **« Peinture Atlantique — Essaouira, à 168 km, se
déplace jusqu'à 200 km »**. C'est le résultat qui démontre le produit : un
artisan lointain retenu parce que SON rayon couvre le chantier. S'il manque,
la base est vide — repasser `SEMER_AU_DEMARRAGE` à `1` une fois.

À l'inverse, `?metier=MENUISERIE&ville=marrakech` ne doit rien rendre : le
menuisier du jeu d'essai est à 30 km, et son rayon s'arrête à 10.

Les comptes de démonstration et leur mot de passe commun sont dans le README.

---

## 5. Si ça ne marche pas

| Symptôme | Cause la plus fréquente |
|---|---|
| `ARRÊT : MONGO_URI n'est pas défini` | variable non enregistrée dans le tableau de bord |
| `l'API n'a pas répondu au bout de 60 secondes` | `0.0.0.0/0` absent de **Network Access** chez Atlas |
| hôte introuvable dans les journaux | caractère spécial non encodé dans le mot de passe |
| `Transaction numbers are only allowed on a replica set` | la chaîne pointe une base qui n'est pas un replica set |
| pages sans aucun style | `.next/static` absent de l'image — voir le `Dockerfile` |
| la démonstration se vide toute seule | `SEMER_AU_DEMARRAGE` resté à `1` |

Les journaux sont dans **Logs**, sur la page du service. Le script de
démarrage y écrit chaque étape, et nomme la cause probable quand il s'arrête.
