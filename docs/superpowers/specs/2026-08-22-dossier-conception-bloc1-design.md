# Dossier de conception B1 - cadrage de la production

## Finalité

Produire un PDF individuel, professionnel et compréhensible par un lecteur qui ne connaît ni RobLaude ni ROS 2. Le dossier doit répondre aux compétences C1.1, C1.2 et C1.3 de l'épreuve écrite HETIC sans transformer le rendu en rapport d'activité ou en documentation purement technique.

Le dossier présentera RobLaude comme une solution conçue pour améliorer l'autonomie des personnes à mobilité réduite dans les établissements recevant du public. Il distinguera explicitement :

1. la cible fonctionnelle initiale ;
2. les choix de conception et leurs justifications ;
3. les éléments réellement réalisés ou validés ;
4. les limites constatées et les améliorations possibles.

## Position éditoriale

Le texte sera rédigé à la première personne du pluriel lorsqu'il décrit le travail de l'équipe, et à la première personne du singulier uniquement lorsqu'une analyse ou une recommandation relève du dossier individuel.

Le ton restera factuel, direct et naturel. Le document évitera les formulations génériques, les superlatifs non démontrés et les longues listes de technologies. Chaque choix technique devra être relié à un besoin, une contrainte ou un arbitrage observé dans le projet.

Les niveaux de réalité seront formulés sans ambiguïté :

- "prévu" ou "conçu" pour une cible non entièrement validée ;
- "implémenté" lorsqu'un composant existe dans le dépôt ;
- "testé sur le robot réel" uniquement lorsqu'une source du projet l'atteste ;
- "axe d'amélioration" pour une évolution encore à réaliser.

## Sources de référence

Le contenu reposera en priorité sur :

- le cahier des charges `docs/CDC_Roblaude_v1.2.md` ;
- l'architecture canonique `docs/architecture.md` ;
- la spécification MQTT `docs/mqtt-spec.md` ;
- les faits robot sourcés `docs/ROBOT.md` ;
- la roadmap `docs/ROADMAP.md` ;
- les difficultés et la dette documentées ;
- le code actuel de la branche `feat/demo-soutenance` ;
- les diagrammes UML existants, après correction de leurs incohérences.

Une information contradictoire sera tranchée à partir de la source la plus récente et la plus proche du code. Une affirmation invérifiable ne sera pas présentée comme un fait.

## Structure du PDF

Le document visera 14 à 18 pages de contenu, auxquelles s'ajouteront la couverture, le sommaire et, si nécessaire, une courte annexe.

1. Page de garde
2. Résumé exécutif
3. Contexte, problématique et parties prenantes
4. Objectifs, besoins et priorités
5. Périmètre fonctionnel et cas d'utilisation
6. État de l'art et comparaison des options
7. Recommandations et choix retenus
8. Architecture logicielle et flux de communication
9. Spécifications fonctionnelles des missions
10. Réalisation et validation sur le projet
11. Contraintes, risques et limites
12. Axes d'amélioration et évolutivité
13. Conclusion
14. Sources et références

## Couverture des compétences

### C1.1 - Spécifier la demande

Le dossier présentera le contexte des ERP, les utilisateurs, les difficultés rencontrées par les personnes à mobilité réduite, les objectifs hiérarchisés, les contraintes matérielles et les retombées attendues. Les évolutions probables, notamment le multi-robot et l'adaptation à plusieurs bâtiments, seront reliées à l'architecture.

### C1.2 - État de l'art et recommandations

Les comparaisons porteront uniquement sur les décisions structurantes : application web installable ou application native, REST et WebSocket, MQTT ou communication directe avec ROS 2, ROS 2 et ses briques éprouvées ou développement robotique spécifique, traitement embarqué ou déporté. Chaque comparaison indiquera les critères, le choix retenu, ses bénéfices et ses conséquences.

### C1.3 - Architecture et spécifications

Le dossier décrira les responsabilités du frontend, du backend, de la base de données, du broker MQTT, du bridge et des nœuds ROS 2. Les contrats et flux seront cohérents avec `docs/mqtt-spec.md`. Les cas d'utilisation et états de mission emploieront une nomenclature unique dans le texte et les schémas.

## Représentations graphiques

Quatre diagrammes principaux seront produits ou corrigés :

1. diagramme de cas d'utilisation, pour les acteurs et le périmètre ;
2. diagramme de composants, pour l'architecture web, MQTT et robot ;
3. diagramme de séquence simplifié d'une mission de transport, pour le flux de bout en bout ;
4. diagramme d'états d'une mission, pour les transitions normales et les erreurs.

Un tableau de traçabilité reliera les besoins prioritaires aux composants et aux validations disponibles. Les schémas éviteront les détails de code inutiles et resteront lisibles au format A4.

## Principaux arbitrages à expliquer

- PWA React et TypeScript pour une interface accessible, installable et maintenable avec les compétences de l'équipe ;
- backend central comme autorité pour l'authentification, les missions et les données ;
- REST pour les actions ponctuelles et WebSocket pour le suivi en temps réel ;
- MQTT entre le backend et le robot afin de découpler les deux environnements et gérer les communications asynchrones ;
- ROS 2 Humble, Nav2 et SLAM Toolbox pour s'appuyer sur un écosystème robotique standard ;
- conteneurisation sur le Jetson Nano pour concilier le matériel disponible et les dépendances ROS 2 ;
- contrats de messages versionnés, QoS différenciés et séparation entre commandes, événements et états ;
- architecture en couches permettant de faire évoluer le web ou la partie robot sans réécrire l'ensemble.

## Honnêteté sur la réalisation

Le dossier ne présentera pas la saisie autonome comme totalement fiable. Il indiquera ce qui a été implémenté ou testé, les limites du bras et de la vision, ainsi que les solutions de repli étudiées.

La navigation, la cartographie, les flux LiDAR, les transformations TF et la communication avec le robot seront décrits à partir des validations documentées. Les difficultés techniques serviront à démontrer la qualité des arbitrages et les enseignements de conception, sans transformer le dossier en post-mortem.

## Direction visuelle

Le PDF adoptera une mise en page A4 sobre : fond clair, typographie lisible, titres hiérarchisés, palette limitée et contrastée, tableaux aérés et légendes systématiques. Les pages ne seront pas surchargées. Les diagrammes partageront les mêmes couleurs et la même nomenclature que le corps du document.

La couverture identifiera clairement RobLaude, le bloc B1, l'épreuve, l'auteur et l'année. Aucun élément décoratif ne devra prendre le pas sur le contenu.

## Contrôles avant livraison

- correspondance explicite avec C1.1, C1.2 et C1.3 ;
- cohérence des noms entre texte, code, MQTT et UML ;
- distinction vérifiable entre cible, réalisation et amélioration ;
- absence d'affirmation économique chiffrée sans source ;
- absence de contradiction entre les diagrammes et les spécifications ;
- relecture orthographique et suppression des formulations artificielles ;
- contrôle visuel de chaque page rendue en image ;
- vérification de la pagination, du sommaire, des légendes et de la lisibilité A4.

## Livrables

- un PDF final prêt à rendre ;
- un fichier source éditable pour permettre les corrections de dernière minute ;
- les sources des diagrammes utilisées dans le PDF.
