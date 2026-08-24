# Setup

Cuatro apps independientes, sin tooling de monorepo (sin workspaces, sin `package.json` raíz): cada una se instala y se levanta por separado, en su propia terminal.

## Requisitos previos

- Node 20+ (probado con Node 24) y npm
- Docker + Docker Compose (solo para Postgres)
- Expo Go (app móvil, iOS/Android) o un emulador Android / simulador iOS, únicamente si se va a probar `mobile/`

## 1. Infraestructura (Postgres)

Desde la raíz del repo:

```
docker-compose up -d
```

Levanta un único contenedor Postgres 17 (`fleet_telemetry` db) expuesto en el host en `localhost:5433` (mapea `5433:5432`, para no chocar con un Postgres local en el puerto por defecto).

## 2. Backend (NestJS)

```
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npm run db:seed
npm run start:dev
```

Queda en `http://localhost:3001`, con prefijo `/api/v1` (ej. `GET http://localhost:3001/api/v1/health`).

### Variables de entorno (`backend/.env`)

| Variable       | Descripción                                                              | Default (`.env.example`) |
|----------------|---------------------------------------------------------------------------|---------------------------|
| `DATABASE_URL` | Connection string de Postgres, debe apuntar al puerto de host `5433`      | `postgresql://postgres:postgres@localhost:5433/fleet_telemetry` |
| `JWT_SECRET`   | Secreto HMAC para firmar/verificar tokens a mano (`shared/jwt.ts`)        | `dev-secret-change-me`    |
| `PORT`         | Puerto HTTP del backend                                                   | `3001`                    |
| `WEB_ORIGIN`   | Origen permitido por CORS (debe matchear la URL del front web)            | `http://localhost:3000`   |

### Credenciales de demo (seed)

| Rol      | Email                | Password       |
|----------|-----------------------|-----------------|
| ADMIN    | admin@fleet.demo      | Admin123!       |
| OPERATOR | operator@fleet.demo   | Operator123!    |
| VIEWER   | viewer@fleet.demo     | Viewer123!      |

Login: `POST /api/v1/auth/login` con `{ email, password }` → devuelve `accessToken` en el body y setea `refreshToken` en cookie httpOnly. Variante para mobile (sin cookies, refresh token en el body): `POST /api/v1/auth/mobile/login`.

8 vehículos sembrados: `DEV-0001-XC54` … `DEV-0008-HS40`, con 6h de histórico y un repostaje ya incluido en cada uno.

### Simulador (demo en vivo)

Genera telemetría periódica (GPS, combustible, temperatura) para los vehículos sembrados, disparando alertas y eventos WS en tiempo real:

```
POST /api/v1/sim/start
POST /api/v1/sim/stop
POST /api/v1/sim/drain/:devicePublicId
```

Los tres requieren `Authorization: Bearer <jwt admin>`. `drain` fuerza a un vehículo a combustible bajo para disparar una alerta CRITICAL en la próxima lectura — usar el `publicId` del device (ej. `DEV-0003-LR88`), no el `id` interno.

### Tests

```
cd backend
npm test
```

Corre con Jest tanto los tests del backend (`backend/test/**`) como la lógica de dominio en `shared/**/*.test.ts` (cálculo de combustible, JWT, masking, refresh tokens, rate limiter, etc.) — ambos están cableados en `backend/jest.config.js` (`roots` incluye `../shared`). Un archivo suelto: `npx jest path/to/file.spec.ts`.

## 3. Web (Next.js)

En otra terminal:

```
cd web
cp .env.example .env.local
npm install
npm run dev
```

Queda en `http://localhost:3000`. Requiere el backend corriendo en `http://localhost:3001` (ver `web/.env.example` para las variables `NEXT_PUBLIC_BACKEND_HTTP_URL` / `NEXT_PUBLIC_BACKEND_WS_URL` / `BACKEND_HTTP_URL`).

El dashboard de alertas predictivas (`/alerts`) solo es visible para el rol ADMIN — logueado como OPERATOR o VIEWER, el link no aparece y la ruta redirige a `/`.

> Nota: `web/` no tiene aún test runner ni tests propios (a diferencia de `shared/` y `mobile/`) — ver limitaciones conocidas más abajo.

## 4. Mobile (Expo / React Native)

En otra terminal:

```
cd mobile
cp .env.example .env
npm install
npm run start
```

Abre con Expo Go (escaneando el QR) o `npm run android` / `npm run ios` para un emulador/simulador local.

En un dispositivo físico, `localhost` en `mobile/.env` apunta al propio dispositivo, no a la máquina de desarrollo: cambiar `EXPO_PUBLIC_BACKEND_HTTP_URL` / `EXPO_PUBLIC_BACKEND_WS_URL` a la IP LAN de la máquina (ej. `http://192.168.1.20:3001`).

### Tests

```
cd mobile
npm test
```

## Flujo recomendado para una demo local completa

1. `docker-compose up -d`
2. Backend: instalar, migrar, seed, `start:dev`
3. `POST /api/v1/sim/start` (con JWT admin) para generar telemetría en vivo
4. Web `npm run dev`, login como `admin@fleet.demo` → ver mapa, gráficos históricos y alertas en `/alerts`
5. (Opcional) Mobile `npm run start` contra el mismo backend

## Limitaciones conocidas / pendientes

- `DESIGN.md` está pendiente de completar (elección de stack y trade-offs).
- `web/` no tiene tests automatizados todavía; `mobile/` y `shared/` sí.
- El cálculo de autonomía usa una ventana de distancia (km) en vez de una conversión directa a horas como métrica primaria; `predictedEmptyAt` es la proyección a timestamp derivada de esa misma ventana (ver `shared/fuel.ts`).
