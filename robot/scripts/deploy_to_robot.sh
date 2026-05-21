#!/bin/bash
# deploy_to_robot.sh — pousse nos packages ROS2 + nos scripts dans le workspace
# persistant /home/jetson/roblaude_ws sur le robot, puis lance colcon build dans
# le container.
#
# Source de verite cote Mac (ce repo) :
#   robot/roblaude_nav/    -> roblaude_ws/src/roblaude_nav/
#   robot/roblaude_mqtt/   -> roblaude_ws/src/roblaude_mqtt/
#   robot/scripts/         -> roblaude_ws/scripts/   (autostart, helpers)
#
# Idempotent. rsync delta = rapide meme avec gros workspace.
#
# Usage :
#   ./robot/scripts/deploy_to_robot.sh             # deploy + build
#   ./robot/scripts/deploy_to_robot.sh --no-build  # deploy only

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/find_robot.sh"

ROBOT_USER="${ROBOT_USER:-jetson}"
CONTAINER="${CONTAINER:-m3pro}"
WS_HOST="${WS_HOST:-/home/jetson/roblaude_ws}"
WS_CONTAINER="${WS_CONTAINER:-/root/roblaude_ws}"

DO_BUILD=true
if [[ "$1" == "--no-build" ]]; then
    DO_BUILD=false
fi

if ! find_robot; then
    exit 1
fi

SSH_OPTS="-o StrictHostKeyChecking=accept-new"
SSH="ssh $SSH_OPTS $ROBOT_USER@$ROBOT_IP"
RSYNC_E="ssh $SSH_OPTS"

echo "━━━ Deploy RobLaude → $ROBOT_USER@$ROBOT_IP:$WS_HOST ━━━"

# 1) Prepa structure cote hote
$SSH "mkdir -p $WS_HOST/src $WS_HOST/scripts"

# 2) Push des packages ROS (delete-after pour nettoyer fichiers supprimes)
# Auto-detect : tout dossier dans robot/ qui contient un package.xml (a
# n'importe quelle profondeur 1-2) OU qui est un workspace de packages.
echo "▶ rsync packages..."
for dir in "$REPO_ROOT"/robot/*/; do
    name=$(basename "$dir")
    [ "$name" = "scripts" ] && continue
    [ "$name" = "_stub_local" ] && continue
    # On rsync si le dossier contient un package.xml direct OU au moins
    # un sous-dossier avec package.xml (workspace de packages — colcon
    # explorera recursivement).
    if [ -f "$dir/package.xml" ] || find "$dir" -maxdepth 2 -name 'package.xml' -print -quit | grep -q .; then
        rsync -avz --delete-after -e "$RSYNC_E" \
            --exclude '__pycache__' --exclude '*.pyc' --exclude '.pytest_cache' \
            --exclude '.git' --exclude 'build' --exclude 'install' --exclude 'log' \
            "$dir" \
            "$ROBOT_USER@$ROBOT_IP:$WS_HOST/src/$name/"
    fi
done

# 3) Push des scripts (autostart, helpers, etc.)
echo "▶ rsync scripts..."
rsync -avz --delete-after -e "$RSYNC_E" \
    --exclude '__pycache__' \
    "$REPO_ROOT/robot/scripts/" \
    "$ROBOT_USER@$ROBOT_IP:$WS_HOST/scripts/"

$SSH "chmod +x $WS_HOST/scripts/*.sh"

# 4) Colcon build dans le container
if $DO_BUILD; then
    echo "▶ colcon build dans le container $CONTAINER..."
    $SSH "docker exec $CONTAINER bash -c '
        source /opt/ros/humble/setup.bash &&
        source /root/yahboomcar_ws/install/setup.bash 2>/dev/null &&
        cd $WS_CONTAINER &&
        colcon build --symlink-install 2>&1 | tail -20
    '"
fi

echo ""
echo "✅ Deploy termine."
echo "   Workspace hote   : $ROBOT_USER@$ROBOT_IP:$WS_HOST"
echo "   Visible container: $WS_CONTAINER  (via bind-mount)"
if $DO_BUILD; then
    echo "   Build : reussi (cf. sortie ci-dessus)"
else
    echo "   Build : skip — relance avec './deploy_to_robot.sh' pour builder"
fi
