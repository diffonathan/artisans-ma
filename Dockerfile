# Image de démonstration d'Artisans.ma — API et interface dans UN conteneur.
#
# ── Pourquoi un seul conteneur, alors que ce sont deux applications ─────────
# L'offre gratuite de Render endort un service après quinze minutes sans
# visite, et le réveille à la visite suivante. Avec deux services, l'interface
# se réveille, interroge une API encore endormie, et le visiteur reçoit une
# erreur — puis une page correcte s'il recharge. C'est pire qu'un démarrage
# lent, parce que ça ressemble à une panne.
#
# Un seul conteneur dort et se réveille d'un bloc. L'interface parle à l'API
# par la boucle locale, donc le réveil est atomique du point de vue du
# visiteur.
#
# Ce que ce choix coûte, et qu'il faut savoir dire : les deux applications ne
# se déploient plus ni ne se redimensionnent séparément, et elles partagent
# 512 Mio. Ce n'est pas l'architecture qu'on retiendrait pour un vrai service —
# c'est celle qui tient dans une démonstration gratuite. Le dépôt, lui, les
# garde séparées : `api/` et `web/` ont leurs dépendances, leurs tests et leur
# cycle de vie propres.

# ── 1. L'API ────────────────────────────────────────────────────────────────
# ── Pourquoi Node 24 et pas 22 ──────────────────────────────────────────────
# Le fichier de verrouillage est écrit par le npm du poste de développement,
# ici npm 11 (livré avec Node 24). `node:22-alpine` embarque npm 10, qui ne
# sait pas relire certaines résolutions de ce format et refuse l'installation
# avec « Missing: typescript@5.9.3 from lock file » — un message qui accuse un
# paquet alors que le problème est la version de l'outil.
#
# L'image doit donc exécuter le même npm majeur que celui qui a produit le
# verrou. Sinon `npm ci`, dont la raison d'être est de reproduire exactement
# un arbre de dépendances, échoue sur l'arbre qu'on lui demande de reproduire.
FROM node:24-alpine AS construction-api
WORKDIR /build

# Les manifestes d'abord : tant qu'ils ne changent pas, Docker réutilise la
# couche d'installation, qui est la plus longue.
COPY api/package.json api/package-lock.json ./
RUN npm ci

COPY api/ ./
RUN npm run build

# Les dépendances de production, dans un dossier propre. `npm ci --omit=dev`
# APRÈS la construction : les outils de compilation (NestJS CLI, TypeScript)
# sont nécessaires pour construire, inutiles pour exécuter.
RUN npm ci --omit=dev

# ── 2. L'interface ──────────────────────────────────────────────────────────
FROM node:24-alpine AS construction-web
WORKDIR /build

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── 3. L'image qui tourne ───────────────────────────────────────────────────
FROM node:24-alpine
WORKDIR /app

# `tini` comme PID 1 : sans lui, le script de démarrage reçoit les signaux
# mais les processus Node qu'il a lancés ne les reçoivent pas, et Render
# attend trente secondes avant de tuer le conteneur à chaque redéploiement.
RUN apk add --no-cache tini curl

# L'API : son code compilé et ses dépendances d'exécution.
COPY --from=construction-api /build/dist ./api/dist
COPY --from=construction-api /build/node_modules ./api/node_modules
COPY --from=construction-api /build/package.json ./api/

# L'interface : la sortie autonome, puis les deux dossiers que le serveur
# minimal NE recopie PAS de lui-même. Sans eux, la page s'affiche sans aucune
# feuille de style — ce qui ressemble à un bogue de rendu et non à un fichier
# absent. La documentation de Next le signale ; on le paie une fois.
COPY --from=construction-web /build/.next/standalone ./web/
COPY --from=construction-web /build/.next/static ./web/.next/static

COPY deploy/demarrer.sh ./demarrer.sh
RUN chmod +x ./demarrer.sh

ENV NODE_ENV=production
# L'API n'est jamais exposée : l'interface l'atteint par la boucle locale.
ENV PORT_API=3000
ENV API_GRAPHQL=http://127.0.0.1:3000/graphql
# Render fournit PORT ; 10000 est son défaut, répété ici pour que l'image
# tourne aussi en local sans variable.
ENV PORT=10000

EXPOSE 10000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./demarrer.sh"]
