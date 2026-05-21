#!/bin/bash
# Docker_M3Pro_Joy.sh — lance le container ROS2 du M3 PRO avec notre persistance
#
# Remplace le script Yahboom d'origine. Différences :
#   - container nommé "m3pro" (stable, pas de hunting docker ps)
#   - --restart=unless-stopped (revient apres crash + reboot host)
#   - bind-mount /home/jetson/roblaude_ws (NOTRE workspace, source de verite)
#   - bind-mount /home/jetson/robot_maps (cartes SLAM persistees)
#   - bind-mount /etc/roblaude (broker_ip mis a jour par sync_time.sh)
#   - PAS de mount du m3pro_teacher_ws (on n'utilise plus le code prof)
#   - lance NOTRE container_autostart.sh comme PID 1
#
# Installe par install_persistence.sh sur /home/jetson/Docker_M3Pro_Joy.sh,
# appele par l'autostart Yahboom existant (~/.config/autostart/uros.desktop).

# Attendre le demon Docker
while true; do
    if systemctl is-active --quiet docker; then
        break
    fi
    sleep 1
done

# Autoriser X local pour le container
xhost +local:root >/dev/null 2>&1 || true

# Repertoires hote persistants (jetson est owner, pas de sudo)
mkdir -p /home/jetson/roblaude_ws/scripts
mkdir -p /home/jetson/robot_maps
# /etc/roblaude est cree par install_persistence.sh (sudo). On ne tente pas
# mkdir ici : si le dossier n'existe pas, le bind-mount echouera silencieusement
# (read-only) et BROKER_HOST=localhost fallback dans le container.
if [ ! -d /etc/roblaude ]; then
    echo "ATTENTION : /etc/roblaude absent — lance install_persistence.sh d'abord"
fi

# Recreer "m3pro" a chaque boot pour que les nouveaux volumes/flags prennent.
# Le container persiste via --restart=unless-stopped tant que ce script n'est
# pas rejoue (ex: relogin).
if docker ps -a --format '{{.Names}}' | grep -qx m3pro; then
    docker stop m3pro >/dev/null 2>&1 || true
    docker rm m3pro >/dev/null 2>&1 || true
fi

docker run -d \
  --name m3pro \
  --restart=unless-stopped \
  --net=host \
  --env="DISPLAY" \
  --env="QT_X11_NO_MITSHM=1" \
  -e PULSE_SERVER=unix:/run/user/1000/pulse/native \
  -e ALSA_CARD=0 \
  -e XDG_RUNTIME_DIR=/tmp/runtime-jetson \
  -e ROS_DOMAIN_ID=30 \
  -e FASTDDS_BUILTIN_TRANSPORTS=UDPv4 \
  -v /run/user/1000/pulse:/run/user/1000/pulse:ro \
  -v /home/jetson/.config/pulse:/root/.config/pulse:ro \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  -v /home/jetson/roblaude_ws:/root/roblaude_ws \
  -v /home/jetson/robot_maps:/root/maps \
  -v /etc/roblaude:/etc/roblaude:ro \
  --device=/dev/bus/usb \
  --device=/dev/input \
  --security-opt apparmor:unconfined \
  192.168.2.51:5000/rosmaster-m3pro-nano:1.1.0 \
  /bin/bash -c 'if [ -x /root/roblaude_ws/scripts/container_autostart.sh ]; then
    exec /bin/bash /root/roblaude_ws/scripts/container_autostart.sh
  else
    echo "[boot] container_autostart.sh absent du workspace bind-mounte."
    echo "[boot] lance deploy_to_robot.sh depuis le Mac, puis relance ce script."
    echo "[boot] container reste en vie via tail -f /dev/null"
    exec tail -f /dev/null
  fi'

echo "Container m3pro lance."
docker ps --filter name=m3pro --format '  {{.Names}}: {{.Status}}'
