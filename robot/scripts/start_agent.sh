#!/bin/bash
# start_agent.sh — (LEGACY) lancement manuel de l'agent micro-ROS.
# Prefere le service systemd : install_microros_service.sh. Ici on garde le
# lancement manuel pour le debug, mais on relie d'abord /dev/myserial au bon
# port (CP210x = STM32, jamais le CH340 = micro) via le helper partage.

CONTAINER_NAME="micro_ros_agent"
IMAGE="192.168.2.51:5000/micro-ros-agent:humble"

# Garde-fou : /dev/myserial doit viser le STM32 (CP210x), pas le micro (CH340).
[ -x "$(dirname "$0")/roblaude-link-stm32.sh" ] && "$(dirname "$0")/roblaude-link-stm32.sh" || true

# Attend Docker
while ! systemctl is-active --quiet docker; do
    sleep 1
done

# Reuse si existant. PAS de `-ai` : ca bloque la fenetre lxterminal de
# l'autostart (attache stdin et reste en attente). docker start tout court
# demarre le container en arriere-plan, ce qu'on veut (--restart=unless-stopped
# le maintient en vie de toute facon).
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "ℹ️  Container '${CONTAINER_NAME}' deja existant, redemarrage..."
    docker start "${CONTAINER_NAME}" >/dev/null
    exit $?
fi

# Creation initiale — `-d` (detache) pour ne pas bloquer la fenetre lxterminal
# de l'autostart. L'agent est un daemon, il n'a pas besoin de TTY.
echo "🚀 Creation du container '${CONTAINER_NAME}'"
docker run -d \
    --name "${CONTAINER_NAME}" \
    --restart unless-stopped \
    --init \
    -v /dev:/dev \
    -v /dev/shm:/dev/shm \
    --privileged \
    --net=host \
    "${IMAGE}" \
    serial --dev /dev/myserial -b 2000000 -v4
