# Cahier des Charges — RobLaude v1.2

## Informations générales

| Élément | Détail |
|---------|--------|
| Nom du projet | RobLaude — Robot d'Assistance Autonome |
| Type | Projet académique HETIC — Web3 / Robotique |
| Équipe | Wissem + Maxime (2 personnes) |
| Durée | 18 semaines — 17 février → 26 juin 2026 |
| Version CdC | v1.2 |
| Date | 19 février 2026 |

---

## 1. Contexte et vision du projet

### 1.1 Problématique

Dans les Établissements Recevant du Public (ERP — mairies, hôpitaux, administrations), les personnes à mobilité réduite sont souvent dépendantes d'un tiers pour récupérer ou se faire livrer des documents et objets à travers les couloirs du bâtiment. C'est un problème d'autonomie concret qui touche beaucoup d'usagers au quotidien.

### 1.2 Solution proposée

RobLaude est un robot d'assistance autonome capable de se déplacer dans un bâtiment pour :

- Transporter un document d'un point A vers un point B à la demande d'un utilisateur
- Récupérer un objet grâce à un bras robotique et le livrer à un point donné

L'utilisateur pilote le tout depuis une interface web accessible, pensée pour les personnes en situation de handicap.

### 1.3 Cible utilisateur

- **Utilisateur principal** : personne à mobilité réduite dans un ERP
- **Utilisateur secondaire** : agent d'accueil, personnel administratif
- **Administrateur** : personnel technique qui configure le système

### 1.4 Contraintes de départ

Il y a plusieurs choses qu'on ne sait pas encore à ce stade et qu'il faut garder en tête en lisant ce document :

- **Le hardware est arrivé (mars 2026) : Yahboom ROSMASTER M3 PRO.** On ne connaît pas encore toutes les limites réelles du robot, de son bras, de son LiDAR, mais on peut maintenant les mesurer pendant les sprints. Tout ce qui touche au robot dans ce CDC est basé sur la documentation du ROSMASTER M3 PRO (modèle Jetson Nano) et est validé au fur et à mesure.
- **On débute en ROS2.** Les choix techniques côté robot (topics, nœuds, architecture) seront affinés au fur et à mesure de notre apprentissage. Ce CDC décrit les fonctionnalités visées, pas l'implémentation robot finale.
- **La saisie d'objet est le point le plus incertain.** On ne sait pas encore si le bras 6 DOF du ROSMASTER M3 PRO sera capable de saisir des objets de manière fiable. C'est un risque identifié et on a prévu des fallbacks.

Ce CDC décrit donc ce qu'on veut construire et les grandes lignes de comment on compte s'y prendre. Les détails d'implémentation seront documentés au fil des sprints dans la documentation technique.

---

## 2. Architecture globale

### 2.1 Principe — 3 couches découplées

Le système est découpé en trois parties indépendantes :

```
┌──────────────────────────────────────────────┐
│  Interface Web (PWA)                         │
│  Ce que l'utilisateur voit et utilise        │
├──────────────────────────────────────────────┤
│  Serveur Backend                             │
│  Logique métier, base de données             │
│  Fait le pont entre le web et le robot       │
├──────────────────────────────────────────────┤
│  Robot                                       │
│  Navigation, bras, caméra                    │
│  Fonctionne d'abord en simulation            │
└──────────────────────────────────────────────┘
```

L'interface web communique avec le serveur. Le serveur communique avec le robot. Le robot ne parle jamais directement au frontend. Ce découplage est essentiel pour une équipe de 2 : chacun peut bosser sur sa partie sans bloquer l'autre.

### 2.2 Communication entre les couches

| Liaison | Protocole envisagé | Justification |
|---------|-------------------|---------------|
| Frontend ↔ Backend | REST + WebSocket | REST pour les opérations classiques, WebSocket pour le suivi temps réel (position robot, changement de statut) |
| Backend ↔ Robot | MQTT | Protocole léger et standard en IoT/robotique, communication par topics, adapté aux contraintes réseau d'un robot |
| Robot interne | ROS2 | Standard de facto en robotique, fait communiquer les différents composants du robot entre eux |

Le choix de MQTT entre le backend et le robot est basé sur la documentation et les pratiques courantes en robotique. L'architecture exacte des topics et messages sera définie quand on aura une meilleure maîtrise de ROS2, probablement au Sprint 3-4.

---

## 3. Stack technique

### 3.1 Frontend

On part sur React avec TypeScript et Vite. C'est notre zone de confort et ça nous permet d'avancer vite sur la partie web. L'interface sera une PWA (Progressive Web App) pour être installable sur téléphone. Zustand pour la gestion d'état, React Router pour le routage.

### 3.2 Backend

Node.js avec Express en TypeScript, Prisma comme ORM avec MySQL. On connaît bien cette stack, pas de risque de ce côté. Zod pour la validation des entrées, JWT pour l'authentification.

### 3.3 Robot

C'est la partie où on a le moins d'expérience. Le plan :

- **OS** : Ubuntu 22.04 (requis par ROS2 Humble)
- **Framework** : ROS2 Humble
- **Navigation** : Nav2 + SLAM Toolbox — c'est le standard ROS2, bien documenté
- **Bras** : MoveIt2 — standard ROS2 pour la manipulation
- **Vision** : OpenCV — pour la détection d'objets via la caméra
- **Simulation** : Gazebo — pour tout développer avant d'avoir le hardware

Ces choix sont basés sur la documentation officielle et les tutoriels ROS2. On s'attend à devoir ajuster beaucoup de choses une fois qu'on aura les mains dedans.

### 3.4 Hardware cible

Robot : **Yahboom ROSMASTER M3 PRO** (version Jetson Nano). Caractéristiques :

- **Calculateur** : NVIDIA Jetson Nano B01 (4 Go RAM, ARM64, JetPack 4.6 / Ubuntu 18.04 d'origine — cible ROS 2 Humble via conteneurs Docker `dustynv/ros:humble`)
- **Châssis** : 4 roues mecanum (déplacement omnidirectionnel)
- **LiDAR** : YDLidar 2D (portée ~8 m, 360°)
- **Caméra** : Orbbec DaBai DCW2 RGB-D (couleur via UVC, profondeur via OrbbecSDK)
- **Bras** : 6 DOF avec gripper (modèle PRO MAX)
- **Contrôleur bas niveau** : carte STM32 pilotée via UART par la lib Python officielle Yahboom `Rosmaster_Lib`
- **Commande** : manette 2.4 GHz avec dongle USB (fournie)
- **Connectivité** : WiFi 2.4/5 GHz, SSH, ROS 2 DDS sur le LAN
- **Alimentation** : batterie Li-Ion intégrée (autonomie ~2 h)

L'architecture reste pensée pour que le développement en simulation Gazebo et le hardware réel partagent un maximum de code. Les premiers tests hardware démarrent au Sprint 1 (mars 2026).

### 3.5 Tests

| Outil | Usage |
|-------|-------|
| Vitest | Tests unitaires JS/TS (frontend + backend) |
| Playwright | Tests E2E + audits accessibilité |
| pytest | Tests des composants ROS2 |
| Gazebo | Simulation robot complète |

### 3.6 Outils

GitHub (repo + issues + PR + CI), Docker Compose (MySQL + broker MQTT en local), Gazebo (simulation).

---

## 4. Fonctionnalités visées

### 4.1 Acteurs

| Acteur | Rôle |
|--------|------|
| Utilisateur | Demande un transport ou une récupération d'objet |
| Admin | Configure les points et objets, a aussi les droits Utilisateur |
| Robot | Exécute les missions (physique ou simulé) |

### 4.2 Liste des fonctionnalités

| # | Fonctionnalité | Acteur | Priorité |
|---|---------------|--------|----------|
| UC-01 | Demander un transport de document | Utilisateur | Haute |
| UC-02 | Demander la récupération d'un objet (bras) | Utilisateur | Haute |
| UC-03 | Suivre une mission en temps réel | Utilisateur | Haute |
| UC-04 | Arrêt d'urgence | Utilisateur | Critique |
| UC-05 | Configurer les points du bâtiment | Admin | Moyenne |
| UC-06 | Configurer les objets saisissables | Admin | Moyenne |
| UC-07 | Consulter l'historique des missions | Admin | Basse |

### 4.3 Relations

UC-01 et UC-02 incluent automatiquement UC-03 (le suivi se lance à chaque mission). UC-06 est un prérequis de UC-02 (il faut que les objets soient configurés avant de pouvoir les demander). UC-04 est déclenchable à tout moment pendant UC-01 et UC-02.

### 4.4 UC-01 — Transport de document

L'utilisateur demande au robot de transporter un document d'un point A à un point B.

**Pré-conditions** : points configurés, robot disponible, réseau actif.

**Scénario** :

1. L'utilisateur ouvre l'interface et crée une mission de transport
2. Il choisit le point de départ et d'arrivée
3. Le robot se rend au point de collecte
4. L'utilisateur est notifié de l'arrivée et pose le document
5. Il confirme que c'est fait
6. Le robot se rend à la destination
7. L'utilisateur est notifié de la livraison

**Ce qui peut mal tourner** : robot indisponible, obstacle infranchissable (timeout), arrêt d'urgence en cours de route.

### 4.5 UC-02 — Récupération d'objet

L'utilisateur demande au robot d'aller chercher un objet pré-enregistré.

**Pré-conditions** : objet configuré dans le système, bras fonctionnel, caméra active.

**Scénario** :

1. L'utilisateur choisit un objet et un point de livraison
2. Le robot navigue vers l'emplacement de l'objet
3. Il détecte l'objet avec sa caméra
4. Il tente de le saisir avec son bras
5. Il transporte l'objet et le dépose à destination

**Ce qui peut mal tourner** : objet non détecté, saisie qui échoue (on prévoit plusieurs tentatives), objet qui tombe pendant le transport, arrêt d'urgence.

Note : c'est la fonctionnalité la plus risquée du projet. Le nombre exact de tentatives, la stratégie de saisie, et les limites du bras seront déterminés pendant les sprints 6-7 quand on aura testé MoveIt2.

### 4.6 UC-04 — Arrêt d'urgence

Le robot doit pouvoir être arrêté immédiatement en cas de danger. L'arrêt doit être déclenchable depuis l'interface (bouton visible en permanence) et par raccourci clavier. On vise un temps de réaction le plus court possible.

Après un arrêt, l'utilisateur peut reprendre la mission ou l'annuler.

Le mécanisme technique exact (niveau de garantie du message, priorité de traitement) sera défini au Sprint 4 quand on implémentera la communication MQTT.

---

## 5. Interface web

### 5.1 PWA

L'interface est une Progressive Web App : installable sur téléphone, chargement rapide grâce au cache, plein écran sans barre d'adresse, pas besoin de passer par un store. C'est important pour notre cible PMR qui utilise principalement un smartphone.

Le mode offline n'a pas de sens ici : on ne contrôle pas un robot sans réseau. Le Service Worker sert uniquement à accélérer le chargement et à rendre l'app installable.

### 5.2 Responsive design

L'interface doit fonctionner sur mobile, tablette et desktop. Sur mobile, la navigation se fait via une barre en bas de l'écran. Sur desktop, via une sidebar. Le bouton d'arrêt d'urgence est toujours visible quel que soit l'écran, avec une taille tactile d'au moins 48x48px.

### 5.3 Accessibilité (WCAG AA)

Notre cible principale étant les PMR, l'accessibilité est une priorité :

- Navigation complète au clavier (tab, focus visible, skip-to-content)
- Contraste suffisant (ratio ≥ 4.5:1 pour le texte)
- Zones tactiles assez grandes sur mobile (≥ 48px)
- Labels ARIA sur tous les éléments interactifs
- Bouton d'arrêt d'urgence accessible (visible + raccourci clavier)

On valide tout ça avec des audits automatisés (axe-core via Playwright) et des tests manuels.

---

## 6. Cycle de vie d'une mission

### 6.1 Principes

Une mission passe par plusieurs états entre sa création et sa fin. Les grands principes :

- Une mission commence en attente, puis passe "en cours" quand le robot est assigné
- Pendant qu'elle est en cours, elle peut être mise en pause (arrêt d'urgence), terminée avec succès, ou échouer
- Depuis la pause, on peut reprendre ou annuler
- Certains échecs sont récupérables (la saisie a échoué mais le robot fonctionne), d'autres non (obstacle critique)
- On peut annuler à tout moment

### 6.2 États envisagés

Pour le transport (UC-01) : en attente → navigation vers collecte → attente chargement → navigation vers destination → terminée.

Pour la récupération d'objet (UC-02) : en attente → navigation vers l'objet → détection → saisie → transport → dépôt → terminée.

États transversaux : en pause (arrêt d'urgence), échouée, annulée.

La liste exacte des états et leurs noms techniques seront définis au moment de l'implémentation du modèle de données (Sprint 2) et affinés quand on codera la communication avec le robot (Sprint 4).

---

## 7. Modèle de données

Le système repose sur 5 entités principales :

**Utilisateur** — Email, mot de passe (hashé), nom, rôle (utilisateur ou admin). Peut créer des missions.

**Mission** — Type (transport ou récupération d'objet), statut, point de départ, point d'arrivée, robot assigné, objet à récupérer (le cas échéant), timestamps, raison d'échec éventuelle.

**Point** — Un emplacement dans le bâtiment. Nom, identifiant unique, coordonnées, description.

**Robot** — Statut (disponible, occupé, hors ligne, en erreur), position, niveau de batterie.

**Objet** — Un objet que le robot peut aller chercher. Nom, emplacement, image, disponibilité.

Les relations : un utilisateur crée des missions, une mission relie deux points, une mission est assignée à un robot, une mission de récupération est liée à un objet.

Le schéma technique (ORM, migrations, types exacts) sera défini au Sprint 1-2 dans la documentation technique.

---

## 8. Risques identifiés

| # | Risque | Probabilité | Impact | Ce qu'on fait |
|---|--------|------------|--------|---------------|
| R1 | Hardware en retard ou défectueux | Haute | Moyen | On développe tout en simulation Gazebo d'abord |
| R2 | MoveIt2 trop complexe pour nous | Haute | Élevé | On prévoit des poses de saisie simplifiées en plan B, et un buffer de temps au Sprint 6 |
| R3 | La détection d'objet ne marche pas bien | Moyenne | Élevé | On commence avec un objet très simple (cube rouge), QR codes en plan B |
| R4 | Le gripper ne saisit pas correctement | Moyenne | Élevé | Plusieurs tentatives, objets plus gros si besoin, on adaptera au Sprint 7 |
| R5 | Nav2 difficile à configurer | Moyenne | Moyen | On part des exemples officiels, buffer de temps au Sprint 3 |
| R6 | Problèmes de communication réseau | Basse | Moyen | Tout en local via Docker pour le développement |


---

## 9. Livrables

| # | Livrable | Format |
|---|----------|--------|
| L1 | Code source complet | Repo GitHub |
| L2 | Interface web fonctionnelle (PWA) | Déployé ou démo locale |
| L3 | Robot fonctionnel en simulation | Démo live ou vidéo |
| L4 | Robot fonctionnel IRL (si hardware reçu) | Démo live |
| L5 | Documentation technique | Dans le repo |
| L6 | Diagrammes UML | Dans /docs |
| L7 | Slides de soutenance | ~20 slides |
| L8 | Vidéo démo de secours | MP4 3-5 min |
| L9 | Retrospective projet | Document |

---

## 10. Décisions techniques

| Décision | Choix | Pourquoi |
|----------|-------|----------|
| ORM | Prisma | Type-safe, migrations auto, on connaît |
| State management | Zustand | Léger, simple, suffisant |
| Tests unitaires | Vitest | Natif Vite, rapide |
| Tests E2E | Playwright | E2E + accessibilité |
| Navigation robot | Nav2 + SLAM Toolbox | Standard ROS2 |
| Bras robotique | MoveIt2 | Standard ROS2 |
| Vision | OpenCV | Mature, bien documenté |
| Communication robot | MQTT | Léger, adapté IoT |
| PWA | vite-plugin-pwa | Intégration native Vite |
| Auth | JWT | Simple, stateless |

---

