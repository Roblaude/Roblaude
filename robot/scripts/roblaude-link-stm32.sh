#!/bin/bash
# Lie /dev/myserial au STM32 (puce CP210x, VID 10c4:ea60).
# NE JAMAIS lier le CH340 (1a86) : c'est le micro du robot (cf speech.rules).
# On keye sur la puce, pas sur ttyUSB0/1 : l'ordre d'enumeration change au boot.
set -u
WAIT_SECS=${ROBLAUDE_LINK_WAIT_SECS:-90}
case "$WAIT_SECS" in
  ''|*[!0-9]*) WAIT_SECS=90 ;;
esac
for i in $(seq 1 "$WAIT_SECS"); do
  for d in /dev/serial/by-id/*Silicon_Labs* /dev/serial/by-id/*CP210*; do
    [ -e "$d" ] || continue
    ln -sf "$d" /dev/myserial
    echo "myserial -> $(readlink -f /dev/myserial) (STM32 CP210x)"
    exit 0
  done
  sleep 1
done
echo "STM32 CP210x introuvable dans /dev/serial/by-id" >&2
exit 1
