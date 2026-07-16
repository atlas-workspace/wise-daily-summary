import { Router, Request, Response } from 'express';
import { requireAuth } from './auth-middleware';
import { config } from './config';
import { getTodaySheetTabName } from './date-utils';
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

const OUTBOUND_SHEET_ID = '1l3CCrUAP4_kl3Yx6gnn6MH9qbRYhOVW-u7sbp173678';
const INBOUND_SHEET_ID = '1hrOvrEluNnkvmniIQYPeCCsBHgRRSLUtFrkFaudnCgo';
const YARD_SHEET_ID = '1HvgWrskHiMCTpT57Jo8Jhe3LYkkP6s-bT9ON_V2Rpzg';

const PEPSICO_ID = 'ORG-368074';

const ORDER_STATUSES = [
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

async function wmsSearch(path: string, body: unknown, auth: AuthContext) {
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
  const json: any = await res.json();
  if (json.code !== 0 && json.success !== true) throw new Error(json.msg || `WMS error code ${json.code}`);
  return json.data;
}

const router = Router();

// --- Yard (no auth needed) ---
router.get('/yard', async (_req: Request, res: Response) => {
  try {
    const text = await fetchSheet(`https://docs.google.com/spreadsheets/d/${YARD_SHEET_ID}/export?format=csv&gid=0`);
    const lines = text.split('\n');

    let inYardCount = 0;
    let noRnCount = 0;
    let stagedCount = 0;

    // Right table: col 12 = carrier, col 13 = RN
    for (let i = 2; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]);
      const carrier = (cells[12] ?? '').trim();
      if (!carrier) continue;
      inYardCount++;
      const rn = (cells[13] ?? '').trim().toUpperCase().replace(/-/g, ' ');
      if (rn === 'NO RN' || rn.includes('NO RN')) noRnCount++;
    }

    // Left table: staged loads (stop at first blank gap)
    let leftHeaderIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]);
      const c0 = (cells[0] ?? '').trim().toUpperCase();
      const c2 = (cells[2] ?? '').trim().toUpperCase();
      if (c0 === 'CARRIER' && (c2.includes('STAGED') || c2.includes('LIVE') || c2.includes('RN'))) {
        leftHeaderIdx = i;
        break;
      }
    }

    if (leftHeaderIdx >= 0) {
      for (let i = leftHeaderIdx + 1; i < lines.length; i++) {
        const cells = parseCSVLine(lines[i]);
        const carrier = (cells[0] ?? '').trim();
        const rn = (cells[2] ?? '').trim();
        const ref = (cells[3] ?? '').trim();
        if (!carrier && !rn && !ref) break;
        if (!carrier) continue;
        if (rn || ref) stagedCount++;
        const rnUpper = rn.toUpperCase().replace(/-/g, ' ');
        if (rnUpper === 'NO RN' || rnUpper.includes('NO RN')) noRnCount++;
      }
    }

    res.json({ inYardCount, noRnCount, stagedCount, error: null });
  } catch (e: any) {
    res.json({ inYardCount: null, noRnCount: null, stagedCount: null, error: e.message });
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
    let inPreloadSection = false;
    let lastAppt = '';

    interface Row { dn: string; status: string; carrier: string; loadNo: string; appointmentTime: string; door: string; loadId: string; }
    const liveRows: Row[] = [];
    const preloadRows: Row[] = [];
    const shippedLiveRows: Row[] = [];
    const shippedPreloadRows: Row[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.toUpperCase().includes('PRELOADS BELOW')) { inPreloadSection = true; lastAppt = ''; continue; }
      if (inPreloadSection && /^,CARRIER,DN/.test(line)) continue;

      const cells = parseCSVLine(line);
      const status = (cells[6] ?? '').trim().toUpperCase();
      const appt = (cells[0] ?? '').trim();
      if (appt) lastAppt = appt;

      const row: Row = {
        dn: (cells[2] ?? '').trim(),
        status: (cells[6] ?? '').trim(),
        carrier: (cells[1] ?? '').trim(),
        loadNo: (cells[3] ?? '').trim(),
        appointmentTime: lastAppt,
        door: (cells[5] ?? '').trim(),
        loadId: (cells[7] ?? '').trim(),
      };

      if (inPreloadSection) {
        if (['PLANNED', 'PICKING', 'LOADED', 'COMMIT FAILED', 'STAGED'].includes(status)) {
          preloadsCount++;
          preloadRows.push(row);
        } else if (status === 'SHIPPED') {
          shippedPreloadCount++;
          shippedPreloadRows.push(row);
        }
      } else {
        if (i >= 3 && row.loadId.startsWith('78') && row.appointmentTime) {
          if (['PLANNED', 'COMMIT FAILED', 'STAGED'].includes(status)) {
            outboundLivesCount++;
            liveRows.push(row);
          } else if (status === 'SHIPPED') {
            shippedLiveCount++;
            shippedLiveRows.push(row);
          }
        }
      }
    }

    res.json({ outboundLivesCount, preloadsCount, shippedLiveCount, shippedPreloadCount, liveRows, preloadRows, shippedLiveRows, shippedPreloadRows, error: null });
  } catch (e: any) {
    res.json({ outboundLivesCount: null, preloadsCount: null, shippedLiveCount: null, shippedPreloadCount: null, liveRows: [], preloadRows: [], shippedLiveRows: [], shippedPreloadRows: [], error: e.message });
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

    const EXCLUDED_STATUSES = ['STAGED', 'IN PROGRESS', 'IN PROGESS'];

    for (let i = 0; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]);

      if (i > 3 && cells.length > 5 && cells[1]?.trim() === 'CARRIER' && cells[2]?.trim() === 'RN' && cells[4]?.trim() === 'DOOR' && cells[5]?.trim() === 'REFERENCE#') {
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

      if (!carrier && !reference) continue;

      const row: PoRow = { po: reference, appointmentTime: lastAppointmentTime, carrier, rn, et, door, status, arrivalTime };

      if (inDropSection) {
        dropCount++;
        if (reference.startsWith('76')) dropPoRows.push(row);
      } else {
        if (!EXCLUDED_STATUSES.includes(status.toUpperCase())) liveCount++;
        if (reference.startsWith('76')) livePoRows.push(row);
      }
    }

    res.json({ liveCount, dropCount, livePoRows, dropPoRows, error: null });
  } catch (e: any) {
    res.json({ liveCount: null, dropCount: null, livePoRows: [], dropPoRows: [], error: e.message });
  }
});

// --- WMS Outbound Metrics (auth required) ---
router.get('/outbound-metrics', requireAuth, async (req: Request, res: Response) => {
  const auth = req.authContext!;
  try {
    const results = await Promise.allSettled(
      ORDER_STATUSES.map(async (s) => {
        const data = await wmsSearch('/wms-bam/outbound/order/search-by-paging', {
          statuses: [s.status], customerId: PEPSICO_ID, currentPage: 1, pageSize: 1,
        }, auth);
        return data?.totalCount ?? 0;
      })
    );
    const metrics = ORDER_STATUSES.map((s, i) => ({
      label: s.label, status: s.status,
      count: results[i].status === 'fulfilled' ? results[i].value : null,
    }));
    res.json({ metrics, error: null });
  } catch (e: any) {
    res.json({ metrics: [], error: e.message });
  }
});

// --- WMS Inbound Metrics (auth required) ---
router.get('/inbound-metrics', requireAuth, async (req: Request, res: Response) => {
  const auth = req.authContext!;
  try {
    const results = await Promise.allSettled(
      RECEIPT_STATUSES.map(async (s) => {
        const data = await wmsSearch('/wms-bam/inbound/receipt/search-by-paging', {
          statuses: [s.status], currentPage: 1, pageSize: 1,
        }, auth);
        return data?.totalCount ?? 0;
      })
    );
    const metrics = RECEIPT_STATUSES.map((s, i) => ({
      label: s.label, status: s.status,
      count: results[i].status === 'fulfilled' ? results[i].value : null,
    }));
    res.json({ metrics, error: null });
  } catch (e: any) {
    res.json({ metrics: [], error: e.message });
  }
});

// --- Partial Shipped Detail (auth required) ---
router.get('/partial-shipped', requireAuth, async (req: Request, res: Response) => {
  const auth = req.authContext!;
  try {
    const data = await wmsSearch('/wms-bam/outbound/order/search-by-paging', {
      statuses: ['PARTIAL_SHIPPED'], customerId: PEPSICO_ID, currentPage: 1, pageSize: 50,
    }, auth);
    const orders = (data?.list ?? []).map((o: any) => ({
      id: o.id, referenceNo: o.referenceNo ?? '', status: o.status, createdTime: o.createdTime ?? '',
    }));
    res.json({ totalCount: data?.totalCount ?? 0, orders, error: null });
  } catch (e: any) {
    res.json({ totalCount: null, orders: [], error: e.message });
  }
});

export { router as summaryRouter };
