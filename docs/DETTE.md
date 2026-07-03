# Dette technique RobLaude — à ne pas oublier

> Fichier mémo local (non commité, jamais sur `dev` ni `main`).
> Mis à jour le 2026-06-17 **après consolidation des branches** (#265/#266/#267 mergées sur `dev`).
> Règle : ne tracer ici que ce qui reste VRAIMENT ouvert. Chaque item = une action claire.

---

## 0. RÉSOLU le 2026-06-17 (ne plus en parler)

- ✅ `fix/explore-tf-drops` (fix `scan_restamper`) — **mergée #265**, plus aucun commit local-only.
- ✅ `feat/uc02-robot` (détecteur, IK, **pince `/arm_joint` id=6**, caméra DaBai, autostart) — **mergée #266**. `dev` peut maintenant être déployé sur le robot **sans régresser UC-02**.
- ✅ `feat/uc02-graspobject-color` (migration `GraspObject.color`) — **mergée #267**. La colonne a enfin sa migration Prisma (≠ `Annotation.color`).
- ✅ Branches mortes supprimées : `feat/arm-control-camera-live` (absorbée #255), `fix/web-bugs-257-258` (vide), worktrees retirés, `stash@{0}` (paho-mqtt, déjà sur `dev`) droppé.

---

## 0bis. SESSION 2026-06-19 (investigations + doc)

- ✅ **Doc consolidée** : `docs/architecture.md` créé = **source canonique unique**. `AGENTS.md` + `CODEX_BRIEFING.md` fusionnés dedans (réduits à des pointeurs). Fin de la divergence « 4 docs mémoire ».
- ✅ **Capteurs sains [PROUVÉ]** : sous mouvement réel, chaîne LiDAR (`/scan0,1`/`/scan_multi`/`/scan_fixed` ~7 Hz) + `/odom` tiennent, 0 trou, 0 « queue full ». Le « gel SLAM / scan silent » des sessions passées = **contact USB LiDAR intermittent, réglé par recâblage**. Plus un bug logiciel.
- ✅ **Bras** : bus servo recâblé → le bras bouge (HOME + mono-servo). STM32 exécute bien (buzzer/LEDs répondent). « Ne tient pas la pose » = batterie/couple ou contact marginal **[DÉDUIT, à reconfirmer batterie chargée]**.
- ✅ **Règle rigueur** ajoutée au `CLAUDE.md` global (standard 1+1=2, étiqueter PROUVÉ/DÉDUIT/SUPPOSÉ, isoler la variable avant d'agir, anti-tunnel).

### Objectif produit visé : SCAN auto → repérer objet (QR) → grasp → retour base
- **80 % existe déjà** (rapport d'exploration 2026-06-19) : détection 3D, IK bras, séquence saisie/dépôt, navigation pickup→destination, points en DB (`Point`/`GraspObject`), contrat MQTT. Le « retour base » = un `toPoint` fixe.
- **Manque** : (a) **détecteur QR** dans `object_detector.py` (aucun code QR/ArUco aujourd'hui), (b) vérif identité `objectId` vs ID lu du QR, (c) état **SCAN/recherche** (le robot ne sait pas encore *chercher* un objet de position inconnue), (d) point **base** dédié. Conception en cours.

### ⏳ PAS FAIT au 2026-06-19 (à faire — ordre = spec UC03 §7)
- [ ] **Fix `mqtt_bridge` CPU** : seulement diagnostiqué, **pas appliqué** (slam /tf 50→20 Hz + lookup TF 5 Hz). Prérequis dur pour l'automap+caméra.
- [ ] **Vérif `/tf`** (injection 50/20 Hz → mesure CPU) : **interrompue**, à reprendre pour prouver la magnitude.
- [ ] **UC-03 (QR → fetch → base)** : **spec écrite** (`docs/UC03_SCAN_FETCH_QR.md`), **0 ligne de code**. Étape 1 = détecteur QR (hors-ligne).
- [ ] **Bras « ne tient pas la pose »** : à reconfirmer **batterie chargée** (couple/contact).
- [ ] **Automap bout-en-bout** : pas validé (Nav2 timeout sous charge tant que le cœur n'est pas libéré).

---

## 1. Dette working tree `dev` (local, hors PR)

- **Suppressions non commitées** : `robot/scripts/start_all.sh`, `robot/scripts/start_robot.sh` (« redondants », `CODEX_BRIEFING.md` §10).
  → Trancher dans une branche `chore/scripts-cleanup` : committer la suppression ou `git checkout --` pour annuler.
- **Nouveaux docs à committer** : `docs/architecture.md` (**NOUVEAU**, source canonique), `AGENTS.md` + `CODEX_BRIEFING.md` (réduits à des pointeurs), `.codex/`, `AUDIT_REPORT.md`, `docs/CHECKPOINT.md`, `docs/DETTE.md`, `docs/ROBOT.md`.
  → Décider : committer (doc projet) ou `.gitignore`. **Ne pas mettre sur `main`.**
- **Branches distantes hors périmètre à auditer** (non touchées) : `origin/docs/technique`, `origin/fix/position-ws-broadcast`, `origin/test/frontend-coverage`, `origin/test/wcag-audit`.

---

## 2. Dette hardware / robot

### ✅ RÉSOLU — bras : `/arm6_joints` fonctionne (testé 2026-06-17, câble STM32 neuf)
Les deux canaux actionnent le bras. **Canal retenu = `/arm6_joints` (batch, méthode A)** — il fait exactement la pose voulue, c'est celui qu'utilise déjà `mission_executor._send_arm` (`mission_executor.py:413`) + le bridge → **rien à corriger pour UC-02**. (`/arm_joint` single-servo marche aussi, mais on standardise sur `/arm6_joints`.)
- **Faux négatif du matin expliqué** : le test `/arm6_joints` sans mouvement venait du **câble USB STM32 en train de lâcher** (coupure totale ensuite). Quand le STM32 est sain, `/arm6_joints` marche.
- **Leçon** : bras/batterie/moteurs muets → vérifier D'ABORD le lien STM32 (`lsusb 10c4:ea60`, `/dev/myserial`, `/battery`). Cf `docs/ROBOT.md` §6bis.

### Reste
- **Batterie / chargeur** : ✅ **12.2 V au 2026-06-17** (a enfin chargé) → mouvement débloqué. Garder l'œil (règle « ≥12 V » = convention `AGENTS.md:122`, pas de garde-fou code).
- **`/cmd_vel`** : ✅ **sain** (vérifié 2026-06-17 : 0 message au repos ; `mqtt_bridge` = téléop/deadman, `mission_executor` = emergency only). Pas de fix nécessaire.
- **Pince `/arm_joint` id=6** : ✅ **validée en réel** (open/close) → anomalie #1 levée.
- **Calibration bras 3D (mirror #264)** : conversion `rad=(deg-90)·π/180` uniforme (`web/frontend/src/lib/armUrdf.ts`), à recaler par joint contre le bras physique. Pince non mappée dans le 3D (URDF 2 doigts rlink/llink).
- **Mode mapping léger** : ✅ validé en session 2026-06-17. Carte `roblaude_map` sauvée sur robot + Mac (`312 x 261`, `0.05 m/px`, origine `[-8.21, -8.72]`, soit ~15.6 x 13 m). À industrialiser (mode `mapping` vs `full` dans l'autostart).
- **Nav2 sans `explore_lite`** : ✅ lancé en mode SLAM live, sans goal mouvement. Nodes `controller_server`, `planner_server`, `bt_navigator`, `behavior_server`, `smoother`, `velocity_smoother`, `lifecycle_manager` OK ; costmaps global/local OK ; `/navigate_to_pose` disponible. Le Nano tient ce mode sans `explore_lite`.
- **Autonav réelle** : premier retour A a échoué en session 2026-06-17. Cause observée : drops TF/scan dans les costmaps + `GridBased failed to create plan with tolerance 0.50`. Fix préparé côté repo : `robot/roblaude_nav/launch/nav2_slam_roblaude.launch.py` génère des params Nav2 adaptés (`global_costmap` sans obstacle live, `local_costmap` sur `/scan_fixed`, vitesses basses, tolerance planner 1.0). À tester batterie rechargée.

---

## 3. Dette logicielle connue (à revérifier sur `dev` actuel)

- **`mqtt_bridge` >100 % CPU — CAUSE TROUVÉE 2026-06-19 [PROUVÉ]** : ce n'est **PAS** le broker absent (broker connecté = TCP ESTABLISHED). Le CPU est **piloté par les messages** (0 % topics silencieux ↔ ~120 % topics actifs), brûlé dans l'exécuteur rclpy (`wait_for_ready_callbacks`), pas paho/DDS. ~17 souscriptions sur un `SingleThreadedExecutor` inondées en automap (slam publie `/tf` à 50 Hz). Détail complet + chaîne de preuves : `docs/architecture.md` §9.3.
  - **VÉRIF préalable [EN COURS]** : injection `/tf` synthétique à 50/20 Hz → mesure CPU `mqtt_bridge`, pour passer la magnitude de DÉDUITE à PROUVÉE (test interrompu, à reprendre).
  - **FIX à appliquer (après vérif)** : (1) slam `transform_publish_period` 0.02→0.05 (50→20 Hz). (2) `mqtt_bridge` : remplacer la souscription `/tf` brute par un **lookup TF périodique à 5 Hz** (préserve la pose web sans inonder l'exécuteur). Re-mesurer le CPU pendant l'automap pour valider. `robot_state_publisher` ~49 % = même famille, secondaire.
- **`Infinity` dans le JSON du scan** (`telemetry/scan`) — sanitiser `inf`→`null` (probablement `ranges` LaserScan).
- **#257 — `/mapping` écran noir sans WebGL** : error-boundary OK dans un vrai navigateur, à durcir pour la démo (machine sans GPU).

---

## 4. Docs & tickets

- **Docs périmées** : `STATUS.md`/journaux décrivaient Sprint 3-4 alors que le code est à Sprint 7 (`AUDIT_REPORT.md` §6). `STATUS.md` mis à jour le 2026-06-17.
- **Tickets GitHub** : 116 fermés / 72 ouverts. Ouverts surtout Sprint 8 (16, hardware), Sprint 9 (15, soutenance), Sprint 6 (14), Sprint 7 (13). Beaucoup non clôturables sans présentiel robot.

---

## 5. [MANQUANT] — à fournir par Wissem (cf `docs/ROBOT.md`)

- **Hostname** robot dans le repo (observé `jetson-desktop`, non sourcé).
- **Seuil batterie de blocage réel** voulu (aucun garde-fou code aujourd'hui).
- **Carte seed de navigation** versionnée (`web/backend/maps/` = `.gitkeep` seul).
- *(Résolu)* ~~Canal pince~~ → `/arm_joint` id=6, désormais sur `dev` (#266).

---

## Ordre de traitement suggéré

1. **Jour robot (batterie OK)** : lancer `slam.launch.py`, puis `nav2_slam_roblaude.launch.py`, tester un goal très court en zone blanche, puis seulement ensuite un point `Accueil`/`Bureau`.
2. **Branche `chore/git-cleanup`** : trancher untracked + scripts supprimés (§1). Jamais sur `main`.
3. **Audit séparé** des 4 branches remote hors périmètre (§1).
4. **Soutenance (Sprint 9)** : slides, script démo, secours vidéo.
