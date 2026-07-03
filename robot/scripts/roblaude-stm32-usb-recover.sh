#!/bin/bash
# Recovery USB cible pour le STM32 CP210x.
# Sur ce robot, le CP210x tombe derriere le hub USB2 1-2, port 3
# ("usb 1-2-port3: Cannot enable"). On reset ce hub, jamais le bus complet.
set -u
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

HUB=${ROBLAUDE_STM32_USB_HUB:-1-2.4}
HUB_PORT=${ROBLAUDE_STM32_USB_PORT:-1}
PARENT_HUB=${ROBLAUDE_STM32_PARENT_USB_HUB:-1-2}
PARENT_PORT=${ROBLAUDE_STM32_PARENT_USB_PORT:-4}
COOLDOWN=${ROBLAUDE_STM32_USB_RESET_COOLDOWN:-300}
OFF_SECS=${ROBLAUDE_STM32_USB_RESET_OFF_SECS:-5}
SETTLE_SECS=${ROBLAUDE_STM32_USB_RESET_SETTLE_SECS:-15}
STAMP=/run/roblaude-stm32-usb-reset
LOCKDIR=/run/roblaude-stm32-usb-reset.lock
DIAGDIR=/var/log/roblaude
port_cycle_ran=false
port_cycle_failed=false

case "$COOLDOWN" in ''|*[!0-9]*) COOLDOWN=300 ;; esac
case "$HUB_PORT" in ''|*[!0-9]*) HUB_PORT=1 ;; esac
case "$PARENT_PORT" in ''|*[!0-9]*) PARENT_PORT=4 ;; esac
case "$OFF_SECS" in ''|*[!0-9]*) OFF_SECS=5 ;; esac
case "$SETTLE_SECS" in ''|*[!0-9]*) SETTLE_SECS=15 ;; esac

install -d -o root -g root -m 0755 "$DIAGDIR" 2>/dev/null || mkdir -p "$DIAGDIR"
LOG="$DIAGDIR/usb_recover_$(date +%Y%m%d-%H%M%S).log"

log() {
  echo "$*"
  echo "$*" >> "$LOG" 2>/dev/null || true
}

cp210_present() {
  lsusb -d 10c4:ea60 >/dev/null 2>&1 && return 0
  for d in /dev/serial/by-id/*Silicon_Labs* /dev/serial/by-id/*CP210*; do
    [ -e "$d" ] && return 0
  done
  return 1
}

hub_has_root_disk() {
  check_hub=$1
  root_src=$(findmnt -n -o SOURCE / 2>/dev/null || true)
  [ -n "$root_src" ] || return 1
  root_dev=$(readlink -f "$root_src" 2>/dev/null || true)
  root_name=$(basename "$root_dev" 2>/dev/null || true)
  [ -n "$root_name" ] || return 1
  parent=$(lsblk -no PKNAME "$root_dev" 2>/dev/null | head -n 1 || true)
  [ -n "$parent" ] || parent="$root_name"
  root_sys=$(readlink -f "/sys/class/block/$parent/device" 2>/dev/null || true)
  case "$root_sys" in
    *"/usb$check_hub/"*|*"/$check_hub/"*|*"/$check_hub."*) return 0 ;;
  esac
  return 1
}

power_cycle_port() {
  hub=$1
  port=$2
  label=$3

  if ! command -v roblaude-hub-port-power >/dev/null 2>&1; then
    log "roblaude-hub-port-power absent, $label impossible"
    return 1
  fi

  if [ ! -e "/sys/bus/usb/devices/$hub" ]; then
    log "hub $hub absent, $label impossible"
    return 1
  fi

  busnum=$(cat "/sys/bus/usb/devices/$hub/busnum" 2>/dev/null || true)
  devnum=$(cat "/sys/bus/usb/devices/$hub/devnum" 2>/dev/null || true)
  if [ -z "$busnum" ] || [ -z "$devnum" ]; then
    log "busnum/devnum absents pour $hub, $label impossible"
    return 1
  fi

  log "power-cycle $label: hub $hub port $port off (${OFF_SECS}s), puis on (${SETTLE_SECS}s)"
  if ! roblaude-hub-port-power "$busnum" "$devnum" "$port" off >> "$LOG" 2>&1; then
    log "$label off echoue"
    return 1
  fi
  sleep "$OFF_SECS"
  if ! roblaude-hub-port-power "$busnum" "$devnum" "$port" on >> "$LOG" 2>&1; then
    log "$label on echoue"
    return 1
  fi
  sleep "$SETTLE_SECS"
  return 0
}

if cp210_present; then
  log "CP210x deja present, rien a reset"
  exit 0
fi

if ! mkdir "$LOCKDIR" 2>/dev/null; then
  log "reset USB deja en cours"
  exit 0
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null || true' EXIT

now=$(date +%s)
last=$(cat "$STAMP" 2>/dev/null || echo 0)
case "$last" in ''|*[!0-9]*) last=0 ;; esac
if [ $((now-last)) -lt "$COOLDOWN" ]; then
  log "cooldown USB actif ($((now-last))s/${COOLDOWN}s), pas de reset"
  exit 2
fi

{
  echo "--- before ---"
  date
  uptime
  lsusb
  lsusb -t
  dmesg 2>/dev/null | grep -Ei 'cp210|ttyUSB|Cannot enable|unable to enumerate|1-2-port' | tail -40
} >> "$LOG" 2>&1 || true

echo "$now" > "$STAMP"
if power_cycle_port "$HUB" "$HUB_PORT" "STM32"; then
  port_cycle_ran=true
else
  port_cycle_failed=true
fi

if ! cp210_present && [ "$port_cycle_ran" = true ] && [ "$port_cycle_failed" = false ]; then
  log "port STM32 power-cycle OK mais CP210x absent, tentative parent $PARENT_HUB port $PARENT_PORT"
  power_cycle_port "$PARENT_HUB" "$PARENT_PORT" "hub robot parent" || port_cycle_failed=true
fi

if ! cp210_present && [ "$port_cycle_failed" = true ]; then
  AUTH="/sys/bus/usb/devices/$PARENT_HUB/authorized"
  if [ ! -w "$AUTH" ]; then
    log "fallback impossible, hub $PARENT_HUB introuvable ou non modifiable ($AUTH)"
    exit 1
  fi
  if hub_has_root_disk "$PARENT_HUB"; then
    log "ABORT: le hub $PARENT_HUB contient le disque racine, reset refuse"
    exit 1
  fi
  log "reset USB hub parent $PARENT_HUB: authorized=0 (${OFF_SECS}s), puis authorized=1 (${SETTLE_SECS}s)"
  echo 0 > "$AUTH"
  sleep "$OFF_SECS"
  echo 1 > "$AUTH"
  sleep "$SETTLE_SECS"
fi

for f in /sys/bus/usb/devices/*/power/control; do
  [ -w "$f" ] || continue
  echo on > "$f" 2>/dev/null || true
done

{
  echo "--- after ---"
  date
  lsusb
  lsusb -t
  dmesg 2>/dev/null | grep -Ei 'cp210|ttyUSB|Cannot enable|unable to enumerate|1-2-port' | tail -60
} >> "$LOG" 2>&1 || true

if cp210_present; then
  log "CP210x revenu apres reset USB"
  ROBLAUDE_LINK_WAIT_SECS=10 /usr/local/bin/roblaude-link-stm32.sh >> "$LOG" 2>&1 || true
  exit 0
fi

log "CP210x toujours absent apres reset USB"
exit 1
