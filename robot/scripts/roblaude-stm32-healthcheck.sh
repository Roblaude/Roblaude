#!/bin/bash
# Healthcheck STM32 <-> micro-ROS (timer systemd, toutes les 2 min).
# But : detecter tot une regression (agent sur le mauvais port, session morte)
# capturer le diag pour ne plus rediagnostiquer de zero, puis relink + restart.
set -u
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
SVC=micro-ros-agent.service
LINK=/usr/local/bin/roblaude-link-stm32.sh
RECOVER=/usr/local/bin/roblaude-stm32-usb-recover.sh
# Tourne en root (oneshot systemd) : on garde le diag dans un dossier root-owned,
# pas dans /home/jetson (sinon un compte jetson compromis pourrait piéger le chemin
# par symlink et faire écrire root ailleurs). 0755 => lisible sans sudo.
DIAGDIR=/var/log/roblaude
STAMP=/run/roblaude-stm32-last-restart
COOLDOWN=300
[ -L "$DIAGDIR" ] && { echo "$DIAGDIR est un symlink, abort" >&2; exit 1; }
install -d -o root -g root -m 0755 "$DIAGDIR" 2>/dev/null || mkdir -p "$DIAGDIR"
reason=""

cp210_path() {
  for d in /dev/serial/by-id/*Silicon_Labs* /dev/serial/by-id/*CP210*; do
    [ -e "$d" ] || continue
    readlink -f "$d"
    return 0
  done
  return 1
}

cp210_present() {
  cp210_path >/dev/null 2>&1 && return 0
  lsusb -d 10c4:ea60 >/dev/null 2>&1 && return 0
  return 1
}

# 1. Le STM32 est-il enumere ?
if ! cp210_present; then
  reason="STM32 CP210x absent du bus USB"
fi

# 2. container agent vivant ?
if [ -z "$reason" ]; then
  docker ps --format '{{.Names}}' | grep -q '^micro_ros_agent$' || reason="container micro_ros_agent absent"
fi

# 3. myserial pointe bien sur le CP210x (jamais le CH340) ?
if [ -z "$reason" ]; then
  tgt=$(readlink -f /dev/myserial 2>/dev/null || true)
  cp=$(cp210_path 2>/dev/null || true)
  [ -z "$cp" ] && reason="STM32 CP210x absent de /dev/serial/by-id"
  [ -z "$reason" ] && [ "$tgt" != "$cp" ] && reason="myserial->$tgt mais STM32(CP210x)=$cp"
fi

# 4. L'agent peut rester "active" apres disparition du port : lire son log.
if [ -z "$reason" ]; then
  docker logs --tail 20 micro_ros_agent 2>&1 | grep -q 'Serial port not found' \
    && reason="micro_ros_agent actif mais /dev/myserial absent"
fi

# 5. Preuve de vie STM32 : un message frais, pas un node zombie.
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
  echo "--- usb tree ---"; lsusb 2>&1; lsusb -t 2>&1
  echo "--- myserial ---"; ls -l /dev/myserial 2>&1; ls -l /dev/serial/by-id 2>&1
  echo "--- docker ps ---"; docker ps 2>&1
  echo "--- systemd ---"; systemctl --no-pager --plain status "$SVC" 2>&1 | sed -n '1,80p'
  echo "--- agent log ---"; docker logs --tail 40 micro_ros_agent 2>&1
  echo "--- dmesg usb ---"; dmesg 2>/dev/null | grep -Ei 'ch34|cp210|ttyusb|usb .*disconnect|Cannot enable|enumerate' | tail -30
} > "$F" 2>&1
echo "incident: $reason -> $F"

if ! cp210_present; then
  if [ -x "$RECOVER" ]; then
    "$RECOVER" || true
  else
    echo "$RECOVER absent, recovery USB impossible"
  fi
fi

if ! cp210_present; then
  systemctl stop "$SVC" 2>/dev/null || true
  echo "CP210x toujours absent, $SVC stoppe jusqu'au prochain healthcheck"
  exit 1
fi

ROBLAUDE_LINK_WAIT_SECS=10 "$LINK" || true
now=$(date +%s); last=$(cat "$STAMP" 2>/dev/null || echo 0)
if [ $((now-last)) -ge $COOLDOWN ]; then
  echo "$now" > "$STAMP"; systemctl restart "$SVC"; echo "restart $SVC"
else
  echo "cooldown actif, pas de restart"
fi
# garde les 30 plus recents (noms horodates -> tri lexical = chronologique)
find "$DIAGDIR" -maxdepth 1 -name 'incident_*.log' -type f | sort | head -n -30 | while read -r f; do rm -f -- "$f"; done
exit 1
