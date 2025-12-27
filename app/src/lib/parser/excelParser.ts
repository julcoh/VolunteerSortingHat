import * as XLSX from 'xlsx';
import type { Shift, Volunteer, Settings, ParsedData } from '../../types';

// Normalize ShiftID: remove trailing .0, convert to string
function normalizeShiftId(val: unknown): string {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  // If it looks like "123.0" or "123.00", strip the decimal part
  if (/^\d+(\.0+)?$/.test(s)) {
    return String(parseInt(s, 10));
  }
  return s;
}

// Parse Excel time value to Date
function parseExcelDateTime(dateVal: unknown, _timeVal?: unknown): Date | null {
  if (dateVal === null || dateVal === undefined) return null;

  // Excel stores dates as serial numbers (days since 1900)
  // If it's already a Date string, parse it
  if (typeof dateVal === 'string') {
    const parsed = new Date(dateVal);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // If it's a number (Excel serial date)
  if (typeof dateVal === 'number') {
    // Convert Excel serial date to JS Date
    const excelEpoch = new Date(1899, 11, 30);
    const msPerDay = 24 * 60 * 60 * 1000;
    return new Date(excelEpoch.getTime() + dateVal * msPerDay);
  }

  return null;
}

// Parse time string like "10:00:00 PM" or "8:00 AM"
function parseTimeString(timeStr: string, dateStr: string): Date | null {
  if (!timeStr || !dateStr) return null;

  // Try to parse the combined date + time
  const combined = `${dateStr} ${timeStr}`;
  const parsed = new Date(combined);
  if (!isNaN(parsed.getTime())) return parsed;

  // If that fails, try parsing components manually
  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!timeMatch) return null;

  let hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const ampm = timeMatch[4]?.toUpperCase();

  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  // Parse the date part
  const dateOnly = new Date(dateStr);
  if (isNaN(dateOnly.getTime())) return null;

  dateOnly.setHours(hours, minutes, 0, 0);
  return dateOnly;
}

export function parseExcelFile(buffer: ArrayBuffer): ParsedData {
  const errors: string[] = [];
  const warnings: string[] = [];
  const shifts: Shift[] = [];
  const volunteers: Volunteer[] = [];
  let settings: Settings = {
    minPoints: 6,
    maxOver: 2,
    seed: 42,
    maxShifts: 999
  };

  try {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

    // Expected sheets: Shifts, Prefs, Settings
    const sheetNames = workbook.SheetNames;

    // Parse Settings sheet
    if (sheetNames.includes('Settings')) {
      const settingsSheet = workbook.Sheets['Settings'];
      const settingsData = XLSX.utils.sheet_to_json<Record<string, unknown>>(settingsSheet);
      if (settingsData.length > 0) {
        const row = settingsData[0];
        settings = {
          minPoints: Number(row['MIN_POINTS'] ?? row['MinPoints'] ?? 6),
          maxOver: Number(row['MAX_OVER'] ?? row['MaxOver'] ?? 2),
          seed: Number(row['SEED'] ?? row['Seed'] ?? 42),
          maxShifts: Number(row['MAX_SHIFTS'] ?? row['MaxShifts'] ?? 999)
        };
      }
    } else {
      warnings.push('No Settings sheet found, using defaults (MIN_POINTS=6, MAX_OVER=2)');
    }

    // Parse Shifts sheet
    if (sheetNames.includes('Shifts')) {
      const shiftsSheet = workbook.Sheets['Shifts'];
      const shiftsData = XLSX.utils.sheet_to_json<Record<string, unknown>>(shiftsSheet);

      for (const row of shiftsData) {
        const shiftId = normalizeShiftId(row['ShiftID']);
        if (!shiftId) continue;

        const dateVal = row['Date'];
        const startTimeVal = row['StartTime'];
        const endTimeVal = row['EndTime'];

        let startTime: Date | null = null;
        let endTime: Date | null = null;

        // Handle various date/time formats
        if (startTimeVal instanceof Date) {
          startTime = startTimeVal;
        } else if (typeof startTimeVal === 'string' && typeof dateVal === 'string') {
          startTime = parseTimeString(startTimeVal, dateVal);
        } else if (typeof startTimeVal === 'number') {
          startTime = parseExcelDateTime(startTimeVal, null);
        }

        if (endTimeVal instanceof Date) {
          endTime = endTimeVal;
        } else if (typeof endTimeVal === 'string' && typeof dateVal === 'string') {
          endTime = parseTimeString(endTimeVal, dateVal);
        } else if (typeof endTimeVal === 'number') {
          endTime = parseExcelDateTime(endTimeVal, null);
        }

        if (!startTime || !endTime) {
          warnings.push(`Shift ${shiftId}: Could not parse start/end times`);
          continue;
        }

        shifts.push({
          id: shiftId,
          date: String(dateVal ?? ''),
          role: String(row['Role'] ?? ''),
          startTime,
          endTime,
          capacity: Number(row['Capacity'] ?? 1),
          points: Number(row['Points'] ?? 1),
          jotformLabel: row['Jotform Label'] ? String(row['Jotform Label']) : undefined
        });
      }

      if (shifts.length === 0) {
        errors.push('No valid shifts found in Shifts sheet');
      }
    } else {
      errors.push('Missing required "Shifts" sheet');
    }

    // Parse Prefs sheet
    if (sheetNames.includes('Prefs')) {
      const prefsSheet = workbook.Sheets['Prefs'];
      const prefsData = XLSX.utils.sheet_to_json<Record<string, unknown>>(prefsSheet);

      // Get shift IDs from column headers (everything except Volunteer and MinPoints)
      const headers = XLSX.utils.sheet_to_json<string[]>(prefsSheet, { header: 1 })[0] || [];
      const shiftIdColumns = headers
        .map((h, i) => ({ header: String(h), index: i }))
        .filter(({ header }) =>
          header !== 'Volunteer' &&
          header !== 'MinPoints' &&
          header.trim() !== ''
        );

      for (const row of prefsData) {
        const name = String(row['Volunteer'] ?? '').trim();
        if (!name) continue;

        const minPointsVal = row['MinPoints'];
        const minPoints = minPointsVal !== undefined && minPointsVal !== '' && minPointsVal !== null
          ? Number(minPointsVal)
          : undefined;

        const preferences = new Map<string, number>();

        for (const { header } of shiftIdColumns) {
          const normalizedId = normalizeShiftId(header);
          const rankVal = row[header];
          if (rankVal !== undefined && rankVal !== '' && rankVal !== null) {
            const rank = Number(rankVal);
            if (!isNaN(rank) && rank >= 1) {
              preferences.set(normalizedId, rank);
            }
          }
        }

        if (preferences.size === 0) {
          warnings.push(`Volunteer "${name}" has no preferences set`);
        }

        volunteers.push({
          name,
          minPoints,
          preferences
        });
      }

      if (volunteers.length === 0) {
        errors.push('No volunteers found in Prefs sheet');
      }
    } else {
      errors.push('Missing required "Prefs" sheet');
    }

  } catch (e) {
    errors.push(`Failed to parse Excel file: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { shifts, volunteers, settings, errors, warnings };
}
