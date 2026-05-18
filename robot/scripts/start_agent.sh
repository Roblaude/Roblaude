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

# Reuse si existant
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "ℹ️  Container '${CONTAINER_NAME}' deja existant, redemarrage..."
    docker start -ai "${CONTAINER_NAME}"
    exit $?
fi

# Creation initiale
echo "🚀 Creation du container '${CONTAINER_NAME}'"
docker run -it \
    --name "${CONTAINER_NAME}" \
    --restart unless-stopped \
    --init \
    -v /dev:/dev \
    -v /dev/shm:/dev/shm \
    --privileged \
    --net=host \
    "${IMAGE}" \
    serial --dev /dev/myserial -b 2000000 -v4
