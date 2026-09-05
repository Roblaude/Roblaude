# Matrice factuelle - dossier B1 RobLaude

| Sujet | Affirmation retenue | Niveau | Source principale | Usage dans le dossier |
|---|---|---|---|---|
| Besoin | RobLaude vise à réduire la dépendance à un tiers pour le transport de documents ou d'objets dans un ERP. | Besoin formulé | `docs/CDC_Roblaude_v1.2.md`, section 1 | Problématique et enjeux |
| Utilisateurs | La cible principale est la personne à mobilité réduite ; le personnel d'accueil et l'administrateur sont des acteurs secondaires. | Besoin formulé | `docs/CDC_Roblaude_v1.2.md`, sections 1.3 et 4.1 | Parties prenantes |
| Périmètre | Le projet prévoit le transport de documents, la récupération d'un objet, le suivi temps réel et l'arrêt d'urgence. | Conception | `docs/CDC_Roblaude_v1.2.md`, section 4 | Besoins et cas d'utilisation |
| Architecture | Le frontend ne communique jamais directement avec ROS 2 ; le backend reste l'autorité métier et MQTT assure le découplage avec le robot. | Conception et implémentation | `docs/mqtt-spec.md`, sections 1 à 3 ; code `web/` et `robot/roblaude_mqtt/` | Architecture de composants |
| Frontend | L'interface est une PWA React, Vite et TypeScript conçue pour mobile, tablette et desktop. | Implémentation | `web/frontend/package.json`, `docs/CDC_Roblaude_v1.2.md`, section 5 | Choix PWA et accessibilité |
| Backend | Le serveur utilise Express, Prisma et MySQL pour les utilisateurs, missions, robots, points et objets. | Implémentation | `web/backend/package.json`, `web/backend/prisma/schema.prisma` | Responsabilités backend et données |
| Temps réel web | REST sert aux actions métier et un canal WebSocket transmet les changements de position et de statut. | Conception et implémentation | `docs/architecture.md`, code backend/frontend | Arbitrage REST/WebSocket |
| MQTT | Le contrat sépare commandes, télémétrie et cycle de mission sous `roblaude/{robotId}/...`. | Spécification validée et implémentation | `docs/mqtt-spec.md`, `robot/roblaude_mqtt/roblaude_mqtt/mqtt_bridge.py` | Contrat de communication |
| MQTT | Les niveaux de QoS et le retained dépendent de la nature du message ; les commandes ne sont pas retained. | Spécification validée | `docs/mqtt-spec.md`, section 6 | Fiabilité et conséquences des choix |
| Robot | Le robot réel est un Yahboom ROSMASTER M3 PRO avec Jetson Nano, STM32, deux LiDAR, une caméra Orbbec DaBai DCW2 et un bras 6 DOF. | Fait stable | `docs/architecture.md`, section 1 | Contraintes matérielles |
| Conteneurs | ROS 2 Humble et le workspace RobLaude sont exécutés dans des conteneurs Docker sur le Jetson Nano. | Implémentation | `docs/architecture.md`, sections 1 et 3 ; scripts robot | Arbitrage de compatibilité |
| ROS 2 | La partie robot est organisée en nœuds spécialisés communiquant par topics et actions. | Implémentation | packages `robot/roblaude_nav` et `robot/roblaude_mqtt` | État de l'art et architecture robot |
| Navigation | Nav2 reçoit des objectifs `NavigateToPose` depuis `mission_executor`. | Implémentation | `robot/roblaude_nav/roblaude_nav/mission_executor.py` | Séquence de mission |
| Cartographie | SLAM Toolbox construit la carte à partir des scans LiDAR et des transformations TF. | Implémentation et validation documentée | `robot/roblaude_nav/launch/slam.launch.py`, `docs/architecture.md` | Choix du SLAM |
| LiDAR | Les scans fusionnés sont republiés sur `/scan_fixed` après correction temporelle avant leur consommation par le SLAM et Nav2. | Implémentation et validation terrain documentée | `scan_restamper.py`, `slam.launch.py`, `test_nav2_overrides.py`, `docs/architecture.md` | Exemple de contrainte réelle |
| Navigation réelle | La chaîne LiDAR, odométrie et exploration a été observée comme fonctionnelle sur le robot réel dans un état propre. | Test terrain documenté | `docs/architecture.md`, sections 9.2 et 9.3 | Réalisation et validation |
| Carte réelle | Une carte de l'environnement a été sauvegardée après une session de cartographie sur le robot. | Test terrain documenté | `docs/ROBOT.md`, section 7 | Réalisation et validation |
| Bras | Les canaux `/arm6_joints` et `/arm_joint` actionnent le bras et la pince après résolution d'un problème de câblage. | Test terrain documenté | `docs/ROBOT.md`, section 6 bis ; `docs/architecture.md`, section 9.1 | Réalisation et limites |
| Saisie autonome | La saisie autonome fiable d'objets n'est pas considérée comme totalement validée. | Limite | `docs/CDC_Roblaude_v1.2.md`, `docs/architecture.md`, `docs/DIFFICULTES_ROBOT.md` | Honnêteté sur le périmètre |
| Performance | Les quatre cœurs et les 4 Go de RAM du Jetson Nano structurent les arbitrages de fréquence, de caméra et de services actifs. | Contrainte mesurée/documentée | `docs/architecture.md`, sections 1, 8 et 9 | Coût, performance et pérennité |
| Sécurité | L'arrêt d'urgence est prévu depuis l'interface et relayé vers le robot ; la sécurité physique reste dépendante de validations complémentaires. | Implémentation partielle et axe d'amélioration | `docs/mqtt-spec.md`, code web/robot, `docs/DETTE.md` | Spécification et limites |
| Évolutivité | Le préfixe MQTT par `robotId`, la séparation des couches et les entités de données permettent une extension multi-robot. | Capacité d'architecture | `docs/mqtt-spec.md`, `schema.prisma` | Évolutivité |

## Contradictions neutralisées

- Le matériel caméra retenu est l'Orbbec DaBai DCW2. Les anciennes mentions RealSense dans les UML v1.1 ne sont pas reprises.
- La nomenclature MQTT de référence est `roblaude/{robotId}/...`. Les anciens topics `robot/...` des premiers diagrammes sont remplacés.
- La saisie d'objet est décrite comme une cible partiellement implémentée et encore limitée, jamais comme une capacité industrielle fiable.
- Les chiffres économiques non sourcés sont exclus. Les retombées sont formulées comme bénéfices attendus, pas comme retour sur investissement démontré.
- Le terme "validé" est réservé à une observation documentée ou à un test existant ; la simple présence de code est qualifiée d'"implémentée".
