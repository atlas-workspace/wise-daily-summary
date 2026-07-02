# WISE Dashboard Template

A full-stack Node.js + TypeScript template server with IAM login, WMS and YMS connectivity health checks, and a background WebSocket bridge for order status change events.

## Quick Start

```bash
npm install
cp .env.example .env   # fill in COOKIE_SECRET; defaults point to production gateway
npm run dev            # development with hot reload
```

For production:

```bash
npm run build
npm start
```

Open `http://localhost:3000` in a browser.

## Frontend Flow

1. **Sign In** — Authenticate with username/password against the configured IAM endpoint
2. **Dashboard** — View signed-in state, check WMS and YMS connectivity, sign out

No facility selection is required. The bearer token is captured server-side and used for WMS/YMS API calls. The browser never receives raw tokens.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP/WebSocket server port |
| `IAM_BASE_URL` | `https://unis.item.com/api/wms-bam` | IAM login service base URL |
| `IAM_LOGIN_PATH` | `/auth/login-by-password` | Login endpoint path (POST with `{username, password}`) |
| `COOKIE_SECRET` | `dev-secret-change-me` | HMAC secret for session cookie signing |
| `WMS_BASE_URL` | `https://unis.item.com/api` | WMS API gateway base URL |
| `WMS_AUTH_TOKEN` | _(blank)_ | Fallback Bearer token for background poller (server-to-server) |
| `TENANT_ID` | `LT` | Default tenant identifier |
| `FACILITY_ID` | `LT_ORG-8125` | Default facility identifier |
| `YMS_BASE_URL` | `https://unis.item.com/api/yms` | YMS API base URL |
| `POLL_INTERVAL_MS` | `5000` | Background poller interval in milliseconds |
| `POLL_PAGE_SIZE` | `50` | Events per poll page |
| `MOCK_WMS` | `false` | Generate fake events for local testing |
| `MARK_EVENTS_PROCESSED` | `false` | Mark events as PROCESSED via WMS API after broadcast |
| `AUTH_DEBUG_RESPONSES` | `true` | Return detailed diagnostics to frontend on failure. Set `false` in production |
| `LOG_LEVEL` | `info` | Logging level: debug, info, warn, error |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output |
| `npm run typecheck` | Type-check without emitting |

## Authentication Flow

1. User enters credentials in the browser
2. Browser sends `POST /api/auth/login` with `{username, password}`
3. Server calls `POST {IAM_BASE_URL}{IAM_LOGIN_PATH}` with `{username, password}`
4. On success, server stores the IAM token in an in-memory session, sets a signed httpOnly cookie
5. Browser never sees the raw token — only a signed session cookie

Session cookies are HMAC-SHA256 signed, httpOnly, SameSite=Strict.

## WMS Health Check

After signing in, use the "Check WMS Connection" button. This calls `GET /api/wms/health` which:

1. Uses the server-side session token (Bearer auth)
2. Calls a non-mutating WMS endpoint that validates the token
3. Returns connection status to the frontend

If the token is invalid or expired, the frontend shows "WMS access could not be verified" with optional diagnostics (when `AUTH_DEBUG_RESPONSES=true`).

## YMS Health Check

Use the "Check YMS Connection" button. This calls `GET /api/yms/health` which:

1. Uses the same server-side session token (Bearer auth)
2. Calls a non-mutating YMS user-profile search endpoint that validates the token
3. Returns connection status to the frontend

This confirms the bearer token obtained via IAM login is also accepted by the YMS service.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | Public | Authenticate and create session |
| `POST` | `/api/auth/logout` | Public | Destroy session |
| `GET` | `/api/auth/me` | Session | Return current username |
| `GET` | `/api/wms/health` | Session | Check WMS connectivity using session token |
| `GET` | `/api/yms/health` | Session | Check YMS connectivity using session token |
| `GET` | `/health` | Public | Server status, poller state |
| `POST` | `/simulate/order-shipped` | Public | Broadcast a fake transition (testing) |
| `WS` | `/ws` | Public | WebSocket endpoint for live order events |

## Background WebSocket Bridge

The server runs a background poller that monitors WMS order status change events (LOADING → SHIPPED transitions) and broadcasts them to connected WebSocket clients. This operates independently of the frontend login flow and uses `WMS_AUTH_TOKEN` from env for server-to-server authentication.

### WebSocket Client Example

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'order.status.changed') {
    console.log(`Order ${msg.orderId}: ${msg.oldStatus} → ${msg.newStatus}`);
  }
};
```

## Architecture

```
src/
├── config.ts          # Environment variable loading
├── types.ts           # Shared type definitions (AuthContext, SessionData)
├── logger.ts          # Structured console logger
├── iam-adapter.ts     # IAM login HTTP client with diagnostics
├── session-store.ts   # In-memory session map + HMAC cookie signing
├── auth-middleware.ts # Express session middleware + auth guard
├── auth-routes.ts     # Authentication API routes
├── wms-client.ts      # WMS API HTTP client (supports dynamic auth context)
├── websocket-hub.ts   # WebSocket server, broadcast, heartbeat
├── poller.ts          # Background polling logic (real + mock modes)
└── server.ts          # Express + HTTP server entrypoint + WMS health route

public/
├── index.html         # SPA shell (login + dashboard)
├── style.css          # Dark theme (Item AI Systems visual)
└── app.js             # Client-side logic
```

## Security Notes

- Session tokens stored server-side only (in-memory map)
- Cookie: httpOnly, SameSite=Strict, HMAC-SHA256 signed
- No tokens, API URLs, or internal identifiers exposed in the browser UI
- `AUTH_DEBUG_RESPONSES=false` suppresses diagnostics from API responses (server still logs them)
- `.env` is gitignored — never commit credentials

## Live Validation

To validate WMS connectivity with real credentials:

1. Set `IAM_BASE_URL`, `WMS_BASE_URL` in `.env`
2. Start the server: `npm run dev`
3. Open `http://localhost:3000`, sign in with valid credentials
4. Click "Check WMS Connection" to verify the bearer token works against WMS
