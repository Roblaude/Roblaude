# Runbook démo — soutenance

> Rodé à la maison les 3-4 juillet. Ordre strict, chaque étape a son check.
> Règle d'or : **une fois le robot posé, on ne touche plus au châssis** (connecteur
> USB interne fragile — c'est le câble sous la clé wifi, rebranché le 4/07, scotché).

## La veille

- [ ] Charge complète (viser ≥ 12,4 V au repos, jamais démarrer une mission < 12 V)
- [ ] `git pull` sur dev + `deploy_to_robot.sh` si le code robot a changé
- [ ] Pré-provisionner le wifi école + hotspot sur le Jetson :
      `sudo nmcli dev wifi connect <SSID> password <pass>` (à faire tant qu'on a encore un accès)
- [ ] Vérifier le scotch du câble USB interne

## Sur place — réseau (~10 min)

1. Mac + robot sur le même wifi (hotspot téléphone en plan B — le wifi école bloque souvent le peer-to-peer)
2. Trouver l'IP du robot : elle s'affiche sur son écran, sinon `arp -a | grep 50:3d:d1`
   (attention : le scan de `find_robot.sh` est cassé sur macOS, `export ROBOT_IP=<ip>` à la main)
3. Mettre à jour l'IP du broker sur le robot (l'IP du Mac a changé !) :
   `ssh jetson@$ROBOT_IP 'echo <IP_DU_MAC> | sudo tee /etc/roblaude/broker_ip' && ssh jetson@$ROBOT_IP 'docker restart m3pro'`
4. Backend : vérifier `ROBOT_1_SSH_HOST` dans `web/backend/.env`

## Sur place — stack web (~5 min)

```bash
docker compose up -d                  # mosquitto + mysql
cd web/backend && npm run dev         # backend :3001
cd web/frontend && npm run dev        # dashboard :5173
```
Login : admin@roblaude.fr / changeme. Page Réparation → tout doit être vert.

## Robot (~5 min)

1. Poser le robot à son point de départ (marquer au scotch !), orienté vers la zone démo. **Ne plus le toucher.**
2. Allumer. Le boot fait tout : préflight (gate USB), agent micro-ROS, container (base + MQTT + mission_executor + mapping_supervisor).
3. Check : page Réparation toute verte + batterie. En SSH si besoin : `cat /run/roblaude-demo-preflight.status` → `GO`.

## Cartographie de la salle (~10 min)

1. Dashboard → wizard Mapping → étape 1 verte → lancer.
2. Le robot explore seul (rotation 360° puis frontières). **Couper à 5-8 min max** (le
   CPU sature si on laisse tourner) — la zone de démo suffit, pas besoin de toute la salle.
3. Stop → Sauvegarder. Pas besoin de l'étape localisation : la nav de démo tourne sur SLAM live.

## Mission démo

1. Remettre le robot sur sa marque **en douceur** (base tenue à deux mains, pas par le dessus).
2. Relancer la nav (origine carte = marque) :
   `ssh jetson@$ROBOT_IP '/home/jetson/roblaude_ws/scripts/start_nav.sh --reset'` → « pret pour une mission »
3. Perception : bouton « Démarrer caméra + détecteur » page Réparation (ou `start_perception.sh`)
4. Poser l'objet ROUGE à ~1,9 m devant la marque, décalé selon le point en base
   (`Point` slug `stockage` = où le robot s'arrête, 30 cm AVANT l'objet ; slug `base` = retour).
   Adapter les coords à la salle via la page Admin points AVANT la mission.
5. Dashboard → carte « Démo 1 clic ». Suivi live sur la page mission. STOP en haut de la sidebar.

## Ce qui peut foirer (vécu)

| Symptôme | Cause | Fix |
|---|---|---|
| Préflight NO_GO usb-missing | connecteur USB interne | resserrer LE câble (sous la clé wifi), reboot |
| Tout passe « unknown » en pleine mission | CPU saturé | attendre 30 s ; ne jamais lancer explore + mission en même temps |
| Robot dévie, se croit ailleurs | batterie < 12 V | recharger, point final |
| `nav-server-unavailable` | Nav2 pas lancé | `start_nav.sh` |
| Détection timeout au point objet | objet hors champ caméra (fixe, ~20-80 cm devant, au sol) | vérifier position objet vs point d'arrêt, resserrer la tolérance déjà fait (0,15 m) |
| Robot « kidnappé » (déplacé à la main) | SLAM perdu | `start_nav.sh --reset` robot remis sur la marque |
| Agent micro-ROS mort après manipulation | USB a bronché | `sudo systemctl restart micro-ros-agent`, sinon `roblaude-stm32-usb-recover.sh` |

## Plan B assumé

Simulation (mission simulée au niveau MQTT, dashboard identique) + vidéos du robot réel
(mapping autonome, nav validée, bras/pince) + explication du diagnostic USB au jury.
