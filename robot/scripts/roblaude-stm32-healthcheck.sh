#!/bin/bash
# Healthcheck STM32 <-> micro-ROS (timer systemd, toutes les 2 min).
# But : detecter tot une regression (agent sur le mauvais port, session morte)
# capturer le diag pour ne plus rediagnostiquer de zero, puis relink + restart.
set -u
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
SVC=micro-ros-agent.service
# Tourne en root (oneshot systemd) : on garde le diag dans un dossier root-owned,
# pas dans /home/jetson (sinon un compte jetson compromis pourrait piéger le chemin
# par symlink et faire écrire root ailleurs). 0755 => lisible sans sudo.
DIAGDIR=/var/log/roblaude
STAMP=/run/roblaude-stm32-last-restart
COOLDOWN=300
[ -L "$DIAGDIR" ] && { echo "$DIAGDIR est un symlink, abort" >&2; exit 1; }
install -d -o root -g root -m 0755 "$DIAGDIR" 2>/dev/null || mkdir -p "$DIAGDIR"
reason=""

# 1. container agent vivant ?
docker ps --format '{{.Names}}' | grep -q '^micro_ros_agent$' || reason="container micro_ros_agent absent"

# 2. myserial pointe bien sur le CP210x (jamais le CH340) ?
if [ -z "$reason" ]; then
  tgt=$(readlink -f /dev/myserial 2>/dev/null || true)
  cp=""
  for d in /dev/serial/by-id/*Silicon_Labs* /dev/serial/by-id/*CP210*; do
    [ -e "$d" ] && cp=$(readlink -f "$d") && break
  done
  [ -z "$cp" ] && reason="STM32 CP210x absent de /dev/serial/by-id"
  [ -z "$reason" ] && [ "$tgt" != "$cp" ] && reason="myserial->$tgt mais STM32(CP210x)=$cp"
fi

# 3. L'agent peut rester "active" apres disparition du port : lire son log.
if [ -z "$reason" ]; then
  docker logs --tail 20 micro_ros_agent 2>&1 | grep -q 'Serial port not found' \
    && reason="micro_ros_agent actif mais /dev/myserial absent"
fi

# 4. Preuve de vie STM32 : un message frais, pas un node zombie.
if [ -z "$reason" ]; then
  docker ps --format '{{.Names}}' | grep -q '^m3pro$' || reason="container m3pro absent"
fi
if [ -z "$reason" ]; then
  docker exec -e ROS_DOMAIN_ID=30 -e FASTDDS_BUILTIN_TRANSPORTS=UDPv4 m3pro \
    bash -lc '
      source /opt/ros/humble/setup.bash
      source /root/yahboomcar_ws/install/setup.bash 2>/dev/null || true
      source /root/roblaude_ws/install/setup.bash 2>/dev/null || true
      timeout 5 ros2 topic echo /battery --once >/tmp/roblaude_battery_check 2>/dev/null ||
      timeout 5 ros2 topic echo /odom_raw --once >/tmp/roblaude_odom_raw_check 2>/dev/null
    ' || reason="aucun message frais /battery ou /odom_raw"
fi

[ -z "$reason" ] && { echo "OK"; exit 0; }

# --- incident ---
F="$DIAGDIR/incident_$(date +%Y%m%d-%H%M%S).log"
[ -L "$F" ] && rm -f "$F"   # jamais suivre un symlink piégé
{
  echo "REASON: $reason"; date; uptime
  echo "--- myserial ---"; ls -l /dev/myserial 2>&1; ls -l /dev/serial/by-id 2>&1
  echo "--- docker ps ---"; docker ps 2>&1
  echo "--- agent log ---"; docker logs --tail 40 micro_ros_agent 2>&1
  echo "--- dmesg usb ---"; dmesg 2>/dev/null | grep -Ei 'ch34|cp210|ttyusb|usb .*disconnect|Cannot enable|enumerate' | tail -30
} > "$F" 2>&1
echo "incident: $reason -> $F"

/usr/local/bin/roblaude-link-stm32.sh || true
now=$(date +%s); last=$(cat "$STAMP" 2>/dev/null || echo 0)
if [ $((now-last)) -ge $COOLDOWN ]; then
  echo "$now" > "$STAMP"; systemctl restart "$SVC"; echo "restart $SVC"
else
  echo "cooldown actif, pas de restart"
fi
# garde les 30 plus recents (noms horodates -> tri lexical = chronologique)
find "$DIAGDIR" -maxdepth 1 -name 'incident_*.log' -type f | sort | head -n -30 | while read -r f; do rm -f -- "$f"; done
exit 1
