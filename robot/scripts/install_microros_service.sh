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
sudo install -o jetson -g jetson -m 0755 "$SRC/Docker_M3Pro_Joy.sh"          /home/jetson/Docker_M3Pro_Joy.sh
sudo install -m 0755 "$SRC/roblaude-usb-stable.sh"         /usr/local/bin/roblaude-usb-stable.sh
sudo install -m 0755 "$SRC/roblaude-link-stm32.sh"        /usr/local/bin/roblaude-link-stm32.sh
sudo install -m 0755 "$SRC/roblaude-stm32-usb-recover.sh" /usr/local/bin/roblaude-stm32-usb-recover.sh
sudo install -m 0755 "$SRC/roblaude-stm32-healthcheck.sh" /usr/local/bin/roblaude-stm32-healthcheck.sh
sudo install -m 0755 "$SRC/roblaude-robot-status.sh"      /usr/local/bin/roblaude-robot-status.sh
sudo install -m 0755 "$SRC/roblaude-usb-boot-guard.sh"    /usr/local/bin/roblaude-usb-boot-guard.sh
sudo install -m 0755 "$SRC/roblaude-demo-preflight.sh"    /usr/local/bin/roblaude-demo-preflight.sh
if [ -f "$SRC/roblaude-hub-port-power.c" ] && command -v gcc >/dev/null && command -v pkg-config >/dev/null && pkg-config --exists libusb-1.0; then
  if sudo gcc -O2 -Wall -Wextra "$SRC/roblaude-hub-port-power.c" -o /usr/local/bin/roblaude-hub-port-power $(pkg-config --cflags --libs libusb-1.0); then
    echo "   roblaude-hub-port-power compile"
  else
    echo "   compilation roblaude-hub-port-power echouee (fallback sysfs garde)"
  fi
else
  echo "   gcc/libusb indisponible (fallback sysfs garde)"
fi

echo "━━━ 1bis/4 : dossier diag root-owned ━━━"
sudo install -d -o root -g root -m 0755 /var/log/roblaude

echo "━━━ 2/4 : units systemd ━━━"
sudo install -m 0644 "$SRC/systemd/micro-ros-agent.service"            /etc/systemd/system/micro-ros-agent.service
sudo install -m 0644 "$SRC/systemd/roblaude-stm32-healthcheck.service" /etc/systemd/system/roblaude-stm32-healthcheck.service
sudo install -m 0644 "$SRC/systemd/roblaude-stm32-healthcheck.timer"   /etc/systemd/system/roblaude-stm32-healthcheck.timer
sudo install -m 0644 "$SRC/systemd/roblaude-usb-stable.service"        /etc/systemd/system/roblaude-usb-stable.service
sudo install -m 0644 "$SRC/systemd/roblaude-demo-preflight.service"    /etc/systemd/system/roblaude-demo-preflight.service
sudo install -m 0644 "$SRC/systemd/roblaude-m3pro.service"             /etc/systemd/system/roblaude-m3pro.service

echo "━━━ 3/4 : on coupe l'ancien autostart GUI fragile (si present) ━━━"
GUI=/home/jetson/.config/autostart/start.desktop
[ -f "$GUI" ] && mv "$GUI" "$GUI.disabled-by-roblaude-systemd" && echo "   start.desktop desactive"
GUI=/home/jetson/.config/autostart/uros.desktop
[ -f "$GUI" ] && mv "$GUI" "$GUI.disabled-by-roblaude-systemd" && echo "   uros.desktop desactive"

echo "━━━ 4/4 : (re)demarrage des services ━━━"
sudo systemctl daemon-reload
sudo systemctl enable --now roblaude-usb-stable.service
sudo systemctl enable roblaude-demo-preflight.service
sudo systemctl enable micro-ros-agent.service
sudo systemctl restart micro-ros-agent.service || true
sudo systemctl enable roblaude-m3pro.service
sudo systemctl enable --now roblaude-stm32-healthcheck.timer
sleep 10

echo ""
echo "━━━ verif ━━━"
echo "myserial : $(readlink -f /dev/myserial)"
echo "agent    : $(systemctl is-active micro-ros-agent.service)"
echo "timer    : $(systemctl is-active roblaude-stm32-healthcheck.timer)"
sudo /usr/local/bin/roblaude-stm32-healthcheck.sh || true
