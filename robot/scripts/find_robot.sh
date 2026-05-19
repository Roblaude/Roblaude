#!/bin/bash
# find_robot.sh — Trouve l'IP courante du robot en scannant le subnet par MAC
#
# Le WiFi event change régulièrement l IP du robot via DHCP. Cette fonction
# scanne le subnet local et retourne l IP correspondant a la MAC du Jetson.
#
# Usage (sourcing) :
#   source scripts/find_robot.sh
#   find_robot            # remplit $ROBOT_IP
#
# Usage (standalone) :
#   ./scripts/find_robot.sh
#
# Configurable via env :
#   ROBOT_MAC      : MAC du Jetson (defaut 50:3d:d1:ff:f3:7d)
#   ROBOT_IP       : si deja set et ping OK, on ne scan pas
#   SUBNET_PREFIX  : ex "10.10.221" (si absent, deduit de l IP locale)

ROBOT_MAC="${ROBOT_MAC:-50:3d:d1:ff:f3:7d}"

find_robot() {
    # 1) Si ROBOT_IP deja set et robot ping, on garde
    if [ -n "$ROBOT_IP" ] && ping -c 1 -W 1 "$ROBOT_IP" > /dev/null 2>&1; then
        # verifier que c est bien notre robot (MAC match)
        local arp_mac
        arp_mac=$(arp -n "$ROBOT_IP" 2>/dev/null | awk '{print $4}' | grep -i "^$ROBOT_MAC$")
        if [ -n "$arp_mac" ]; then
            echo "✅ Robot deja joignable a $ROBOT_IP (MAC confirmee)" >&2
            export ROBOT_IP
            return 0
        fi
    fi

    echo "🔍 Scan du subnet pour trouver le robot (MAC $ROBOT_MAC)..." >&2

    # 2) Deduire le prefix subnet depuis l IP locale
    local prefix="${SUBNET_PREFIX}"
    if [ -z "$prefix" ]; then
        local local_ip
        local_ip=$(ipconfig getifaddr en0 2>/dev/null)
        if [ -z "$local_ip" ]; then
            # Fallback Linux : route par defaut
            local_ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)
        fi
        prefix=$(echo "$local_ip" | cut -d. -f1-3)
    fi

    if [ -z "$prefix" ]; then
        echo "❌ Impossible de deduire le subnet local" >&2
        return 1
    fi

    # 3) Ping parallele sur tout le subnet pour peupler la table ARP
    echo "   -> ping $prefix.1-254 en parallele..." >&2
    for i in $(seq 1 254); do
        ping -c 1 -W 1 -t 1 "$prefix.$i" > /dev/null 2>&1 &
    done
    wait 2>/dev/null

    # 4) Chercher la MAC dans la table ARP (compatible macOS BSD et Linux)
    local found_ip
    found_ip=$(arp -a 2>/dev/null | grep -i "$ROBOT_MAC" | awk -F'[()]' '{print $2}' | head -1)

    if [ -z "$found_ip" ]; then
        echo "❌ Robot introuvable dans $prefix.0/24 (MAC $ROBOT_MAC)" >&2
        echo "   Verifie que le robot est allume et sur le meme WiFi que toi." >&2
        return 1
    fi

    echo "✅ Robot trouve a $found_ip (MAC $ROBOT_MAC)" >&2
    export ROBOT_IP="$found_ip"
    return 0
}

# Si execute directement (pas sourced) : affiche l IP
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    find_robot && echo "$ROBOT_IP"
fi
