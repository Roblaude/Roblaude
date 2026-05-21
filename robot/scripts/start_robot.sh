#!/bin/bash
# start_robot.sh — Script tout-en-un pour demarrer une session robot
#
# Ce qu il fait (dans l ordre) :
#   1) Auto-detecte l IP du robot par MAC address (resiste aux changements DHCP)
#   2) Fixe l horloge du Jetson (pas de RTC -> date perdue a chaque extinction)
#   3) Verifie que m3pro_main et micro_ros_agent tournent (les demarre sinon)
#   4) Lance la stack ROS2 complete (start_all.sh dans le container)
#   5) Ouvre Foxglove Studio (si installe) sur l URL du bridge
#
# Usage :
#     ./scripts/start_robot.sh            # full start
#     ./scripts/start_robot.sh --no-foxglove  # sans ouvrir Foxglove
#
# Options env :
#     ROBOT_MAC=aa:bb:... # si tu utilises un autre robot
#     NO_CLOCK_SYNC=1     # saute la sync horloge
#     NO_START=1          # ne lance pas start_all.sh (juste connexion)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/find_robot.sh"

ROBOT_USER="${ROBOT_USER:-jetson}"
ROBOT_PASS="${ROBOT_PASS:-yahboom}"
CONTAINER="${CONTAINER:-m3pro}"
AGENT_CONTAINER="${AGENT_CONTAINER:-micro_ros_agent}"

OPEN_FOXGLOVE=true
if [[ "$1" == "--no-foxglove" ]]; then
    OPEN_FOXGLOVE=false
fi

SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10"
ssh_cmd() {
    sshpass -p "$ROBOT_PASS" ssh $SSH_OPTS "$ROBOT_USER@$ROBOT_IP" "$@"
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🤖 ROSMASTER M3 PRO — Start session"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1) Auto-detect IP par MAC ────────────────────────────
echo ""
echo "▶ Etape 1/5 : Recherche du robot"
if ! find_robot; then
    echo "❌ Robot introuvable sur ton subnet. Verifie qu il est allume."
    exit 1
fi

# ── 2) Sync horloge (palliatif au Jetson sans RTC) ───────
if [ -z "${NO_CLOCK_SYNC:-}" ]; then
    echo ""
    echo "▶ Etape 2/5 : Sync horloge Jetson"
    MAC_UTC=$(date -u +"%Y-%m-%d %H:%M:%S")
    ROBOT_DATE=$(ssh_cmd "date -u +%s")
    MAC_DATE=$(date -u +%s)
    DIFF=$(( MAC_DATE - ROBOT_DATE ))
    if [ ${DIFF#-} -gt 60 ]; then
        echo "   ⏰ Ecart detecte : ${DIFF}s -> resync"
        ssh_cmd "echo $ROBOT_PASS | sudo -S date -u -s '$MAC_UTC'" > /dev/null 2>&1
        echo "   ✅ Horloge fixee a $MAC_UTC UTC"
    else
        echo "   ✅ Horloge deja correcte (ecart ${DIFF}s)"
    fi
else
    echo "▶ Etape 2/5 : Sync horloge — SKIP (NO_CLOCK_SYNC=1)"
fi

# ── 3) Verif containers ─────────────────────────────────
echo ""
echo "▶ Etape 3/5 : Verification containers"
RUNNING=$(ssh_cmd "docker ps --format '{{.Names}}'" 2>/dev/null)
for c in "$CONTAINER" "$AGENT_CONTAINER"; do
    if echo "$RUNNING" | grep -q "^$c$"; then
        echo "   ✅ $c en cours"
    else
        echo "   ⚠️  $c arrete, tentative de demarrage..."
        ssh_cmd "docker start $c" > /dev/null 2>&1 || echo "   ❌ impossible de demarrer $c"
    fi
done

# ── 4) Lancer la stack ROS2 ──────────────────────────────
if [ -z "${NO_START:-}" ]; then
    echo ""
    echo "▶ Etape 4/5 : Lancement stack ROS2 (start_all.sh)"
    ssh_cmd "docker exec $CONTAINER bash /root/roblaude_ws/scripts/start_all.sh" 2>&1 | sed 's/^/   /'

    echo ""
    echo "   ⏳ Attente 10s stabilisation..."
    sleep 10

    echo "   Verif ports :"
    for port in 8765 8080; do
        if nc -zv -w 2 "$ROBOT_IP" "$port" 2>&1 | grep -q succeeded; then
            echo "   ✅ port $port (${port/8765/foxglove}${port/8080/web_video}) ouvert"
        else
            echo "   ⚠️  port $port non disponible"
        fi
    done
else
    echo "▶ Etape 4/5 : Start stack — SKIP (NO_START=1)"
fi

# ── 5) Ouverture Foxglove ───────────────────────────────
echo ""
echo "▶ Etape 5/5 : Foxglove Studio"
FOXGLOVE_URL="ws://$ROBOT_IP:8765"
VIDEO_URL="http://$ROBOT_IP:8080/stream?topic=/camera/color/image_raw&type=mjpeg"

if $OPEN_FOXGLOVE && command -v open > /dev/null; then
    # Ouvre Foxglove Studio si installe, sinon son URL de telechargement
    if [ -d "/Applications/Foxglove Studio.app" ] || [ -d "/Applications/Foxglove.app" ]; then
        open "foxglove://open?ds=foxglove-websocket&ds.url=$FOXGLOVE_URL"
        echo "   ✅ Foxglove lance sur $FOXGLOVE_URL"
    else
        echo "   ℹ️  Foxglove Studio non detecte dans /Applications"
        echo "       Install : brew install --cask foxglove-studio"
        echo "       Connexion manuelle : $FOXGLOVE_URL"
    fi
else
    echo "   URL Foxglove : $FOXGLOVE_URL"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Session prete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Robot IP      : $ROBOT_IP"
echo "Foxglove      : $FOXGLOVE_URL"
echo "Camera MJPEG  : $VIDEO_URL"
echo ""
echo "Pour SSH direct : sshpass -p yahboom ssh jetson@$ROBOT_IP"
echo "Pour logs ROS   : ssh jetson@$ROBOT_IP 'docker exec -it $CONTAINER tail -f /tmp/roslogs/slam.log'"
