#!/bin/bash
# install_persistence.sh — one-shot setup persistance du robot RobLaude.
#
# Execute EN SSH sur le Jetson par l'humain (toi). Idempotent — on peut
# le rejouer sans casser. A executer une fois, puis plus jamais (sauf
# si on change l'architecture persistance).
#
# Fait, dans l'ordre :
#   1) Installe fake-hwclock + chrony (heure persiste entre reboots,
#      sync NTP si reseau dispo)
#   2) Timezone -> Europe/Paris (defaut Yahboom = Asia/Shanghai)
#   3) Cree /etc/roblaude/broker_ip (place-holder localhost, ecrase par
#      sync_time.sh a chaque session)
#   4) Backup tar.gz du m3pro_teacher_ws avant suppression
#   5) Cree /home/jetson/roblaude_ws/
#   6) Installe NOTRE Docker_M3Pro_Joy.sh dans /home/jetson/ (backup .bak.<ts>
#      de la version Yahboom)
#   7) (Optionnel, demande confirmation) rm -rf m3pro_teacher_ws
#
# Usage cote Mac :
#   scp robot/scripts/install_persistence.sh jetson@<robot>:/tmp/
#   ssh jetson@<robot> "bash /tmp/install_persistence.sh"

set -e

if [ "$(id -u)" -eq 0 ]; then
    echo "ne lance pas ce script en root, utilise sudo ponctuellement"
    exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
ROBLAUDE_WS=/home/jetson/roblaude_ws
TEACHER_WS=/home/jetson/m3pro_teacher_ws
DOCKER_LAUNCHER=/home/jetson/Docker_M3Pro_Joy.sh

echo "━━━ Etape 1/7 : fake-hwclock (NTP impossible — reseau ecole bloque UDP 123) ━━━"
# apt update peut echouer sur des repos morts (ex: nvidia-l4t-apt) — on
# ignore, l'install reussira tant que le mirror Ubuntu repond.
sudo apt-get update -qq || true
sudo apt-get install -y fake-hwclock
sudo systemctl enable --now fake-hwclock
# Si chrony est deja installe, on le masque pour ne pas qu'il tente NTP en
# boucle (sera unmasked si on retrouve un reseau avec NTP plus tard).
if systemctl list-unit-files | grep -q '^chrony.service'; then
    sudo systemctl stop chrony 2>/dev/null || true
    sudo systemctl disable chrony 2>/dev/null || true
fi
echo "   horloge actuelle : $(date)"

echo ""
echo "━━━ Etape 2/7 : timezone Europe/Paris ━━━"
sudo timedatectl set-timezone Europe/Paris
echo "   timezone : $(timedatectl | grep 'Time zone')"

echo ""
echo "━━━ Etape 3/7 : /etc/roblaude/broker_ip ━━━"
sudo mkdir -p /etc/roblaude
if [ ! -f /etc/roblaude/broker_ip ]; then
    echo "localhost" | sudo tee /etc/roblaude/broker_ip > /dev/null
    echo "   cree avec valeur 'localhost' (a ecraser par sync_time.sh)"
else
    echo "   deja present : $(cat /etc/roblaude/broker_ip)"
fi

echo ""
echo "━━━ Etape 4/7 : backup m3pro_teacher_ws ━━━"
if [ -d "$TEACHER_WS" ]; then
    BACKUP_PATH="/home/jetson/teacher_ws_backup_${TS}.tar.gz"
    if [ ! -f "$BACKUP_PATH" ]; then
        echo "   archive vers $BACKUP_PATH (peut prendre 1-2 min)..."
        tar czf "$BACKUP_PATH" -C /home/jetson m3pro_teacher_ws
        echo "   OK ($(du -h "$BACKUP_PATH" | cut -f1))"
    fi
else
    echo "   pas de teacher_ws (deja supprime ?)"
fi

echo ""
echo "━━━ Etape 5/7 : workspace RobLaude ━━━"
mkdir -p "$ROBLAUDE_WS/src" "$ROBLAUDE_WS/scripts"
echo "   $ROBLAUDE_WS pret"

echo ""
echo "━━━ Etape 6/7 : Docker_M3Pro_Joy.sh ━━━"
if [ -f "$DOCKER_LAUNCHER" ] && ! grep -q "roblaude_ws" "$DOCKER_LAUNCHER"; then
    cp "$DOCKER_LAUNCHER" "${DOCKER_LAUNCHER}.bak.${TS}"
    echo "   ancienne version sauvegardee : ${DOCKER_LAUNCHER}.bak.${TS}"
fi
if [ -f "$ROBLAUDE_WS/scripts/Docker_M3Pro_Joy.sh" ]; then
    cp "$ROBLAUDE_WS/scripts/Docker_M3Pro_Joy.sh" "$DOCKER_LAUNCHER"
    chmod +x "$DOCKER_LAUNCHER"
    echo "   installe depuis $ROBLAUDE_WS/scripts/Docker_M3Pro_Joy.sh"
else
    echo "   ATTENTION : pas trouve $ROBLAUDE_WS/scripts/Docker_M3Pro_Joy.sh"
    echo "   lance d'abord ./deploy_to_robot.sh depuis le Mac"
    exit 2
fi

echo ""
echo "━━━ Etape 7/7 : suppression teacher_ws ━━━"
if [ -d "$TEACHER_WS" ]; then
    echo "   teacher_ws est encore present."
    read -r -p "   confirmer suppression ? backup tar.gz fait deja. (yes/N) " confirm
    if [ "$confirm" = "yes" ]; then
        rm -rf "$TEACHER_WS"
        echo "   supprime"
    else
        echo "   skip — relance le script et tape 'yes' quand tu es pret"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ install_persistence.sh termine"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Etapes suivantes (depuis le Mac) :"
echo "  1) ./robot/scripts/sync_time.sh        # push date + broker_ip"
echo "  2) ./robot/scripts/deploy_to_robot.sh  # deploy + build packages"
echo "  3) ssh jetson@<robot> 'bash /home/jetson/Docker_M3Pro_Joy.sh'"
echo "     (ou reboot complet, l'autostart le fait)"
