import { Router, Request, Response } from 'express';
import { resolveWmsAuth } from './auth-middleware';
import { config } from './config';
import { getTodaySheetTabName, getRollingAppointmentRangeLA, getYesterdayDateLA, getSheetTabNameForDate, normalizeSheetDate } from './date-utils';
import { forceRenewServiceToken } from './service-auth';
import type { AuthContext } from './types';

function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) { cells.push(current); current = ''; }
    else current += ch;
  }
  cells.push(current);
  return cells;
}

interface YardRow { carrier: string; rn: string; trailer: string; reference: string; date: string; }
interface InboundStagedRow { carrier: string; rn: string; reference: string; door: string; date: string; notes: string; status: 'STAGED'; }
interface YesterdayNoRnRow { carrier: string; rn: string; trailer: string; reference: string; date: string; door: string; notes: string; source: string; }

function isNoRn(rn: string): boolean {
  const upper = rn.toUpperCase().replace(/-/g, ' ');
  return upper === 'NO RN' || upper.includes('NO RN');
}

function parseInboundStagedRows(lines: string[]): InboundStagedRow[] {
  const leftHeaderIdx = lines.findIndex((line) => {
    const cells = parseCSVLine(line);
    const carrierHeader = (cells[0] ?? '').trim().toUpperCase();
    const stagedHeader = (cells[2] ?? '').trim().toUpperCase();
    return carrierHeader === 'CARRIER' && (stagedHeader.includes('STAGED') || stagedHeader.includes('LIVE') || stagedHeader.includes('RN'));
  });

  if (leftHeaderIdx < 0) return [];

  const stagedRows: InboundStagedRow[] = [];
  for (let i = leftHeaderIdx + 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    const carrier = (cells[0] ?? '').trim();
    const rn = (cells[2] ?? '').trim();
    const reference = (cells[3] ?? '').trim();

    if (!carrier && !rn && !reference) break;
    if (!carrier || (!rn && !reference)) continue;

    stagedRows.push({
      carrier,
      rn,
      reference,
      door: (cells[4] ?? '').trim(),
      date: (cells[5] ?? '').trim(),
      notes: (cells[7] ?? '').trim(),
      status: 'STAGED',
    });
  }

  return stagedRows;
}

const OUTBOUND_SHEET_ID = '1l3CCrUAP4_kl3Yx6gnn6MH9qbRYhOVW-u7sbp173678';
const INBOUND_SHEET_ID = '1hrOvrEluNnkvmniIQYPeCCsBHgRRSLUtFrkFaudnCgo';
const YARD_SHEET_ID = '1HvgWrskHiMCTpT57Jo8Jhe3LYkkP6s-bT9ON_V2Rpzg';

const PEPSICO_ID = 'ORG-368074';

const ORDER_STATUSES = [
  { label: 'Imported', status: 'IMPORTED' },
  { label: 'Open', status: 'OPEN' },
  { label: 'Committed', status: 'COMMITTED' },
  { label: 'Partial Committed', status: 'PARTIAL_COMMITTED' },
  { label: 'Planned', status: 'PLANNED' },
  { label: 'Picking', status: 'PICKING' },
  { label: 'Picked', status: 'PICKED' },
  { label: 'Packing', status: 'PACKING' },
  { label: 'Packed', status: 'PACKED' },
  { label: 'Loading', status: 'LOADING' },
  { label: 'Loaded', status: 'LOADED' },
  { label: 'Ready To Ship', status: 'READY_TO_SHIP' },
  { label: 'Partial Shipped', status: 'PARTIAL_SHIPPED' },
  { label: 'Shipped', status: 'SHIPPED' },
  { label: 'Short Shipped', status: 'SHORT_SHIPPED' },
  { label: 'Commit Failed', status: 'COMMIT_FAILED' },
];

const RECEIPT_STATUSES = [
  { label: 'Imported', status: 'IMPORTED' },
  { label: 'Open', status: 'OPEN' },
  { label: 'Appointment Made', status: 'APPOINTMENT_MADE' },
  { label: 'In Progress', status: 'IN_PROGRESS' },
  { label: 'Task Completed', status: 'TASK_COMPLETED' },
  { label: 'Partial Received', status: 'PARTIAL_RECEIVED' },
  { label: 'Closed', status: 'CLOSED' },
  { label: 'Force Closed', status: 'FORCE_CLOSED' },
  { label: 'Exception', status: 'EXCEPTION' },
  { label: 'Cancelled', status: 'CANCELLED' },
];

async function fetchSheet(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  return res.text();
}

class WmsSessionError extends Error {}

function isWmsSessionError(error: unknown): error is WmsSessionError {
  return error instanceof WmsSessionError;
}

async function wmsSearch(path: string, body: unknown, auth: AuthContext, retried = false) {
  const res = await fetch(`${config.wms.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${auth.token}`,
      'x-tenant-id': auth.tenantId,
      'x-facility-id': auth.facilityId,
      'item-time-zone': 'America/Los_Angeles',
    },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  const message = String(json.msg || json.message || json.error || '');
  const isAuthError = res.status === 401 || res.status === 403 || /token.*(expired|invalid)|unauthorized|not authenticated/i.test(message);

  if (isAuthError && !retried && auth.username === 'service') {
    // Service token may have expired between refresh and use: force renewal and retry once.
    const renewed = await forceRenewServiceToken();
    if (renewed) {
      return wmsSearch(path, body, renewed, true);
    }
  }

  if (isAuthError) {
    throw new WmsSessionError('WMS session unavailable. Please sign in again.');
  }
  if (!res.ok || (String(json.code) !== '0' && json.success !== true)) {
    throw new Error(message || `WMS request failed (${res.status})`);
  }
  return json.data;
}

const router = Router();

// Summary responses must always reflect the latest operational source data.
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// --- Yard with detail rows (no auth needed) ---
router.get('/yard', async (_req: Request, res: Response) => {
  try {
    const text = await fetchSheet(`https://docs.google.com/spreadsheets/d/${YARD_SHEET_ID}/export?format=csv&gid=0`);
    const lines = text.split('\n');

    let inYardCount = 0;
    let noRnCount = 0;
    const inYardRows: YardRow[] = [];
    const noRnRows: YardRow[] = [];

    // Right table: col 12 = carrier, col 13 = RN, col 14 = trailer, col 15 = reference, col 16 = date
    for (let i = 2; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]);
      const carrier = (cells[12] ?? '').trim();
      if (!carrier) continue;
      const rn = (cells[13] ?? '').trim();
      const date = (cells[16] ?? '').trim();
      const row: YardRow = { carrier, rn, trailer: (cells[14] ?? '').trim(), reference: (cells[15] ?? '').trim(), date };
      inYardCount++;
      inYardRows.push(row);
      if (isNoRn(rn)) {
        noRnCount++;
        noRnRows.push(row);
      }
    }

    // Left table: only the first contiguous inbound staged/No-RN worklist after its header.
    const inboundStagedRows = parseInboundStagedRows(lines);
    for (const row of inboundStagedRows) {
      if (isNoRn(row.rn)) {
        noRnCount++;
        noRnRows.push({ carrier: row.carrier, rn: row.rn, trailer: '', reference: row.reference, date: row.date });
      }
    }

    res.json({
      inYardCount,
      noRnCount,
      inboundStagedCount: inboundStagedRows.length,
      stagedCount: inboundStagedRows.length,
      inYardRows,
      noRnRows,
      inboundStagedRows,
      stagedRows: inboundStagedRows,
      error: null,
    });
  } catch (e: any) {
    res.json({
      inYardCount: null,
      noRnCount: null,
      inboundStagedCount: null,
      stagedCount: null,
      inYardRows: [],
      noRnRows: [],
      inboundStagedRows: [],
      stagedRows: [],
      error: e.message,
    });
  }
});

// --- Outbound Schedule (no auth needed) ---
router.get('/outbound-schedule', async (_req: Request, res: Response) => {
  try {
    const tab = encodeURIComponent(getTodaySheetTabName());
    const text = await fetchSheet(`https://docs.google.com/spreadsheets/d/${OUTBOUND_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${tab}`);
    const lines = text.split('\n');

    let outboundLivesCount = 0;
    let preloadsCount = 0;
    let shippedLiveCount = 0;
    let shippedPreloadCount = 0;
    let loadedCount = 0;
    let inPreloadSection = false;
    let lastAppt = '';

    interface Row { dn: string; status: string; carrier: string; loadNo: string; appointmentTime: string; door: string; loadId: string; pickupDateTime: string; }
    const liveRows: Row[] = [];
    const preloadRows: Row[] = [];
    const shippedLiveRows: Row[] = [];
    const shippedPreloadRows: Row[] = [];
    const loadedRows: Row[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.toUpperCase().includes('PRELOADS BELOW')) { inPreloadSection = true; lastAppt = ''; continue; }
      if (inPreloadSection && /^,CARRIER,DN/.test(line)) continue;

      const cells = parseCSVLine(line);
      const statusRaw = (cells[6] ?? '').trim();
      const status = statusRaw.toUpperCase();
      const appt = (cells[0] ?? '').trim();
      if (appt) lastAppt = appt;

      const pickupDateTime = (cells[18] ?? '').trim();

      const row: Row = {
        dn: (cells[2] ?? '').trim(),
        status: statusRaw,
        carrier: (cells[1] ?? '').trim(),
        loadNo: (cells[3] ?? '').trim(),
        appointmentTime: lastAppt,
        door: (cells[5] ?? '').trim(),
        loadId: (cells[7] ?? '').trim(),
        pickupDateTime,
      };

      // Loaded card: any valid row on today's tab with status LOADED
      // (live or preload section) counts as an outbound load currently loaded.
      if (status === 'LOADED' && (row.dn || row.loadId || row.carrier)) {
        loadedCount++;
        loadedRows.push(row);
      }

      if (inPreloadSection) {
        if (['PLANNED', 'PICKING', 'LOADED', 'COMMIT FAILED', 'STAGED'].includes(status)) {
          preloadsCount++;
          preloadRows.push(row);
        } else if (status === 'SHIPPED') {
          // Business rule: Preloads Shipped counts shipped rows on the current daily tab,
          // regardless of the Schedule Pick Up Date & Time value.
          shippedPreloadCount++;
          shippedPreloadRows.push(row);
        }
      } else {
        if (i >= 3 && row.loadId.startsWith('78') && row.appointmentTime) {
          outboundLivesCount++;
          liveRows.push(row);
          if (status === 'SHIPPED') {
            shippedLiveCount++;
            shippedLiveRows.push(row);
          }
        }
      }
    }

    // Missed outbound appointments come from the PREVIOUS LA calendar day's tab.
    // Business rule: the outbound schedule sheet explicitly marks missed pickups
    // with a "MISSED APPT" status (notes often say "MISSED P/U"). Count those
    // marker rows on yesterday's tab. Rolls daily with America/Los_Angeles.
    const yesterday = getYesterdayDateLA();
    const yesterdayOutboundTab = encodeURIComponent(getSheetTabNameForDate(yesterday.date));
    let missedOutboundCount = 0;
    let missedOutboundDate = yesterday.mdy;
    const missedOutboundRows: Row[] = [];
    let missedOutboundError: string | null = null;

    // Statuses that prove an outbound load was handled (not missed), even when
    // the appointment column is blank on the sheet.
    const OUTBOUND_HANDLED_STATUSES = new Set([
      'SHIPPED', 'LOADED', 'STAGED', 'PICKING', 'PICKED', 'PLANNED',
      'COMMIT FAILED', 'RESCHEDULED', 'CANCELLED', 'ON HOLD',
    ]);

    try {
      const yesterdayText = await fetchSheet(`https://docs.google.com/spreadsheets/d/${OUTBOUND_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${yesterdayOutboundTab}`);
      const yLines = yesterdayText.split('\n');
      let yLastAppt = '';
      for (let i = 0; i < yLines.length; i++) {
        const cells = parseCSVLine(yLines[i]);
        const yStatusRaw = (cells[6] ?? '').trim();
        const yStatus = yStatusRaw.toUpperCase();
        const yAppt = (cells[0] ?? '').trim();
        if (yAppt) yLastAppt = yAppt;

        const yDn = (cells[2] ?? '').trim();
        const yCarrier = (cells[1] ?? '').trim();
        const yLoadId = (cells[7] ?? '').trim();

        // Skip header rows, spacers, and section markers (PRELOADS BELOW etc.)
        if (yCarrier.toUpperCase() === 'CARRIER' || yDn.toUpperCase() === 'DN#' || yDn.toUpperCase() === 'DN') continue;
        if (yCarrier.toUpperCase().includes('PRELOADS BELOW') || yCarrier.toUpperCase().includes('OUTBOUND SCHEDULE')) continue;
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(yCarrier) || /^[A-Z]/.test(yCarrier) && !yDn && !yLoadId && !yStatus) continue;

        // Valid data row: has DN / carrier / load ID / status evidence
        const isValidRow = Boolean(yDn || yCarrier || yLoadId || yStatus);
        if (!isValidRow) continue;

        const explicitlyMissed = yStatus === 'MISSED APPT' || yStatus === 'MISSED' || yStatus.includes('NO SHOW');
        const blankAppointment = !yLastAppt.trim();
        const notHandled = !OUTBOUND_HANDLED_STATUSES.has(yStatus);

        if (explicitlyMissed || (blankAppointment && notHandled)) {
          missedOutboundCount++;
          missedOutboundRows.push({
            dn: yDn,
            status: yStatusRaw,
            carrier: yCarrier,
            loadNo: (cells[3] ?? '').trim(),
            appointmentTime: yLastAppt,
            door: (cells[5] ?? '').trim(),
            loadId: yLoadId,
            pickupDateTime: (cells[18] ?? '').trim(),
          });
        }
      }
    } catch (e: any) {
      missedOutboundError = e.message || 'Outbound schedule unavailable';
    }

    res.json({ outboundLivesCount, preloadsCount, shippedLiveCount, shippedPreloadCount, loadedCount, loadedRows, missedOutboundCount, missedOutboundDate, missedOutboundRows, missedOutboundError, liveRows, preloadRows, shippedLiveRows, shippedPreloadRows, error: null });
  } catch (e: any) {
    res.json({ outboundLivesCount: null, preloadsCount: null, shippedLiveCount: null, shippedPreloadCount: null, loadedCount: null, loadedRows: [], missedOutboundCount: null, missedOutboundDate: null, missedOutboundRows: [], missedOutboundError: null, liveRows: [], preloadRows: [], shippedLiveRows: [], shippedPreloadRows: [], error: e.message });
  }
});

// --- Inbound Schedule (no auth needed) ---
router.get('/inbound-schedule', async (_req: Request, res: Response) => {
  try {
    const tab = encodeURIComponent(getTodaySheetTabName());
    const text = await fetchSheet(`https://docs.google.com/spreadsheets/d/${INBOUND_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${tab}`);
    const lines = text.split('\n');

    let liveCount = 0;
    let dropCount = 0;
    let inDropSection = false;
    let lastAppointmentTime = '';

    interface PoRow { po: string; appointmentTime: string; carrier: string; rn: string; et: string; door: string; status: string; arrivalTime: string; }
    const livePoRows: PoRow[] = [];
    const dropPoRows: PoRow[] = [];

    for (let i = 0; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]);

      // Detect drop/yard section: a repeated header row with CARRIER in col 1 after row 3
      if (i > 3 && cells.length > 1 && cells[1]?.trim() === 'CARRIER') {
        inDropSection = true;
        continue;
      }

      if (i < 4) continue;

      const appointmentTime = cells[0]?.trim() ?? '';
      if (appointmentTime) lastAppointmentTime = appointmentTime;

      const carrier = cells[1]?.trim() ?? '';
      const rn = cells[2]?.trim() ?? '';
      const et = cells[3]?.trim() ?? '';
      const door = cells[4]?.trim() ?? '';
      const reference = cells[5]?.trim() ?? '';
      const status = cells[6]?.trim() ?? '';
      const arrivalTime = cells[8]?.trim() ?? '';

      if (inDropSection) {
        // Drop Scheduled rule: only count drop rows that are NOT filled out —
        // no status information AND no meaningful load data assigned yet
        // (RN / PO / arrival blank). Filled/tracked drop rows (status present,
        // RN present, arrival recorded) are excluded from the count.
        // Exclude headers, spacers, and rows with no carrier/reference evidence.
        const hasRowEvidence = Boolean(carrier || reference);
        if (!hasRowEvidence) continue;
        const isUnfilled = !status && !rn && !arrivalTime && !et && !door;
        if (!isUnfilled) continue;

        const row: PoRow = { po: reference, appointmentTime: lastAppointmentTime, carrier, rn, et, door, status, arrivalTime };
        dropCount++;
        dropPoRows.push(row);
      } else {
        // Valid live appointment row needs a carrier AND a 76-prefix reference
        if (!carrier || !reference.startsWith('76')) continue;
        const row: PoRow = { po: reference, appointmentTime: lastAppointmentTime, carrier, rn, et, door, status, arrivalTime };
        liveCount++;
        livePoRows.push(row);
      }
    }

    // Missed inbound appointments come from the PREVIOUS LA calendar day's tab.
    // Since the whole target day is yesterday, every appointment time on that
    // tab has passed. Conservative rule: a live-section appointment is missed
    // when there is no arrival evidence — no arrival time recorded and the
    // status is not an arrived/in-progress/completed state. The inbound sheet
    // does not use an explicit MISSED marker.
    const ARRIVED_STATUSES = new Set(['IN YARD', 'IN PROGRESS', 'IN PROGESS', 'TASK COMPLETED', 'PARTIAL RECEIVED', 'CLOSED', 'FORCE CLOSED', 'COMPLETED']);

    // "No RN Arrived Yesterday" and "Missed Inbound Appts" both read the
    // previous LA calendar day's tab from the inbound schedule.
    const yesterday = getYesterdayDateLA();
    const yesterdayTab = encodeURIComponent(getSheetTabNameForDate(yesterday.date));
    let yesterdayNoRnCount = 0;
    let yesterdayNoRnDate = yesterday.mdy;
    const yesterdayNoRnRows: YesterdayNoRnRow[] = [];
    let yesterdayNoRnError: string | null = null;

    let missedInboundCount = 0;
    let missedInboundDate = yesterday.mdy;
    const missedInboundRows: PoRow[] = [];
    let missedInboundError: string | null = null;

    try {
      const yesterdayText = await fetchSheet(`https://docs.google.com/spreadsheets/d/${INBOUND_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${yesterdayTab}`);
      const yLines = yesterdayText.split('\n');
      let yLastAppointmentTime = '';
      let yInDropSection = false;

      for (let i = 0; i < yLines.length; i++) {
        const cells = parseCSVLine(yLines[i]);

        // Detect drop/yard section on yesterday's tab (repeated CARRIER header)
        if (i > 3 && cells.length > 1 && cells[1]?.trim() === 'CARRIER') {
          yInDropSection = true;
          continue;
        }
        if (i < 4) continue;

        const yAppt = cells[0]?.trim() ?? '';
        if (yAppt) yLastAppointmentTime = yAppt;

        const yCarrier = cells[1]?.trim() ?? '';
        const yRn = cells[2]?.trim() ?? '';
        const yEt = cells[3]?.trim() ?? '';
        const yDoor = cells[4]?.trim() ?? '';
        const yReference = cells[5]?.trim() ?? '';
        const yStatus = cells[6]?.trim() ?? '';
        const yArrivalTime = cells[8]?.trim() ?? '';

        if (!yCarrier || !yReference.startsWith('76')) continue;

        if (isNoRn(yRn)) {
          yesterdayNoRnCount++;
          yesterdayNoRnRows.push({
            carrier: yCarrier,
            rn: yRn,
            trailer: (cells[11] ?? '').trim(),
            reference: yReference,
            date: (cells[12] ?? '').trim() || yesterday.mdy,
            door: yDoor,
            notes: (cells[7] ?? '').trim(),
            source: 'inbound',
          });
        }

        // Missed rule (live section only). Per user: if the appointment column
        // is blank/empty/missing, that row is a missed appointment — in addition
        // to the existing no-arrival-evidence rule. On yesterday's tab every
        // appointment time has passed, so a row is missed when it has no
        // appointment time (inherited empty) OR no arrival evidence (no arrival
        // time and status not arrived/in-progress/completed).
        if (!yInDropSection) {
          const statusUpper = yStatus.toUpperCase();
          const hasNoAppointment = !yLastAppointmentTime.trim();
          const hasArrivalEvidence = Boolean(yArrivalTime) || ARRIVED_STATUSES.has(statusUpper);
          if (!hasNoAppointment && hasArrivalEvidence) continue;
          missedInboundCount++;
          missedInboundRows.push({
            po: yReference,
            appointmentTime: yLastAppointmentTime,
            carrier: yCarrier,
            rn: yRn,
            et: yEt,
            door: yDoor,
            status: yStatus,
            arrivalTime: yArrivalTime,
          });
        }
      }
    } catch (e: any) {
      yesterdayNoRnError = e.message || 'Inbound schedule unavailable';
      missedInboundError = e.message || 'Inbound schedule unavailable';
    }

    res.json({
      liveCount: livePoRows.length,
      dropCount: dropPoRows.length,
      livePoRows,
      dropPoRows,
      missedInboundCount,
      missedInboundDate,
      missedInboundRows,
      missedInboundError,
      yesterdayNoRnCount,
      yesterdayNoRnDate,
      yesterdayNoRnRows,
      yesterdayNoRnError,
      error: null,
    });
  } catch (e: any) {
    res.json({ liveCount: null, dropCount: null, livePoRows: [], dropPoRows: [], missedInboundCount: null, missedInboundDate: null, missedInboundRows: [], missedInboundError: null, yesterdayNoRnCount: null, yesterdayNoRnDate: null, yesterdayNoRnRows: [], yesterdayNoRnError: null, error: e.message });
  }
});

// --- WMS Outbound Metrics (service/session auth, scoped to rolling appointment window) ---
router.get('/outbound-metrics', resolveWmsAuth, async (req: Request, res: Response) => {
  const auth = req.wmsAuth;
  const appointmentWindow = getRollingAppointmentRangeLA();
  if (!auth) {
    res.json({ metrics: [], totalCount: 0, unavailableStatusCount: 0, windowStart: appointmentWindow.fromDisplay, windowEnd: appointmentWindow.toDisplay, refreshedAt: new Date().toISOString(), error: 'WMS access is not configured. Contact your administrator.' });
    return;
  }
  try {
    const results = await Promise.allSettled(
      ORDER_STATUSES.map(async (s) => {
        const data = await wmsSearch('/wms-bam/outbound/order/search-by-paging', {
          statuses: [s.status], customerId: PEPSICO_ID, currentPage: 1, pageSize: 1,
          appointmentTimeFrom: appointmentWindow.from, appointmentTimeTo: appointmentWindow.to,
        }, auth);
        return data?.totalCount ?? 0;
      })
    );
    const authFailure = results.find((result) => result.status === 'rejected' && isWmsSessionError(result.reason));
    if (authFailure) {
      res.json({ metrics: [], totalCount: 0, unavailableStatusCount: 0, windowStart: appointmentWindow.fromDisplay, windowEnd: appointmentWindow.toDisplay, refreshedAt: new Date().toISOString(), error: 'WMS data is temporarily unavailable.' });
      return;
    }
    if (results.every((result) => result.status === 'rejected')) {
      res.json({ metrics: [], totalCount: 0, unavailableStatusCount: 0, windowStart: appointmentWindow.fromDisplay, windowEnd: appointmentWindow.toDisplay, refreshedAt: new Date().toISOString(), error: 'Outbound metrics are temporarily unavailable.' });
      return;
    }
    const metrics = ORDER_STATUSES.map((s, i) => ({
      label: s.label, status: s.status,
      count: results[i].status === 'fulfilled' ? results[i].value : null,
    }));
    const totalCount = metrics.reduce((sum, metric) => sum + (metric.count ?? 0), 0);
    const unavailableStatusCount = metrics.filter((metric) => metric.count === null).length;
    res.json({ metrics, totalCount, unavailableStatusCount, windowStart: appointmentWindow.fromDisplay, windowEnd: appointmentWindow.toDisplay, refreshedAt: new Date().toISOString(), error: null });
  } catch (e: any) {
    res.json({ metrics: [], totalCount: 0, unavailableStatusCount: 0, windowStart: appointmentWindow.fromDisplay, windowEnd: appointmentWindow.toDisplay, refreshedAt: new Date().toISOString(), error: 'Outbound metrics are temporarily unavailable.' });
  }
});

// --- WMS Inbound Metrics (service/session auth, scoped to rolling appointment window) ---
router.get('/inbound-metrics', resolveWmsAuth, async (req: Request, res: Response) => {
  const auth = req.wmsAuth;
  const appointmentWindow = getRollingAppointmentRangeLA();
  if (!auth) {
    res.json({ metrics: [], totalCount: 0, unavailableStatusCount: 0, windowStart: appointmentWindow.fromDisplay, windowEnd: appointmentWindow.toDisplay, refreshedAt: new Date().toISOString(), error: 'WMS access is not configured. Contact your administrator.' });
    return;
  }
  try {
    const results = await Promise.allSettled(
      RECEIPT_STATUSES.map(async (s) => {
        const data = await wmsSearch('/wms-bam/inbound/receipt/search-by-paging', {
          statuses: [s.status], customerId: PEPSICO_ID, currentPage: 1, pageSize: 1,
          appointmentTimeFrom: appointmentWindow.from, appointmentTimeTo: appointmentWindow.to,
        }, auth);
        return data?.totalCount ?? 0;
      })
    );
    const authFailure = results.find((result) => result.status === 'rejected' && isWmsSessionError(result.reason));
    if (authFailure) {
      res.json({ metrics: [], totalCount: 0, unavailableStatusCount: 0, windowStart: appointmentWindow.fromDisplay, windowEnd: appointmentWindow.toDisplay, refreshedAt: new Date().toISOString(), error: 'WMS data is temporarily unavailable.' });
      return;
    }
    if (results.every((result) => result.status === 'rejected')) {
      res.json({ metrics: [], totalCount: 0, unavailableStatusCount: 0, windowStart: appointmentWindow.fromDisplay, windowEnd: appointmentWindow.toDisplay, refreshedAt: new Date().toISOString(), error: 'Inbound metrics are temporarily unavailable.' });
      return;
    }
    const metrics = RECEIPT_STATUSES.map((s, i) => ({
      label: s.label, status: s.status,
      count: results[i].status === 'fulfilled' ? results[i].value : null,
    }));
    const totalCount = metrics.reduce((sum, metric) => sum + (metric.count ?? 0), 0);
    const unavailableStatusCount = metrics.filter((metric) => metric.count === null).length;
    res.json({ metrics, totalCount, unavailableStatusCount, windowStart: appointmentWindow.fromDisplay, windowEnd: appointmentWindow.toDisplay, refreshedAt: new Date().toISOString(), error: null });
  } catch (e: any) {
    res.json({ metrics: [], totalCount: 0, unavailableStatusCount: 0, windowStart: appointmentWindow.fromDisplay, windowEnd: appointmentWindow.toDisplay, refreshedAt: new Date().toISOString(), error: 'Inbound metrics are temporarily unavailable.' });
  }
});

// --- WMS Outbound Order Detail by Status (service/session auth) ---
router.get('/outbound-orders/:status', resolveWmsAuth, async (req: Request, res: Response) => {
  const auth = req.wmsAuth;
  const appointmentWindow = getRollingAppointmentRangeLA();
  const status = req.params.status;
  if (!auth) {
    res.json({ totalCount: null, orders: [], windowStart: appointmentWindow.fromDisplay, windowEnd: appointmentWindow.toDisplay, error: 'WMS access is not configured. Contact your administrator.' });
    return;
  }
  try {
    const data = await wmsSearch('/wms-bam/outbound/order/search-by-paging', {
      statuses: [status], customerId: PEPSICO_ID, currentPage: 1, pageSize: 50,
      appointmentTimeFrom: appointmentWindow.from, appointmentTimeTo: appointmentWindow.to,
    }, auth);
    const orders = (data?.list ?? []).map((o: any) => {
      // Search multiple fields for a DN in DN-###### format
      const candidates = [
        o.orderNo, o.dnNo, o.dnNumber, o.dn, o.customerOrderNo,
        o.referenceNo, o.referenceNumber, o.poNo, o.soNo, o.shipperReference,
        o.id,
      ];
      let dn = '';
      // First pass: look for explicit DN-###### or DN###### pattern
      for (const val of candidates) {
        if (!val || typeof val !== 'string') continue;
        const dnMatch = val.match(/DN-?(\d{6})/i);
        if (dnMatch) {
          dn = 'DN-' + dnMatch[1];
          break;
        }
      }
      // Second pass: if no DN pattern found, look for a standalone 5-6 digit number
      if (!dn) {
        for (const val of candidates) {
          if (!val || typeof val !== 'string') continue;
          const numMatch = val.match(/^(\d{5,6})$/);
          if (numMatch) {
            dn = 'DN-' + numMatch[1];
            break;
          }
        }
      }
      return {
        id: o.id, dn, referenceNo: o.referenceNo ?? '',
        status: o.status, createdTime: o.createdTime ?? '', loadNo: o.loadNo ?? '',
        loadId: o.loadId ?? '', shipTo: o.shipTo ?? '',
      };
    });
    res.json({ totalCount: data?.totalCount ?? 0, orders, windowStart: appointmentWindow.fromDisplay, windowEnd: appointmentWindow.toDisplay, error: null });
  } catch (e: any) {
    if (isWmsSessionError(e)) {
      res.json({ totalCount: null, orders: [], windowStart: appointmentWindow.fromDisplay, windowEnd: appointmentWindow.toDisplay, error: 'WMS data is temporarily unavailable.' });
      return;
    }
    res.json({ totalCount: null, orders: [], windowStart: appointmentWindow.fromDisplay, windowEnd: appointmentWindow.toDisplay, error: 'Outbound details are temporarily unavailable.' });
  }
});

// --- WMS Inbound Receipt Detail by Status (service/session auth) ---
router.get('/inbound-receipts/:status', resolveWmsAuth, async (req: Request, res: Response) => {
  const auth = req.wmsAuth;
  const appointmentWindow = getRollingAppointmentRangeLA();
  const status = req.params.status;
  if (!auth) {
    res.json({ totalCount: null, receipts: [], windowStart: appointmentWindow.fromDisplay, windowEnd: appointmentWindow.toDisplay, error: 'WMS access is not configured. Contact your administrator.' });
    return;
  }
  try {
    const data = await wmsSearch('/wms-bam/inbound/receipt/search-by-paging', {
      statuses: [status], customerId: PEPSICO_ID, currentPage: 1, pageSize: 50,
      appointmentTimeFrom: appointmentWindow.from, appointmentTimeTo: appointmentWindow.to,
    }, auth);
    const receipts = (data?.list ?? []).map((r: any) => ({
      id: r.id, poNo: r.poNo ?? '', referenceNo: r.referenceNo ?? '', status: r.status,
      appointmentTime: r.appointmentTime ?? '', customerId: r.customerId ?? '',
    }));
    res.json({ totalCount: data?.totalCount ?? 0, receipts, windowStart: appointmentWindow.fromDisplay, windowEnd: appointmentWindow.toDisplay, error: null });
  } catch (e: any) {
    if (isWmsSessionError(e)) {
      res.json({ totalCount: null, receipts: [], windowStart: appointmentWindow.fromDisplay, windowEnd: appointmentWindow.toDisplay, error: 'WMS data is temporarily unavailable.' });
      return;
    }
    res.json({ totalCount: null, receipts: [], windowStart: appointmentWindow.fromDisplay, windowEnd: appointmentWindow.toDisplay, error: 'Inbound details are temporarily unavailable.' });
  }
});

// --- Commit Failed Detail (service/session auth, current-status) ---
router.get('/commit-failed', resolveWmsAuth, async (req: Request, res: Response) => {
  const auth = req.wmsAuth;
  if (!auth) {
    res.json({ totalCount: null, orders: [], error: 'WMS access is not configured. Contact your administrator.' });
    return;
  }
  try {
    const data = await wmsSearch('/wms-bam/outbound/order/search-by-paging', {
      statuses: ['COMMIT_FAILED'], customerId: PEPSICO_ID, currentPage: 1, pageSize: 50,
    }, auth);
    const orders = (data?.list ?? []).map((o: any) => {
      const candidates = [
        o.orderNo, o.dnNo, o.dnNumber, o.dn, o.customerOrderNo,
        o.referenceNo, o.referenceNumber, o.poNo, o.soNo, o.shipperReference,
        o.id,
      ];
      let dn = '';
      for (const val of candidates) {
        if (!val || typeof val !== 'string') continue;
        const dnMatch = val.match(/DN-?(\d{6})/i);
        if (dnMatch) { dn = 'DN-' + dnMatch[1]; break; }
      }
      if (!dn) {
        for (const val of candidates) {
          if (!val || typeof val !== 'string') continue;
          const numMatch = val.match(/^(\d{5,6})$/);
          if (numMatch) { dn = 'DN-' + numMatch[1]; break; }
        }
      }
      return {
        id: o.id, dn, referenceNo: o.referenceNo ?? '', status: o.status,
        createdTime: o.createdTime ?? '', loadNo: o.loadNo ?? '', shipTo: o.shipTo ?? '',
      };
    });
    res.json({ totalCount: data?.totalCount ?? 0, orders, error: null });
  } catch (e: any) {
    if (isWmsSessionError(e)) {
      res.json({ totalCount: null, orders: [], error: 'WMS data is temporarily unavailable.' });
      return;
    }
    res.json({ totalCount: null, orders: [], error: 'Commit Failed details are temporarily unavailable.' });
  }
});

// --- Partial Shipped Detail (service/session auth, current-status, no date filter) ---
router.get('/partial-shipped', resolveWmsAuth, async (req: Request, res: Response) => {
  const auth = req.wmsAuth;
  if (!auth) {
    res.json({ totalCount: null, orders: [], error: 'WMS access is not configured. Contact your administrator.' });
    return;
  }
  try {
    const data = await wmsSearch('/wms-bam/outbound/order/search-by-paging', {
      statuses: ['PARTIAL_SHIPPED'], customerId: PEPSICO_ID, currentPage: 1, pageSize: 50,
    }, auth);
    const orders = (data?.list ?? []).map((o: any) => {
      const candidates = [
        o.orderNo, o.dnNo, o.dnNumber, o.dn, o.customerOrderNo,
        o.referenceNo, o.referenceNumber, o.poNo, o.soNo, o.shipperReference,
        o.id,
      ];
      let dn = '';
      for (const val of candidates) {
        if (!val || typeof val !== 'string') continue;
        const dnMatch = val.match(/DN-?(\d{6})/i);
        if (dnMatch) { dn = 'DN-' + dnMatch[1]; break; }
      }
      if (!dn) {
        for (const val of candidates) {
          if (!val || typeof val !== 'string') continue;
          const numMatch = val.match(/^(\d{5,6})$/);
          if (numMatch) { dn = 'DN-' + numMatch[1]; break; }
        }
      }
      return {
        id: o.id, dn, referenceNo: o.referenceNo ?? '', status: o.status,
        createdTime: o.createdTime ?? '', loadNo: o.loadNo ?? '', shipTo: o.shipTo ?? '',
      };
    });
    res.json({ totalCount: data?.totalCount ?? 0, orders, error: null });
  } catch (e: any) {
    if (isWmsSessionError(e)) {
      res.json({ totalCount: null, orders: [], error: 'WMS data is temporarily unavailable.' });
      return;
    }
    res.json({ totalCount: null, orders: [], error: 'Partial Shipped details are temporarily unavailable.' });
  }
});

export { router as summaryRouter };
