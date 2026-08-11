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

function isHeaderOrSectionRow(row: OutboundScheduleRow): boolean {
  const carrierUpper = row.carrier.toUpperCase();
  const dnUpper = row.dn.toUpperCase();
  if (carrierUpper === 'CARRIER' || dnUpper === 'DN#' || dnUpper === 'DN') return true;
  if (carrierUpper.includes('PRELOADS BELOW') || carrierUpper.includes('OUTBOUND SCHEDULE')) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(row.carrier)) return true;
  return false;
}

function hasOperationalData(row: OutboundScheduleRow): boolean {
  return Boolean(row.dn || row.carrier || row.loadId || row.loadNo || row.status);
}

function isMarkerOnlyRow(row: OutboundScheduleRow): boolean {
  return !row.dn && !row.carrier && !row.loadNo && !row.door && !row.loadId;
}

function isMissedMarker(row: OutboundScheduleRow): boolean {
  return /\bMISSED(?:\s+APPT)?\b|\bNO\s*SHOW\b/i.test(row.status);
}

function withMissedStatus(row: OutboundScheduleRow, markerStatus: string): OutboundScheduleRow {
  return {
    ...row,
    status: markerStatus || row.status || 'MISSED APPT',
  };
}

export function parseMissedOutboundRows(lines: string[]): OutboundScheduleRow[] {
  const rows: OutboundScheduleRow[] = [];
  let lastAppointmentTime = '';

  for (const line of lines) {
    const cells = parseCSVLine(line);
    const appointmentTime = (cells[0] ?? '').trim();
    if (appointmentTime) lastAppointmentTime = appointmentTime;

    const statusRaw = (cells[6] ?? '').trim();
    const notes = (cells[10] ?? '').trim();
    rows.push({
      dn: (cells[2] ?? '').trim(),
      status: statusRaw || notes,
      carrier: (cells[1] ?? '').trim(),
      loadNo: (cells[3] ?? '').trim(),
      appointmentTime: lastAppointmentTime,
      door: (cells[5] ?? '').trim(),
      loadId: (cells[7] ?? '').trim(),
      pickupDateTime: (cells[18] ?? '').trim(),
    });
  }

  const missedRows: OutboundScheduleRow[] = [];
  const seen = new Set<string>();
  const addRow = (row: OutboundScheduleRow, markerStatus?: string) => {
    if (isHeaderOrSectionRow(row) || !hasOperationalData(row)) return;
    const output = withMissedStatus(row, markerStatus || row.status);
    const key = `${output.dn}|${output.loadNo}|${output.loadId}|${output.appointmentTime}`;
    if (seen.has(key)) return;
    seen.add(key);
    missedRows.push(output);
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (isHeaderOrSectionRow(row)) continue;

    const status = normalizeStatus(row.status);
    const explicitlyMissed = isMissedMarker(row);
    const blankAppointment = !row.appointmentTime;
    const notHandled = !OUTBOUND_HANDLED_STATUSES.has(status);

    if (explicitlyMissed && isMarkerOnlyRow(row)) {
      // Some schedules record the missed appointment note on a blank marker row,
      // with the actual DN/carrier/load data on the adjacent row for that appt.
      const next = rows.slice(i + 1).find((candidate) =>
        candidate.appointmentTime === row.appointmentTime && !isMarkerOnlyRow(candidate) && hasOperationalData(candidate) && !isHeaderOrSectionRow(candidate)
      );
      const previous = [...rows.slice(0, i)].reverse().find((candidate) =>
        candidate.appointmentTime === row.appointmentTime && !isMarkerOnlyRow(candidate) && hasOperationalData(candidate) && !isHeaderOrSectionRow(candidate)
      );
      const related = next || previous;
      if (related) addRow(related, row.status);
      continue;
    }

    if (explicitlyMissed || (hasOperationalData(row) && blankAppointment && notHandled)) {
      addRow(row);
    }
  }

  return missedRows;
}
