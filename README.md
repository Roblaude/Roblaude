# RobLaude

[![CI](https://github.com/Roblaude/Roblaude/actions/workflows/ci.yml/badge.svg)](https://github.com/Roblaude/Roblaude/actions/workflows/ci.yml)

Robot d'assistance autonome pour les personnes à mobilité réduite en ERP, pilotée par un **Yahboom ROSMASTER M3 PRO** (Jetson Nano + ROS 2 Humble).

## Structure

```
web/frontend/   — PWA React + Vite + TypeScript
web/backend/    — API Node + Express + Prisma + MySQL
robot/          — ROS2 Humble (navigation, bras, vision)
bridge/         — Bridge ROS2 ↔ MQTT
docs/           — Cahier des charges, roadmap, specs
uml/            — Diagrammes PlantUML
```
