#!/bin/bash
# fetch_urdf_from_robot.sh — recupere l'URDF live du robot et le copie cote
# backend pour que le frontend (urdf-loader) puisse l'afficher fidelement.
#
# Usage : ./robot/scripts/fetch_urdf_from_robot.sh
#
# Pre-requis : robot up, container m3pro tourne, /robot_state_publisher actif.

set -eo pipefail
# pas de -u car find_robot.sh teste $ROBOT_IP avant set, et certains
# autres scripts du dossier supposent un environnement laxe.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/find_robot.sh"

DEST="$REPO_ROOT/web/backend/robot_assets"
mkdir -p "$DEST/meshes"

if ! find_robot; then
  echo "Robot inaccessible — abort." >&2
  exit 1
fi

echo "Recuperation URDF depuis $ROBOT_IP..."
ssh -o StrictHostKeyChecking=accept-new "jetson@$ROBOT_IP" \
  "docker exec m3pro bash -c '
    source /opt/ros/humble/setup.bash
    timeout 5 ros2 param get /robot_state_publisher robot_description --hide-type
  '" > "$DEST/m3pro.urdf.xml.tmp"

# La sortie ros2 param peut prefixer par "String value is: ". On strip si present.
sed -i.bak 's/^String value is: //' "$DEST/m3pro.urdf.xml.tmp" 2>/dev/null || \
  sed -i 's/^String value is: //' "$DEST/m3pro.urdf.xml.tmp"
rm -f "$DEST/m3pro.urdf.xml.tmp.bak"
mv "$DEST/m3pro.urdf.xml.tmp" "$DEST/m3pro.urdf.xml"

JOINTS=$(grep -c "<joint " "$DEST/m3pro.urdf.xml" || true)
LINKS=$(grep -c "<link " "$DEST/m3pro.urdf.xml" || true)
echo "URDF sauve : $DEST/m3pro.urdf.xml"
echo "   $LINKS links, $JOINTS joints"

# Copie aussi les meshes STL utilisees par l'URDF.
echo "Copie meshes STL..."
rsync -av -e "ssh -o StrictHostKeyChecking=accept-new" \
  "jetson@$ROBOT_IP:/home/jetson/M3Pro_ws/src/M3Pro/meshes/" \
  "$DEST/meshes/" 2>&1 | tail -5

echo "Termine."
