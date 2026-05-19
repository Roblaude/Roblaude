#!/bin/bash
# connect.sh — Ouvre rapidement une session SSH au robot + noVNC dans le navigateur
#
# Usage : ./connect.sh [--no-vnc]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/find_robot.sh"

ROBOT_USER="${ROBOT_USER:-jetson}"
OPEN_VNC=true

if [[ "$1" == "--no-vnc" ]]; then
    OPEN_VNC=false
fi

# Auto-detect robot par MAC (resistant au changement d IP DHCP du WiFi event)
if ! find_robot; then
    exit 1
fi
echo "✅ Robot OK"

if $OPEN_VNC; then
    echo "=== Ouverture noVNC dans navigateur ==="
    open "http://$ROBOT_IP:6080/vnc.html?host=$ROBOT_IP&port=6080&autoconnect=1&resize=scale"
fi

echo "=== SSH au robot (password: yahboom) ==="
ssh "$ROBOT_USER@$ROBOT_IP"
