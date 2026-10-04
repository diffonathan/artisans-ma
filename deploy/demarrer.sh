#!/bin/sh
# Démarrage de la démonstration : l'API, puis l'interface.
#
# ══ LA LEÇON QUI A COÛTÉ LE PLUS CHER ══════════════════════════════════════
#
# Sur un déploiement précédent, le conteneur mourait sans message. La cause :
# le contrôle de santé de l'hébergeur commençait seize secondes après le
# démarrage, avec une seconde de patience — pendant que les migrations
# tournaient encore. Aucun port n'écoutait, le contrôle échouait, l'hébergeur
# tuait le conteneur, et recommençait. Les journaux ne montraient que des
# redémarrages.
#
# D'où l'ordre de ce script : on OUVRE LE PORT D'ABORD, et le travail long
# vient après. Un service qui écoute pendant qu'il se prépare survit à son
# contrôle de santé ; un service qui se prépare avant d'écouter ne survit pas.
#
# Conséquence assumée : pendant les premières secondes, l'interface répond
# alors que la base est peut-être vide. C'est visible — une liste vide — et
# réparable en rechargeant. Un conteneur tué en boucle ne l'est pas.

set -eu

echo "── Artisans.ma ─────────────────────────────────────────────"

# ── Contrôles préalables, avec des messages qui nomment la cause ────────────
if [ -z "${MONGO_URI:-}" ]; then
  echo "ARRÊT : MONGO_URI n'est pas défini."
  echo "        Attendu : une chaîne MongoDB Atlas (mongodb+srv://...)."
  echo "        À renseigner dans le tableau de bord, jamais dans le dépôt."
  exit 1
fi

if [ -z "${JWT_SECRET:-}" ]; then
  echo "ARRÊT : JWT_SECRET n'est pas défini."
  echo "        Sans lui l'application démarrerait avec la clé de"
  echo "        développement, écrite en clair dans un dépôt public — donc"
  echo "        avec des sessions que n'importe qui peut forger."
  exit 1
fi

# `directConnection=true` est juste en local, où le replica set à un nœud
# s'annonce sur une adresse injoignable depuis l'hôte. Il est FAUX sur Atlas,
# qui est un replica set à trois nœuds : le pilote se collerait à un seul,
# et perdrait la bascule automatique en cas de panne de ce nœud-là.
case "${MONGO_URI}" in
  *directConnection=true*)
    echo "AVERTISSEMENT : MONGO_URI contient directConnection=true."
    echo "                Ce réglage est destiné au montage LOCAL. Sur Atlas,"
    echo "                il désactive la découverte du replica set."
    ;;
esac

# ── 1. L'API, en arrière-plan ───────────────────────────────────────────────
echo "Démarrage de l'API sur le port ${PORT_API}…"
PORT="${PORT_API}" node api/dist/main.js &
PID_API=$!

# On attend qu'elle réponde vraiment, pas qu'elle ait été lancée : l'interface
# fait ses lectures côté serveur, et une page demandée avant que l'API écoute
# rendrait une erreur au lieu d'un contenu.
ATTENTE=0
until curl -fsS -o /dev/null -X POST "http://127.0.0.1:${PORT_API}/graphql" \
      -H 'Content-Type: application/json' \
      -d '{"query":"{ __typename }"}' 2>/dev/null; do
  ATTENTE=$((ATTENTE + 1))
  if [ "${ATTENTE}" -gt 60 ]; then
    echo "ARRÊT : l'API n'a pas répondu au bout de 60 secondes."
    echo "        Cause la plus fréquente : MONGO_URI refusé par Atlas."
    echo "        Vérifier que l'adresse du service est autorisée dans"
    echo "        « Network Access » — Render n'a pas d'adresse IP fixe sur"
    echo "        l'offre gratuite, il faut donc y autoriser 0.0.0.0/0."
    kill "${PID_API}" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done
echo "API prête après ${ATTENTE} s."

# ── 2. L'interface, qui ouvre le port public ────────────────────────────────
echo "Démarrage de l'interface sur le port ${PORT}…"
HOSTNAME=0.0.0.0 node web/server.js &
PID_WEB=$!

# ── 3. Le jeu de démonstration, APRÈS l'ouverture du port ───────────────────
#
# `SEMER_AU_DEMARRAGE=1` le déclenche. Il n'est pas automatique : une
# démonstration consultée par plusieurs personnes ne doit pas se réinitialiser
# à chaque réveil du conteneur, qui a lieu à chaque visite après quinze
# minutes de calme. On le met à 1 pour la première mise en ligne, puis on le
# retire.
if [ "${SEMER_AU_DEMARRAGE:-0}" = "1" ]; then
  echo "Semis du jeu de démonstration…"
  if node api/dist/outils/semer.js; then
    echo "Jeu de démonstration en place."
  else
    echo "AVERTISSEMENT : le semis a échoué. L'application reste en service,"
    echo "                avec une base vide. Voir les lignes ci-dessus."
  fi
fi

echo "── En service ──────────────────────────────────────────────"

# ── 4. Surveiller les deux processus ────────────────────────────────────────
#
# Si l'un des deux meurt, le conteneur doit mourir : un service à moitié
# vivant répond des erreurs tout en passant pour sain auprès de l'hébergeur,
# qui ne le redémarre donc jamais.
#
# `wait -n`, qui rendrait la main au premier processus terminé, serait le
# bon outil — mais c'est une extension de bash, et cette image est en Alpine,
# donc en busybox ash, où elle n'existe pas. Le script s'arrêterait sur une
# erreur de syntaxe au démarrage, c'est-à-dire au pire moment.
#
# `kill -0` n'envoie aucun signal : il teste seulement si le processus existe
# encore. Une seconde entre deux tours coûte un réveil par seconde et détecte
# une mort en une seconde, ce qui est largement assez pour un redémarrage.
while kill -0 "${PID_API}" 2>/dev/null && kill -0 "${PID_WEB}" 2>/dev/null; do
  sleep 1
done

if kill -0 "${PID_API}" 2>/dev/null; then
  echo "L'interface s'est arrêtée. Arrêt du conteneur."
else
  echo "L'API s'est arrêtée. Arrêt du conteneur."
fi

kill "${PID_API}" "${PID_WEB}" 2>/dev/null || true
exit 1
