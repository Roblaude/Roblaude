# UC-03 — Explore → Découvrir (QR) → Fetch sur clic → Retour base

> **Conception** (spec). Date : 2026-06-19. Source de vérité archi : `docs/architecture.md`.
> Étiquettes : **[EXISTE]** déjà codé · **[NOUVEAU]** à créer · **[ÉTEND]** modifier l'existant.
> Objectif produit (mots du codeur) : « le robot explore tout seul, repère les QR sur la
> carte, me la ramène ; je clique sur un QR (ou un point) → il y va, attrape, revient base. »

---

## 1. Vue d'ensemble — 2 phases

### Phase A — Exploration + cartographie des QR (autonome)
Le robot explore une zone inconnue, construit la carte SLAM, et **pendant ce temps** détecte les
QR codes : pour chaque QR vu, il lit son ID, calcule sa position **dans le repère `map`**, et
mémorise `(qrId, x_map, y_map)`. La liste des objets découverts remonte au web → la carte affiche
un marqueur par QR.

### Phase B — Fetch sur clic (déclenché par l'utilisateur)
Sur la carte web, l'utilisateur **clique un marqueur QR** (objet connu, coords + ID) **ou un point
libre** (coords seules) → bouton **Fetch**. Le robot navigue vers la cible, **active la caméra à fond**,
**reconnaît/confirme le QR** (vérifie l'ID), **attrape** l'objet, puis **revient au Point « base »**.

> **Modèle caméra (refinement codeur 2026-06-19) — c'est le levier CPU :**
> - **Pendant l'explore** : caméra à **bas débit** (2-3 Hz), juste repérer/marquer les objets sur la carte. Léger.
> - **Au point de fetch (sur clic)** : caméra **activée à fond** pour reconnaître précisément + saisir.
> → On **n'allume jamais** explore + SLAM + caméra-pleine-cadence + QR en même temps. Ça résout la tension §6.

```
PHASE A (auto):   explore_lite + SLAM ──┐
                  caméra + QR detector ──┴─► (qrId, x_map, y_map) ──MQTT──► backend ──► carte web (marqueurs)

PHASE B (clic):   clic marqueur/point ──► backend cmd/mission ──► robot:
                  NAV(coords) ─► CONFIRM_QR ─► GRASP ─► NAV(base) ─► done
```

---

## 2. Ce qui EXISTE déjà (rapport d'exploration 2026-06-19)

- **[EXISTE]** Détection 3D objet (HSV+depth) : `object_detector.py` → `/roblaude/detections` (PoseArray), pipeline `sample_depth_median` + `backproject` (`detection.py`).
- **[EXISTE]** IK bras `arm_kin.py` (`compute_ik`, `rad_to_servo`), séquence saisie + dépôt (`mission_executor.py`).
- **[EXISTE]** Navigation Nav2 `/navigate_to_pose`, machine à états PICK_AND_PLACE.
- **[EXISTE]** TF `camera → base_link → map` (donc on peut placer une détection dans `map`).
- **[EXISTE]** DB : `Point{x,y,theta,slug}`, `GraspObject{color,locationId}`, `Mission{fromPoint,toPoint,objectId}`.
- **[EXISTE]** Contrat MQTT mission complet (`docs/mqtt-spec.md`).
- **[EXISTE]** Carte live web (`/map` via `mqtt_bridge` → wsTf/telemetry).
- **[EXISTE]** Explore_lite + SLAM (la stack automap, en cours d'optimisation CPU).

## 3. Ce qui MANQUE (à construire)

| # | Pièce | Couche | Type |
|---|-------|--------|------|
| 1 | **Détecteur QR** (`cv2.QRCodeDetector`) : détecte + décode l'ID, calcule la pos 3D (réutilise le depth→3D existant), publie avec l'ID. HSV gardé en fallback. | robot | NOUVEAU |
| 2 | **qr_mapper** : transforme chaque détection QR `camera → map` (TF), **déduplique** par ID, tient la liste `(qrId, x_map, y_map, seenAt)`, la publie en MQTT (retained). | robot | NOUVEAU |
| 3 | **Mission FETCH** : NAV(coords) → **CONFIRM_QR** (revérifie l'ID sur place) → GRASP → NAV(**base**) → done. Réutilise PICK_AND_PLACE + ajoute confirm QR + retour base. | robot | ÉTEND |
| 4 | **Point « base »** (slug `base`) en DB + un défaut si absent. | DB/config | NOUVEAU |
| 5 | **Backend** : sub MQTT `telemetry/discovered_objects` → upsert DB ; modèle `DiscoveredObject{qrId,x,y,seenAt,...}` ; REST `GET /discovered` + `POST /missions/fetch`. | backend | NOUVEAU |
| 6 | **Frontend** : marqueurs QR sur la carte + clic marqueur/point → bouton **Fetch** → POST. | frontend | NOUVEAU |

---

## 4. Détail technique des pièces robot

### 4.1 Détecteur QR (`object_detector.py` [ÉTEND])
- `cv2.QRCodeDetector().detectAndDecodeMulti(rgb)` → pour chaque QR : 4 coins + texte décodé (= l'ID objet, ex. `"obj-42"`).
- Centre QR (moyenne des coins) → `sample_depth_median` + `backproject` (pipeline existant) → `(x,y,z)` repère caméra.
- **Sortie** : nouveau topic `/roblaude/qr_detections` (String JSON) = `[{ "qr": "obj-42", "x":…, "y":…, "z":… }, …]` (PoseArray ne porte pas de texte → topic parallèle).
- Pas de dépendance nouvelle : `cv2.QRCodeDetector` est dans `opencv-python` (déjà utilisé). **[À VÉRIFIER]** version OpenCV du container (multi-QR ≥ 4.5.1 ; sinon `detectAndDecode` simple).
- HSV reste actif → fallback si QR illisible.

### 4.2 qr_mapper (logique de cartographie [NOUVEAU])
- Souscrit `/roblaude/qr_detections`, lookup TF `camera → map`, transforme chaque point en `map`.
- **Dédup** par `qr` (même ID revu → met à jour la position moyenne, pas un doublon). Garde le meilleur (depth valide, proche).
- Publie `roblaude/{id}/telemetry/discovered_objects` (retained) = `[{ "qr", "x_map", "y_map", "seenAt" }, …]`.
- Peut vivre dans `mission_executor` ou un petit node dédié (décider à l'implémentation — un node dédié est plus propre et coupable indépendamment côté CPU).

### 4.3 Mission FETCH (`mission_executor.py` [ÉTEND])
États : `NAVIGATING_TO_OBJECT` → `CONFIRMING_QR` (revérifie l'ID lu == cible, sinon `failed:qr-mismatch`) → `GRASPING` (existant) → `RETURNING_TO_BASE` (nav vers Point `base`) → `completed`.
- `fromPoint` = coords du QR cliqué (ou point libre). `toPoint` = Point `base`.
- Reasons d'échec : `qr-not-found`, `qr-mismatch`, `grasp-failed`, `nav-status-*`.

---

## 5. Ajouts contrat MQTT

- **`telemetry/discovered_objects`** (Robot→Back, retained) : `[{ qr, x_map, y_map, seenAt }]`.
- **`cmd/mission`** : ajouter `type: "FETCH"`, `qrId` (optionnel, pour CONFIRM_QR).
- **`mission/status`** : nouveaux états `NAVIGATING_TO_OBJECT`, `CONFIRMING_QR`, `RETURNING_TO_BASE`.
- **`mission/result`** : reasons `qr-not-found`, `qr-mismatch`.

(Détailler dans `docs/mqtt-spec.md` à l'implémentation.)

---

## 6. ⚠️ Contrainte CPU (prouvée 2026-06-19) — prérequis dur

Phase A = explore_lite + SLAM + caméra + QR + mqtt **en même temps** = le cas le **plus lourd** pour le Nano (4 cœurs faibles). On a **prouvé** que :
- l'automap seul met déjà le Nano sous tension ;
- `mqtt_bridge` brûle ~1 cœur (cause `docs/architecture.md` §9.3).

**Donc, prérequis avant la Phase A :**
1. **Appliquer le fix `mqtt_bridge`** (slam /tf 50→20 Hz + lookup TF 5 Hz) → libère ~1 cœur. (cf. `DETTE.md` §3)
2. **Throttler la détection QR** (ex. 2-3 Hz, pas la pleine cadence caméra).
3. Tester **incrémentalement** : explore seul OK ? + caméra ? + QR ? — mesurer le load à chaque ajout, ne pas tout allumer d'un coup.

Si le Nano ne tient pas explore+caméra ensemble malgré le fix → repli : **mapper d'abord (sans caméra), puis une passe de recherche** (caméra+QR) sur la carte figée. À décider par la mesure, pas par supposition.

---

## 7. Ordre de construction (incrémental, chaque étape testable)

0. **[PRÉREQUIS]** Fix `mqtt_bridge` CPU + vérif `/tf` (cf. `DETTE.md`).
1. **Détecteur QR** (robot) — testable hors-ligne avec une image de QR (unit test). Détecte+décode+3D, publie `/roblaude/qr_detections`. HSV gardé.
2. **qr_mapper** — détection→`map`, dédup, publie `discovered_objects`. Test : poser un QR, vérifier la coord `map` stable.
3. **Backend** — modèle `DiscoveredObject` + sub MQTT + REST (`GET /discovered`, `POST /missions/fetch`).
4. **Frontend** — marqueurs QR sur la carte + clic → Fetch.
5. **Mission FETCH** (robot) — NAV→CONFIRM_QR→GRASP→retour base.
6. **Intégration E2E** — explore → découvre → clic fetch → grasp → retour base.

---

## 8. Décisions ouvertes (à trancher en avançant)

- **Contenu du QR** : ID brut (`"obj-42"`) ou un payload structuré ? → MVP : ID brut = `GraspObject.id` ou un slug.
- **qr_mapper** : node dédié vs dans `mission_executor` ? → penché node dédié (isolable CPU).
- **Repli carte-figée** si CPU insuffisant (cf. §6) → décidé par mesure.
- **Clic point libre** (sans QR) : on envoie le robot aux coords sans CONFIRM_QR (juste go-to / fetch best-effort) ? → à confirmer avec le codeur.
