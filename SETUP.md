# Setup

```
docker-compose up -d
cp backend/.env.example backend/.env
cd backend
npm install
npx prisma migrate deploy
npm run db:seed
npm run start:dev
```

Backend queda en `http://localhost:3001`, con prefijo `/api/v1` (ej. `GET http://localhost:3001/api/v1/health`).

## Credenciales de demo (seed)

| Rol      | Email                | Password       |
|----------|-----------------------|-----------------|
| ADMIN    | admin@fleet.demo      | Admin123!       |
| OPERATOR | operator@fleet.demo   | Operator123!    |
| VIEWER   | viewer@fleet.demo     | Viewer123!      |

El endpoint de login todavía no existe (bloque siguiente). Para probar rutas `@Roles('ADMIN')` mientras tanto, firmar un JWT a mano con `shared/jwt.ts` (`sign({ sub, role: 'ADMIN' }, JWT_SECRET, ttlSec)`).

## Simulador (demo en vivo)

```
POST /api/v1/sim/start
POST /api/v1/sim/stop
POST /api/v1/sim/drain/:devicePublicId
```

Los tres requieren `Authorization: Bearer <jwt admin>`. `drain` fuerza a un vehículo a combustible bajo para disparar una alerta CRITICAL en la próxima lectura — usar el `publicId` del device (ej. `DEV-0003-LR88`), no el `id` interno.

8 vehículos sembrados: `DEV-0001-XC54` … `DEV-0008-HS40`, con 6h de histórico y un repostaje ya incluido en cada uno.
