#!/bin/bash
# Stabilise l'USB du Jetson avant micro-ROS/camera.
# Contexte M3 Pro : le sous-hub 1-2.3 peut tomber en autosuspend au boot
# (error -71 / Cannot enable), ce qui emporte CP2104, CH340 et Orbbec.
set -u
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

if [ -w /sys/module/usbcore/parameters/autosuspend ]; then
  echo -1 > /sys/module/usbcore/parameters/autosuspend || true
fi

for f in /sys/bus/usb/devices/*/power/control; do
  [ -w "$f" ] || continue
  echo on > "$f" 2>/dev/null || true
done

echo "usb autosuspend=$(cat /sys/module/usbcore/parameters/autosuspend 2>/dev/null || echo '?')"
