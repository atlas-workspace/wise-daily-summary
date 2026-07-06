# Dashboard Card API Endpoint Catalog

Concise endpoint catalog for adding dashboard cards across WMS, TMS/FMS, YMS, and Ticketing. Use the TMS/FMS ontology-backed operations below as the source of truth for freight cards. Do not put bearer tokens, cookies, raw headers, quote tokens, card numbers, or other secrets in card configuration.

## Safe card integration pattern

- Prefer server-side proxy routes under `/api/...`; the browser should call only dashboard routes and never receive upstream bearer tokens.
- Use the signed dashboard session for user-scoped calls.
- Include tenant/facility/timezone only as server-side context headers where required. Current known scope for this project: tenant `LT`, facility `LT_ORG-8125`, timezone `America/Los_Angeles`.
- Treat write actions such as order creation, quote saving, dispute submission, status updates, and simulation as explicit user-confirmed actions, not auto-refresh cards.
- Hide internal IDs and tokens from end users unless they are safe display references. Never display quote tokens.

## Dashboard template endpoints already exposed by this repo

| System | Method / Path | Business purpose | Context scope | Key params/body hints | Response/card mapping hints | Safe usage notes |
|---|---|---|---|---|---|---|
| Auth | `POST /api/auth/login` | Sign in and establish dashboard session | Public login; creates server session | Body: `username`, `password` | Map success to signed-in user/session state | Rate limited; do not log credentials |
| Auth | `POST /api/auth/logout` | End dashboard session | Current session | No body required | Map to signed-out state | Safe user action |
| Auth | `GET /api/auth/me` | Get current signed-in user | Current session | None | User profile/status card | No secrets in response |
| WMS | `GET /api/wms/health` | Verify WMS connectivity | Current session; tenant | None | Status card: `ok`, `message`, optional diagnostics in debug mode | Read-only health check |
| YMS | `GET /api/yms/health` | Verify YMS connectivity | Current session; tenant, facility, timezone | None | Status card: `ok`, `message` | Read-only health check |
| TMS/FMS | `GET /api/tms/health` | Verify TMS/FMS connectivity | Current session; tenant, facility, timezone | None | Status card: `ok`, `message` | Read-only; default upstream is user/customer context lookup |
| Ticketing | `GET /api/ticket/health` | Verify Ticket API connectivity | Current session; tenant | None | Status card: `ok`, `message` | Read-only; Ticket IAM endpoints use IAM bearer token, no separate API key |
| Platform | `GET /health` | Server and poller status | Public | None | Ops card: server ok, poller state | Do not expose sensitive env details |
| WMS | `WS /ws` | Live WMS order status-change events | Session cookie or server-to-server key | WebSocket messages | Live feed card: order id, old status, new status, timestamps | Browser uses session cookie; server consumers may use `WS_AUTH_KEY` without exposing it |
| WMS test | `POST /simulate/order-shipped` | Broadcast fake shipped transition for local/non-production testing | Non-production only unless explicitly enabled | Test order payload | Demo/live event card | Disabled in production by default; do not use for real operations |

## Upstream endpoints currently used by the template

| System | Method / Path | Business purpose | Context scope | Key params/body hints | Response/card mapping hints | Safe usage notes |
|---|---|---|---|---|---|---|
| WMS | `GET /wms-bam/employee/check-bind-code` | Validate WMS user access | IAM bearer, tenant | None | Connectivity status | Read-only |
| YMS | `GET /task-board/employees/filters` | Validate YMS user-profile/filter access | IAM bearer, tenant, facility, timezone | None | Connectivity status | Read-only |
| TMS/FMS | `GET /wms-bam/v1/web/user/info` | User/customer context lookup before freight pricing flows | IAM bearer, tenant, facility, timezone | None | Customer-context selector/card; quote prerequisite | Read-only; configured by `TMS_HEALTH_PATH` |
| Ticketing | `GET /v1/iam/ticket/priorities/list` | Validate Ticket IAM access and list ticket priorities | IAM bearer, tenant | None | Ticket priority selector/status card | Read-only; do not send `x-api-key` |
| WMS | `POST /wms/outbound/order-status-change-event/search-by-paging` | Poll WMS outbound order status transitions | Server/poller token or user auth; tenant, facility | Body: `currentPage`, `pageSize` | Event feed: `orderId`, `oldStatus`, `newStatus`, `processStatus`, timestamps | Read-only search, but high-frequency polling should back off on errors |
| WMS | `PUT /wms/outbound/order-status-change-event` | Mark a status-change event processed | Server/poller token or user auth; tenant, facility | Body: `id`, `processStatus: "PROCESSED"` | Action result / processed badge | Mutating; only enable after events are safely handled |

## TMS/FMS ontology-backed freight operations

The following operations come from the available TMS/FMS/FMS ontology tool contract. Concrete upstream route names are not all present in this template repository; implement these as server-side proxy routes and bind them to the matching ontology operation/tool. Never guess customer codes, payment card IDs, or quote choices: the user must explicitly select them.

| Recommended dashboard route | Ontology operation | Business purpose | Context scope | Key params/body hints | Response/card mapping hints | Safe usage notes |
|---|---|---|---|---|---|---|
| `GET /api/tms/customers` | `getUtCustomers4Iam` | List UT customers available for quote pricing | Current IAM session | No body | Customer selector: code/name/id | Must be called before quote pricing; user selects `customer_code` |
| `GET /api/tms/accessorials` | `portalAccList` | List supported accessorial/additional services | Current IAM session | No body | Multi-select options: `code`, `name` | Verify mentioned services before quoting/order creation |
| `POST /api/tms/quotes` | `portalQuote` | Calculate real-time freight rates | Selected customer; shipper/consignee lanes; manifests; accessorials | Body: `customer_code`; shipper/consignee `city/state/zip`; `manifests[]` with item, quantity, dimensions, stackable flag, class, weight, NMFC, description; optional `additional_quote_lines[]` | Rate cards: carrier, service, price, transit time, `rate_uuid`; retain token server-side | Do not auto-fill `customer_code`; do not display quote token; let user choose among rates |
| `POST /api/tms/quotes/save` | `portalSaveShippingQuote` | Save selected carrier quote for order creation | Selected quote | Body: `rate_uuid`, server-held quote `token`, optional `quote_id` | Saved quote card: `quote_id`, chosen rate summary | Mutating; only after user selects a rate; token remains hidden |
| `GET /api/tms/payment-cards` | `portalGetUserPaymentCards` | List saved payment cards for order payment | Current IAM session | No body | Payment selector: card label, last4/brand if returned, `pay_card_id` | User must explicitly select `pay_card_id`; never default silently |
| `POST /api/tms/orders` | `portalCreateShippingOrder` | Create shipping order from saved quote and payment | Saved quote, selected payment card, pickup window, shipper/consignee contacts | Body: `quote_id`, `pay_card_id`, `pay_amount`, full shipper/consignee name/phone/email/street/city/state/zip, pickup date/time window, order type, accessorials | Order confirmation card: order id/status/BOL/PRO if returned, pickup window, amount | Mutating/payment action; pickup date/time must be tomorrow or later; readonly fields should stay readonly in UI |
| `GET /api/tms/tracking` | `tmsShipmentOrderTracking` | Track shipment/order by BOL, PRO, PU, tracking number, or other reference | Current IAM session | Query: `searchText`, optional `page` | Shipment status card: reference, order status, carrier, milestones, ETA if returned | Read-only; allow pagination; avoid over-polling |
| `GET /api/tms/claim-customers` | `getPortalClaimCustom` | List customers available for invoice/claim processing | Current IAM session | Query: optional `refresh_cache` | Claim customer selector | User selects customer before invoice lookup |
| `GET /api/tms/invoices` | `getCustomerInvoiceList` | List/search invoices for selected customer | Selected claim customer | Query/body: `customer_id`, `customer_code`, `customer_name`, optional `invoice_number`, `current_page`, `page_size` | Invoice table/card: invoice number, date/status/amount if returned | Read-only; require selected customer context |
| `GET /api/tms/invoices/{invoice_number}/items` | `getInvoiceItems` | List invoice line items for dispute selection | Selected invoice/customer | Path: `invoice_number`; query: `customer_code` | Line-item selector: label description + amount; value item index | Read-only; preserve `invoiceLineId`/flag server-side for dispute submission |
| `POST /api/tms/disputes` | `portalSubmitPreparedDispute` | Submit invoice dispute/claim | Selected customer, invoice, contact email, selected items | Body: `customer_id`, `customer_code`, `customer_name`, `invoice_number`, `contact_email`, `dispute_type` (`quantity`, `quality`, `pricing`, `damage`, `other`), `dispute_reason`, `dispute_items[]` with item index/name, line id/flag, quantity, invoice amount, rate, claim amount, description | Dispute confirmation card: submitted status/reference if returned, claimed amount, disputed items | Mutating; require user confirmation and complete reason/item claim details |

## WMS dashboard card candidates

| Endpoint | Business purpose | Card mapping hints | Notes |
|---|---|---|---|
| `GET /api/wms/health` | WMS connectivity | Simple status/check card | Already implemented |
| `WS /ws` | Live outbound order transition feed | Timeline/list card with `orderId`, `oldStatus -> newStatus`, timestamps | Already implemented |
| `POST /wms/outbound/order-status-change-event/search-by-paging` via server proxy | Historical/paged event table | Table with pagination and status filters | Upstream currently used by poller; expose a read-only dashboard proxy if needed |

## YMS dashboard card candidates

| Endpoint | Business purpose | Card mapping hints | Notes |
|---|---|---|---|
| `GET /api/yms/health` | YMS connectivity | Simple status/check card | Already implemented |
| `GET /task-board/employees/filters` via server proxy | Yard/task-board employee filters | Selector/filter card | Upstream currently used only as safe health validation |

## Ticketing dashboard card candidates

| Endpoint | Business purpose | Card mapping hints | Notes |
|---|---|---|---|
| `GET /api/ticket/health` | Ticket connectivity | Simple status/check card | Already implemented |
| `GET /v1/iam/ticket/priorities/list` via server proxy | Ticket priority list | Priority selector/count card | Read-only; no `x-api-key` |

## Card-building guidance

- Status cards: map `{ ok, message }` to green/red state and keep diagnostics behind an admin/debug toggle.
- Selector cards: use stable IDs/codes as values and friendly names as labels; keep sensitive values server-side.
- Tables: include pagination inputs (`current_page`, `page_size`) and avoid unbounded list calls.
- Action cards: require explicit confirmation, show a preview summary, then submit.
- Freight quote cards: show all returned rate options and make the user choose; never pick the cheapest/first rate automatically.
- Payment cards: display masked card labels only; the selected `pay_card_id` must come from the payment-card list response.
