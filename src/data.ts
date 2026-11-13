import type { AttendanceDay, Employee, Punch, RawMap } from './types';

export const ATTENDANCE_TIME_ZONE = 'Asia/Kolkata';

const datePartsInAttendanceZone = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ATTENDANCE_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
};

export const asMap = (value: unknown): RawMap =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as RawMap
    : {};

export const dateKey = (date: Date) => {
  const parts = datePartsInAttendanceZone(date);
  return `${parts.day}-${parts.month}-${parts.year}`;
};

export const parseDateKey = (key: string): Date | null => {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(key);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 6, 30)); // Noon in Asia/Kolkata.
  const parts = datePartsInAttendanceZone(date);
  return Number(parts.day) === day && Number(parts.month) === month && Number(parts.year) === year ? date : null;
};

export const parseEmployees = (raw: unknown): Employee[] => Object.entries(asMap(raw)).map(([uid, value]) => {
  const item = asMap(value);
  return {
    uid,
    id: String(item.UID ?? uid),
    name: String(item.Name ?? 'Unnamed employee'),
    email: String(item.Email ?? ''),
    designation: String(item.Designation ?? ''),
    phone: String(item.PhoneNumber ?? ''),
    address: String(item.Address ?? ''),
    officeKey: String(item.allotted_office ?? ''),
  };
}).sort((a, b) => a.name.localeCompare(b.name));

const parsePunchTime = (value: unknown, fallback: string): { text: string; millis: number } | null => {
  const text = String(value ?? fallback);
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { text: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`, millis: ((hour * 60 + minute) * 60 + second) * 1000 };
};

export const buildAttendance = (
  rawAttendance: unknown,
  employees: Employee[],
  locations: unknown,
): AttendanceDay[] => {
  const attendance = asMap(rawAttendance);
  const officeMap = asMap(locations);
  const result: AttendanceDay[] = [];
  for (const employee of employees) {
    const days = asMap(attendance[employee.uid]);
    for (const [key, value] of Object.entries(days)) {
      const date = parseDateKey(key);
      if (!date) continue;
      const punchMap = asMap(value);
      const punches: Punch[] = [];
      for (const [punchKey, punchValue] of Object.entries(punchMap)) {
        const separator = punchKey.indexOf('-');
        const typeText = separator < 0 ? '' : punchKey.slice(0, separator).toLowerCase();
        if (typeText !== 'in' && typeText !== 'out') continue;
        const punchData = asMap(punchValue);
        const parsed = parsePunchTime(punchData.time, separator < 0 ? '' : punchKey.slice(separator + 1));
        if (!parsed) continue;
        punches.push({ type: typeText, time: parsed.text, millis: parsed.millis, officeKey: String(punchData.office ?? '') });
      }
      punches.sort((a, b) => a.millis - b.millis);
      if (!punches.length) continue;
      let started: number | null = null;
      let worked = 0;
      for (const punch of punches) {
        if (punch.type === 'in' && started === null) started = punch.millis;
        else if (punch.type === 'out' && started !== null) {
          if (punch.millis > started) worked += punch.millis - started;
          started = null;
        }
      }
      if (started !== null && dateKey(date) === dateKey(new Date())) {
        worked += Math.max(0, Date.now() - started);
      }
      const last = punches[punches.length - 1];
      const firstIn = punches.find((p) => p.type === 'in');
      const lastOut = [...punches].reverse().find((p) => p.type === 'out');
      const officeKey = last.officeKey || firstIn?.officeKey || employee.officeKey;
      const location = asMap(officeMap[officeKey]);
      result.push({
        uid: employee.uid,
        employee,
        dateKey: key,
        date,
        punches,
        present: Boolean(firstIn),
        checkedIn: last.type === 'in',
        inTime: firstIn?.time ?? '—',
        outTime: lastOut?.time ?? (last.type === 'in' ? 'In progress' : '—'),
        office: String(location.name ?? officeKey ?? '—') || '—',
        workedMinutes: Math.floor(worked / 60000),
      });
    }
  }
  return result.sort((a, b) => b.date.getTime() - a.date.getTime() || a.employee.name.localeCompare(b.employee.name));
};

export const formatDuration = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
export const monthKey = (date: Date) => {
  const parts = datePartsInAttendanceZone(date);
  return `${parts.year}-${parts.month}`;
};
export const formatDate = (date: Date) => new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: ATTENDANCE_TIME_ZONE,
}).format(date);
