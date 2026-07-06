# WMS Dashboard Endpoint Catalog

Source of truth: WMS 3.0 ontology APIEndpoint contracts. This catalog is intentionally dashboard/card-oriented: it prioritizes read/search/summary endpoints that are safe for KPI cards, lists, charts, and drilldowns. It does not include secrets, tokens, or environment-specific credential values.

## Common call pattern

- **Scope headers:** WMS calls are tenant/facility scoped. Use the app/session context for auth and headers such as `x-tenant-id`, `x-facility-id`, and `item-time-zone`; do not hard-code secrets.
- **Pagination:** most list cards should use `POST .../search-by-paging` with `currentPage`, `pageSize`, optional `searchCount`, and optional `sortingFields`.
- **Date/time:** use facility-local ISO timestamps or API-supported period arrays. Prefer explicit `...From`/`...To` fields when present.
- **Response mapping:** common paged response shape is `data.list`, `data.totalCount`, `data.currentPage`, `data.pageSize`, `data.totalPage`; non-paged list response is usually `data[]`.
- **Safe usage:** prefer read-only search endpoints. Avoid mutation endpoints in dashboard cards. Use small `pageSize` for preview tables and count-focused cards.

## Dashboard / BAM overview

| Endpoint | Business purpose | Scope | Key params/body hints | Response/card mapping hints | Safe usage notes |
|---|---|---|---|---|---|
| `POST /wms-bam/dashboard/overall-progress/search` | Overall warehouse progress KPI rollups. | Tenant + facility + timezone. | Requires created-time window fields per WMS contract. | Map returned progress totals to KPI tiles/progress bars. | Use bounded date windows; do not infer all-time totals. |
| `POST /wms-bam/tasks/search/status/summary` | Task status summary. | Tenant + facility. | Task filters: `taskType`, `statuses`, `customerId(s)`, assignee/time fields. | Status-count KPI card by task status/type. | Contract response is less descriptive in ontology; validate sample before complex charting. |

## Outbound cards

| Endpoint | Business purpose | Scope | Key params/body hints | Response/card mapping hints | Safe usage notes |
|---|---|---|---|---|---|
| `POST /wms/outbound/order/search-by-paging` | Order inquiry for open/shipped/cancelled/order aging cards. | Tenant + facility. | `statuses`, `excludeStatuses`, `customerId`, `retailerIds`, `carrierId`, `loadNo(s)`, `appointmentTimeFrom/To`, `createdTimeFrom/To`, `shippedTimeFrom/To`, `currentPage`, `pageSize`. | `data.totalCount` for KPI; `data.list[].id/status/customerId/loadNo/appointmentTime/shippedTime/totalWeight/totalPallets` for tables. | For “unshipped,” use non-shipped statuses or `excludeStatuses: ["SHIPPED","CANCELLED"]`; no literal UNSHIPPED status. |
| `POST /wms/outbound/load/search-by-paging` | Load board, loads by status, appointment/load aging. | Tenant + facility. | `status`, `ids`, `loadNo(s)`, `customerId(s)`, `carrierId(s)`, `appointmentTimeFrom/To`, `createdTimeFrom/To`. | `data.totalCount`; list fields include `id`, `loadNo`, `status`, `customerId`, `carrierId`, `appointmentTime`, `masterBolNo`. | Use `GET /wms/outbound/load/search-by-orderId/{orderId}` for drilldown from an order. |
| `POST /wms/outbound/order-plan/search-by-paging` | Order planning/release workload. | Tenant + facility. | `orderIds`, `pickTaskIds`, `customerId(s)`, `pickType(s)`, `status(es)`, paging. | Count plans; show `id`, `orderIds`, `pickTaskIds`, `pickMethod`, `pickType`, customer fields. | Useful for process-stage cards between commit and pick. |
| `POST /wms/outbound/pick-task/search-by-paging` | Pick task workload and pick execution status. | Tenant + facility. | `statuses`, `excludeStatuses`, `assigneeUserId(s)`, `customerId(s)`, `orderIds`, `orderPlanId`, `startTime/endTime`, paging. | `data.totalCount`; list fields include task `id`, `status`, `assigneeUserId`, `orderIds`, `orderPlanId`, `startTime`, `endTime`. | For step-aware cards use `/wms/outbound/pick-task/search-by-paging-with-step`. |
| `POST /wms-bam/outbound/batch-pack-station/dashboard/search-by-paging` | Batch pack station dashboard. | Tenant + facility. | `locationId/name`, `customerId`, `status`, `processMode`, `packageId`, `lastActivityTimeFrom/To`, carrier pickup filters. | Station cards: `locationName`, `customerName`, `packageName`, `orderQty`, `status`, `lastActivityTime`, `currentBatchNo`. | BAM endpoint is dashboard-friendly; keep filters tight for station wallboards. |
| `GET /wms-bam/outbound/batch-pack-station/{stationId}/item-quantity-summary` | Item quantity summary for a batch pack station. | Tenant + facility. | Path `stationId`. | `data[]` with `itemId`, `totalQty`, `uomId` for item summary table/bar chart. | Drilldown only after resolving station from station search. |

## Inbound cards

| Endpoint | Business purpose | Scope | Key params/body hints | Response/card mapping hints | Safe usage notes |
|---|---|---|---|---|---|
| `POST /wms/inbound/receipt/search-by-paging` | Receipt inquiry for inbound volume/status/aging. | Tenant + facility. | `receiptIds`, `keyword`, `statuses`, `excludeStatuses`, `customerId(s)`, `carrierId`, `appointmentTimeFrom/To`, `createdTimeFrom/To`, `poNoLike`, `referenceNoLike`, paging. | `data.totalCount`; list fields include `id`, `status`, `customerId`, `poNo`, `referenceNo`, `appointmentTime`, `receivedTime`, `closedTime`. | Prefer this over report endpoints when building operational cards. |
| `POST /wms/inbound/receive-task/search-by-paging` | Receiving task workload. | Tenant + facility. | `statuses`, `assigneeUserId(s)`, `customerId(s)`, `dockId`, `entryId`, `receiptIds`, created/end time periods, paging. | Count tasks; show `id`, `status`, `receiptIds`, `dockId`, `assigneeUserId`, `createdTime`, `endTime`. | For step-level cards use `/wms/inbound/receive-task/search-by-paging-with-step`. |
| `POST /wms/inbound/put-away-task/search-by-paging` | Put-away task workload and bottlenecks. | Tenant + facility. | `statuses`, `assigneeUserId(s)`, `customerId`, `stepTaskIds`, `startTime/endTime`, paging. | Count by status/assignee; list `id`, `status`, `customerId`, `assigneeUserId`, `lastAssignedWhen`. | For step-aware cards use `/wms/inbound/put-away-task/search-by-paging-with-step`. |
| `POST /wms-bam/appointment/search-by-paging` | Appointment list crossing inbound/outbound activities. | Tenant + facility. | `appointmentTimePeriod`, `apptStatus`, `serviceType`, `carrierId`, `customerId`, `loadId`, `receiptId`, `referenceNo`, paging. | Appointment count/timeline: `id`, `sid`, `apptStatus`, `appointmentType`, `appointmentTime`, `carrierName`, `customerNames`, linked loads/receipts. | Use facility-local time windows for daily appointment KPIs. |

## Inventory, LP, and location cards

| Endpoint | Business purpose | Scope | Key params/body hints | Response/card mapping hints | Safe usage notes |
|---|---|---|---|---|---|
| `POST /wms/wms-inventory/search-by-paging` | Inventory on-hand/status/location/item cards. | Tenant + facility. | `customerId(s)`, `titleId(s)`, `itemId(s)`, `status(es)`, `type(s)`, `locationId(s)`, `lpId(s)`, `lotNo`, `receiptId`, `orderId`, paging. | `data.totalCount`; list fields include `itemId`, `qty`, `uomId`, `status`, `locationId`, `lpId`, `customerId`. | Resolve item/customer IDs before filtering; do not use raw item names in ID fields. |
| `POST /wms/wms-lp/search-by-paging` | License plate population, status, location occupancy. | Tenant + facility. | `id(s)`, `code`, `locationId(s)`, `type`, `status(es)`, `orderId`, `taskId`, paging. | LP cards: `id`, `code`, `type`, `status`, `locationId`, dimensions/weight, `createdTime`. | LP state is operational; treat as snapshot and refresh periodically. |
| `POST /wms/wms-location/search-by-paging` | Location/dock/staging occupancy and status. | Tenant + facility. | `ids`, `locationIds`, `category`, `categories`, `type`, `status`, `dockStatus`, `spaceStatus`, `customerIds`, paging. | Map `data.list[]` to dock/location cards: `id`, `name`, `type`, `category`, `dockStatus`, `spaceStatus`, `capacity`, `lpCount`, `itemCount`. | For dock cards, filter by `type/category` rather than keyword-only search. |

## Yard / appointment / gate cards

| Endpoint | Business purpose | Scope | Key params/body hints | Response/card mapping hints | Safe usage notes |
|---|---|---|---|---|---|
| `POST /wms-bam/entry-ticket/search-by-paging` | Gate/window/dock check-in queue and dwell. | Tenant + facility. | `fuzzyEntryId`, `statuses`, `checkInTypes`, `tags`, `carrierId`, driver/equipment fields, `loadId/loadNo`, `receiptId`, `customerIds`, gate/window check-in ranges, paging. | Queue cards: `entryId`, status/check action, driver/carrier, linked receipts/loads, dock/task objects. | This is WMS-BAM yard view; use YMS-specific APIs only if separately confirmed. |
| `POST /wms-bam/yard/equipment/search` | Yard equipment current location/status. | Tenant + facility. | `equipmentNo`, `type`, `carrierId`, `checkInEntry`, `entryId`, `referenceNo`, `statuses`, `locationTypes`. | Yard cards: `equipmentNo`, `equipmentType`, `status`, `currentLocationName`, `gateCheckinTime`, `carrierName`. | Non-paged list; add filters to avoid large responses. |
| `POST /wms-bam/yard/equipment/activity-history/search` | Equipment activity timeline. | Tenant + facility. | Required: `equipmentNo`, `checkInEntry`. | Timeline: `checkInTime`, `checkOutTime`, `currentLocation`, `status`, `updateScenario`. | Use as drilldown from yard equipment card, not broad dashboard query. |
| `POST /wms/appointment/search-by-paging` | Core appointment search. | Tenant + facility. | `appointmentTimePeriod`, `apptStatuses`, `appointmentTypes`, `serviceTypes`, `carrierId(s)`, `customerId(s)`, `referenceNo(s)`, paging. | Calendar/list card using `id`, `sid`, `appointmentType`, `appointmentTime`, `apptStatus`, `carrierId`, `customerIds`. | WMS appointment statuses include `NEW`, `CHECKED_IN`, `CONFIRM`, `COMPLETED`, `CANCEL`, etc. |

## Master data support cards/selectors

| Endpoint | Business purpose | Scope | Key params/body hints | Response/card mapping hints | Safe usage notes |
|---|---|---|---|---|---|
| `POST /mdm/customer/search-by-paging` | Customer selector/filter and customer cards. | Tenant + facility header; MDM object. | `id(s)`, `orgId(s)`, `customerCode`, `name`, paging. | `id`, `orgId`, `customerCode`, `name`, `fullName`. | Resolve customer IDs before using in WMS filters. |
| `POST /mdm/carrier/search-by-paging` | Carrier selector/filter. | Tenant + facility header; MDM object. | `id(s)`, `eqName`, `regexName`, `scac`, `shippingMethods`, `status`, `deliveryServices`, paging. | `id`, `name`, `scac`, `shippingMethods`, `deliveryServices`, `status`. | Pair carrier with delivery service when building shipment filters. |
| `POST /wms-bam/item/search-by-paging` | Item selector/filter and item master cards. | Tenant + facility. | `code(s)`, `name`, `customerId`, `status`, `tags`, `labels`, paging. | `id`, `code`, `name`, `description`, `customerId`, `status`, `upcCode`, dimensions/attributes. | Use item IDs in inventory/order filters; avoid raw code/name in ID fields. |
| `POST /itemmaster/item/search-by-paging` | Item Master service search. | Tenant + timezone; auth handled by app. | Similar item filters plus `currentPage`, `pageSize`. | Item master list in `data.list`. | Cross-service path may not use WMS facility the same way; validate context handling. |

## Billing, documents, and integration monitoring

| Endpoint | Business purpose | Scope | Key params/body hints | Response/card mapping hints | Safe usage notes |
|---|---|---|---|---|---|
| `POST /wms/billing-log/search-by-paging` | Operational billing events by order/receipt/load/task. | Tenant + facility. | `customerId`, `orderId`, `billingCode`, paging. | `amount`, `billingCode`, `qty`, `unitPrice`, `status`, `orderId`, `receiptId`, `loadId`, `taskId`. | Financial data may be sensitive; limit card visibility by role. |
| `POST /wms/billing/billing-direct/search-by-paging` | Direct billing cards. | Tenant + facility. | Required `currentPage`, `pageSize`; optional `customerId`, project/date/status fields. | `amount`, `status`, `project`, `customerName`, `startDate`, `endDate`, `invoiceId`. | Use bounded dates for dashboards. |
| `POST /wms/client-document/search-by-paging` | Generated documents by order/receipt/tracking. | Tenant + facility. | `orderId(s)`, `receiptId(s)`, `trackingNo(s)`, `documentType(s)`, `customerId(s)`, created/update time fields, paging. | `fileName`, `documentType`, `status`, `orderId`, `receiptId`, `fileId`. | Do not expose document URLs/files unless user has permission. |
| `POST /wms-bam/confirmation-log/search-by-paging` | Integration confirmation health. | Tenant + facility. | `confirmationType(s)`, `statuses`, `excludeStatuses`, `customerId(s)`, `orderId(s)`, `receiptId(s)`, `createdTimeFrom/To`, paging. | Error/success cards using `status`, `confirmationType`, `errorMessage`, `foreignId`, `referenceNo`, `createdTime`. | Good for exception cards; do not display raw payload content broadly. |

## Notes on other systems

The original request mentioned WMS, TMS, YMS, and Ticketing. In this execution context only the **WMS 3.0 ontology** was visible, so this file only catalogs ontology-verified WMS/WMS-BAM/MDM endpoints. Do not add TMS/YMS/Ticket endpoints here unless their ontologies/API contracts are available and verified.