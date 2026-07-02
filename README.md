# WISE Dashboard Template

A full-stack Node.js + TypeScript template server with IAM login, WMS, YMS, and TMS/FMS connectivity health checks, and a background WebSocket bridge for order status change events.

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
2. **Dashboard** — View signed-in state, check WMS, YMS, and TMS/FMS connectivity, sign out

No facility selection is required. The bearer token is captured server-side and used for WMS/YMS/TMS/FMS API calls. The browser never receives raw tokens.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP/WebSocket server port |
| `NODE_ENV` | _(blank)_ | Set `production` for deployments: enforces a strong `COOKIE_SECRET`, adds the `Secure` cookie flag, disables `/simulate/*` routes |
| `IAM_BASE_URL` | `https://unis.item.com/api/wms-bam` | IAM login service base URL |
| `IAM_LOGIN_PATH` | `/auth/login-by-password` | Login endpoint path (POST with `{username, password}`) |
| `COOKIE_SECRET` | `dev-secret-change-me` | HMAC secret for session cookie signing. **Required (32+ chars) when `NODE_ENV=production` — the server refuses to start otherwise** |
| `LOGIN_RATE_LIMIT_MAX` | `10` | Max login attempts per IP per window |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | `900000` | Login rate-limit window (15 min) |
| `WMS_BASE_URL` | `https://unis.item.com/api` | WMS API gateway base URL |
| `WMS_AUTH_TOKEN` | _(blank)_ | Bearer token for the background poller (server-to-server). If blank, the poller does not start |
| `TENANT_ID` | `LT` | Default tenant identifier |
| `FACILITY_ID` | `LT_ORG-8125` | Default facility identifier |
| `YMS_BASE_URL` | `https://unis.item.com/api` | YMS API base URL |
| `TMS_BASE_URL` | `https://unis.item.com/api` | TMS/FMS API gateway base URL |
| `TMS_HEALTH_PATH` | `/wms-bam/v1/web/user/info` | Read-only upstream path used by `/api/tms/health` |
| `TICKET_BASE_URL` | `https://ticket.item.com/api/item-tickets` | Ticket API gateway base URL |
| `TIMEZONE` | `America/Los_Angeles` | Timezone sent as Item-Time-Zone header for YMS/TMS requests |
| `POLL_INTERVAL_MS` | `5000` | Background poller interval in milliseconds (backs off exponentially on repeated errors, up to 5 min) |
| `POLL_PAGE_SIZE` | `50` | Events per poll page |
| `WS_AUTH_KEY` | _(blank)_ | Shared key for non-browser WebSocket consumers (`?key=...` or `Authorization: Bearer ...`). Browser clients use the session cookie |
| `MOCK_WMS` | `false` | Generate fake events for local testing |
| `MARK_EVENTS_PROCESSED` | `false` | Mark events as PROCESSED via WMS API after broadcast |
| `ENABLE_SIMULATE_ROUTES` | _(unset)_ | Force-enable/disable `POST /simulate/order-shipped`. Unset: enabled outside production, disabled in production |
| `AUTH_DEBUG_RESPONSES` | `false` | Return detailed diagnostics to frontend on failure. Enable only while debugging |
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

## TMS/FMS Health Check

Use the "Check TMS/FMS Connection" button. This calls `GET /api/tms/health` which:

1. Uses the same server-side session token (Bearer auth) created by IAM login
2. Calls a safe, non-mutating upstream endpoint: `GET {TMS_BASE_URL}{TMS_HEALTH_PATH}`
3. Sends business context headers: `x-tenant-id` (`LT` by default), `x-facility-id` (`LT_ORG-8125` by default), and `Item-Time-Zone` (`America/Los_Angeles` by default)
4. Returns only a sanitized status object to the browser; raw tokens, raw headers, and full upstream bodies are not exposed

Default upstream hint: `https://unis.item.com/api/wms-bam/v1/web/user/info`. This is a read-only UNIS web/IAM user-context endpoint used by transportation/FMS flows (for example, customer context lookup before quoting). If a dedicated TMS/FMS read-only status or tracking-search endpoint is confirmed, set `TMS_HEALTH_PATH` to that path without changing the dashboard route.

Success response shape:

```json
{ "ok": true, "message": "TMS/FMS connection verified" }
```

Failure response shape (when authenticated to the dashboard but upstream verification fails):

```json
{
  "ok": false,
  "message": "TMS/FMS access could not be verified",
  "diagnostics": {
    "status": 401,
    "statusText": "Unauthorized",
    "upstreamMessage": "Unauthorized access",
    "upstreamCode": "401"
  }
}
```

`diagnostics` is omitted when `AUTH_DEBUG_RESPONSES=false`. If the user has no dashboard session, `/api/tms/health` returns HTTP `401` with `{ "error": "Not authenticated" }`.

## Ticket Health Check

Use the "Check Ticket Connection" button. This calls `GET /api/ticket/health` which:

1. Uses the same server-side session token (Bearer auth) created by IAM login
2. Calls a safe, read-only endpoint: `GET {TICKET_BASE_URL}/v1/iam/ticket/priorities/list`
3. Sends `x-tenant-id` (`LT` by default)
4. Considers the check healthy when HTTP 200 with body `success: true` and `code: 200`
5. Returns only a sanitized status object to the browser

The Ticket `/v1/iam/...` endpoints rely solely on the IAM bearer token — no separate API key is needed or sent. Live validation requires valid credentials and appropriate permissions.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | Public | Authenticate and create session |
| `POST` | `/api/auth/logout` | Public | Destroy session |
| `GET` | `/api/auth/me` | Session | Return current username |
| `GET` | `/api/wms/health` | Session | Check WMS connectivity using session token |
| `GET` | `/api/yms/health` | Session | Check YMS connectivity using session token |
| `GET` | `/api/tms/health` | Session | Check TMS/FMS connectivity using session token |
| `GET` | `/api/ticket/health` | Session | Check Ticket connectivity using session token |
| `GET` | `/health` | Public | Server status, poller state |
| `POST` | `/simulate/order-shipped` | Non-production only | Broadcast a fake transition (testing). Disabled when `NODE_ENV=production` unless `ENABLE_SIMULATE_ROUTES=true` |
| `WS` | `/ws` | Session cookie or `WS_AUTH_KEY` | WebSocket endpoint for live order events |

`POST /api/auth/login` is rate limited per client IP (10 attempts / 15 min by default); over the limit it returns HTTP `429` with a `Retry-After` header.

## Background WebSocket Bridge

The server runs a background poller that monitors WMS order status change events (LOADING → SHIPPED transitions) and broadcasts them to connected WebSocket clients. This operates independently of the frontend login flow and uses `WMS_AUTH_TOKEN` from env for server-to-server authentication. If `WMS_AUTH_TOKEN` is blank the poller does not start (set `MOCK_WMS=true` for local testing). On repeated poll failures the interval backs off exponentially, up to 5 minutes.

WebSocket connections to `/ws` must be authenticated: browser clients present the signed dashboard session cookie automatically; server-to-server consumers pass `WS_AUTH_KEY` via `?key=...` or an `Authorization: Bearer` header.

### WebSocket Client Example

```javascript
// Non-browser consumer: authenticate with the shared key
const ws = new WebSocket('ws://localhost:3000/ws?key=' + WS_AUTH_KEY);
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

- Session tokens stored server-side only (in-memory map, swept periodically after expiry)
- Cookie: httpOnly, SameSite=Strict, HMAC-SHA256 signed; `Secure` flag added when `NODE_ENV=production`
- No tokens, raw headers, or full upstream response bodies exposed in the browser UI
- Diagnostics in API responses are off by default; set `AUTH_DEBUG_RESPONSES=true` only while debugging (server always logs them)
- Login endpoint is rate limited per IP; WebSocket connections require a session cookie or `WS_AUTH_KEY`
- `/simulate/*` routes are disabled in production
- In production the server refuses to start without a strong `COOKIE_SECRET` (32+ chars)
- `.env` is gitignored — never commit credentials

## Live Validation

To validate WMS connectivity with real credentials:

1. Set `IAM_BASE_URL`, `WMS_BASE_URL`, and optionally `TMS_BASE_URL`/`TMS_HEALTH_PATH` in `.env`
2. Start the server: `npm run dev`
3. Open `http://localhost:3000`, sign in with valid credentials
4. Click "Check WMS Connection" or "Check TMS/FMS Connection" to verify the bearer token works against the selected backend
