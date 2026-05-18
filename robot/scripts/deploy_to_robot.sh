#!/bin/bash
# deploy_to_robot.sh — Pousse les launch files vers le robot
#
# Usage : ./deploy_to_robot.sh
#
# Prerequis :
#   - sshpass installe (brew install sshpass)
#   - Robot accessible sur 172.20.10.2 (ssh jetson@... fonctionne)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/find_robot.sh"

ROBOT_USER="${ROBOT_USER:-jetson}"
ROBOT_PASS="${ROBOT_PASS:-yahboom}"
DEST_DIR="${DEST_DIR:-/home/jetson/launch}"
CONTAINER="${CONTAINER:-angry_ptolemy}"
CONTAINER_DEST="${CONTAINER_DEST:-/root/launch}"

# Auto-detect robot par MAC
if ! find_robot; then
    exit 1
fi

LOCAL_DIR="$(cd "$SCRIPT_DIR/../robot_stack/launch" && pwd)"

echo "=== Deploy robot_stack/launch/ vers $ROBOT_USER@$ROBOT_IP:$DEST_DIR ==="
echo "Source : $LOCAL_DIR"
echo ""

# Creer le dossier distant si besoin
sshpass -p "$ROBOT_PASS" ssh -o StrictHostKeyChecking=no "$ROBOT_USER@$ROBOT_IP" \
    "mkdir -p $DEST_DIR"

# Transfert rsync (delta = rapide)
sshpass -p "$ROBOT_PASS" rsync -avz --delete \
    -e "ssh -o StrictHostKeyChecking=no" \
    "$LOCAL_DIR/" \
    "$ROBOT_USER@$ROBOT_IP:$DEST_DIR/"

echo ""
echo "=== Propagation vers le container $CONTAINER:$CONTAINER_DEST ==="
# Le container ROS2 n a pas de volume vers ~/launch : on copie dedans
sshpass -p "$ROBOT_PASS" ssh -o StrictHostKeyChecking=no "$ROBOT_USER@$ROBOT_IP" \
    "docker exec $CONTAINER mkdir -p $CONTAINER_DEST && docker cp $DEST_DIR/. $CONTAINER:$CONTAINER_DEST/"

echo ""
echo "✅ Deploiement termine (host + container)."
echo ""
echo "Pour lancer un fichier :"
echo "  ssh $ROBOT_USER@$ROBOT_IP"
echo "  docker exec -it $CONTAINER bash"
echo "  source /opt/ros/humble/setup.bash"
echo "  source /root/yahboomcar_ws/install/setup.bash"
echo "  export ROS_DOMAIN_ID=30"
echo "  ros2 launch $CONTAINER_DEST/lidar.launch.py"
