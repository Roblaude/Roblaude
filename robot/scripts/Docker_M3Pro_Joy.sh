#!/bin/bash
# Docker_M3Pro_Joy.sh — Lance le container ROS2 principal du M3 PRO
#
# Comportement :
#   - Attend que Docker soit pret
#   - Si le container "m3pro" existe deja -> le redemarre (garde /root/*)
#   - Sinon -> le cree avec un nom fixe (pas de noms random angry_ptolemy...)
#
# Avantage : tu retrouves tes fichiers perso dans /root/ entre les reboots
# (ex: /root/launch/, /root/scan_restamper.py, /root/odom_to_tf.py).

CONTAINER_NAME="m3pro"
IMAGE="192.168.2.51:5000/rosmaster-m3pro-nano:1.1.0"

# 1) Attend le demon Docker
while true; do
    if systemctl is-active --quiet docker; then
        echo "✅ Docker service has been started"
        break
    fi
    echo "⏳ The Docker service has not started, waiting..."
    sleep 1
done

xhost +

# 2) Container deja existant ? -> on le relance simplement
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "ℹ️  Container '${CONTAINER_NAME}' deja existant, redemarrage..."
    docker start -ai "${CONTAINER_NAME}"
    exit $?
fi

# 3) Sinon : creation initiale
echo "🚀 Creation du container '${CONTAINER_NAME}' (premiere fois)"
docker run -it \
    --name "${CONTAINER_NAME}" \
    --restart unless-stopped \
    --net=host \
    --env="DISPLAY" \
    --env="QT_X11_NO_MITSHM=1" \
    -e PULSE_SERVER=unix:/run/user/1000/pulse/native \
    -e ALSA_CARD=0 \
    -e XDG_RUNTIME_DIR=/tmp/runtime-$USER \
    -v /run/user/1000/pulse:/run/user/1000/pulse:ro \
    -v ~/.config/pulse:/root/.config/pulse:ro \
    -v /tmp/.X11-unix:/tmp/.X11-unix \
    -v /home/jetson/launch:/root/launch \
    --device=/dev/bus/usb \
    --security-opt apparmor:unconfined \
    --device=/dev/input \
    "${IMAGE}" /bin/bash /root/joy.sh
