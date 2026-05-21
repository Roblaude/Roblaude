#!/bin/bash
# start_agent.sh — Lance le container micro-ROS-agent avec nom fixe
#
# Identique a la logique Docker_M3Pro_Joy.sh : nom fixe "micro_ros_agent"
# -> pas de nouveau container a chaque reboot.

CONTAINER_NAME="micro_ros_agent"
IMAGE="192.168.2.51:5000/micro-ros-agent:humble"

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
