# RobLaude — Mémoire agents

> **Ce fichier a été fusionné dans la source canonique unique : [`docs/architecture.md`](docs/architecture.md).**
> Lis-la **en entier avant d'agir** — elle contient tout (matériel, réseau, contrôle robot, MQTT,
> archi web + robot, pièges appris à la dure, causes racines connues avec niveau de preuve).

## Rappels top-priorité (le détail est dans `docs/architecture.md`)

- **Langue** : toujours répondre **en français**.
- **Git** : jamais `git commit` / `gh pr create` direct → toujours le skill `/commit`. 1 ticket = 1 branche = 1 PR, partir de `dev`, jamais merge direct (hook `git-guard`).
- **Commits/commentaires** : 1 ligne, style humain. Mots IA bannis (implement, enhance, ensure, robust, comprehensive, « This commit… »…).
- **Rigueur** (cf. CLAUDE.md global) : standard « 1+1=2 » — vérifier avant d'affirmer, étiqueter PROUVÉ/DÉDUIT/SUPPOSÉ, isoler la variable avant d'agir, anti-tunnel.
- **Robot** : `ROS_DOMAIN_ID=30` + `FASTDDS_BUILTIN_TRANSPORTS=UDPv4` obligatoires ; CPU Jetson Nano = la contrainte n°1 ; `YB_Node` crashe sous pub en boucle (→ reboot) ; ne rien bouger sans accord.

→ **Tout le reste : [`docs/architecture.md`](docs/architecture.md).**
