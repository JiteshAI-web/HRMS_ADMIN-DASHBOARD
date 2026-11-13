export interface Employee {
  uid: string;
  id: string;
  name: string;
  email: string;
  designation: string;
  phone: string;
  address: string;
  officeKey: string;
}

export interface Punch {
  type: 'in' | 'out';
  time: string;
  officeKey: string;
  millis: number;
}

export interface AttendanceDay {
  uid: string;
  employee: Employee;
  dateKey: string;
  date: Date;
  punches: Punch[];
  present: boolean;
  checkedIn: boolean;
  inTime: string;
  outTime: string;
  office: string;
  workedMinutes: number;
}

export type RawMap = Record<string, unknown>;
