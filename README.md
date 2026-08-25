# Fleet Telemetry

Sistema de monitoreo IoT para flotas vehiculares: posición GPS, combustible y temperatura en tiempo real, con acceso basado en rol (admin/operator/viewer) y soporte offline en web y mobile.

Prueba técnica Full Stack — Desarrollador II, Simon Movilidad.

## Stack

| Capa    | Tecnología |
|---------|------------|
| Backend | NestJS 11 (REST + WebSocket gateway), Prisma 7 + PostgreSQL 17 |
| Web     | Next.js 16 (App Router), MapLibre GL JS 6 |
| Mobile  | Expo SDK 57 / React Native (expo-router) |
| Shared  | TypeScript plano sin build (`shared/`), consumido por las tres apps |
| Tests   | Jest (backend + shared), Vitest (mobile) |

Detalle de elección de stack y trade-offs: [DESIGN.md](DESIGN.md).

## Estructura

Cuatro apps independientes, sin tooling de monorepo (sin workspaces, sin `package.json` raíz) — cada una se instala y corre por separado:

```
backend/   API REST + WS gateway, Prisma/Postgres, simulador de telemetría
web/       Dashboard Next.js (mapa, gráficos, alertas)
mobile/    App Expo — mismo dashboard adaptado a mobile
shared/    Tipos, contrato de WS y lógica de dominio (fuel, jwt, masking) compartidos
simulator/ Vacío — el simulador real vive en backend/src/sim/
```

## Funcionalidades

- **Auth JWT manual**: firma/verificación HS256 a mano con `node:crypto`, sin librerías JWT (`backend/src/auth/access-token.service.ts`). Refresh tokens rotados y de un solo uso.
- **Roles**: `ADMIN` / `OPERATOR` / `VIEWER`, gateados por `JwtAuthGuard` + `RolesGuard`.
- **Ingesta de sensores**: ubicación GPS, combustible, temperatura, persistidos en Postgres vía Prisma.
- **Alertas predictivas de combustible**: proyección a `<1h` de autonomía (`shared/fuel.ts`), visibles solo para ADMIN en `/alerts`.
- **Tiempo real**: `TelemetryGateway` (Socket.IO) emite `position`/`alert` por rooms de dispositivo y una room admin; contrato de eventos único en `shared/contract.ts`.
- **Privacidad**: IDs de dispositivo enmascarados en servidor (`MaskingInterceptor` sobre HTTP) para cualquier rol distinto de ADMIN — nunca en el cliente.
- **Offline**: caché de último estado conocido + cola de acciones (`enqueue`/`flushQueue`) — `localStorage` en web, `expo-sqlite` en mobile, mismo contrato de claves en ambos.
- **Mobile**: réplica del dashboard, notificaciones push de alertas, sincronización offline.
- **Simulador**: genera telemetría periódica sobre los vehículos sembrados para demo en vivo (`backend/src/sim/`).

## Quick start

```
docker-compose up -d          # Postgres

cd backend && cp .env.example .env && npm install
npx prisma migrate deploy && npm run db:seed && npm run start:dev   # http://localhost:3001

cd web && cp .env.example .env.local && npm install && npm run dev  # http://localhost:3000

cd mobile && cp .env.example .env && npm install && npm run start   # Expo (opcional)
```

Credenciales de demo, variables de entorno, comandos de test y flujo de demo completo: [SETUP.md](SETUP.md).

## Tests

```
cd backend && npm test   # backend + shared/**/*.test.ts (fuel, jwt, masking, refresh tokens, rate limiter)
cd mobile  && npm test
```

`web/` no tiene tests automatizados todavía (ver limitaciones en [SETUP.md](SETUP.md)).

## Documentación

- [DESIGN.md](DESIGN.md) — elección de stack y trade-offs técnicos.
- [SETUP.md](SETUP.md) — guía de despliegue local, variables de entorno, credenciales de seed, flujo de demo.
- [CLAUDE.md](CLAUDE.md) — guía de arquitectura para agentes/contribuidores.

## Links
- Video sustentación: https://youtu.be/dA8WE-6ETjA
