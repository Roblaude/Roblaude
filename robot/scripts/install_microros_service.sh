#!/bin/bash
# install_microros_service.sh — installe (idempotent) le bridge micro-ROS STM32
# en service systemd + son healthcheck. A lancer SUR le Jetson.
#
# Corrige le bug historique : l'agent etait pointe sur le CH340 (1a86 = micro)
# au lieu du STM32 (CP2104 = 10c4:ea60) -> "running... fd:3" sans jamais de
# session, YB_Node absent, /battery muet. Ici on keye sur la puce CP210x.
#
# Usage (depuis le Mac) :
#   ./robot/scripts/deploy_to_robot.sh            # pousse les scripts
#   ssh jetson@<robot> 'bash /home/jetson/roblaude_ws/scripts/install_microros_service.sh'
set -e

SRC="$(cd "$(dirname "$0")" && pwd)"

echo "━━━ 1/4 : helpers dans /usr/local/bin ━━━"
sudo install -m 0755 "$SRC/roblaude-link-stm32.sh"       /usr/local/bin/roblaude-link-stm32.sh
sudo install -m 0755 "$SRC/roblaude-stm32-healthcheck.sh" /usr/local/bin/roblaude-stm32-healthcheck.sh

echo "━━━ 2/4 : units systemd ━━━"
sudo install -m 0644 "$SRC/systemd/micro-ros-agent.service"            /etc/systemd/system/micro-ros-agent.service
sudo install -m 0644 "$SRC/systemd/roblaude-stm32-healthcheck.service" /etc/systemd/system/roblaude-stm32-healthcheck.service
sudo install -m 0644 "$SRC/systemd/roblaude-stm32-healthcheck.timer"   /etc/systemd/system/roblaude-stm32-healthcheck.timer

echo "━━━ 3/4 : on coupe l'ancien autostart GUI fragile (si present) ━━━"
GUI=/home/jetson/.config/autostart/start.desktop
[ -f "$GUI" ] && mv "$GUI" "$GUI.disabled-by-roblaude-systemd" && echo "   start.desktop desactive"

echo "━━━ 4/4 : (re)demarrage des services ━━━"
sudo systemctl daemon-reload
sudo systemctl enable --now micro-ros-agent.service
sudo systemctl enable --now roblaude-stm32-healthcheck.timer
sleep 10

echo ""
echo "━━━ verif ━━━"
echo "myserial : $(readlink -f /dev/myserial)"
echo "agent    : $(systemctl is-active micro-ros-agent.service)"
echo "timer    : $(systemctl is-active roblaude-stm32-healthcheck.timer)"
sudo /usr/local/bin/roblaude-stm32-healthcheck.sh
