# Les difficultés rencontrées avec le robot RobLaude — et comment on les a résolues

> Robot : Yahboom ROSMASTER M3 PRO sur Jetson Nano (ROS 2 Humble).
> Document pensé pour être lu à voix haute en soutenance : chaque problème =
> **ce qu'on voyait → la vraie cause → ce qu'on a fait**.

---

## Vue d'ensemble : par où passe l'information

```
   [ Front React ]  --REST/WebSocket-->  [ Backend Node ]  --MQTT-->  [ Robot ]
        PWA                                  Express/Prisma            Jetson Nano
                                                  |                       |
                                                  |  SSH (admin)          | micro-ROS (série)
                                                  +---------------------> [ STM32 ]
                                                                          base : moteurs,
                                                                          batterie, bras
```

Trois canaux, trois familles de pannes :
1. **Front ↔ Back** : REST + WebSocket (temps réel).
2. **Back ↔ Robot** : MQTT (commandes + télémétrie) + SSH (admin/diag).
3. **Jetson ↔ STM32** : micro-ROS sur un câble série USB. **C'est ici qu'on a eu
   le plus de mal.**

---

## A — Liaison Jetson ↔ STM32 (le gros morceau)

### A1. Le STM32 "ne répondait plus" — bras/batterie/moteurs muets

**Ce qu'on voyait :** l'agent micro-ROS démarrait (`running... fd: 3`) puis plus
rien. Pas de `YB_Node`, `/battery` muet, `/cmd_vel` sans abonné. Le bras ne
bougeait pas, la batterie ne remontait pas.

**Fausse piste :** "c'est le câble / le hub / l'alim". On a même remplacé le câble.
Le problème revenait.

**La vraie cause :** il y a **DEUX** adaptateurs USB-série sur le robot, et on
pointait sur le mauvais.

```
            /dev/ttyUSB0   ──►  CP2104  (10c4:ea60)  = STM32  ✅ le bon
   Jetson
            /dev/ttyUSB1   ──►  CH340   (1a86)        = micro  ❌ pas le STM32

   L'agent micro-ROS ouvrait le CH340 (le micro) au lieu du CP2104 (le STM32).
   -> port valide, mais personne ne parle micro-ROS au bout -> aucune session.
```

En plus, l'ordre `ttyUSB0/ttyUSB1` **change à chaque démarrage**, donc viser un
numéro fixe était condamné à échouer un jour sur deux.

**Comment on a résolu :**
- Un script qui lie `/dev/myserial` à la **puce** du STM32 (CP210x), jamais au
  numéro `ttyUSB`, jamais au CH340.
- L'agent micro-ROS lancé en **service systemd** (redémarre tout seul).
- **Preuve** : en pointant sur le CP2104, session établie immédiatement +
  `YB_Node` présent + `/battery` à 10,5 V. Le STM32 était sain depuis le début.

### A2. On rediagnostiquait la même panne à chaque fois

**Ce qu'on voyait :** à chaque incident, on repartait de zéro (SSH, dmesg, etc.).

**La cause :** rien ne surveillait la *vraie* santé (juste "le process tourne"),
et aucune trace n'était gardée.

**Comment on a résolu :** un **healthcheck** (toutes les 2 min) qui vérifie
`YB_Node` + `/battery`, **capture le diagnostic** dans `/var/log/roblaude/` à
chaque incident, puis **répare tout seul** (relink + restart). Testé en cassant
le lien volontairement : détecté → réparé en quelques secondes.

### A3. Débit série à 2 Mbaud sur puce CH340 = fragile (note)

Le débit micro-ROS est figé à **2 000 000 baud**. Sur une puce CH340 c'est la
limite haute (peu de marge → trames corrompues). Sur le CP2104 (le vrai STM32)
c'est fiable. Conclusion : **garder le STM32 sur le CP2104**, ne jamais essayer
de faire parler micro-ROS au CH340.

---

## B — Démarrage & persistance du robot

### B1. L'IP du robot change tout le temps (DHCP)

**Problème :** le réseau de l'école donne une IP différente à chaque fois → on ne
savait plus où joindre le robot.

**Solution :** `find_robot.sh` scanne le réseau et retrouve le robot par son
**adresse MAC** (fixe), pas par IP.

### B2. Le Jetson perd l'heure à chaque extinction

**Problème :** le Jetson Nano n'a **pas d'horloge interne (RTC)**. Au rallumage,
date fausse → SLAM rejette les scans (timestamps incohérents), certificats/logs
faux.

**Solution :** `fake-hwclock` (mémorise la dernière heure) + `sync_time.sh` qui
repousse l'heure depuis le Mac à chaque session. NTP est bloqué par le réseau
école, d'où le palliatif.

### B3. L'autostart d'origine était fragile

**Problème :** au boot, un terminal graphique lançait un script qui supposait que
`/dev/myserial` existait déjà — souvent faux → "Serial port not found".

**Solution :** remplacé par un **service systemd** propre qui attend le bon
device, crée le lien, lance l'agent et le relance s'il tombe.

### B4. SSH qui coupe juste après le démarrage

**Ce qu'on voyait :** `kex_exchange_identification: Connection reset` quelques
minutes après le reboot.

**La cause :** le Jetson **sature au boot** (Docker + containers ROS + agent qui
démarrent tous en même temps sur 4 Go de RAM) → SSH refuse temporairement.

**Solution / contournement :** attendre ~90 s que le boot se calme ; éviter de
tout lancer en même temps. (Piste d'amélioration : étaler les démarrages.)

---

## C — Capteurs & navigation

### C1. SLAM qui décroche : "queue full"

**Ce qu'on voyait :** le SLAM laissait tomber des scans ("message filter
drops"), pas de carte.

**La cause :** les timestamps du LiDAR/odométrie venaient du STM32 (horloge non
synchro) → SLAM les jugeait "trop vieux" et les jetait.

**Solution :** un node `scan_restamper` re-tamponne `/scan` et `/odom` à
`maintenant - 0,2 s` → les scans repassent le filtre temporel. Fin des drops.

### C2. Navigation autonome qui s'annule (ABORTED)

**Ce qu'on voyait :** premier objectif accepté puis `ABORTED`, avec
`GridBased failed to create plan` et des drops de costmap.

**La cause :** la config Nav2 par défaut était trop stricte pour notre carte/Nano
(obstacles live bruités, tolérance planner trop faible).

**Solution (préparée) :** un launch Nav2 sur-mesure
(`nav2_slam_roblaude.launch.py`) : costmap allégée, scan fixe, vitesses réduites,
tolérance planner augmentée. À valider sur un objectif court.

### C3. `explore_lite` trop lourd pour le Nano

**Constat :** le Jetson Nano tient `SLAM + Nav2`, mais l'exploration autonome
(`explore_lite`) le met à genoux.

**Solution :** cartographie en **mode léger** (base + SLAM + téléop clavier +
sauvegarde de carte), exploration auto mise de côté.

### C4. Le LiDAR sort 2 demi-scans

**Détail matériel :** le M3 PRO publie `/scan0` + `/scan1` (deux moitiés) qu'il
faut fusionner en `/scan`. Géré par le merger laser.

---

## D — Bras & pince

### D1. Le bras n'a aucun retour de position (open-loop)

**Problème :** `/joint_states` publie `0.0` partout — impossible de lire la vraie
position du bras (pas de capteur de retour).

**Conséquence + solution :** côté front, le bras 3D est en **"mode miroir"** : il
rejoue la dernière commande envoyée (on affiche ce qu'on a demandé, pas une
mesure réelle). Honnête et suffisant pour la démo.

### D2. La convention de la pince était inversée

**Problème :** la doc du prof disait l'inverse de la réalité → la pince
s'ouvrait/fermait au mauvais moment.

**Solution :** convention vérifiée physiquement et figée :
`pince = servo id 6`, **0 = fermé, 180 = ouvert**. Espaces YAML obligatoires
(`{id: 6, joint: 180}`), sinon la commande est ignorée en silence.

### D3. `YB_Node` plante sous rafales de commandes

**Problème :** envoyer beaucoup de `ros2 topic pub` d'affilée fait crasher le
driver (`YB_Node`), qui pilote les servos ET publie la batterie → tout devient
muet.

**Solution / règle :** commandes en `--once`, jamais en boucle ; rebooter avant
une session de test bras. (C'est ce crash qui faisait passer des commandes
correctes pour des "échecs".)

---

## E — Énergie

### E1. Batterie faible = comportements bizarres

**Règle apprise :** sous ~12 V, les moteurs/servos deviennent capricieux. On vise
**≥ 12 V avant tout mouvement**. (Ce n'est pas un blocage logiciel, c'est une
règle humaine — la batterie était à 10,5 V en fin de session.)

---

## F — Web (front/back) côté robot

### F1. Deux émetteurs sur `/cmd_vel`

**Problème :** `mission_executor` ET `mqtt_bridge` publient tous les deux sur
`/cmd_vel` → conflit possible au repos (téléop vs arrêt d'urgence).

**État :** identifié, à nettoyer (un seul propriétaire de `/cmd_vel`).

### F2. Écran `/mapping` noir sans WebGL

**Problème :** la carte plantait dans un navigateur headless sans WebGL (vu en CI
E2E).

**Solution :** error-boundary qui affiche un message au lieu d'un écran noir ; OK
dans un vrai navigateur.

---

## Les 3 leçons à retenir (pour la soutenance)

1. **Ne jamais accuser le matériel sans preuve.** La plus grosse panne (le STM32)
   n'était PAS un câble — c'était un mauvais port série. On l'a prouvé en
   pointant sur le bon device : ça a marché immédiatement.
2. **Identifier par la nature, pas par le numéro.** `ttyUSB0/1` change au boot →
   on cible la *puce* (CP2104). Pareil pour l'IP → on cible la *MAC*.
3. **Rendre le système auto-diagnostiquant.** Un healthcheck qui capture le diag
   et répare tout seul = on ne perd plus une heure à rechercher la même panne.
```

---

## Annexe — où c'est dans le code

| Sujet | Fichier |
|---|---|
| Lien série STM32 | `robot/scripts/roblaude-link-stm32.sh` |
| Service agent micro-ROS | `robot/scripts/systemd/micro-ros-agent.service` |
| Healthcheck + capture diag | `robot/scripts/roblaude-stm32-healthcheck.sh` |
| Recherche robot par MAC | `robot/scripts/find_robot.sh` |
| Sync horloge | `robot/scripts/sync_time.sh` |
| Re-stamp SLAM | `robot/roblaude_nav/roblaude_nav/scan_restamper.py` |
| Nav2 sur-mesure | `robot/roblaude_nav/launch/nav2_slam_roblaude.launch.py` |
| Bridge MQTT | `robot/roblaude_mqtt/roblaude_mqtt/mqtt_bridge.py` |
