#!/bin/bash
# sync_time.sh — synchronise l'horloge du robot + pousse l'IP du Mac comme
# broker MQTT.
#
# A lancer cote Mac, au debut de chaque session robot. Le Jetson n'a pas de
# RTC peuplee et le reseau ecole bloque UDP 123 (NTP) — donc on prend le Mac
# comme source de verite : date + IP locale.
#
# Idempotent. Si l'ecart est < 60s on ne resynchronise pas.
#
# Usage :
#   ./robot/scripts/sync_time.sh
#   ROBOT_IP=10.10.220.109 ./robot/scripts/sync_time.sh  # sans scan reseau

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/find_robot.sh"

ROBOT_USER="${ROBOT_USER:-jetson}"
ROBOT_PASS="${ROBOT_PASS:-yahboom}"
BROKER_IP_FILE="${BROKER_IP_FILE:-/etc/roblaude/broker_ip}"

if ! find_robot; then
    exit 1
fi

SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
SSH="sshpass -p $ROBOT_PASS ssh $SSH_OPTS $ROBOT_USER@$ROBOT_IP"

# 1) Horloge ---------------------------------------------------------------
MAC_UTC=$(date -u +"%Y-%m-%d %H:%M:%S")
MAC_EPOCH=$(date -u +%s)
ROBOT_EPOCH=$($SSH "date -u +%s")
DIFF=$(( MAC_EPOCH - ROBOT_EPOCH ))
ABS_DIFF=${DIFF#-}

echo "━━━ sync horloge ━━━"
echo "   Mac   UTC : $MAC_UTC"
echo "   ecart     : ${DIFF}s"

if [ "$ABS_DIFF" -gt 60 ]; then
    echo "   resync via sudo date -s..."
    $SSH "echo $ROBOT_PASS | sudo -S date -u -s '$MAC_UTC' >/dev/null"
    # Sauve dans fake-hwclock pour que le prochain boot demarre proche
    $SSH "echo $ROBOT_PASS | sudo -S fake-hwclock save >/dev/null 2>&1 || true"
    echo "   ✅ horloge fixee"
else
    echo "   ✅ deja synchro (tolerance 60s)"
fi

# 2) Broker IP -------------------------------------------------------------
ROBOT_PREFIX="$(echo "$ROBOT_IP" | cut -d. -f1-3)"
MAC_IP=""

# Decision soutenance : le Mac et le robot doivent etre sur le meme vrai Wi-Fi.
# On choisit l'IP Wi-Fi du Mac qui partage le prefixe du robot.
for iface in en0; do
    CANDIDATE="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    if [ -z "$CANDIDATE" ]; then
        CANDIDATE="$(ifconfig "$iface" 2>/dev/null | awk '/inet / {print $2; exit}')"
    fi
    if [ -n "$CANDIDATE" ] && [ "$(echo "$CANDIDATE" | cut -d. -f1-3)" = "$ROBOT_PREFIX" ]; then
        MAC_IP="$CANDIDATE"
        break
    fi
done

if [ -z "$MAC_IP" ]; then
    MAC_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
fi
if [ -z "$MAC_IP" ]; then
    MAC_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)"
fi
echo ""
echo "━━━ broker MQTT ━━━"

# Si on n'a pas reussi a deduire l'IP du Mac, abort plutot que d'ecrire vide
# dans broker_ip (ce qui rendrait le bridge muet au prochain boot).
if [ -z "$MAC_IP" ]; then
    echo "   ❌ IP Mac introuvable (en0 down, pas de route ?). broker_ip non touche."
    exit 2
fi
echo "   IP Mac (broker)  : $MAC_IP"

CURRENT=$($SSH "cat $BROKER_IP_FILE 2>/dev/null || echo missing")
echo "   $BROKER_IP_FILE actuel : $CURRENT"

if [ "$CURRENT" != "$MAC_IP" ]; then
    $SSH "echo $ROBOT_PASS | sudo -S bash -c 'mkdir -p /etc/roblaude && echo $MAC_IP > $BROKER_IP_FILE'"
    echo "   ✅ broker_ip mis a jour vers $MAC_IP"
    echo "   (le bridge MQTT prendra effet au prochain redemarrage du container)"
else
    echo "   ✅ deja a jour"
fi

echo ""
echo "✅ sync_time termine"
