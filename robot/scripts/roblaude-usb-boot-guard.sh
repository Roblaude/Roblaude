#!/bin/bash
# Verifie les ports USB critiques au boot et tente un recovery cible.
# Objectif : avant Docker/ROS, les ports utilises doivent etre enumeres.
set -u
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

HUB=${ROBLAUDE_USB_GUARD_HUB:-1-2}
SAFE_PORTS=${ROBLAUDE_USB_GUARD_SAFE_PORTS:-4}
ALLOW_HUB_FALLBACK=${ROBLAUDE_USB_GUARD_ALLOW_HUB_FALLBACK:-false}
MAX_ATTEMPTS=${ROBLAUDE_USB_GUARD_ATTEMPTS:-2}
OFF_SECS=${ROBLAUDE_USB_GUARD_OFF_SECS:-4}
SETTLE_SECS=${ROBLAUDE_USB_GUARD_SETTLE_SECS:-12}
DIAGDIR=/var/log/roblaude
LOG="$DIAGDIR/usb_boot_guard_$(date +%Y%m%d-%H%M%S).log"

case "$MAX_ATTEMPTS" in ''|*[!0-9]*) MAX_ATTEMPTS=2 ;; esac
case "$OFF_SECS" in ''|*[!0-9]*) OFF_SECS=4 ;; esac
case "$SETTLE_SECS" in ''|*[!0-9]*) SETTLE_SECS=12 ;; esac

install -d -o root -g root -m 0755 "$DIAGDIR" 2>/dev/null || mkdir -p "$DIAGDIR"

log() {
  echo "$*"
  echo "$*" >> "$LOG" 2>/dev/null || true
}

present() {
  lsusb -d "$1" >/dev/null 2>&1
}

status_line() {
  name=$1
  vidpid=$2
  if present "$vidpid"; then
    echo "$name:$vidpid=ok"
  else
    echo "$name:$vidpid=missing"
  fi
}

missing_required() {
  missing=""
  present 2357:012e || missing="$missing wifi"
  present 10c4:ea60 || missing="$missing stm32"
  present 1a86:7522 || missing="$missing ch341"
  present 2bc5:06a0 || missing="$missing orbbec_depth"
  present 2bc5:0561 || missing="$missing orbbec_rgb"
  echo "$missing" | sed 's/^ *//'
}

fault_ports_from_dmesg() {
  dmesg 2>/dev/null |
    sed -n "s/.*usb ${HUB}-port\\([0-9][0-9]*\\):.*\\(Cannot enable\\|unable to enumerate\\).*/\\1/p" |
    sort -n | uniq
}

hub_has_root_disk() {
  root_src=$(findmnt -n -o SOURCE / 2>/dev/null || true)
  [ -n "$root_src" ] || return 1
  root_dev=$(readlink -f "$root_src" 2>/dev/null || true)
  root_name=$(basename "$root_dev" 2>/dev/null || true)
  [ -n "$root_name" ] || return 1
  parent=$(lsblk -no PKNAME "$root_dev" 2>/dev/null | head -n 1 || true)
  [ -n "$parent" ] || parent="$root_name"
  root_sys=$(readlink -f "/sys/class/block/$parent/device" 2>/dev/null || true)
  case "$root_sys" in
    *"/usb$HUB/"*|*"/$HUB/"*|*"/$HUB."*) return 0 ;;
  esac
  return 1
}

hub_bus_dev() {
  busnum=$(cat "/sys/bus/usb/devices/$HUB/busnum" 2>/dev/null || true)
  devnum=$(cat "/sys/bus/usb/devices/$HUB/devnum" 2>/dev/null || true)
  [ -n "$busnum" ] && [ -n "$devnum" ] || return 1
  echo "$busnum $devnum"
}

cycle_port() {
  port=$1
  if ! command -v roblaude-hub-port-power >/dev/null 2>&1; then
    log "outil roblaude-hub-port-power absent, port $port non cycle"
    return 1
  fi
  bd=$(hub_bus_dev) || { log "hub $HUB sans busnum/devnum"; return 1; }
  set -- $bd
  busnum=$1
  devnum=$2
  log "power-cycle hub $HUB port $port"
  if ! roblaude-hub-port-power "$busnum" "$devnum" "$port" off >> "$LOG" 2>&1; then
    log "port $port off echoue"
    return 1
  fi
  sleep "$OFF_SECS"
  if ! roblaude-hub-port-power "$busnum" "$devnum" "$port" on >> "$LOG" 2>&1; then
    log "port $port on echoue"
    return 1
  fi
  sleep "$SETTLE_SECS"
  return 0
}

cycle_hub_fallback() {
  auth="/sys/bus/usb/devices/$HUB/authorized"
  [ -w "$auth" ] || { log "fallback impossible, $auth non modifiable"; return 1; }
  if hub_has_root_disk; then
    log "fallback refuse: $HUB contient le disque racine"
    return 1
  fi
  log "fallback hub entier $HUB"
  echo 0 > "$auth"
  sleep "$OFF_SECS"
  echo 1 > "$auth"
  sleep "$SETTLE_SECS"
}

ports_to_try() {
  ports=""
  missing=$(missing_required)
  # Depuis le recablage fiable, tout le bloc robot (STM32, CH341, Orbbec)
  # est derriere le hub lourd branche sur le port 4 du hub 1-2.
  case " $missing " in
    *" stm32 "*|*" ch341 "*|*" orbbec_depth "*|*" orbbec_rgb "*) ports="$ports 4" ;;
  esac
  for p in $(fault_ports_from_dmesg); do
    ports="$ports $p"
  done
  # Mode demo strict : ne jamais toucher aux ports hors whitelist. Ca garde le
  # Wi-Fi/SSH vivant meme si un vieux dmesg mentionne un autre port.
  echo "$ports" | tr ' ' '\n' | sed '/^$/d' | sort -n | uniq |
    awk -v safe="$SAFE_PORTS" '
      BEGIN { split(safe, a, /[ ,]+/); for (i in a) allowed[a[i]]=1 }
      allowed[$0] { print }
    '
}

{
  echo "--- start ---"
  date
  uptime
  echo "$(status_line wifi 2357:012e)"
  echo "$(status_line stm32 10c4:ea60)"
  echo "$(status_line ch341 1a86:7522)"
  echo "$(status_line orbbec_depth 2bc5:06a0)"
  echo "$(status_line orbbec_rgb 2bc5:0561)"
  echo "$(status_line screen 0484:5750)"
  lsusb
  lsusb -t
  dmesg 2>/dev/null | grep -Ei "usb ${HUB}-port|cp210|ttyUSB|Cannot enable|unable to enumerate" | tail -80
} >> "$LOG" 2>&1 || true

attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  missing=$(missing_required)
  [ -z "$missing" ] && { log "USB boot guard OK"; exit 0; }

  ports=$(ports_to_try)
  [ -n "$ports" ] || { log "aucun port cible pour: $missing"; exit 1; }
  log "tentative $attempt/$MAX_ATTEMPTS, manquants:$missing, ports:$ports"

  failed=false
  for p in $ports; do
    cycle_port "$p" || failed=true
  done
  if [ "$failed" = true ] && [ "$ALLOW_HUB_FALLBACK" = true ]; then
    cycle_hub_fallback || true
  elif [ "$failed" = true ]; then
    log "fallback hub entier desactive (ROBLAUDE_USB_GUARD_ALLOW_HUB_FALLBACK=false)"
  fi

  {
    echo "--- after attempt $attempt ---"
    date
    echo "$(status_line wifi 2357:012e)"
    echo "$(status_line stm32 10c4:ea60)"
    echo "$(status_line ch341 1a86:7522)"
    echo "$(status_line orbbec_depth 2bc5:06a0)"
    echo "$(status_line orbbec_rgb 2bc5:0561)"
    echo "$(status_line screen 0484:5750)"
    lsusb
    lsusb -t
    dmesg 2>/dev/null | grep -Ei "usb ${HUB}-port|cp210|ttyUSB|Cannot enable|unable to enumerate" | tail -80
  } >> "$LOG" 2>&1 || true

  attempt=$((attempt + 1))
done

missing=$(missing_required)
if [ -n "$missing" ]; then
  log "USB boot guard KO, manquants:$missing"
  exit 1
fi

log "USB boot guard OK"
exit 0
