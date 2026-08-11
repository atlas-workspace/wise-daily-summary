import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getSheetTabNameCandidatesForDate } from './date-utils';
import { parseMissedOutboundRows } from './outbound-missed';

function csvRow(values: Record<number, string>): string {
  const cells = Array.from({ length: 19 }, () => '');
  for (const [index, value] of Object.entries(values)) cells[Number(index)] = value;
  return cells.map((value) => `"${value.replace(/"/g, '""')}"`).join(',');
}

describe('missed outbound appointments', () => {
  it('tries the real double-space August 10 tab variant', () => {
    const candidates = getSheetTabNameCandidatesForDate(new Date('2026-08-10T19:00:00Z'));
    assert.equal(candidates[0], 'MONDAY - AUGUST 10');
    assert.ok(candidates.includes('MONDAY  - AUGUST 10'));
  });

  it('counts explicit note markers and blank unhandled data rows only', () => {
    const rows = parseMissedOutboundRows([
      csvRow({ 1: 'CARRIER', 2: 'DN#', 6: 'STATUS', 10: 'NOTES' }),
      csvRow({ 0: '5:00 PM', 10: 'MISSED - MOVED TO CURRENT DATE' }),
      csvRow({ 1: 'CHAO', 2: 'DN-1', 6: 'SHIPPED', 7: '100' }),
      csvRow({ 0: '6:00 PM', 1: 'ROCO', 2: 'DN-2', 6: 'OPEN', 7: '101' }),
      csvRow({ 1: 'ROCO', 2: 'DN-3', 6: 'OPEN', 7: '102' }),
      csvRow({ 10: 'MISSED - MOVED TO CURRENT DATE' }),
      csvRow({ 1: 'PRELOADS BELOW' }),
      csvRow({ 10: 'MOVED TO 8/11' }),
    ]);

    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((row) => ({ dn: row.dn, status: row.status, appointmentTime: row.appointmentTime })), [
      { dn: '', status: 'MISSED - MOVED TO CURRENT DATE', appointmentTime: '5:00 PM' },
      { dn: 'DN-3', status: 'OPEN', appointmentTime: '6:00 PM' },
      { dn: '', status: 'MISSED - MOVED TO CURRENT DATE', appointmentTime: '6:00 PM' },
    ]);
  });

  it('matches the real August 10 marker rows exactly', () => {
    const rows = parseMissedOutboundRows([
      csvRow({ 0: '5:00 PM', 10: 'MISSED - MOVED TO CURRENT DATE' }),
      csvRow({ 1: 'CHAO', 2: 'DN-101952', 6: 'SHIPPED', 7: '78869523' }),
      csvRow({ 0: '6:00 PM', 1: 'CHAO', 2: 'DN-102050', 6: 'SHIPPED', 7: '78927782' }),
      csvRow({ 10: 'MISSED - MOVED TO CURRENT DATE' }),
    ]);

    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.appointmentTime), ['5:00 PM', '6:00 PM']);
  });
});
