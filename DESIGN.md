# Diseño

Elección de stack y trade-offs técnicos de fleet-telemetry, en el orden de la rúbrica de la prueba (backend, web, mobile, requisitos generales).

## Elección de stack

La prueba sugería Golang/C# para backend. Elegí **TypeScript de punta a punta** (NestJS + Next.js + Expo) porque:

- Permite compartir tipos, contrato de WS y **lógica de dominio real** entre las tres apps vía `shared/` (regla no negociable del repo: dominio en `shared`, sin dependencias de runtime, con tests) — `shared/fuel.ts` (predicción de combustible), `shared/jwt.ts` (firma/verificación), `shared/mask.ts` (enmascarado) y `shared/contract.ts` (eventos/payloads de WS) son la misma función/tipo en backend, web y mobile. Con Go/C# en el backend esa lógica se hubiera tenido que reimplementar o exponer solo por API, perdiendo la garantía de "un solo cálculo".
- Un único lenguaje en las tres apps maximiza la superficie que puedo entregar con calidad en 3 días, priorizando cumplir los criterios de peso alto (calidad de código 30%, funcionalidad 25%) sobre la sugerencia de lenguaje del enunciado (que el propio enunciado marca como opcional: "puede usar otro donde sea experto").
- **Trade-off aceptado**: sin el aislamiento de proceso/memoria que dan Go o C#, el backend depende de la disciplina del propio código (tipado estricto, sin `any` sin justificar) para la seguridad que un runtime más estricto daría gratis.

| Capa    | Elegido | Alternativa considerada | Por qué |
|---------|---------|--------------------------|---------|
| Backend | NestJS 11 + Prisma 7 + PostgreSQL 17 | Go (Gin/Fiber) | Nest da DI, guards e interceptors listos para el corte transversal que pide la prueba (`RolesGuard`, `MaskingInterceptor`) sin construir ese plumbing a mano; Prisma da migraciones tipadas contra el mismo schema que ambos frontends consumen vía `shared`. |
| Web     | Next.js 16 App Router | SPA con Vite | Route Handlers de Next dan un lugar natural para el refresh token en cookie httpOnly (nunca tocado por JS de cliente) sin levantar un backend-for-frontend aparte. |
| Mobile  | Expo SDK 57 (React Native) | Nativo puro | Expo Go acelera la demo (QR, sin builds nativas) y `expo-notifications` + `expo-sqlite` cubren push y persistencia offline sin plugins nativos custom. |
| DB      | PostgreSQL 17 (vs SQLite ofrecido como alternativa) | SQLite | Un solo `TelemetryReading` por vehículo cada pocos segundos con índices compuestos (`@@index([deviceId, recordedAt(sort: Desc)])`) escala mejor a flota real en Postgres; Docker Compose lo hace igual de trivial de levantar en local. |

## Backend

### Auth JWT manual

Requisito no negociable: sin `jsonwebtoken`/`@nestjs/jwt`/passport. [`shared/jwt.ts`](shared/jwt.ts) implementa HS256 a mano sobre `node:crypto`:

- Firma: `base64url(header).base64url(payload).base64url(hmacSha256(...))`, con `iat`/`exp` inyectados por `sign()`.
- Verificación: valida forma (3 segmentos), algoritmo (rechaza `alg` distinto de `HS256` — cierra la puerta clásica de "confundir HS256 con RS256/`none`"), compara firma con `timingSafeEqual` (evita timing attack en la comparación) y solo entonces mira expiración.
- Errores tipados (`JwtMalformedError`, `JwtInvalidSignatureError`, `JwtExpiredError`, ...) en vez de un booleano — el caller decide el mapeo a HTTP.

**Refresh tokens**: rotados y de un solo uso ([`RefreshTokenService`](backend/src/auth/refresh-token.service.ts)). Cada `rotate()` emite uno nuevo y marca el viejo `revokedAt` + `replacedById`, formando una cadena. Si un token ya revocado se reintenta usar (reuse), se interpreta como robo/race y se revoca **toda la familia** (`revokeFamily`), no solo ese token — trade-off deliberado: un falso positivo (ej. una race de red del propio usuario) fuerza relogin, pero cierra la ventana de que un token robado siga vivo en paralelo al legítimo. Esto es también la razón de que el web use una cola single-flight para refresh ([`refresh-queue.ts`](web/lib/http/refresh-queue.ts)): sin ella, N requests concurrentes con 401 dispararían N refresh del mismo token y el segundo se leería como reuse.

- Web: access token en memoria (`useRef`, nunca `localStorage`) + refresh token en cookie httpOnly vía Route Handlers — inaccesible a un XSS.
- Mobile: sin cookies de navegador, así que `POST /auth/mobile/login` devuelve el refresh token en el body y el cliente lo guarda en `expo-secure-store` (keychain/keystore), no en `AsyncStorage`.

### Cálculo predictivo de combustible

Núcleo en [`shared/fuel.ts`](shared/fuel.ts), usado igual por la evaluación de alertas del backend y por el detalle de un device en los frontends:

1. **Detección de repostaje** (`detectRefuel`): un salto de litros > 5% de la capacidad del tanque entre lecturas consecutivas corta el historial — todo lo anterior al último repostaje se descarta antes de estimar consumo.
2. **Tasa de consumo** (`consumptionRatePerKm`): regresión lineal (mínimos cuadrados) de litros vs. km de odómetro sobre una **ventana móvil de 15 min** post-repostaje, no sobre todo el historial — un consumo que cambió hace una hora (tráfico vs. autopista) no debe pesar en la predicción de ahora.
3. **Autonomía** (`autonomyKm`): litros actuales / pendiente. Un vehículo detenido (pendiente ≈ 0, umbral `-0.005` L/km para absorber ruido de GPS/odómetro sin confundirlo con un auto real de bajo consumo) devuelve `null` — no autonomía infinita ni cero engañosos.
4. **Alerta** (`shouldAlert`): `WARNING` bajo 50 km, `CRITICAL` bajo 15 km, con dedupe de 10 min (`lastAlertAt`) para no re-disparar en cada lectura, y auto-cierre (`close: true`) si la autonomía vuelve a subir sobre 65 km (repostaje) — con histéresis entre el umbral de disparo (50) y el de cierre (65) para no oscilar cerca del límite.

**Trade-off documentado** (ver también `SETUP.md`): la rúbrica pide "alerta si el nivel baja a <1h de autonomía", pero el modelo primario predice en **km**, no en horas — un vehículo detenido tiene autonomía en litros pero 0 km/h, así que "horas restantes" no está bien definido sin asumir una velocidad. `estimateAvgSpeedKmh` deriva una velocidad promedio de la misma ventana para producir `predictedEmptyAt` (timestamp) como proyección secundaria, pero la fuente de verdad y el umbral de disparo son en km, no en horas.

### Tiempo real (WebSockets)

[`TelemetryGateway`](backend/src/ws/telemetry.gateway.ts) (Socket.IO): el JWT viaja en el *handshake* (`socket.handshake.auth.token`), verificado con el mismo `AccessTokenService` que HTTP — una sola fuente de verdad para "quién es este usuario". Rooms por device (`device:<id>`, suscripción explícita por el cliente) + una room `role:admin` para alertas, en vez de un broadcast global: un operator nunca recibe telemetría de vehículos que no pidió, y solo ADMIN recibe alertas. La conexión se auto-desconecta al expirar el access token (timer armado con el `exp` del claim) en vez de esperar al siguiente mensaje fallido.

Las posiciones se emiten por device a través de un *throttle coalescente* (`createCoalescingThrottle`, 1 emisión/seg máx por device) — el simulador puede generar lecturas más rápido de lo que un mapa necesita re-renderizar sin saturar el socket.

**Trade-off**: el enmascarado de `publicId` corre en `MaskingInterceptor`, que solo intercepta HTTP (`context.getType() !== 'http'` corta temprano). El gateway de WS emite payloads que ya no incluyen `publicId` (usa `deviceId` interno), así que hoy no hay fuga — pero es una responsabilidad que quedó fuera del interceptor central y hay que sostenerla a mano si un futuro evento de WS empieza a llevar `publicId`.

### Privacidad (enmascarado de IDs)

`maskDeviceId` (`shared/mask.ts`) conserva prefijo/sufijo y oculta el segmento medio (`DEV-0001-XC54` → `DEV-****-XC54`, igual al ejemplo del enunciado). Se aplica en `MaskingInterceptor`, un interceptor **global** que recorre la respuesta entera (objetos anidados, arrays) buscando cualquier campo `publicId` — decisión explícita para que un endpoint nuevo no necesite acordarse de enmascarar a mano; solo se salta si `request.user.role === 'ADMIN'`. Cumple el requisito no negociable de "enmascarado ocurre en el servidor, nunca en el cliente": el cliente jamás ve el ID real de un device si su rol no es ADMIN.

### Modelo de datos

- `@@unique([deviceId, recordedAt])` + `@@unique([deviceId, idempotencyKey])` en `TelemetryReading`: dos guardarraíles de idempotencia independientes, porque el outbox offline puede reintentar una ingesta y el reintento debe ser un no-op, no un duplicado ni un 500.
- `ackIdempotencyKey` en `Alert`: mismo patrón para el `POST /ack` — un admin reintentando su propio ack recibe 200, no un 409 de "ya reconocida por otro".
- Índices pensados para los dos accesos reales: `[deviceId, recordedAt desc]` (últimas N lecturas de un vehículo) e `[ingestedAt]` (reconciliación tras reconexión: "todo lo ingestado después de este cursor").

## Frontend web

Next.js App Router + MapLibre (no Google Maps, evita API key/billing para una demo). Alertas predictivas (`/alerts`) gateadas por rol en el propio layout/route, no solo escondiendo el link — un OPERATOR que fuerza la URL es redirigido, no ve un 403 en pantalla ni datos parciales.

Offline (`web/lib/offline/offline.ts`, `localStorage`): dos primitivas separadas, no una sola — `saveCache`/`readCache` (snapshot de último estado bueno, ej. lista de devices) y `enqueue`/`flushQueue` (acciones hechas offline, ej. un ack, para reproducir al reconectar). `flushQueue` reintenta acción por acción y deja en cola lo que falló, en vez de todo-o-nada.

## Mobile

Mismo patrón de offline que web pero sobre `expo-sqlite` en vez de `localStorage` (mismas claves/formas — mantenidas en sync a mano, no hay build step compartido entre `web/lib/offline` y `mobile/src/lib/offline`). Una única conexión SQLite compartida (`dbPromise`) en vez de abrir un handle por caller: en Android, abrir SQLite concurrentemente desde dos sitios distintos puede crashear la app.

**Trade-off aceptado**: duplicar el módulo de offline en vez de compartirlo desde `shared/` fue deliberado — `localStorage` y `expo-sqlite` tienen APIs y modelos de concurrencia distintos (sync vs. async), así que una abstracción común hubiera terminado siendo una interfaz async forzada sobre web sin necesidad real, a cambio de "un solo archivo". Se prefirió duplicación explícita y documentada sobre una abstracción prematura.

## Testing

TDD para lógica crítica, tal como pide la rúbrica y la regla del repo ("tests antes de la implementación"): `shared/fuel.ts` (consumo, autonomía, dedupe/histéresis de alertas), `shared/jwt.ts` (firma/verificación, algoritmos no soportados, expiración), `shared/mask.ts`, refresh token rotation/reuse — todo corre con Jest, cableado en `backend/jest.config.js` (`roots` incluye `../shared`) para que un solo `npm test` en `backend/` cubra dominio + integración HTTP. Mobile tiene su propio test runner (Vitest). `web/` es la brecha conocida: sin test runner propio todavía (ver `SETUP.md`).

**Build bloqueado por tests**: `npm run build` en `backend/` corre `test` primero vía `prebuild` — un build con tests rotos no debe compilar, no queda como paso manual aparte. Los `.e2e.spec.ts` levantan el `AppModule` completo contra Postgres real (sin mocks), así que necesitan `docker-compose up -d` antes; sin la DB arriba fallan por timeout en `beforeAll`, no por un bug de lógica — es la causa más común de un `prebuild` en rojo en una máquina nueva.

**Determinismo en el simulador de combustible**: el test de drenaje de tanque en `sim.service.spec.ts` (200 ticks) usaba `Math.random` real y flakeaba — el resultado final oscilaba entre ~4L y ~11L de combustible contra un umbral de `<10L`, porque el cap de `MAX_LEAD_MS` en `SimService.tickAll` hace que los primeros 2 ticks (cada uno con un solo sorteo de velocidad) carguen ~29% del combustible total quemado, sin promediarse como sí hacen los ~197 ticks chicos restantes. Fix: [`SimService.start()`](backend/src/sim/sim.service.ts) acepta un `randomSource` opcional — no en el constructor, para no romper la resolución de Nest DI (un tipo función no es un provider registrable) — que el test fija con un PRNG con seed (`mulberry32`), reproduciendo la misma dispersión estadística que `Math.random` pero bit a bit determinístico, sin tocar el default de producción.

## Limitaciones conocidas

- `web/` sin tests automatizados.
- La predicción de combustible es lineal (regresión simple); no modela pendientes de terreno, clima ni estilo de conducción — suficiente para el alcance de la prueba, no para producción.
- CORS del WS gateway abierto (`origin: '*'`) — aceptable para demo/local, a acotar por entorno antes de cualquier despliegue real.
