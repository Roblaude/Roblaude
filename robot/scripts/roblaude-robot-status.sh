#!/bin/bash
# Etat du robot en JSON (READ-ONLY, aucune action, aucune reparation).
# Lu par le backend via SSH pour la page Reparation du front.
set -u

# 1. /dev/myserial pointe-t-il bien sur le STM32 (CP210x) ?
myserial_ok=false
tgt=$(readlink -f /dev/myserial 2>/dev/null || true)
for d in /dev/serial/by-id/*Silicon_Labs* /dev/serial/by-id/*CP210*; do
  [ -e "$d" ] || continue
  [ "$(readlink -f "$d")" = "$tgt" ] && myserial_ok=true
  break
done

# 2. service agent micro-ROS
agent=$(systemctl is-active micro-ros-agent.service 2>/dev/null || echo unknown)

# 3. container ROS principal
m3pro=down
docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^m3pro$' && m3pro=up

# 4. YB_Node present = session STM32 vivante
yb_node=false
if [ "$m3pro" = up ]; then
  docker exec -e ROS_DOMAIN_ID=30 -e FASTDDS_BUILTIN_TRANSPORTS=UDPv4 m3pro \
    bash -lc 'source /opt/ros/humble/setup.bash; timeout 8 ros2 node list 2>/dev/null | grep -q YB_Node' \
    && yb_node=true
fi

printf '{"myserial_ok":%s,"agent":"%s","m3pro":"%s","yb_node":%s}\n' \
  "$myserial_ok" "$agent" "$m3pro" "$yb_node"
