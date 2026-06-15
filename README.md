# RobLaude

[![CI](https://github.com/Roblaude/Roblaude/actions/workflows/ci.yml/badge.svg)](https://github.com/Roblaude/Roblaude/actions/workflows/ci.yml)

Robot d'assistance autonome pour les personnes à mobilité réduite en ERP, piloté par un **Yahboom ROSMASTER M3 PRO** (Jetson Nano + ROS 2 Humble).

## Structure

```
web/frontend/   — PWA React + Vite + TypeScript
web/backend/    — API Node + Express + Prisma + MySQL
robot/          — ROS2 Humble (navigation, bras, vision)
bridge/         — Bridge ROS2 ↔ MQTT
docs/           — Cahier des charges, roadmap, specs
uml/            — Diagrammes PlantUML
```

## Stack

- **Frontend** — React + Vite + TypeScript (PWA), Zustand, Tailwind, Playwright.
- **Backend** — Node + Express + TypeScript, Prisma + MySQL, WebSocket, client MQTT.
- **Robot** — ROS 2 Humble : navigation (Nav2 + SLAM), contrôle du bras ; vision OpenCV et MoveIt2 prévus (Sprint 6).
- **Communication** — REST + WebSocket (front ↔ back), MQTT/Mosquitto (back ↔ robot).

## Démarrage rapide

Prérequis : Node 22, Docker, npm.

Le broker MQTT exige une authentification (`allow_anonymous false`) : créer
d'abord `infra/mosquitto/passwd` — voir [infra/mosquitto/README.md](infra/mosquitto/README.md).

```bash
# 1. Infra (MySQL + broker Mosquitto)
docker compose up -d

# 2. Backend
cd web/backend
cp .env.example .env            # JWT_SECRET (openssl rand -base64 32) + MQTT_USERNAME / MQTT_PASSWORD
npm install
npx prisma migrate deploy       # crée le schéma
npx ts-node prisma/seed.ts      # données de démo + admin (admin@roblaude.fr / changeme)
npm run dev                     # http://localhost:3001

# 3. Frontend (autre terminal)
cd web/frontend
npm install
npm run dev                     # http://localhost:5173
```

## Tests

```bash
# Backend (vitest + MySQL) — seuil coverage lignes 70%
cd web/backend && npm test && npm run test:coverage

# Frontend (vitest jsdom) — seuil coverage lignes 60%
cd web/frontend && npm test && npm run test:coverage

# E2E (Playwright, desktop + mobile)
cd web/frontend && npm run test:e2e
```

## Documentation

- [Cahier des charges](docs/CDC_Roblaude_v1.2.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture](docs/architecture.md)
- [API REST + WebSocket](docs/API.md)
- [Spécification MQTT](docs/mqtt-spec.md)
- Diagrammes UML : `uml/`
