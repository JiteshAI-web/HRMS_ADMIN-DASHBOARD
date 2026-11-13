import { describe, expect, it } from 'vitest';
import { buildAttendance, dateKey, monthKey, parseDateKey } from './data';
import type { Employee } from './types';

const employee: Employee = {
  uid: 'firebase-uid-42',
  id: 'EMP042',
  name: 'Asha Patel',
  email: 'asha@example.com',
  designation: 'Analyst',
  phone: '9999999999',
  address: 'Mumbai',
  officeKey: 'main_office',
};

describe('mobile attendance data integration', () => {
  it('joins the mobile UID/date/punch tree to the matching employee and location', () => {
    const result = buildAttendance({
      [employee.uid]: {
        '12-11-2026': {
          'OUT-18:05:12': { time: '18:05:12', office: 'main_office' },
          'IN-09:12:03': { time: '09:12:03', office: 'main_office' },
        },
      },
    }, [employee], { main_office: { name: 'Mumbai HQ' } });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      uid: 'firebase-uid-42',
      dateKey: '12-11-2026',
      inTime: '09:12:03',
      outTime: '18:05:12',
      office: 'Mumbai HQ',
      present: true,
      checkedIn: false,
    });
    expect(result[0].employee.name).toBe('Asha Patel');
    expect(result[0].employee.id).toBe('EMP042');
  });

  it('keeps an open IN session visible until a matching OUT arrives', () => {
    const result = buildAttendance({
      [employee.uid]: {
        '12-11-2026': {
          'IN-09:12:03': { time: '09:12:03', office: 'main_office' },
        },
      },
    }, [employee], { main_office: { name: 'Mumbai HQ' } });

    expect(result[0]).toMatchObject({
      inTime: '09:12:03',
      outTime: 'In progress',
      checkedIn: true,
      present: true,
      office: 'Mumbai HQ',
    });
  });

  it('does not invent records or mis-map attendance with no matching profile', () => {
    expect(buildAttendance(null, [employee], {})).toEqual([]);
    expect(buildAttendance({ unknownUid: { '12-11-2026': { 'IN-09:00:00': { time: '09:00:00' } } } }, [employee], {})).toEqual([]);
  });

  it('uses Asia/Kolkata calendar dates across UTC date boundaries', () => {
    expect(dateKey(new Date('2026-11-12T20:00:00.000Z'))).toBe('13-11-2026');
    const parsed = parseDateKey('13-11-2026');
    expect(parsed).not.toBeNull();
    expect(dateKey(parsed!)).toBe('13-11-2026');
    expect(monthKey(parsed!)).toBe('2026-11');
  });

  it('ignores malformed dates and invalid punch times', () => {
    const result = buildAttendance({
      [employee.uid]: {
        '31-02-2026': { 'IN-09:00:00': { time: '09:00:00' } },
        '12-11-2026': {
          'IN-25:90:00': { time: '25:90:00' },
        },
      },
    }, [employee], {});
    expect(result).toEqual([]);
  });
});
