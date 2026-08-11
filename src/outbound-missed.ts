export interface OutboundScheduleRow {
  dn: string;
  status: string;
  carrier: string;
  loadNo: string;
  appointmentTime: string;
  door: string;
  loadId: string;
  pickupDateTime: string;
}

const OUTBOUND_HANDLED_STATUSES = new Set([
  'SHIPPED', 'LOADED', 'STAGED', 'PICKING', 'PICKED', 'PLANNED',
  'COMMIT FAILED', 'RESCHEDULED', 'CANCELLED', 'ON HOLD',
]);

function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function normalizeStatus(status: string): string {
  return status.trim().toUpperCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

export function parseMissedOutboundRows(lines: string[]): OutboundScheduleRow[] {
  const missedRows: OutboundScheduleRow[] = [];
  let lastAppointmentTime = '';

  for (const line of lines) {
    const cells = parseCSVLine(line);
    const appointmentTime = (cells[0] ?? '').trim();
    if (appointmentTime) lastAppointmentTime = appointmentTime;

    const carrier = (cells[1] ?? '').trim();
    const dn = (cells[2] ?? '').trim();
    const loadNo = (cells[3] ?? '').trim();
    const door = (cells[5] ?? '').trim();
    const statusRaw = (cells[6] ?? '').trim();
    const status = normalizeStatus(statusRaw);
    const loadId = (cells[7] ?? '').trim();
    const notes = (cells[10] ?? '').trim();
    const carrierUpper = carrier.toUpperCase();
    const dnUpper = dn.toUpperCase();

    if (carrierUpper === 'CARRIER' || dnUpper === 'DN#' || dnUpper === 'DN') continue;
    if (carrierUpper.includes('PRELOADS BELOW') || carrierUpper.includes('OUTBOUND SCHEDULE')) continue;
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(carrier)) continue;

    const explicitlyMissed = /\bMISSED(?:\s+APPT)?\b|\bNO\s*SHOW\b/i.test(`${statusRaw} ${notes}`);
    const isValidDataRow = Boolean(dn || carrier || loadId || statusRaw);
    const blankAppointment = !appointmentTime;
    const notHandled = !OUTBOUND_HANDLED_STATUSES.has(status);

    if (!explicitlyMissed && !(isValidDataRow && blankAppointment && notHandled)) continue;

    missedRows.push({
      dn,
      status: statusRaw || notes || 'MISSED APPT',
      carrier,
      loadNo,
      appointmentTime: lastAppointmentTime,
      door,
      loadId,
      pickupDateTime: (cells[18] ?? '').trim(),
    });
  }

  return missedRows;
}
