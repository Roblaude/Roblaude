#!/bin/bash
# Etat du robot en JSON (READ-ONLY, aucune action, aucune reparation).
# Lu par le backend via SSH pour la page Reparation du front.
set -u
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# 1. /dev/myserial pointe-t-il bien sur le STM32 (CP210x) ?
myserial_ok=false
tgt=$(readlink -f /dev/myserial 2>/dev/null || true)
cp210x_present=false
for d in /dev/serial/by-id/*Silicon_Labs* /dev/serial/by-id/*CP210*; do
  [ -e "$d" ] || continue
  cp210x_present=true
  [ "$(readlink -f "$d")" = "$tgt" ] && myserial_ok=true
  break
done

# 2. service agent micro-ROS
agent=$(systemctl is-active micro-ros-agent.service 2>/dev/null | head -n 1 || true)
[ -n "$agent" ] || agent=unknown
agent_log_ok=true
docker logs --tail 20 micro_ros_agent 2>&1 | grep -q 'Serial port not found' && agent_log_ok=false

# 3. container ROS principal
m3pro=down
docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^m3pro$' && m3pro=up

# 4. YB_Node reste visible apres certaines pertes serie : indicateur secondaire.
yb_node=false
if [ "$m3pro" = up ]; then
  docker exec -e ROS_DOMAIN_ID=30 -e FASTDDS_BUILTIN_TRANSPORTS=UDPv4 m3pro \
    bash -lc 'source /opt/ros/humble/setup.bash; timeout 4 ros2 node list 2>/dev/null | grep -q YB_Node' \
    && yb_node=true
fi

# 5. Preuve forte : donnees fraiches STM32.
stm32_data=false
if [ "$m3pro" = up ] && [ "$myserial_ok" = true ] && [ "$agent_log_ok" = true ]; then
  docker exec -e ROS_DOMAIN_ID=30 -e FASTDDS_BUILTIN_TRANSPORTS=UDPv4 m3pro \
    bash -lc '
      source /opt/ros/humble/setup.bash
      source /root/yahboomcar_ws/install/setup.bash 2>/dev/null || true
      source /root/roblaude_ws/install/setup.bash 2>/dev/null || true
      timeout 4 ros2 topic echo /battery --once >/tmp/roblaude_battery_check 2>/dev/null ||
      timeout 4 ros2 topic echo /odom_raw --once >/tmp/roblaude_odom_raw_check 2>/dev/null
    ' && stm32_data=true
fi

printf '{"myserial_ok":%s,"cp210x_present":%s,"agent":"%s","agent_log_ok":%s,"m3pro":"%s","yb_node":%s,"stm32_data":%s}\n' \
  "$myserial_ok" "$cp210x_present" "$agent" "$agent_log_ok" "$m3pro" "$yb_node" "$stm32_data"
