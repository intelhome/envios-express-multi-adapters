# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install --force   # dependencies mix Baileys forks; plain install often needs --force
npm start              # run with node
npm run dev             # run with nodemon (auto-restart)
```

There is no real test suite (`npm test` is a placeholder that exits 1) and no lint script wired up despite `eslint` being a dependency.

Server listens on `PORT` from `.env` (default 4010; README mentions 8000 but code default is 4010).

Docker: `docker-compose up` builds from the root `Dockerfile` and exposes port 4010.

## Architecture

Express + Socket.IO backend that sends/receives WhatsApp messages through a **swappable provider adapter**, backed by MongoDB (Mongoose for user data, native driver for Baileys auth-state collections).

### Provider abstraction (the core design)

`src/lib/shared/infrastructure/config/dependencies.js` is the composition root. It reads `WHATSAPP_PROVIDER` from `.env` (`whatsapp-web` or `baileys`) and builds a single shared `whatsappProvider` instance via a factory (`createWhatsAppProvider`). Everything else in the app — use cases, controllers, socket handlers — depends on this one instance and is provider-agnostic.

- `src/lib/messaging/infrastructure/adapters/whatsapp-web/WhatsAppWebAdapter.js` — wraps `whatsapp-web.js` (Puppeteer-driven). Auth via `LocalAuth` on disk (`./.wwebjs_auth`).
- `src/lib/messaging/infrastructure/adapters/baileys/BaileysAdapter.js` — wraps `@whiskeysockets/baileys` (or the `@fizzxydev/baileys-pro` fork). Auth state is persisted in MongoDB per-session via `src/lib/authentication/infrastructure/adapters/baileys-auth/mongoAuthState.js` (custom Baileys `AuthState` implementation, collection named `session_auth_info_<sessionId>`), not `useMultiFileAuthState`.
- Each adapter pairs with a domain message service (`MessageServiceWhatsAppWeb` / `MessageServiceBaileys`) that formats outgoing/incoming messages for that library.
- Both adapters keep an in-memory `this.sessions[sessionId]` map holding socket/client handles, connection `status` (`qr_code`, `connecting`, `ready`/`CONNECTED`, etc.), and QR data — this state is NOT persisted and is rebuilt from Mongo (`sessionRepository`/`userRepository`) on connect/reconnect.
- Adding a new provider (Venom, Twilio — stubs are commented out in `dependencies.js`) means: implement an adapter with the same interface (`connect`, `disconnect`, `getServiceSession`, send methods), register it in the `providers` map, and wire a matching message service.

### Layering (light DDD/hexagonal)

Each bounded context under `src/lib/` (`messaging`, `authentication`, `shared`, `api`) follows `domain/` → `application/use-cases/` → `infrastructure/` (adapters, repositories, persistence schemas, config). Controllers live under `src/lib/api/controllers/` and are wired to use cases in `registerXModule.js` files (`registerUserModule`, `registerMessageModule`, `registerSessionModule`), each mounting its own router under `app.use(...)` in `src/server.js`. There is no DI container — modules import the shared singletons from `dependencies.js` directly and `new` up their use cases inline.

### Startup sequence (`src/server.js`)

1. Connect to MongoDB (`infrastructure/database/connection.js`).
2. Set up Express + Socket.IO, register socket handlers (`whatsappSocketHandler.js`) which are also handed `whatsappProvider`/repositories.
3. Mount `/scan` (QR page), then the three module routers (`/api/users`, `/api/messages`, `/api/sessions` — see each `registerXModule.js` for exact base paths).
4. `InitializeSessionsUseCase` reconnects all previously known sessions from Mongo (gated by `RESTORE_SESSIONS_ON_START_UP` in `.env`).
5. Graceful shutdown on SIGTERM/SIGINT disconnects the active provider and closes DB connections. `unhandledRejection`/`uncaughtException` handlers deliberately swallow known-noisy Puppeteer/EBUSY errors from `whatsapp-web.js` and log everything else.

### Sessions vs. users

A "session" = one WhatsApp connection identified by `id_externo` (external id), stored via `SessionRepository`/`UserRepository` (Mongoose, `UserSchema.js`). Most REST endpoints take `:id_externo` in the path (see `validateIdExterno` middleware) rather than a Mongo `_id`.

### Real-time updates

`SocketService` (singleton wrapping the `socket.io` server instance) pushes QR codes and connection-state changes to clients; adapters call `SocketService.emitQR(...)` etc. directly rather than going through an event bus.

### Webhooks

`src/lib/shared/domain/services/WebhookService.js` is injected into the message services to forward inbound WhatsApp events to an external URL — check `.env` for the configured webhook target when debugging message delivery.

## Environment

Configured via `.env` (see `.env.example`-style comments in the file for the full list): `PORT`, `RESTORE_SESSIONS_ON_START_UP`, `APP_URL`, `LOG_LEVEL`, `MONGODB_URL`, `MONGO_DB_NAME`, `COLLECTION_SESSIONS_NAME`, `WHATSAPP_PROVIDER`.

Note: on first run, delete any pre-existing `session_auth_info` folder/state if switching providers — stale auth data from one provider is not compatible with another.
